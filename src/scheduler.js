// Timetable scheduler: pure JS, no framework imports.
//
// Public API:
//   precheck(data)                     -> { ok, problems: string[] }
//   generateTimetable(data, options)   -> { ok, entries, unplaced, stats, reason, problems }
//   findClashes(entries, data)         -> { type, message }[]
//   scoreQuality(entries, data)        -> { score, repeats, longRuns, gaps }
//
// Internally days and periods are 0-based indices; a "slot" is day * periodsPerDay + period.

const LECTURE_ROOM_TYPES = new Set(['classroom', 'seminar'])
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
export function groupNamesOf(section) {
  const n = labGroupsOf(section)
  return Array.from({ length: n }, (_, g) => section.groupNames?.[g] || `G${g + 1}`)
}

function roomFits(room, kind, students) {
  // Events-only rooms (e.g. a seminar hall kept for bookings) never hold regular classes.
  if (room.eventsOnly || room.capacity < students) return false
  return kind === 'lab' ? room.type === 'lab' : LECTURE_ROOM_TYPES.has(room.type)
}

function makeContext(data) {
  const { days, periodsPerDay: P, breakAfter = 0 } = data.time
  const D = days.length
  const hasBreak = breakAfter > 0 && breakAfter < P
  // A block may not run past the end of the day or across the break.
  const blockOk = (p, len) => p + len <= P && !(hasBreak && p < breakAfter && p + len > breakAfter)
  const segment = (p) => (hasBreak ? (p < breakAfter ? [0, breakAfter] : [breakAfter, P]) : [0, P])
  const longestBlock = hasBreak ? Math.max(breakAfter, P - breakAfter) : P

  const unavailable = new Map()
  for (const t of data.teachers) {
    const set = new Set()
    for (const key of t.unavailable || []) {
      const cut = key.lastIndexOf('-')
      const d = days.indexOf(key.slice(0, cut))
      const p = Number(key.slice(cut + 1)) - 1
      if (d >= 0 && p >= 0 && p < P) set.add(d * P + p)
    }
    unavailable.set(t.id, set)
  }

  return {
    days,
    D,
    P,
    S: D * P,
    breakAfter,
    hasBreak,
    blockOk,
    segment,
    longestBlock,
    unavailable,
    rooms: byId(data.rooms),
    teachers: byId(data.teachers),
    subjects: byId(data.subjects),
    sections: byId(data.sections),
  }
}

// ---------- pre-check ----------

export function precheck(data) {
  const problems = []
  const { days, periodsPerDay: P } = data.time
  if (!days.length || P < 1) {
    return { ok: false, problems: ['Set at least one working day and one period per day.'] }
  }
  const ctx = makeContext(data)
  const totalUnits = data.sections.reduce((n, s) => n + s.assignments.length, 0)
  if (!data.sections.length || totalUnits === 0) {
    problems.push('Add at least one section with subjects assigned.')
  }

  const teacherLoad = new Map()
  const addLoad = (id, n) => teacherLoad.set(id, (teacherLoad.get(id) || 0) + n)
  const labsByLength = new Map()
  let lectureDemand = 0
  let labDemand = 0

  for (const sec of data.sections) {
    const groups = labGroupsOf(sec)
    const groupSize = Math.ceil(sec.students / groups)
    let hours = 0
    for (const a of sec.assignments) {
      const sub = ctx.subjects.get(a.subjectId)
      if (!sub) {
        problems.push(`${sec.name}: one of its subjects no longer exists.`)
        continue
      }
      const teacher = ctx.teachers.get(a.teacherId)
      if (!teacher) {
        problems.push(`${sec.name}: no teacher assigned for ${sub.name}.`)
        continue
      }
      if (!(teacher.subjectIds || []).includes(sub.id)) {
        problems.push(`${sec.name}: ${teacher.name} is assigned ${sub.name} but is not listed as teaching it.`)
      }
      const labTeacher = a.labTeacherId ? ctx.teachers.get(a.labTeacherId) : teacher
      if (!labTeacher) {
        problems.push(`${sec.name}: the lab teacher chosen for ${sub.name} no longer exists.`)
        continue
      }
      const lec = sub.lectureHours || 0
      const lab = sub.labHours || 0
      const sessions = lab > 0 ? labSessionsOf(sub) : 0
      // Lab groups can run side by side, so the section itself needs each lab only once.
      hours += lec + lab * sessions
      lectureDemand += lec
      labDemand += lab * sessions * groups
      addLoad(teacher.id, lec)
      addLoad(labTeacher.id, lab * sessions * groups)
      if (lab > 0) labsByLength.set(lab, (labsByLength.get(lab) || 0) + sessions * groups)

      if (lab > ctx.longestBlock) {
        problems.push(
          `${sub.name} needs a ${lab}-period lab, but the longest stretch without a break is ${ctx.longestBlock} periods.`,
        )
      }
      if (lab > 0 && !data.rooms.some((r) => roomFits(r, 'lab', groupSize))) {
        const who = groups > 1 ? `Each lab group of ${sec.name} (${groupSize} students)` : `${sec.name} (${sec.students} students)`
        problems.push(`${who} needs a lab for ${sub.name}, but no lab room is big enough.`)
      }
    }
    if (hours > ctx.S) {
      problems.push(`${sec.name} needs ${hours} periods a week, but the week only has ${ctx.S} periods.`)
    }
    if (hours > 0 && !data.rooms.some((r) => roomFits(r, 'lecture', sec.students))) {
      problems.push(`${sec.name} has ${sec.students} students, but no classroom or seminar hall is that big.`)
    }
  }

  for (const [id, load] of teacherLoad) {
    const t = ctx.teachers.get(id)
    const free = ctx.S - ctx.unavailable.get(id).size
    if (load > t.maxHours) {
      problems.push(`${t.name} is assigned ${load} hours a week, more than their maximum of ${t.maxHours}.`)
    }
    if (load > free) {
      problems.push(`${t.name} is assigned ${load} hours but is only available for ${free} periods a week.`)
    }
  }

  const lectureRooms = data.rooms.filter((r) => !r.eventsOnly && LECTURE_ROOM_TYPES.has(r.type)).length
  const labRooms = data.rooms.filter((r) => !r.eventsOnly && r.type === 'lab').length
  if (lectureDemand > lectureRooms * ctx.S) {
    problems.push(
      `Sections need ${lectureDemand} lecture periods, but ${lectureRooms} classroom(s) only offer ${lectureRooms * ctx.S}.`,
    )
  }
  if (labDemand > labRooms * ctx.S) {
    problems.push(`Sections need ${labDemand} lab periods, but ${labRooms} lab(s) only offer ${labRooms * ctx.S}.`)
  }

  // Lab blocks can't straddle the break, so count how many whole blocks fit in a week.
  const halves = ctx.hasBreak ? [ctx.breakAfter, P - ctx.breakAfter] : [P]
  for (const [len, needed] of labsByLength) {
    const perDay = halves.reduce((n, h) => n + Math.floor(h / len), 0)
    const capacity = labRooms * ctx.D * perDay
    if (labRooms && perDay && needed > capacity) {
      problems.push(
        `There are ${needed} ${len}-period lab sessions to schedule, but ${labRooms} lab room(s) can only hold ${capacity} per week (${perDay} per lab per day around the break).`,
      )
    }
  }

  return { ok: problems.length === 0, problems }
}

// ---------- units & candidates ----------

function buildUnits(data, ctx) {
  const units = []
  for (const sec of data.sections) {
    const groups = labGroupsOf(sec)
    const names = groupNamesOf(sec)
    // Busy-grid keys: a lecture occupies every lab group of the section, a lab only its own group.
    const allKeys = names.map((_, g) => `${sec.id}#${g}`)
    for (const a of sec.assignments) {
      const sub = ctx.subjects.get(a.subjectId)
      if (!sub || !ctx.teachers.has(a.teacherId)) continue
      const base = { sectionId: sec.id, subjectId: sub.id }
      for (let i = 0; i < (sub.lectureHours || 0); i++) {
        units.push({
          ...base,
          kind: 'lecture',
          length: 1,
          teacherId: a.teacherId,
          students: sec.students,
          sectionKeys: allKeys,
          siblingKeys: [],
        })
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
  units.forEach((u, idx) => {
    u.idx = idx
    // Identical units (same section, subject, kind, lab group) are interchangeable; search treats them in order.
    u.symKey = `${u.sectionId}|${u.subjectId}|${u.kind}|${u.groupIndex ?? ''}`
    // Spread key: lectures of a subject share one; each lab group's sessions share another.
    u.spreadKey = u.kind === 'lab' ? `${u.sectionKeys[0]}|${u.subjectId}|lab` : `${u.sectionId}|${u.subjectId}`
    const rooms = roomList.filter((r) => roomFits(r, u.kind, u.students))
    const blocked = ctx.unavailable.get(u.teacherId)
    u.candidates = []
    for (let d = 0; d < ctx.D; d++) {
      for (let p = 0; p < ctx.P; p++) {
        if (!ctx.blockOk(p, u.length)) continue
        const s = d * ctx.P + p
        let free = true
        for (let k = 0; k < u.length; k++) if (blocked.has(s + k)) free = false
        if (!free) continue
        for (const r of rooms) u.candidates.push({ d, p, s, roomId: r.id, capacity: r.capacity, roomType: r.type })
      }
    }
  })
  return units
}

// ---------- search state ----------

function makeState(ctx) {
  const grid = () => new Map()
  const state = { teacher: grid(), room: grid(), section: grid(), daySubject: new Map() }
  state.row = (map, id) => {
    let row = map.get(id)
    if (!row) map.set(id, (row = new Uint8Array(ctx.S)))
    return row
  }
  return state
}

function fits(state, u, c) {
  const t = state.row(state.teacher, u.teacherId)
  const room = state.row(state.room, c.roomId)
  for (let k = 0; k < u.length; k++) {
    const s = c.s + k
    if (t[s] || room[s]) return false
    for (const key of u.sectionKeys) if (state.row(state.section, key)[s]) return false
  }
  return true
}

function mark(state, u, c, value) {
  const t = state.row(state.teacher, u.teacherId)
  const room = state.row(state.room, c.roomId)
  const secRows = u.sectionKeys.map((key) => state.row(state.section, key))
  for (let k = 0; k < u.length; k++) {
    t[c.s + k] = value
    room[c.s + k] = value
    for (const row of secRows) row[c.s + k] = value
  }
  const key = `${u.spreadKey}|${c.d}`
  state.daySubject.set(key, (state.daySubject.get(key) || 0) + (value ? 1 : -1))
}

// Length of the busy run that a block [p, p+len) would join, within its half of the day.
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
  // reward full overlap with another group's lab, penalise a staggered partial overlap.
  for (const key of u.siblingKeys) {
    const row = state.row(state.section, key)
    let overlap = 0
    for (let k = 0; k < u.length; k++) overlap += row[c.s + k]
    if (overlap === u.length) score -= 12
    else if (overlap > 0) score += 8
  }
  // Avoid long back-to-back stretches for teachers (and, more mildly, students).
  const tRow = state.row(state.teacher, u.teacherId)
  const tRun = runWith(tRow, ctx, c.d, c.p, u.length)
  if (tRun > MAX_TEACHER_RUN) score += (tRun - MAX_TEACHER_RUN) * 8
  const sRun = runWith(state.row(state.section, u.sectionKeys[0]), ctx, c.d, c.p, u.length)
  if (sRun > 4) score += (sRun - 4) * 3
  // Balance a teacher's day.
  let tDay = 0
  for (let p = 0; p < ctx.P; p++) tDay += tRow[c.d * ctx.P + p]
  if (tDay >= 4) score += (tDay - 3) * 2
  // Mild preferences: earlier periods, snug rooms, keep the seminar hall free.
  score += c.p * 0.15
  score += (c.capacity - u.students) / 50
  if (c.roomType === 'seminar') score += 1
  return score
}

// ---------- search ----------

function attempt(units, ctx, rng, maxSteps, deadline, failCount) {
  const state = makeState(ctx)
  const placed = new Array(units.length).fill(null)
  let count = 0
  let steps = 0
  let best = { count: 0, placed: placed.slice() }

  // Most-constrained-first: the unplaced unit with the fewest live candidates right now.
  function pickNext() {
    let pick = null
    let pickN = Infinity
    const groups = new Set()
    for (const u of units) {
      if (placed[u.idx] || groups.has(u.symKey)) continue
      groups.add(u.symKey)
      let n = 0
      for (const c of u.candidates) {
        if (fits(state, u, c) && ++n >= pickN) break
      }
      if (n < pickN || (n === pickN && u.length > pick.length)) {
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
    const live = u.candidates.filter((c) => fits(state, u, c))
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
  return `${sub.name}${u.kind === 'lab' ? ' lab' : ''} for ${who}`
}

// Explain, in plain language, why the hardest unit could not be placed.
function explainFailure(units, ctx, best, failCount) {
  const unplaced = units.filter((u) => !best.placed[u.idx])
  if (!unplaced.length) return ''
  const worst = unplaced.reduce((a, b) => (failCount[b.idx] > failCount[a.idx] ? b : a))
  const teacher = ctx.teachers.get(worst.teacherId)
  const what = describeUnit(worst, ctx)

  if (!worst.candidates.length) {
    return `Couldn't place ${what}: ${teacher.name} is unavailable for every slot where a suitable room exists.`
  }

  // Replay the best partial timetable and see what blocks each possible start time.
  const state = makeState(ctx)
  units.forEach((u) => best.placed[u.idx] && mark(state, u, best.placed[u.idx], 1))
  const starts = new Map()
  for (const c of worst.candidates) {
    if (!starts.has(c.s)) starts.set(c.s, [])
    starts.get(c.s).push(c)
  }
  let teacherBusy = 0
  let sectionBusy = 0
  let roomsBusy = 0
  const tRow = state.row(state.teacher, worst.teacherId)
  const sRows = worst.sectionKeys.map((key) => state.row(state.section, key))
  for (const [s, cands] of starts) {
    const range = [...Array(worst.length).keys()].map((k) => s + k)
    if (range.some((x) => tRow[x])) teacherBusy++
    else if (range.some((x) => sRows.some((row) => row[x]))) sectionBusy++
    else if (!cands.some((c) => fits(state, worst, c))) roomsBusy++
  }
  const parts = []
  if (teacherBusy) parts.push(`${teacherBusy} already have ${teacher.name} teaching`)
  if (sectionBusy) parts.push(`${sectionBusy} already have another class for ${ctx.sections.get(worst.sectionId).name}`)
  if (roomsBusy) parts.push(`${roomsBusy} have every suitable ${worst.kind === 'lab' ? 'lab' : 'room'} taken`)
  return (
    `Couldn't place ${what} (best attempt left ${unplaced.length} class${unplaced.length > 1 ? 'es' : ''} unplaced). ` +
    `Of its ${starts.size} possible time slots, ${parts.join(', ')}. ` +
    `Try adding a ${worst.kind === 'lab' ? 'lab' : 'room'}, giving ${teacher.name} more free slots, or reducing hours.`
  )
}

export function generateTimetable(data, options = {}) {
  const { seed = Date.now(), maxSteps = 3000, maxRestarts = 25, timeLimitMs = 4000 } = options
  const started = Date.now()
  const check = precheck(data)
  if (!check.ok) {
    return {
      ok: false,
      entries: [],
      unplaced: [],
      problems: check.problems,
      reason: check.problems.join(' '),
      stats: { placed: 0, total: 0, clashes: 0, quality: 0, steps: 0, restarts: 0, ms: Date.now() - started },
    }
  }

  const ctx = makeContext(data)
  const units = buildUnits(data, ctx)
  const rng = mulberry32(seed)
  const failCount = new Array(units.length).fill(0)
  let best = { count: -1 }
  let totalSteps = 0
  let restarts = 0
  let solved = false

  const deadline = started + timeLimitMs
  for (; restarts <= maxRestarts && Date.now() < deadline; restarts++) {
    const run = attempt(units, ctx, rng, maxSteps, deadline, failCount)
    totalSteps += run.steps
    if (run.best.count > best.count) best = run.best
    if (run.solved) {
      solved = true
      break
    }
  }

  const entries = toEntries(units, best.placed)
  const clashes = findClashes(entries, data)
  return {
    ok: solved && clashes.length === 0,
    entries,
    unplaced: units.filter((u) => !best.placed[u.idx]).map((u) => describeUnit(u, ctx)),
    problems: [],
    reason: solved ? '' : explainFailure(units, ctx, best, failCount),
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
      clashes.push({ type: 'block', message: `${name(ctx.subjects, e.subjectId)} lab at ${where} runs past the break or day end.` })
    }
    const groups = sec ? labGroupsOf(sec) : 1
    const students = sec ? (e.groupIndex != null ? Math.ceil(sec.students / groups) : sec.students) : 0
    if (room && sec && !roomFits(room, e.kind, students)) {
      clashes.push({ type: 'room', message: `${room.name} is not suitable for ${sec.name}'s ${e.kind} at ${where}.` })
    }
    // A lecture occupies every lab group of the section; a group lab only its own group.
    const sectionKeys = e.groupIndex != null ? [`${e.sectionId}#${e.groupIndex}`] : [...Array(groups).keys()].map((g) => `${e.sectionId}#${g}`)
    for (let k = 0; k < e.length; k++) {
      const s = e.day * ctx.P + e.period + k
      const at = `${ctx.days[e.day]} P${e.period + k + 1}`
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

  const halves = ctx.hasBreak ? [[0, ctx.breakAfter], [ctx.breakAfter, ctx.P]] : [[0, ctx.P]]
  let longRuns = 0
  for (const r of teacherRows.values()) {
    for (let d = 0; d < ctx.D; d++) {
      for (const [lo, hi] of halves) {
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
