// Timetable scheduler: pure JS, no framework imports.
//
// Public API:
//   precheck(data, { departmentId?, fixedEntries? })   -> { ok, problems: string[] }
//   generateTimetable(data, { departmentId?, fixedEntries?, seed, ... })  one department (or everything)
//   generateCollege(data, options)     every department in turn; later ones respect earlier ones' rooms/teachers
//   generateTimetable(data, options)   -> { ok, entries, unplaced, stats, reason, problems }
//   findClashes(entries, data)         -> { type, message }[]
//   scoreQuality(entries, data)        -> { score, repeats, longRuns, gaps }
//
// Internally days and periods are 0-based indices; a "slot" is day * periodsPerDay + period.
// "Closed" slots (after a short day ends, or blocked college-wide) never hold classes; blocks never cross a break.

import { blocksPerWeek, breaksOf, isClosed, longestBlockOf, roomTypeName, roomTypesOf, segmentsOf } from './data/schema.js'

const MAX_TEACHER_RUN = 3 // more back-to-back periods than this is penalised
const BRANCH_LIMIT = 8 // best-scored candidates tried per unit before backtracking further up

// ---------- helpers ----------

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const byId = (list) => new Map(list.map((x) => [x.id, x]))

// A section can split into lab groups (e.g. A1/A2) that take labs separately, often side by side.
export const labGroupsOf = (section) => Math.max(1, section.labGroups || 1)
export const labSessionsOf = (subject) => Math.max(1, subject.labSessions || 1)
export const MAX_LAB_GROUPS = 10

/**
 * How a subject's weekly lecture hours are split into blocks: with lectureBlock 2, 5 hours are two double periods
 * and one single period. Returns block lengths, longest first.
 */
export function lectureBlocksOf(subject) {
  const hours = subject.lectureHours || 0
  const block = Math.max(1, Math.min(hours || 1, subject.lectureBlock || 1))
  const blocks = Array(Math.floor(hours / block)).fill(block)
  if (hours % block) blocks.push(hours % block)
  return blocks
}
export function groupNamesOf(section) {
  const n = labGroupsOf(section)
  return Array.from({ length: n }, (_, g) => section.groupNames?.[g] || `G${g + 1}`)
}

/** What room a subject's lectures or labs need: { type?: room type id, needs: facilities[] }. */
export const needOf = (subject, kind) =>
  kind === 'lab'
    ? { type: subject?.labRoomType || null, needs: subject?.labNeeds ?? [] }
    : { type: subject?.lectureRoomType || null, needs: subject?.lectureNeeds ?? [] }

/** "a Computer lab with Computers, Projector" */
export function describeNeed(data, kind, need) {
  const what = need.type ? roomTypeName(data, need.type) : kind === 'lab' ? 'lab' : 'classroom'
  return `a ${what}${need.needs?.length ? ` with ${need.needs.join(', ')}` : ''}`
}

/**
 * Room matching for the college: fits(room, kind, students, need) says whether a room can hold a class. Labs need a
 * room of a 'lab' kind type and lectures a 'lecture' kind (unless the subject names a type), enough seats, and every
 * required facility. Events-only rooms never hold regular classes.
 */
export function roomMatcher(data) {
  const kinds = new Map(roomTypesOf(data).map((t) => [t.id, t.kind]))
  const has = (room, f) => (room.facilities ?? []).some((x) => x.trim().toLowerCase() === f.trim().toLowerCase())
  return (room, kind, students, need = {}) => {
    if (room.eventsOnly || room.capacity < students) return false
    if (need.type) {
      if (room.type !== need.type) return false
    } else if ((kinds.get(room.type) ?? 'lecture') !== (kind === 'lab' ? 'lab' : 'lecture')) return false
    return (need.needs ?? []).every((f) => has(room, f))
  }
}

/** Kind and size check only (no subject requirements). */
export const roomFits = (room, kind, students, data = {}) => roomMatcher(data)(room, kind, students)

function makeContext(data) {
  const { days, periodsPerDay: P } = data.time
  const D = days.length
  const segments = segmentsOf(data.time)
  const segment = (p) => segments.find(([from, to]) => p >= from && p < to) ?? [0, P]
  // A block may not run past the end of the day or across a break.
  const blockOk = (p, len) => p + len <= segment(p)[1]
  const closed = new Set()
  days.forEach((day, d) => {
    for (let p = 0; p < P; p++) if (isClosed(data.time, day, p)) closed.add(d * P + p)
  })

  const unavailable = new Map()
  for (const t of data.teachers) {
    const set = new Set()
    for (const key of t.unavailable || []) {
      const cut = key.lastIndexOf('-')
      const d = days.indexOf(key.slice(0, cut))
      const p = Number(key.slice(cut + 1)) - 1
      if (d >= 0 && p >= 0 && p < P && !closed.has(d * P + p)) set.add(d * P + p)
    }
    unavailable.set(t.id, set)
  }

  return {
    fits: roomMatcher(data),
    days,
    D,
    P,
    S: D * P,
    open: D * P - closed.size, // slots that can hold classes
    closed,
    breaks: breaksOf(data.time),
    blockOk,
    segment,
    segments,
    blocksPerWeek: (len) => blocksPerWeek(data.time, len),
    longestBlock: longestBlockOf(data.time),
    unavailable,
    rooms: byId(data.rooms),
    teachers: byId(data.teachers),
    subjects: byId(data.subjects),
    sections: byId(data.sections),
  }
}

// ---------- pre-check ----------

// Each problem is also returned as a structured issue ({ kind, key, message, ...facts }) so the UI can explain it
// and suggest changes (see diagnose.js). `problems` stays the plain list of messages.
export function precheck(data, { departmentId, fixedEntries = [] } = {}) {
  const issues = []
  const report = (kind, message, facts = {}) => {
    const key = [kind, ...Object.values(facts).filter((v) => typeof v === 'string')].join('|')
    issues.push({ kind, key, message, ...facts })
  }
  const done = () => ({ ok: issues.length === 0, problems: issues.map((i) => i.message), issues })
  const scope = departmentId ? data.sections.filter((s) => s.deptId === departmentId) : data.sections
  const { days, periodsPerDay: P } = data.time
  if (!days.length || P < 1) {
    report('time', 'Set at least one working day and one period per day.')
    return done()
  }
  const ctx = makeContext(data)
  const totalUnits = scope.reduce((n, s) => n + s.assignments.length, 0)
  if (!scope.length || totalUnits === 0) {
    report(
      'empty',
      departmentId ? 'Add at least one section with subjects to this department.' : 'Add at least one section with subjects assigned.',
    )
  }

  const teacherLoad = new Map()
  const addLoad = (id, n) => teacherLoad.set(id, (teacherLoad.get(id) || 0) + n)
  const labsByNeed = new Map() // lab sessions per (block length, room requirement)
  let lectureDemand = 0
  let labDemand = 0
  // Classes other departments already hold count towards shared teachers' loads.
  for (const e of fixedEntries) addLoad(e.teacherId, e.length)
  const involved = new Set()

  for (const sec of scope) {
    const groups = labGroupsOf(sec)
    const groupSize = Math.ceil(sec.students / groups)
    let hours = 0
    for (const a of sec.assignments) {
      const sub = ctx.subjects.get(a.subjectId)
      if (!sub) {
        report('missing-subject', `${sec.name}: one of its subjects no longer exists.`, { sectionId: sec.id })
        continue
      }
      const teacher = ctx.teachers.get(a.teacherId)
      if (!teacher) {
        report('missing-teacher', `${sec.name}: no teacher assigned for ${sub.name}.`, { sectionId: sec.id, subjectId: sub.id })
        continue
      }
      if (!(teacher.subjectIds || []).includes(sub.id)) {
        report('not-qualified', `${sec.name}: ${teacher.name} is assigned ${sub.name} but is not listed as teaching it.`, {
          sectionId: sec.id,
          subjectId: sub.id,
          teacherId: teacher.id,
        })
      }
      const labTeacher = a.labTeacherId ? ctx.teachers.get(a.labTeacherId) : teacher
      if (!labTeacher) {
        report('missing-teacher', `${sec.name}: the lab teacher chosen for ${sub.name} no longer exists.`, { sectionId: sec.id, subjectId: sub.id, role: 'lab' })
        continue
      }
      const lec = sub.lectureHours || 0
      const lab = sub.labHours || 0
      const tut = sub.tutorialHours || 0
      const sessions = lab > 0 ? labSessionsOf(sub) : 0
      // Lab groups (and tutorial groups) can run side by side, so the section itself needs each only once.
      hours += lec + lab * sessions + tut
      lectureDemand += lec + tut * groups
      labDemand += lab * sessions * groups
      addLoad(teacher.id, lec + tut * groups)
      addLoad(labTeacher.id, lab * sessions * groups)
      const block = Math.max(...lectureBlocksOf(sub), 0)
      if (block > 1 && block > ctx.longestBlock) {
        report(
          'lecture-block-too-long',
          `${sub.name} lectures are in blocks of ${block} periods, but the longest stretch without a break is ${ctx.longestBlock} periods.`,
          { subjectId: sub.id, block, longestBlock: ctx.longestBlock },
        )
      }
      involved.add(teacher.id).add(labTeacher.id)
      if (lab > 0) {
        const need = needOf(sub, 'lab')
        const key = [lab, need.type ?? '', [...need.needs].sort().join(';')].join('|')
        const entry = labsByNeed.get(key) ?? { len: lab, need, needed: 0, subjects: new Set() }
        entry.needed += sessions * groups
        entry.subjects.add(sub.name)
        labsByNeed.set(key, entry)
      }

      if (lab > ctx.longestBlock) {
        report(
          'lab-too-long',
          `${sub.name} needs a ${lab}-period lab, but the longest stretch without a break is ${ctx.longestBlock} periods.`,
          { subjectId: sub.id, labHours: lab, longestBlock: ctx.longestBlock },
        )
      }
      // A room of the required type with the required facilities must exist, and be big enough.
      for (const [kind, students, hrs] of [['lab', groupSize, lab], ['lecture', sec.students, lec], ['tutorial', groupSize, tut]]) {
        const need = needOf(sub, kind)
        const specific = need.type || need.needs.length
        if (!hrs || data.rooms.some((r) => ctx.fits(r, kind, students, need))) continue
        if (specific && !data.rooms.some((r) => ctx.fits(r, kind, 0, need))) {
          report(
            'room-requirement',
            `${sub.name} ${kind === 'lab' ? 'labs need' : 'lectures need'} ${describeNeed(data, kind, need)}, but no room matches.`,
            { subjectId: sub.id, sectionId: sec.id, role: kind, students },
          )
        } else if (kind === 'lab') {
          const who = groups > 1 ? `Each lab group of ${sec.name} (${groupSize} students)` : `${sec.name} (${sec.students} students)`
          const message = specific
            ? `${who} needs ${describeNeed(data, 'lab', need)} for ${sub.name}, but none is big enough.`
            : `${who} needs a lab for ${sub.name}, but no lab room is big enough.`
          report('no-lab-room', message, {
            sectionId: sec.id,
            subjectId: sub.id,
            students: groupSize,
            groups,
          })
        } else if (specific) {
          report('no-lecture-room', `${sec.name} has ${sec.students} students, but no ${describeNeed(data, 'lecture', need).slice(2)} for ${sub.name} is that big.`, {
            sectionId: sec.id,
            subjectId: sub.id,
            students: sec.students,
          })
        }
      }
    }
    if (sec.maxPerDay > 0 && hours > sec.maxPerDay * ctx.D) {
      report('section-daily', `${sec.name} needs ${hours} periods a week, but at most ${sec.maxPerDay} a day over ${ctx.D} days allows only ${sec.maxPerDay * ctx.D}.`, {
        sectionId: sec.id,
        hours,
        max: sec.maxPerDay,
        days: ctx.D,
      })
    }
    if (hours > ctx.open) {
      report('week-overflow', `${sec.name} needs ${hours} periods a week, but the week only has ${ctx.open} teaching periods.`, {
        sectionId: sec.id,
        hours,
        slots: ctx.open,
      })
    }
    if (hours > 0 && !data.rooms.some((r) => ctx.fits(r, 'lecture', sec.students))) {
      report('no-lecture-room', `${sec.name} has ${sec.students} students, but no classroom or seminar hall is that big.`, {
        sectionId: sec.id,
        students: sec.students,
      })
    }
  }

  for (const [id, load] of teacherLoad) {
    // Only teachers who teach in the sections being scheduled (their other departments' hours still count).
    if (!involved.has(id)) continue
    const t = ctx.teachers.get(id)
    const free = ctx.open - ctx.unavailable.get(id).size
    if (load > t.maxHours) {
      report('teacher-max', `${t.name} is assigned ${load} hours a week, more than their maximum of ${t.maxHours}.`, {
        teacherId: id,
        load,
        max: t.maxHours,
      })
    }
    if (t.maxPerDay > 0 && load > t.maxPerDay * ctx.D) {
      report('teacher-daily', `${t.name} is assigned ${load} periods a week, but at most ${t.maxPerDay} a day over ${ctx.D} days allows only ${t.maxPerDay * ctx.D}.`, {
        teacherId: id,
        load,
        max: t.maxPerDay,
        days: ctx.D,
      })
    }
    if (load > free) {
      report('teacher-availability', `${t.name} is assigned ${load} hours but is only available for ${free} periods a week.`, {
        teacherId: id,
        load,
        free,
      })
    }
  }

  const lectureRooms = data.rooms.filter((r) => ctx.fits(r, 'lecture', 0)).length
  const labRooms = data.rooms.filter((r) => ctx.fits(r, 'lab', 0)).length
  if (lectureDemand > lectureRooms * ctx.open) {
    report(
      'lecture-rooms',
      `Sections need ${lectureDemand} lecture periods, but ${lectureRooms} classroom(s) only offer ${lectureRooms * ctx.open}.`,
      { demand: lectureDemand, rooms: lectureRooms, offered: lectureRooms * ctx.open },
    )
  }
  if (labDemand > labRooms * ctx.open) {
    report('lab-rooms', `Sections need ${labDemand} lab periods, but ${labRooms} lab(s) only offer ${labRooms * ctx.open}.`, {
      demand: labDemand,
      rooms: labRooms,
      offered: labRooms * ctx.open,
    })
  }

  // Lab blocks can't straddle a break or a closed slot, so count how many whole blocks fit in a week, in the
  // rooms each kind of lab can use (labs needing a Computer lab only count the computer labs).
  for (const { len, need, needed, subjects } of labsByNeed.values()) {
    const perWeek = ctx.blocksPerWeek(len)
    const rooms = data.rooms.filter((r) => ctx.fits(r, 'lab', 0, need)).length
    const capacity = rooms * perWeek
    const specific = need.type || need.needs.length
    if (rooms && perWeek && needed > capacity) {
      report(
        'lab-blocks',
        `There are ${needed} ${len}-period lab sessions${specific ? ` needing ${describeNeed(data, 'lab', need)} (${[...subjects].join(', ')})` : ''} to schedule, but ${rooms} ${specific ? 'matching ' : ''}lab room(s) can only hold ${capacity} per week (${perWeek} per lab, around the breaks).`,
        { block: String(len), type: need.type ?? '', needs: need.needs.join(';'), needed, capacity, rooms, perWeek },
      )
    }
  }

  return done()
}

// ---------- units & candidates ----------

function buildUnits(sections, ctx) {
  const units = []
  for (const sec of sections) {
    const groups = labGroupsOf(sec)
    const names = groupNamesOf(sec)
    // Busy-grid keys: a lecture occupies every lab group of the section, a lab only its own group.
    const allKeys = names.map((_, g) => `${sec.id}#${g}`)
    for (const a of sec.assignments) {
      const sub = ctx.subjects.get(a.subjectId)
      if (!sub || !ctx.teachers.has(a.teacherId)) continue
      const base = { sectionId: sec.id, subjectId: sub.id, deptId: sec.deptId }
      for (const length of lectureBlocksOf(sub)) {
        units.push({
          ...base,
          kind: 'lecture',
          length,
          teacherId: a.teacherId,
          students: sec.students,
          sectionKeys: allKeys,
          siblingKeys: [],
        })
      }
      // Tutorials: single periods for each lab group (the whole section when it has no groups), in a classroom.
      for (let g = 0; g < groups; g++) {
        for (let i = 0; i < (sub.tutorialHours || 0); i++) {
          units.push({
            ...base,
            kind: 'tutorial',
            length: 1,
            teacherId: a.teacherId,
            students: Math.ceil(sec.students / groups),
            groupIndex: groups > 1 ? g : undefined,
            group: groups > 1 ? names[g] : undefined,
            sectionKeys: [allKeys[g]],
            siblingKeys: allKeys.filter((_, j) => j !== g),
          })
        }
      }
      if (!(sub.labHours > 0)) continue
      const labTeacherId = ctx.teachers.has(a.labTeacherId) ? a.labTeacherId : a.teacherId
      for (let g = 0; g < groups; g++) {
        for (let i = 0; i < labSessionsOf(sub); i++) {
          units.push({
            ...base,
            kind: 'lab',
            length: sub.labHours,
            teacherId: labTeacherId,
            students: Math.ceil(sec.students / groups),
            groupIndex: groups > 1 ? g : undefined,
            group: groups > 1 ? names[g] : undefined,
            sectionKeys: [allKeys[g]],
            siblingKeys: allKeys.filter((_, j) => j !== g),
          })
        }
      }
    }
  }

  const roomList = [...ctx.rooms.values()]
  // Number teachers, rooms and section keys so the search can use arrays (see makeState).
  ctx.teacherIdx = new Map([...ctx.teachers.keys()].map((id, i) => [id, i]))
  ctx.roomIdx = new Map(roomList.map((r, i) => [r.id, i]))
  ctx.sectionKeyIdx = new Map()
  const keyIdx = (key) => ctx.sectionKeyIdx.get(key) ?? ctx.sectionKeyIdx.set(key, ctx.sectionKeyIdx.size).get(key)
  units.forEach((u, idx) => {
    u.idx = idx
    u.ti = ctx.teacherIdx.get(u.teacherId)
    u.si = u.sectionKeys.map(keyIdx)
    u.sib = u.siblingKeys.map(keyIdx)
    const teacher = ctx.teachers.get(u.teacherId)
    const section = ctx.sections.get(u.sectionId)
    u.tMax = teacher?.maxPerDay > 0 ? teacher.maxPerDay : Infinity
    u.sMax = section?.maxPerDay > 0 ? section.maxPerDay : Infinity
    // Identical units (same section, subject, kind, lab group) are interchangeable; search treats them in order.
    u.symKey = `${u.sectionId}|${u.subjectId}|${u.kind}|${u.groupIndex ?? ''}`
    // Spread key: lectures of a subject share one; each lab group's sessions share another.
    u.spreadKey = u.kind === 'lecture' ? `${u.sectionId}|${u.subjectId}` : `${u.sectionKeys[0]}|${u.subjectId}|${u.kind}`
    const rooms = roomList.filter((r) => ctx.fits(r, u.kind, u.students, needOf(ctx.subjects.get(u.subjectId), u.kind)))
    const blocked = ctx.unavailable.get(u.teacherId)
    u.candidates = []
    u.starts = [] // candidates grouped by start slot: [{ d, s, cands }]
    for (let d = 0; d < ctx.D; d++) {
      for (let p = 0; p < ctx.P; p++) {
        if (!ctx.blockOk(p, u.length)) continue
        const s = d * ctx.P + p
        let free = true
        for (let k = 0; k < u.length; k++) if (blocked.has(s + k) || ctx.closed.has(s + k)) free = false
        if (!free || !rooms.length) continue
        const cands = rooms.map((r) => ({ d, p, s, roomId: r.id, ri: ctx.roomIdx.get(r.id), capacity: r.capacity, roomType: r.type, roomDept: r.deptId || null }))
        u.starts.push({ d, s, cands })
        u.candidates.push(...cands)
      }
    }
  })
  return units
}

// ---------- search state ----------
// Busy grids are arrays indexed by teacher / room / section-key number (set up in buildUnits), one Uint8Array of
// slots each, so the hot checks below avoid map lookups. Per-day counters back the daily limits.

function makeState(ctx) {
  const grid = (n) => Array.from({ length: n }, () => new Uint8Array(ctx.S))
  return {
    t: grid(ctx.teacherIdx.size),
    r: grid(ctx.roomIdx.size),
    sec: grid(ctx.sectionKeyIdx.size),
    tDay: grid(ctx.teacherIdx.size).map(() => new Uint8Array(ctx.D)),
    secDay: grid(ctx.sectionKeyIdx.size).map(() => new Uint8Array(ctx.D)),
    daySubject: new Map(),
  }
}

/** Classes already fixed elsewhere (other departments) occupy their teachers and rooms. */
function prefill(state, ctx, fixedEntries) {
  for (const e of fixedEntries) {
    const t = state.t[ctx.teacherIdx.get(e.teacherId)]
    const room = state.r[ctx.roomIdx.get(e.roomId)]
    for (let k = 0; k < e.length; k++) {
      const s = e.day * ctx.P + e.period + k
      if (t) t[s] = 1
      if (room) room[s] = 1
    }
    if (t) state.tDay[ctx.teacherIdx.get(e.teacherId)][e.day] += e.length
  }
}

/** Teacher and every section key of the unit free for the whole block, within the daily limits (any room). */
function startFree(state, u, s, d) {
  const t = state.t[u.ti]
  for (let k = 0; k < u.length; k++) {
    if (t[s + k]) return false
    for (const i of u.si) if (state.sec[i][s + k]) return false
  }
  if (state.tDay[u.ti][d] + u.length > u.tMax) return false
  for (const i of u.si) if (state.secDay[i][d] + u.length > u.sMax) return false
  return true
}

function roomFree(state, u, c) {
  const room = state.r[c.ri]
  for (let k = 0; k < u.length; k++) if (room[c.s + k]) return false
  return true
}

const fits = (state, u, c) => startFree(state, u, c.s, c.d) && roomFree(state, u, c)

function mark(state, u, c, value) {
  const t = state.t[u.ti]
  const room = state.r[c.ri]
  for (let k = 0; k < u.length; k++) {
    t[c.s + k] = value
    room[c.s + k] = value
    for (const i of u.si) state.sec[i][c.s + k] = value
  }
  const delta = value ? u.length : -u.length
  state.tDay[u.ti][c.d] += delta
  for (const i of u.si) state.secDay[i][c.d] += delta
  const key = `${u.spreadKey}|${c.d}`
  state.daySubject.set(key, (state.daySubject.get(key) || 0) + (value ? 1 : -1))
}

/** Candidates of a unit that fit right now; stops counting at `limit`. */
function liveCandidates(state, u, limit = Infinity) {
  const live = []
  for (const st of u.starts) {
    if (!startFree(state, u, st.s, st.d)) continue
    for (const c of st.cands) {
      if (roomFree(state, u, c)) {
        live.push(c)
        if (live.length >= limit) return live
      }
    }
  }
  return live
}

// Length of the busy run that a block [p, p+len) would join, within its stretch of the day (between breaks).
function runWith(row, ctx, d, p, len) {
  const [lo, hi] = ctx.segment(p)
  const base = d * ctx.P
  let run = len
  for (let i = p - 1; i >= lo && row[base + i]; i--) run++
  for (let i = p + len; i < hi && row[base + i]; i++) run++
  return run
}

function softScore(state, ctx, u, c) {
  let score = 0
  // Spread each subject across the week.
  const same = state.daySubject.get(`${u.spreadKey}|${c.d}`) || 0
  score += same * (u.kind === 'lab' ? 4 : 10)
  // Run a section's lab groups exactly side by side (A1 and A2 in different labs at the same time):
  // reward full overlap with another group's class, penalise a staggered partial overlap.
  for (const i of u.sib) {
    const row = state.sec[i]
    let overlap = 0
    for (let k = 0; k < u.length; k++) overlap += row[c.s + k]
    if (overlap === u.length) score -= 12
    else if (overlap > 0) score += 8
  }
  // Avoid long back-to-back stretches for teachers (and, more mildly, students).
  const tRow = state.t[u.ti]
  const tRun = runWith(tRow, ctx, c.d, c.p, u.length)
  if (tRun > MAX_TEACHER_RUN) score += (tRun - MAX_TEACHER_RUN) * 8
  const sRun = runWith(state.sec[u.si[0]], ctx, c.d, c.p, u.length)
  if (sRun > 4) score += (sRun - 4) * 3
  // Balance a teacher's day.
  const tDay = state.tDay[u.ti][c.d]
  if (tDay >= 4) score += (tDay - 3) * 2
  // Mild preferences: earlier periods, snug rooms, keep halls free for bigger classes.
  score += c.p * 0.15
  score += (c.capacity - u.students) / 50
  if (c.roomType === 'seminar') score += 1
  // Prefer the department's own rooms, then shared rooms, then other departments' rooms.
  if (c.roomDept && u.deptId && c.roomDept !== u.deptId) score += 3
  else if (!c.roomDept && u.deptId) score += 0.5
  return score
}

// ---------- search ----------

function attempt(units, ctx, rng, maxSteps, deadline, failCount, fixedEntries) {
  const state = makeState(ctx)
  prefill(state, ctx, fixedEntries)
  const placed = new Array(units.length).fill(null)
  let count = 0
  let steps = 0
  let best = { count: 0, placed: placed.slice() }

  // Most-constrained-first: the unplaced unit with the fewest live candidates right now. Ties go to longer blocks,
  // then to units that failed most in earlier attempts (so restarts deal with the troublemakers sooner).
  function pickNext() {
    let pick = null
    let pickN = Infinity
    const groups = new Set()
    for (const u of units) {
      if (placed[u.idx] || groups.has(u.symKey)) continue
      groups.add(u.symKey)
      const n = liveCandidates(state, u, pickN === Infinity ? Infinity : pickN + 1).length
      if (n < pickN || (n === pickN && (u.length > pick.length || (u.length === pick.length && failCount[u.idx] > failCount[pick.idx])))) {
        pick = u
        pickN = n
        if (n === 0) break
      }
    }
    return pick
  }

  function solve() {
    if (count === units.length) return true
    const u = pickNext()
    const live = liveCandidates(state, u)
    if (live.length === 0) {
      failCount[u.idx]++
      return false
    }
    const ranked = live
      .map((c) => ({ c, score: softScore(state, ctx, u, c) + rng() * 0.5 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, BRANCH_LIMIT)

    for (const { c } of ranked) {
      if (steps >= maxSteps || (steps % 64 === 0 && Date.now() > deadline)) return false
      steps++
      mark(state, u, c, 1)
      placed[u.idx] = c
      count++
      if (count > best.count) best = { count, placed: placed.slice() }
      if (solve()) return true
      mark(state, u, c, 0)
      placed[u.idx] = null
      count--
    }
    return false
  }

  const solved = solve()
  return { solved, steps, best: solved ? { count, placed } : best }
}

function toEntries(units, placed) {
  const entries = []
  units.forEach((u, i) => {
    const c = placed[i]
    if (!c) return
    entries.push({
      sectionId: u.sectionId,
      subjectId: u.subjectId,
      teacherId: u.teacherId,
      roomId: c.roomId,
      day: c.d,
      period: c.p,
      length: u.length,
      kind: u.kind,
      ...(u.group ? { group: u.group, groupIndex: u.groupIndex } : {}),
    })
  })
  return entries.sort((a, b) => a.day - b.day || a.period - b.period)
}

function describeUnit(u, ctx) {
  const sub = ctx.subjects.get(u.subjectId)
  const who = ctx.sections.get(u.sectionId).name + (u.group ? ` (group ${u.group})` : '')
  return `${sub.name}${u.kind === 'lecture' ? '' : ` ${u.kind}`} for ${who}`
}

// Explain, in plain language, why the hardest unit could not be placed. Also returns `failure`: the same facts as
// plain data (the unit, and what blocked each of its possible start times) for diagnose.js to build suggestions.
function explainFailure(units, ctx, best, failCount, fixedEntries) {
  const unplaced = units.filter((u) => !best.placed[u.idx])
  if (!unplaced.length) return { reason: '', failure: null }
  const worst = unplaced.reduce((a, b) => (failCount[b.idx] > failCount[a.idx] ? b : a))
  const teacher = ctx.teachers.get(worst.teacherId)
  const what = describeUnit(worst, ctx)
  const unit = {
    sectionId: worst.sectionId,
    subjectId: worst.subjectId,
    teacherId: worst.teacherId,
    kind: worst.kind,
    length: worst.length,
    students: worst.students,
    ...(worst.group ? { group: worst.group, groupIndex: worst.groupIndex } : {}),
  }
  const failure = {
    unit,
    unplacedCount: unplaced.length,
    unplaced: unplaced.map((u) => ({ sectionId: u.sectionId, subjectId: u.subjectId, teacherId: u.teacherId, kind: u.kind, length: u.length })),
  }

  if (!worst.candidates.length) {
    return {
      reason: `Couldn't place ${what}: ${teacher.name} is unavailable for every slot where a suitable room exists.`,
      failure: { ...failure, slots: 0, teacherBusy: 0, sectionBusy: 0, roomsBusy: 0, dailyLimit: 0, open: 0, noCandidates: true },
    }
  }

  // Replay the best partial timetable and see what blocks each possible start time.
  const state = makeState(ctx)
  prefill(state, ctx, fixedEntries)
  units.forEach((u) => best.placed[u.idx] && mark(state, u, best.placed[u.idx], 1))
  const starts = new Map()
  for (const c of worst.candidates) {
    if (!starts.has(c.s)) starts.set(c.s, [])
    starts.get(c.s).push(c)
  }
  let teacherBusy = 0
  let sectionBusy = 0
  let roomsBusy = 0
  let open = 0
  const tRow = state.t[worst.ti]
  const sRows = worst.si.map((i) => state.sec[i])
  let dailyLimit = 0
  for (const [s, cands] of starts) {
    const range = [...Array(worst.length).keys()].map((k) => s + k)
    if (range.some((x) => tRow[x])) teacherBusy++
    else if (range.some((x) => sRows.some((row) => row[x]))) sectionBusy++
    else if (!startFree(state, worst, s, cands[0].d)) dailyLimit++
    else if (!cands.some((c) => fits(state, worst, c))) roomsBusy++
    else open++
  }
  const parts = []
  if (teacherBusy) parts.push(`${teacherBusy} already have ${teacher.name} teaching (in any department)`)
  if (sectionBusy) parts.push(`${sectionBusy} already have another class for ${ctx.sections.get(worst.sectionId).name}`)
  if (roomsBusy) parts.push(`${roomsBusy} have every suitable ${worst.kind === 'lab' ? 'lab' : 'room'} taken`)
  if (dailyLimit) parts.push(`${dailyLimit} would break a daily limit (most periods a day)`)
  if (open) parts.push(`${open} were still free when the search stopped`)
  return {
    reason:
      `Couldn't place ${what} (best attempt left ${unplaced.length} class${unplaced.length > 1 ? 'es' : ''} unplaced). ` +
      `Of its ${starts.size} possible time slots, ${parts.join(', ')}. ` +
      `Try adding a ${worst.kind === 'lab' ? 'lab' : 'room'}, giving ${teacher.name} more free slots, or reducing hours.`,
    failure: { ...failure, slots: starts.size, teacherBusy, sectionBusy, roomsBusy, dailyLimit, open, noCandidates: false },
  }
}

export function generateTimetable(data, options = {}) {
  const { seed = Date.now(), maxSteps = 3000, maxRestarts = 25, timeLimitMs = 4000, departmentId, fixedEntries = [] } = options
  const started = Date.now()
  const check = precheck(data, { departmentId, fixedEntries })
  if (!check.ok) {
    return {
      ok: false,
      entries: [],
      unplaced: [],
      problems: check.problems,
      issues: check.issues,
      failure: null,
      reason: check.problems.join(' '),
      stats: { placed: 0, total: 0, clashes: 0, quality: 0, steps: 0, restarts: 0, ms: Date.now() - started },
    }
  }

  const ctx = makeContext(data)
  const sections = departmentId ? data.sections.filter((s) => s.deptId === departmentId) : data.sections
  const units = buildUnits(sections, ctx)
  const rng = mulberry32(seed)
  const failCount = new Array(units.length).fill(0)
  let best = { count: -1 }
  let totalSteps = 0
  let restarts = 0
  let solved = false

  const deadline = started + timeLimitMs
  for (; restarts <= maxRestarts && Date.now() < deadline; restarts++) {
    const run = attempt(units, ctx, rng, maxSteps, deadline, failCount, fixedEntries)
    totalSteps += run.steps
    if (run.best.count > best.count) best = run.best
    if (run.solved) {
      solved = true
      break
    }
  }

  const entries = toEntries(units, best.placed)
  const explained = solved ? { reason: '', failure: null } : explainFailure(units, ctx, best, failCount, fixedEntries)
  // Verified together with the fixed classes, so cross-department clashes would be caught too.
  const clashes = findClashes([...fixedEntries, ...entries], data)
  return {
    ok: solved && clashes.length === 0,
    entries,
    unplaced: units.filter((u) => !best.placed[u.idx]).map((u) => describeUnit(u, ctx)),
    problems: [],
    issues: [],
    reason: explained.reason,
    failure: explained.failure && {
      ...explained.failure,
      search: { steps: totalSteps, restarts: Math.min(restarts, maxRestarts), timeLimitMs, timedOut: Date.now() >= deadline },
    },
    stats: {
      placed: best.count,
      total: units.length,
      clashes: clashes.length,
      quality: scoreQuality(entries, data).score,
      steps: totalSteps,
      restarts: Math.min(restarts, maxRestarts),
      ms: Date.now() - started,
    },
  }
}

/** What is kept of one department's run (in timetable.byDept) for the summary and the failure guidance. */
export const runSummary = (r) => ({
  ok: r.ok,
  stats: r.stats,
  reason: r.reason,
  unplaced: r.unplaced,
  problems: r.problems,
  issues: r.issues ?? [],
  failure: r.failure ?? null,
})

/**
 * Generates every department in turn (largest first). Each department is scheduled around the classes of the
 * departments before it, so shared rooms and shared teachers are never double-booked across departments.
 */
export function generateCollege(data, options = {}) {
  const started = Date.now()
  const unitsOf = (deptId) =>
    data.sections.filter((s) => s.deptId === deptId).reduce((n, s) => n + s.assignments.length, 0)
  const departments = (data.departments ?? []).filter((d) => unitsOf(d.id) > 0).sort((a, b) => unitsOf(b.id) - unitsOf(a.id))
  if (!departments.length) return { ...generateTimetable(data, options), byDept: {} }

  let entries = []
  const byDept = {}
  for (const d of departments) {
    const r = generateTimetable(data, { ...options, departmentId: d.id, fixedEntries: entries })
    byDept[d.id] = runSummary(r)
    entries = [...entries, ...r.entries]
  }
  const results = Object.entries(byDept)
  const short = (id) => departments.find((d) => d.id === id)?.short ?? id
  const clashes = findClashes(entries, data)
  const sum = (key) => results.reduce((n, [, r]) => n + r.stats[key], 0)
  return {
    ok: results.every(([, r]) => r.ok) && clashes.length === 0,
    entries,
    byDept,
    unplaced: results.flatMap(([id, r]) => r.unplaced.map((u) => `${u} (${short(id)})`)),
    problems: results.flatMap(([id, r]) => r.problems.map((p) => `${short(id)}: ${p}`)),
    issues: [],
    failure: null,
    reason: results
      .filter(([, r]) => r.reason)
      .map(([id, r]) => `${short(id)}: ${r.reason}`)
      .join(' '),
    stats: {
      placed: sum('placed'),
      total: sum('total'),
      clashes: clashes.length,
      quality: collegeQuality(entries, data),
      steps: sum('steps'),
      restarts: sum('restarts'),
      ms: Date.now() - started,
    },
  }
}

/**
 * Quality across several departments: each department's score weighted by its number of classes.
 * (scoreQuality subtracts raw penalties, so scoring all departments together would understate quality.)
 */
export function collegeQuality(entries, data) {
  const deptOf = new Map(data.sections.map((s) => [s.id, s.deptId ?? '']))
  const groups = new Map()
  for (const e of entries) {
    const key = deptOf.get(e.sectionId) ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  if (groups.size <= 1) return scoreQuality(entries, data).score
  let weighted = 0
  for (const list of groups.values()) weighted += scoreQuality(list, data).score * list.length
  return Math.round(weighted / entries.length)
}

// ---------- verification & quality ----------

/** Independent check of every hard constraint. Returns a list of clashes (empty = valid). */
export function findClashes(entries, data) {
  const ctx = makeContext(data)
  const clashes = []
  const seen = { teacher: new Map(), room: new Map(), section: new Map() }
  const name = (map, id) => map.get(id)?.name || id

  for (const e of entries) {
    const where = `${ctx.days[e.day]} P${e.period + 1}`
    const room = ctx.rooms.get(e.roomId)
    const sec = ctx.sections.get(e.sectionId)
    if (!ctx.blockOk(e.period, e.length)) {
      clashes.push({ type: 'block', message: `${name(ctx.subjects, e.subjectId)} ${e.kind} at ${where} runs across a break or past the day end.` })
    }
    const groups = sec ? labGroupsOf(sec) : 1
    const students = sec ? (e.groupIndex != null ? Math.ceil(sec.students / groups) : sec.students) : 0
    if (room && sec && !ctx.fits(room, e.kind, students, needOf(ctx.subjects.get(e.subjectId), e.kind))) {
      clashes.push({ type: 'room', message: `${room.name} is not suitable for ${sec.name}'s ${e.kind} at ${where}.` })
    }
    // A lecture occupies every lab group of the section; a group lab only its own group.
    const sectionKeys = e.groupIndex != null ? [`${e.sectionId}#${e.groupIndex}`] : [...Array(groups).keys()].map((g) => `${e.sectionId}#${g}`)
    for (let k = 0; k < e.length; k++) {
      const s = e.day * ctx.P + e.period + k
      const at = `${ctx.days[e.day]} P${e.period + k + 1}`
      if (ctx.closed.has(s)) {
        clashes.push({ type: 'closed', message: `${name(ctx.subjects, e.subjectId)} is at ${at}, when there are no classes.` })
      }
      if (ctx.unavailable.get(e.teacherId)?.has(s)) {
        clashes.push({ type: 'unavailable', message: `${name(ctx.teachers, e.teacherId)} is unavailable at ${at}.` })
      }
      const checks = [
        ['teacher', e.teacherId, name(ctx.teachers, e.teacherId)],
        ['room', e.roomId, name(ctx.rooms, e.roomId)],
        ...sectionKeys.map((key) => ['section', key, name(ctx.sections, e.sectionId)]),
      ]
      for (const [kind, id, label] of checks) {
        const key = `${id}|${s}`
        if (seen[kind].has(key)) {
          clashes.push({ type: kind, message: `${label} is double-booked at ${at}.` })
        } else {
          seen[kind].set(key, e)
        }
      }
    }
  }
  return clashes
}

/** 0-100 quality score from soft-constraint penalties. */
export function scoreQuality(entries, data) {
  if (!entries.length) return { score: 0, repeats: 0, longRuns: 0, gaps: 0 }
  const ctx = makeContext(data)
  const daySubject = new Map()
  const teacherRows = new Map()
  const sectionRows = new Map()
  const row = (map, id) => map.get(id) || map.set(id, new Uint8Array(ctx.S)).get(id)

  for (const e of entries) {
    if (e.kind === 'lecture') {
      const key = `${e.sectionId}|${e.day}|${e.subjectId}`
      daySubject.set(key, (daySubject.get(key) || 0) + 1)
    }
    for (let k = 0; k < e.length; k++) {
      const s = e.day * ctx.P + e.period + k
      row(teacherRows, e.teacherId)[s] = 1
      row(sectionRows, e.sectionId)[s] = 1
    }
  }

  let repeats = 0
  for (const n of daySubject.values()) repeats += Math.max(0, n - 1)

  let longRuns = 0
  for (const r of teacherRows.values()) {
    for (let d = 0; d < ctx.D; d++) {
      for (const [lo, hi] of ctx.segments) {
        let run = 0
        for (let p = lo; p < hi; p++) {
          run = r[d * ctx.P + p] ? run + 1 : 0
          if (run > MAX_TEACHER_RUN) longRuns++
        }
      }
    }
  }

  let gaps = 0
  for (const r of sectionRows.values()) {
    for (let d = 0; d < ctx.D; d++) {
      const busy = []
      for (let p = 0; p < ctx.P; p++) if (r[d * ctx.P + p]) busy.push(p)
      if (busy.length > 1) gaps += busy[busy.length - 1] - busy[0] + 1 - busy.length
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - repeats * 2 - longRuns * 3 - gaps * 0.5)))
  return { score, repeats, longRuns, gaps }
}
