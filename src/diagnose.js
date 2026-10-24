// Failure guidance: turns the scheduler's pre-check issues and search-failure facts into plain-language
// explanations with suggested changes. Pure JS (no React), like scheduler.js.
//
//   diagnose(data, run, { departmentId?, fixedEntries? })  -> Diagnosis[] (most important first)
//   applyChange(data, change)                              -> a copy of data with one suggested change applied
//   testChange(data, change, { departmentId?, fixedEntries? }) -> quick generation with the change applied
//
// Diagnosis: { id, certainty, title, cause, facts: string[], remedies: Remedy[] }
//   certainty 'confirmed': the inputs make a timetable impossible (counted, not guessed);
//             'likely':    the search failed and we know what blocked the hardest class in its best attempt;
//             'unknown':   the search stopped without a clear blocker (it may simply have run out of time).
// Remedy: { id, text, where?, change?, checked? }
//   change is plain data for applyChange; checked: 'passes-precheck' | 'clears-check' when re-running the
//   pre-check with the change applied confirmed it. A remedy is never claimed to fix the timetable unless
//   testChange actually generated one.

import { ALL_DAYS, DAY_NAMES, blocksPerWeek, breaksOf, longestBlockOf, openPeriodsOf, uid } from './data/schema.js'
import { generateTimetable, labGroupsOf, labSessionsOf, precheck, roomFits } from './scheduler.js'

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const find = (list, id) => list.find((x) => x.id === id)
const nameOf = (list, id, fallback = 'an unknown item') => find(list, id)?.name ?? fallback
const list = (names) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const WHERE = {
  time: 'Setup → Time structure',
  rooms: 'Setup → Rooms',
  subjects: 'Setup → Subjects',
  teachers: 'Setup → Teachers',
  sections: 'Setup → Sections',
}

// ---------- changes ----------

/** Applies one suggested change to a copy of the data (nothing is saved). */
export function applyChange(data, change) {
  const patchIn = (items, id, patch) => items.map((x) => (x.id === id ? { ...x, ...patch } : x))
  switch (change.type) {
    case 'many':
      return change.changes.reduce(applyChange, data)
    case 'addRoom':
      return { ...data, rooms: [...data.rooms, change.room] }
    case 'room':
      return { ...data, rooms: patchIn(data.rooms, change.id, change.patch) }
    case 'teacher':
      return { ...data, teachers: patchIn(data.teachers, change.id, change.patch) }
    case 'subject':
      return { ...data, subjects: patchIn(data.subjects, change.id, change.patch) }
    case 'section':
      return { ...data, sections: patchIn(data.sections, change.id, change.patch) }
    case 'assignment':
      return {
        ...data,
        sections: data.sections.map((s) =>
          s.id !== change.sectionId
            ? s
            : { ...s, assignments: s.assignments.map((a) => (a.subjectId === change.subjectId ? { ...a, ...change.patch } : a)) },
        ),
      }
    case 'time':
      return { ...data, time: { ...data.time, ...change.patch } }
    default:
      return data
  }
}

/**
 * Generates the department (or college) with the change applied, around the same fixed classes, using a short
 * time limit. A success is real evidence; a failure only means this quick try didn't find a timetable.
 */
export function testChange(data, change, { departmentId, fixedEntries = [], timeLimitMs = 2500 } = {}) {
  const changed = applyChange(data, change)
  const check = precheck(changed, { departmentId, fixedEntries })
  if (!check.ok) return { ok: false, placed: 0, total: 0, problems: check.problems }
  const r = generateTimetable(changed, { departmentId, fixedEntries, seed: 7, timeLimitMs })
  return { ok: r.ok, placed: r.stats.placed, total: r.stats.total, problems: [] }
}

// ---------- shared facts ----------

/** Weekly periods per teacher across every section (lectures + every lab session of every lab group). */
function teacherLoads(data) {
  const loads = new Map()
  const add = (id, n) => n && loads.set(id, (loads.get(id) || 0) + n)
  for (const sec of data.sections) {
    for (const a of sec.assignments) {
      const sub = find(data.subjects, a.subjectId)
      if (!sub) continue
      add(a.teacherId, sub.lectureHours || 0)
      if (sub.labHours > 0) add(a.labTeacherId || a.teacherId, sub.labHours * labSessionsOf(sub) * labGroupsOf(sec))
    }
  }
  return loads
}

const freePeriods = (data, teacher) => openPeriodsOf(data.time) - (teacher.unavailable?.length || 0)

/**
 * Other teachers who can take over a section's lectures or lab for a subject, with room under their maximum.
 * Returns ready-made remedies, best (most spare hours) first.
 */
function reassignRemedies(data, sectionId, subjectId, role, { exclude, limit = 2 } = {}) {
  const sec = find(data.sections, sectionId)
  const sub = find(data.subjects, subjectId)
  const a = sec?.assignments.find((x) => x.subjectId === subjectId)
  if (!sec || !sub || !a) return []
  const hours = role === 'lab' ? (sub.labHours || 0) * labSessionsOf(sub) * labGroupsOf(sec) : sub.lectureHours || 0
  if (!hours) return []
  const loads = teacherLoads(data)
  const current = role === 'lab' ? a.labTeacherId || a.teacherId : a.teacherId
  return data.teachers
    .filter((t) => t.id !== current && t.id !== exclude && (t.subjectIds || []).includes(subjectId))
    .map((t) => ({ t, spare: Math.min(t.maxHours, freePeriods(data, t)) - (loads.get(t.id) || 0) }))
    .filter(({ spare }) => spare >= hours)
    .sort((x, y) => y.spare - x.spare)
    .slice(0, limit)
    .map(({ t, spare }) => {
      // Moving only the lectures keeps the lab with its current teacher (and vice versa).
      const patch =
        role === 'lab'
          ? { labTeacherId: t.id }
          : { teacherId: t.id, ...(sub.labHours > 0 && !a.labTeacherId ? { labTeacherId: a.teacherId } : {}) }
      return {
        id: `reassign-${role}-${sectionId}-${subjectId}-${t.id}`,
        text: `Give ${sub.name} ${role === 'lab' ? 'lab' : 'lectures'} for ${sec.name} (${plural(hours, 'period')} a week) to ${t.name}, who can teach it and has ${spare} spare periods.`,
        where: WHERE.sections,
        change: { type: 'assignment', sectionId, subjectId, patch },
      }
    })
}

/** Ways to get a room of the right type that seats `students`: allow an events-only room, enlarge one, or add one. */
function roomRemedies(data, kind, students, departmentId, { count = 1 } = {}) {
  const lab = kind === 'lab'
  const typeOk = (r) => (lab ? r.type === 'lab' : r.type === 'classroom' || r.type === 'seminar')
  const word = lab ? 'lab' : 'classroom'
  const out = []
  const any = data.rooms.some((r) => !r.eventsOnly && typeOk(r))
  const eventsOnly = data.rooms.filter((r) => r.eventsOnly && typeOk(r) && r.capacity >= students)
  for (const r of eventsOnly.slice(0, 1)) {
    out.push({
      id: `allow-${r.id}`,
      text: `Allow ${r.name} (${r.capacity} seats, currently kept for events) to be used for regular classes.`,
      where: WHERE.rooms,
      change: { type: 'room', id: r.id, patch: { eventsOnly: false } },
    })
  }
  // Closest smaller room of the right type: only worth raising if the room really holds that many.
  const near = data.rooms
    .filter((r) => !r.eventsOnly && typeOk(r) && r.capacity < students)
    .sort((x, y) => y.capacity - x.capacity)[0]
  if (near && near.capacity >= students * 0.8) {
    out.push({
      id: `enlarge-${near.id}`,
      text: `If ${near.name} can actually seat ${students}, raise its capacity from ${near.capacity} to ${students}.`,
      where: WHERE.rooms,
      change: { type: 'room', id: near.id, patch: { capacity: students } },
    })
  }
  const newRoom = () => ({
    id: uid('room'),
    name: `New ${word} (${students} seats)`,
    capacity: students,
    type: lab ? 'lab' : 'classroom',
    deptId: departmentId ?? null,
  })
  out.push({
    id: `add-${word}-${students}-${count}`,
    text: `Add ${count === 1 ? `${any ? 'another' : 'a'} ${word}` : `${count} more ${word}s`} with at least ${students} seats.`,
    where: WHERE.rooms,
    change: count === 1 ? { type: 'addRoom', room: newRoom() } : { type: 'many', changes: Array.from({ length: count }, () => ({ type: 'addRoom', room: newRoom() })) },
  })
  return out
}

/**
 * More teaching time for everyone: one or two more periods a day, or one more working day. Bigger changes to the
 * college day aren't realistic suggestions, so they're left out.
 */
function timeRemedies(data, { periodsNeeded = 1 } = {}) {
  const { days, periodsPerDay } = data.time
  const out = []
  const extra = Math.max(1, Math.ceil(periodsNeeded / days.length))
  if (extra <= 2) out.push({
    id: `periods+${extra}`,
    text: `Add ${plural(extra, 'period')} to each day (${days.length * extra} more periods a week, for every department).`,
    where: WHERE.time,
    change: { type: 'time', patch: { periodsPerDay: periodsPerDay + extra } },
  })
  const nextDay = ALL_DAYS.find((d) => !days.includes(d))
  if (nextDay && periodsPerDay >= periodsNeeded) {
    out.push({
      id: `day-${nextDay}`,
      text: `Add ${DAY_NAMES[nextDay]} as a working day (${periodsPerDay} more periods a week, for every department).`,
      where: WHERE.time,
      change: { type: 'time', patch: { days: ALL_DAYS.filter((d) => days.includes(d) || d === nextDay) } },
    })
  }
  return out
}

/**
 * The single break move (one break to another position) that most improves `score(time)`, e.g. more lab blocks a
 * week. Returns { change, label, from, to, value } or null when no move helps.
 */
function bestBreakMove(time, score) {
  const breaks = breaksOf(time)
  const now = score(time)
  let best = null
  breaks.forEach((b, i) => {
    for (let to = 1; to < time.periodsPerDay; to++) {
      if (breaks.some((x) => x.after === to)) continue
      const next = breaks.map((x, j) => (j === i ? { ...x, after: to } : x))
      const value = score({ ...time, breaks: next })
      if (value > now && (!best || value > best.value)) best = { change: { type: 'time', patch: { breaks: next } }, label: b.label, from: b.after, to, value }
    }
  })
  return best
}

// ---------- pre-check issues (confirmed causes) ----------

const RANK = {
  time: 0,
  empty: 0,
  'missing-subject': 0,
  'missing-teacher': 0,
  'not-qualified': 1,
  'no-lecture-room': 2,
  'no-lab-room': 2,
  'lab-too-long': 2,
  'week-overflow': 3,
  'teacher-availability': 4,
  'teacher-max': 5,
  'lecture-rooms': 6,
  'lab-rooms': 6,
  'lab-blocks': 6,
  other: 9,
}

// How far over the limit an issue is: bigger shortfalls are listed first within the same rank.
const shortfall = (i) =>
  i.kind === 'teacher-max' ? i.load - i.max
  : i.kind === 'teacher-availability' ? i.load - i.free
  : i.kind === 'week-overflow' ? i.hours - i.slots
  : i.kind === 'lab-blocks' ? i.needed - i.capacity
  : i.kind === 'lecture-rooms' || i.kind === 'lab-rooms' ? i.demand - i.offered
  : 0

function issueDiagnosis(data, issue, departmentId) {
  const sec = find(data.sections, issue.sectionId)
  const sub = find(data.subjects, issue.subjectId)
  const teacher = find(data.teachers, issue.teacherId)
  const d = { id: issue.key, certainty: 'confirmed', title: '', cause: issue.message, facts: [], remedies: [] }
  const S = openPeriodsOf(data.time)

  switch (issue.kind) {
    case 'time':
      d.title = 'The week has no teaching time'
      d.remedies.push({ id: 'time', text: 'Choose at least one working day and one period per day.', where: WHERE.time })
      break
    case 'empty':
      d.title = 'Nothing to schedule yet'
      d.remedies.push({ id: 'empty', text: 'Add a section and assign it subjects and teachers.', where: WHERE.sections })
      break
    case 'missing-subject':
      d.title = `${sec?.name ?? 'A section'} lists a deleted subject`
      d.remedies.push({
        id: 'drop-missing',
        text: `Remove the deleted subject from ${sec?.name ?? 'the section'}, or add the subject again.`,
        where: WHERE.sections,
        change: sec && {
          type: 'section',
          id: sec.id,
          patch: { assignments: sec.assignments.filter((a) => find(data.subjects, a.subjectId)) },
        },
      })
      break
    case 'missing-teacher': {
      const role = issue.role === 'lab' ? 'lab' : 'lecture'
      d.title = `${sub?.name ?? 'A subject'} in ${sec?.name ?? 'a section'} has no ${role === 'lab' ? 'lab ' : ''}teacher`
      d.remedies.push(...reassignRemedies(data, issue.sectionId, issue.subjectId, role))
      if (!d.remedies.length) {
        d.remedies.push({
          id: 'qualify',
          text: `No teacher with spare hours lists ${sub?.name ?? 'this subject'} under "can teach". Add it to a teacher's subjects, then assign them.`,
          where: WHERE.teachers,
        })
      }
      break
    }
    case 'not-qualified':
      d.title = `${teacher?.name} isn't listed for ${sub?.name}`
      d.remedies.push({
        id: `qualify-${issue.teacherId}`,
        text: `If ${teacher?.name} does teach ${sub?.name}, add it to their "can teach" subjects.`,
        where: WHERE.teachers,
        change: teacher && { type: 'teacher', id: teacher.id, patch: { subjectIds: [...(teacher.subjectIds || []), issue.subjectId] } },
      })
      d.remedies.push(...reassignRemedies(data, issue.sectionId, issue.subjectId, 'lecture', { limit: 1 }))
      break
    case 'lab-too-long': {
      const { labHours, longestBlock } = issue
      const sessions = labSessionsOf(sub)
      const newSessions = Math.ceil((labHours * sessions) / longestBlock)
      d.title = `${sub?.name} lab is longer than any stretch between breaks`
      d.facts.push(`Lab blocks can't run across a break or a no-class slot, and the longest stretch is ${plural(longestBlock, 'period')}.`)
      d.remedies.push({
        id: `shorten-${sub?.id}`,
        text: `Split the ${labHours}-period lab into ${plural(newSessions, 'session')} of ${longestBlock} periods a week.`,
        where: WHERE.subjects,
        change: sub && { type: 'subject', id: sub.id, patch: { labHours: longestBlock, labSessions: newSessions } },
      })
      const P = data.time.periodsPerDay
      const move = bestBreakMove(data.time, (t) => Math.min(longestBlockOf(t), labHours))
      if (move) {
        d.remedies.push({
          id: `break-${move.from}-${move.to}`,
          text: `Move the ${move.label.toLowerCase()} from after period ${move.from} to after period ${move.to}, so a ${labHours}-period stretch fits (changes the day for every department).`,
          where: WHERE.time,
          change: move.change,
        })
      } else if (labHours >= P) {
        d.remedies.push(...timeRemedies(data, { periodsNeeded: (labHours - P + 1) * data.time.days.length }).slice(0, 1))
      }
      break
    }
    case 'no-lab-room':
    case 'no-lecture-room': {
      const lab = issue.kind === 'no-lab-room'
      const biggest = Math.max(0, ...data.rooms.filter((r) => !r.eventsOnly && (lab ? r.type === 'lab' : r.type !== 'lab')).map((r) => r.capacity))
      const word = lab ? 'lab' : 'classroom'
      d.title = biggest ? `No ${word} is big enough for ${sec?.name}` : `There are no ${word}s for regular classes`
      d.facts.push(
        biggest
          ? `${lab && issue.groups > 1 ? `Each lab group has ${issue.students}` : `It has ${issue.students}`} students; the biggest ${word} that takes classes seats ${biggest}.`
          : `No room of type "${lab ? 'lab' : 'classroom or seminar'}" is available for classes.`,
      )
      d.remedies.push(...roomRemedies(data, lab ? 'lab' : 'lecture', issue.students, departmentId))
      if (lab && biggest > 0 && sec) {
        const groups = Math.ceil(sec.students / biggest)
        if (groups > labGroupsOf(sec) && groups <= 4) {
          d.remedies.push({
            id: `groups-${sec.id}-${groups}`,
            text: `Split ${sec.name} into ${groups} lab groups of about ${Math.ceil(sec.students / groups)} students (each group then needs its own lab session).`,
            where: WHERE.sections,
            change: { type: 'section', id: sec.id, patch: { labGroups: groups } },
          })
        }
      }
      break
    }
    case 'week-overflow': {
      const over = issue.hours - issue.slots
      d.title = `${sec?.name} has more classes than the week has periods`
      d.facts.push(`It needs ${issue.hours} periods; the week has ${issue.slots}. That is ${plural(over, 'period')} too many.`)
      d.remedies.push({
        id: `trim-${sec?.id}`,
        text: `Reduce ${sec?.name}'s subjects or hours by at least ${plural(over, 'period')} a week.`,
        where: WHERE.sections,
      })
      d.remedies.push(...timeRemedies(data, { periodsNeeded: over }))
      break
    }
    case 'teacher-availability': {
      const need = issue.load - issue.free
      d.title = `${teacher?.name} isn't available enough`
      d.facts.push(`${plural(teacher?.unavailable?.length || 0, 'period is', 'periods are')} marked unavailable out of ${S} in the week.`)
      if (teacher?.unavailable?.length) {
        d.remedies.push({
          id: `free-${teacher.id}`,
          text: `Make at least ${plural(need, 'more period')} available for ${teacher.name} (${teacher.unavailable.length} are blocked now).`,
          where: WHERE.teachers,
          change: { type: 'teacher', id: teacher.id, patch: { unavailable: teacher.unavailable.slice(need) } },
        })
      }
      d.remedies.push(...moveSomeClasses(data, issue.teacherId, need))
      break
    }
    case 'teacher-max': {
      const over = issue.load - issue.max
      d.title = `${teacher?.name} has more hours than their maximum`
      d.facts.push(`That is ${plural(over, 'period')} over, counting their classes in every department.`)
      d.remedies.push(...moveSomeClasses(data, issue.teacherId, over))
      d.remedies.push({
        id: `max-${issue.teacherId}`,
        text: `If it's acceptable, raise ${teacher?.name}'s maximum from ${issue.max} to ${issue.load} hours.`,
        where: WHERE.teachers,
        change: teacher && { type: 'teacher', id: teacher.id, patch: { maxHours: issue.load } },
      })
      break
    }
    case 'lecture-rooms':
    case 'lab-rooms': {
      const lab = issue.kind === 'lab-rooms'
      const extra = Math.ceil((issue.demand - issue.offered) / S)
      d.title = lab ? 'Not enough lab time in the week' : 'Not enough classroom time in the week'
      d.facts.push(`Needed: ${issue.demand} periods. Available: ${issue.offered} (${plural(issue.rooms, lab ? 'lab' : 'room')} × ${S} periods).`)
      const scope = departmentId ? data.sections.filter((s) => s.deptId === departmentId) : data.sections
      const students = lab ? labRoomSize(data, departmentId) : Math.max(1, ...scope.map((s) => s.students))
      d.remedies.push(...roomRemedies(data, lab ? 'lab' : 'lecture', students, departmentId, { count: extra }))
      d.remedies.push(...timeRemedies(data, { periodsNeeded: Math.ceil((issue.demand - issue.offered) / Math.max(1, issue.rooms)) }))
      break
    }
    case 'lab-blocks': {
      const len = Number(issue.block)
      const extra = Math.ceil((issue.needed - issue.capacity) / Math.max(1, issue.perWeek))
      d.title = `Not enough ${len}-period lab slots`
      d.facts.push(
        `${issue.needed} lab sessions of ${len} periods need a slot; ${plural(issue.rooms, 'lab')} × ${issue.perWeek} blocks a week each = ${issue.capacity}.`,
      )
      d.remedies.push(...roomRemedies(data, 'lab', labRoomSize(data, departmentId), departmentId, { count: extra }))
      // A different break position may fit more whole blocks a week.
      const move = bestBreakMove(data.time, (t) => blocksPerWeek(t, len))
      if (move) {
        d.remedies.push({
          id: `break-${move.from}-${move.to}`,
          text: `Move the ${move.label.toLowerCase()} from after period ${move.from} to after period ${move.to}: each lab then fits ${move.value} blocks a week instead of ${issue.perWeek} (changes the day for every department).`,
          where: WHERE.time,
          change: move.change,
        })
      }
      d.remedies.push(...timeRemedies(data).slice(1))
      break
    }
    default:
      d.title = 'Setup problem'
  }
  d.remedies = d.remedies.filter((r) => r && (!('change' in r) || r.change !== undefined))
  return d
}

/** Seats a new lab needs for general lab shortages: the largest lab group among the sections being scheduled. */
function labRoomSize(data, departmentId) {
  const subjects = new Map(data.subjects.map((x) => [x.id, x]))
  const sizes = data.sections
    .filter((sec) => !departmentId || sec.deptId === departmentId)
    .filter((sec) => sec.assignments.some((a) => subjects.get(a.subjectId)?.labHours > 0))
    .map((sec) => Math.ceil(sec.students / labGroupsOf(sec)))
  return Math.max(1, ...sizes)
}

/**
 * Moves some of a teacher's classes to colleagues who can teach them: the assignments that would cover `hours`
 * on their own come first, then the biggest ones (which help but may not be enough by themselves).
 */
function moveSomeClasses(data, teacherId, hours, limit = 2) {
  const options = []
  for (const sec of data.sections) {
    for (const a of sec.assignments) {
      const sub = find(data.subjects, a.subjectId)
      if (!sub) continue
      if (a.teacherId === teacherId && sub.lectureHours > 0) options.push({ sec, sub, role: 'lecture', n: sub.lectureHours })
      if ((a.labTeacherId || a.teacherId) === teacherId && sub.labHours > 0) {
        options.push({ sec, sub, role: 'lab', n: sub.labHours * labSessionsOf(sub) * labGroupsOf(sec) })
      }
    }
  }
  const enough = (o) => (o.n >= hours ? 0 : 1)
  options.sort((x, y) => enough(x) - enough(y) || (enough(x) ? y.n - x.n : x.n - y.n))
  const out = []
  for (const o of options) {
    if (out.length >= limit) break
    out.push(...reassignRemedies(data, o.sec.id, o.sub.id, o.role, { limit: 1 }))
  }
  return out
}

// ---------- search failures (likely / unknown causes) ----------

function searchDiagnosis(data, run, departmentId, fixedEntries) {
  const f = run.failure
  const u = f.unit
  const sec = find(data.sections, u.sectionId)
  const sub = find(data.subjects, u.subjectId)
  const teacher = find(data.teachers, u.teacherId)
  if (!sec || !sub || !teacher) return null
  const lab = u.kind === 'lab'
  const who = `${sec.name}${u.group ? ` (group ${u.group})` : ''}`
  const what = `${sub.name}${lab ? ' lab' : ''} for ${who}`
  const { days, periodsPerDay: P } = data.time
  const S = openPeriodsOf(data.time)

  const blockers = [
    { key: 'teacher', n: f.teacherBusy, text: `${teacher.name} was already teaching` },
    { key: 'section', n: f.sectionBusy, text: `${who} already had another class` },
    { key: 'rooms', n: f.roomsBusy, text: `every suitable ${lab ? 'lab' : 'room'} was taken` },
  ]
    .filter((b) => b.n > 0)
    .sort((a, b) => b.n - a.n)

  const unclear = !f.noCandidates && f.open > 0
  const d = {
    id: `search-${u.sectionId}-${u.subjectId}-${u.kind}-${u.group ?? ''}`,
    certainty: unclear ? 'unknown' : 'likely',
    title: unclear ? `The search stopped before placing ${what}` : `${what} couldn't be fitted`,
    cause: '',
    facts: [],
    remedies: [],
  }
  const need = lab ? `a ${u.length}-period block` : 'one period'
  const roomNeed = `${lab ? 'a lab' : 'a classroom'} for ${u.students} students`

  if (f.noCandidates) {
    d.cause = `${what} needs ${need} with ${teacher.name} and ${roomNeed}, but ${teacher.name} is marked unavailable at every time such a block fits.`
  } else {
    const parts = blockers.map((b) => `${b.n} because ${b.text}`)
    if (f.open) parts.push(`${f.open} ${f.open === 1 ? 'was' : 'were'} still free`)
    d.cause =
      `In the best attempt, ${plural(f.unplacedCount, 'class', 'classes')} stayed unplaced. The hardest was ${what}, which needs ${need} ` +
      `with ${teacher.name} and ${roomNeed}. Of its ${f.slots} possible start times: ${list(parts)}.`
  }

  // Facts about the resources involved (counted from the setup and the timetable as generated).
  const eligible = data.rooms.filter((r) => roomFits(r, u.kind, u.students))
  d.facts.push(
    eligible.length
      ? `${plural(eligible.length, lab ? 'lab' : 'room')} can take it: ${list(eligible.slice(0, 4).map((r) => r.name))}${eligible.length > 4 ? ' and others' : ''}.`
      : `No ${lab ? 'lab' : 'room'} can take it.`,
  )
  const loads = teacherLoads(data)
  const elsewhere = departmentId
    ? fixedEntries.filter((e) => e.teacherId === teacher.id).reduce((n, e) => n + e.length, 0)
    : 0
  d.facts.push(
    `${teacher.name} teaches ${loads.get(teacher.id) || 0} periods a week${elsewhere ? ` (${elsewhere} in other departments)` : ''} and is available for ${freePeriods(data, teacher)} of ${S}.`,
  )
  const secLoad = sec.assignments.reduce((n, a) => {
    const s = find(data.subjects, a.subjectId)
    return n + (s ? (s.lectureHours || 0) + (s.labHours || 0) * labSessionsOf(s) : 0)
  }, 0)
  d.facts.push(`${sec.name} has about ${secLoad} periods of classes a week out of ${S}.`)
  const others = [...new Set(run.unplaced || [])].filter((x) => !x.startsWith(what))
  if (others.length) d.facts.push(`Also unplaced: ${others.slice(0, 4).join('; ')}${others.length > 4 ? `; and ${others.length - 4} more` : ''}.`)

  // Suggestions follow the blockers, biggest first.
  if (unclear) {
    d.remedies.push({
      id: 'retry',
      text: `Generate again. Each run starts differently, and this class still had ${plural(f.open, 'free time slot')} when the ${Math.round((f.search?.timeLimitMs ?? 4000) / 1000)}-second search stopped.`,
    })
  }
  const role = lab ? 'lab' : 'lecture'
  const add = {
    teacher: () => {
      d.remedies.push(...reassignRemedies(data, sec.id, sub.id, role))
      if (teacher.unavailable?.length) {
        d.remedies.push({
          id: `free-${teacher.id}`,
          text: `Unblock some of the ${plural(teacher.unavailable.length, 'period')} ${teacher.name} is marked unavailable.`,
          where: WHERE.teachers,
          change: { type: 'teacher', id: teacher.id, patch: { unavailable: [] } },
        })
      }
    },
    section: () => d.remedies.push(...timeRemedies(data, { periodsNeeded: u.length })),
    rooms: () => d.remedies.push(...roomRemedies(data, u.kind, u.students, departmentId)),
  }
  if (f.noCandidates) add.teacher()
  for (const b of blockers) add[b.key]()
  if (!d.remedies.length) d.remedies.push(...roomRemedies(data, u.kind, u.students, departmentId), ...timeRemedies(data))
  return d
}

// ---------- entry point ----------

/**
 * "No room big enough" is reported per section and subject; one diagnosis (for the largest group) covers them all,
 * since a room that fits the largest fits the rest. With no rooms of a kind at all, the weekly-total issue for that
 * kind says the same thing again and is dropped.
 */
function mergeSimilar(issues) {
  const out = []
  const biggest = new Map()
  const seen = new Set()
  for (const i of issues) {
    if (seen.has(i.key)) continue
    seen.add(i.key)
    if (i.kind !== 'no-lab-room' && i.kind !== 'no-lecture-room') {
      out.push(i)
      continue
    }
    const prev = biggest.get(i.kind)
    if (!prev) biggest.set(i.kind, { ...i, similar: 0 })
    else biggest.set(i.kind, i.students > prev.students ? { ...i, similar: prev.similar + 1 } : { ...prev, similar: prev.similar + 1 })
  }
  const dropTotal = (kind, total) => biggest.has(kind) && out.some((i) => i.kind === total && i.rooms === 0)
  // The lab-block count is the tighter version of the lab-hours total, so only it is shown.
  const hasBlocks = out.some((i) => i.kind === 'lab-blocks')
  return [
    ...biggest.values(),
    ...out.filter(
      (i) =>
        !(i.kind === 'lab-rooms' && (hasBlocks || dropTotal('no-lab-room', 'lab-rooms'))) &&
        !(i.kind === 'lecture-rooms' && dropTotal('no-lecture-room', 'lecture-rooms')),
    ),
  ]
}

/**
 * Explains one generation run (a department's entry in timetable.byDept, or a whole result).
 * Returns [] when the run succeeded. Pre-check remedies are checked by re-running the pre-check with the change.
 */
export function diagnose(data, run, { departmentId, fixedEntries = [] } = {}) {
  if (!run || run.ok) return []
  if (run.issues?.length) {
    const ordered = mergeSimilar(run.issues).sort(
      (a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || shortfall(b) - shortfall(a),
    )
    return ordered.map((issue) => {
      const d = issueDiagnosis(data, issue, departmentId)
      if (issue.similar) d.cause += ` The same applies to ${plural(issue.similar, 'other class', 'other classes')}.`
      d.remedies = d.remedies.map((r) => {
        if (!r.change) return r
        const after = precheck(applyChange(data, r.change), { departmentId, fixedEntries })
        const checked = after.ok ? 'passes-precheck' : after.issues.some((i) => i.key === issue.key) ? null : 'clears-check'
        return { ...r, checked }
      })
      return d
    })
  }
  const fromSearch = run.failure && searchDiagnosis(data, run, departmentId, fixedEntries)
  if (fromSearch) return [fromSearch]
  // Older saved results (or problems without structure): show what we know, honestly.
  const text = run.problems?.length ? run.problems : run.reason ? [run.reason] : []
  if (!text.length && run.stats?.clashes) text.push(`The result has ${plural(run.stats.clashes, 'clash', 'clashes')}.`)
  if (!text.length) return []
  return [
    {
      id: 'unknown',
      certainty: run.problems?.length ? 'confirmed' : 'unknown',
      title: 'The timetable is incomplete',
      cause: text.join(' '),
      facts: [],
      remedies: [{ id: 'retry', text: 'Generate again to get detailed, specific suggestions.' }],
    },
  ]
}
