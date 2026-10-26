// Change assistant: an administrator describes a sudden change in plain words ("Dr. Kapil Sharma is on leave on
// Wednesday"), Claude turns it into structured changes (api/change.js), and this module checks them against the real
// college data, applies them, and works out which classes moved. PURE JS (no React, no network) so it can be tested.
//
// A proposal from Claude: { kind: 'changes' | 'question', question, summary, changes: [Change] }
// Change: { type, teacherId, roomId, reason, slots: [{ day: 'Wed', period: 1 }] }   (periods are 1-based)
//   teacher_unavailable / teacher_available   a teacher's unavailable slots (leave, duty, ...)
//   block_slots / unblock_slots               college-wide no-class slots (an event, a holiday morning)
//   room_out_of_service / room_back_in_service  a room closed for maintenance, or reopened
// Nothing from Claude is trusted: every id, day and period is checked here before anything is shown or applied.

import { periodTimes, periodsOn, slotKey } from './data/schema.js'
import { generateCollege } from './scheduler.js'

export const CHANGE_TYPES = [
  'teacher_unavailable',
  'teacher_available',
  'block_slots',
  'unblock_slots',
  'room_out_of_service',
  'room_back_in_service',
]
const TEACHER_TYPES = new Set(['teacher_unavailable', 'teacher_available'])
const SLOT_TYPES = new Set(['teacher_unavailable', 'teacher_available', 'block_slots', 'unblock_slots'])
const ROOM_TYPES = new Set(['room_out_of_service', 'room_back_in_service'])

// ---------- what Claude is told about the college ----------

/**
 * The college as compact, deterministic text (same data = same text, so the server can cache it): working days,
 * period times, current no-class slots, and every teacher and room with its id. Nothing about students.
 */
export function buildCatalog(data) {
  const { periods } = periodTimes(data.time)
  const dept = new Map((data.departments ?? []).map((d) => [d.id, d.short]))
  const lines = [
    `Working days (the timetable repeats every week): ${data.time.days.join(', ')}`,
    `Periods: ${periods.map((p, i) => `P${i + 1} ${p.start}-${p.end}`).join(', ')}`,
  ]
  const short = data.time.days.filter((d) => periodsOn(data.time, d) < data.time.periodsPerDay)
  if (short.length) lines.push(`Shorter days: ${short.map((d) => `${d} has P1-P${periodsOn(data.time, d)}`).join(', ')}`)
  const blocked = Object.entries(data.time.blocked ?? {})
  if (blocked.length) lines.push(`Already class-free: ${blocked.map(([k, why]) => `${k.replace('-', ' P')} (${why || 'no classes'})`).join(', ')}`)
  lines.push('', 'TEACHERS (id | name | department | already unavailable)')
  for (const t of [...data.teachers].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`${t.id} | ${t.name} | ${dept.get(t.deptId) ?? t.department ?? 'service department'} | ${(t.unavailable ?? []).join(' ') || '-'}`)
  }
  lines.push('', 'ROOMS (id | name | type | department | status)')
  for (const r of [...data.rooms].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`${r.id} | ${r.name} | ${r.type} | ${dept.get(r.deptId) ?? 'shared'} | ${r.outOfService ? 'out of service' : 'in use'}`)
  }
  return lines.join('\n')
}

/** "Monday 26 October 2026", for "this Wednesday" / "tomorrow" in the request. */
export const todayText = (now = new Date()) =>
  now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// ---------- checking a proposal ----------

/** "Wed all day", "Fri P1–P2", "Mon P3, P5–P6". */
export function slotsText(data, slots) {
  const byDay = new Map()
  for (const s of slots) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.period])
  return data.time.days
    .filter((d) => byDay.has(d))
    .map((d) => {
      const ps = [...new Set(byDay.get(d))].sort((a, b) => a - b)
      if (ps.length === periodsOn(data.time, d)) return `${d} all day`
      const runs = []
      for (const p of ps) {
        const last = runs.at(-1)
        if (last && p === last[1] + 1) last[1] = p
        else runs.push([p, p])
      }
      return `${d} ${runs.map(([a, b]) => (a === b ? `P${a}` : `P${a}–P${b}`)).join(', ')}`
    })
    .join('; ')
}

/**
 * Checks every proposed change against the college. Returns { question, summary, items } where each item is
 * { type, ok, problem, label, change } and only `ok` items can be applied.
 */
export function resolveProposal(data, proposal) {
  if (!proposal || typeof proposal !== 'object') return { question: '', summary: '', items: [] }
  const teachers = new Map(data.teachers.map((t) => [t.id, t]))
  const rooms = new Map(data.rooms.map((r) => [r.id, r]))
  const items = (Array.isArray(proposal.changes) ? proposal.changes : []).map((c) => {
    const fail = (problem) => ({ type: c?.type, ok: false, problem, label: problem, change: c })
    if (!CHANGE_TYPES.includes(c?.type)) return fail('A change of an unknown kind was left out.')
    const teacher = teachers.get(c.teacherId)
    const room = rooms.get(c.roomId)
    if (TEACHER_TYPES.has(c.type) && !teacher) return fail('A teacher who is not in the college data was left out.')
    if (ROOM_TYPES.has(c.type) && !room) return fail('A room that is not in the college data was left out.')
    let slots = []
    if (SLOT_TYPES.has(c.type)) {
      const raw = Array.isArray(c.slots) ? c.slots : []
      slots = raw.filter((s) => data.time.days.includes(s?.day) && Number.isInteger(s?.period) && s.period >= 1 && s.period <= periodsOn(data.time, s.day))
      if (!slots.length) return fail('A change without valid days and periods was left out.')
      const seen = new Set()
      slots = slots.filter((s) => !seen.has(`${s.day}-${s.period}`) && seen.add(`${s.day}-${s.period}`))
    }
    const reason = String(c.reason ?? '').trim().slice(0, 40)
    const when = slots.length ? slotsText(data, slots) : ''
    const label = {
      teacher_unavailable: () => `${teacher?.name} unavailable: ${when}${reason ? ` (${reason})` : ''}`,
      teacher_available: () => `${teacher?.name} available again: ${when}`,
      block_slots: () => `No classes for anyone: ${when}${reason ? ` (${reason})` : ''}`,
      unblock_slots: () => `Classes allowed again: ${when}`,
      room_out_of_service: () => `${room?.name} out of service${reason ? ` (${reason})` : ''}`,
      room_back_in_service: () => `${room?.name} back in service`,
    }[c.type]()
    return { type: c.type, ok: true, problem: '', label, change: { type: c.type, teacherId: teacher?.id, roomId: room?.id, reason, slots } }
  })
  return {
    question: proposal.kind === 'question' ? String(proposal.question ?? '').trim() : '',
    summary: String(proposal.summary ?? '').trim(),
    items,
  }
}

/**
 * The setup lists that change: { teachers?, time?, rooms? } (only the keys touched), ready for update(key, value).
 * Applies only `ok` items, in order.
 */
export function applyChanges(data, items) {
  let teachers = null
  let time = null
  let rooms = null
  for (const { ok, change: c } of items) {
    if (!ok) continue
    const keys = c.slots.map((s) => slotKey(s.day, s.period - 1))
    if (TEACHER_TYPES.has(c.type)) {
      teachers = (teachers ?? data.teachers).map((t) => {
        if (t.id !== c.teacherId) return t
        const now = new Set(t.unavailable ?? [])
        for (const k of keys) c.type === 'teacher_unavailable' ? now.add(k) : now.delete(k)
        return { ...t, unavailable: [...now] }
      })
    } else if (c.type === 'block_slots' || c.type === 'unblock_slots') {
      const base = time ?? data.time
      const blocked = { ...(base.blocked ?? {}) }
      for (const k of keys) {
        if (c.type === 'block_slots') blocked[k] = c.reason || 'No classes'
        else delete blocked[k]
      }
      time = { ...base, blocked }
    } else {
      rooms = (rooms ?? data.rooms).map((r) => (r.id === c.roomId ? { ...r, outOfService: c.type === 'room_out_of_service' || undefined } : r))
    }
  }
  return { ...(teachers ? { teachers } : {}), ...(time ? { time } : {}), ...(rooms ? { rooms } : {}) }
}

/**
 * Applies the checked changes and regenerates the whole college around the classes they don't affect (those stay
 * exactly where they were). Returns { ok, patch, timetable, moved, result }: `patch` is what to save with
 * update(key, value), `timetable` has `movedFrom` on every class that moved. When `ok` is false nothing should be
 * saved: `result` explains why (problems / reason) and the published timetable stays as it is.
 */
export function updateTimetable(data, items, options = {}) {
  const patch = applyChanges(data, items)
  const next = { ...data, ...patch }
  const previous = (data.timetable ?? data.previous)?.entries ?? []
  const result = generateCollege(next, { ...options, keep: previous })
  if (!result.ok) return { ok: false, patch, timetable: null, moved: 0, result }
  const moves = diffMoves(previous, result.entries)
  const timetable = { ...result, entries: markMoved(result.entries, moves), generatedAt: new Date().toISOString() }
  return { ok: true, patch, timetable, moved: moves.length, result }
}

// ---------- what moved ----------

const unitKey = (e) => [e.sectionId, e.subjectId, e.kind, e.groupIndex ?? '', e.teacherId, e.length].join('|')
const placeKey = (e) => [e.day, e.period, e.roomId].join('|')

/**
 * Classes of `next` that are not where they were in `previous`: [{ entry, from: { day, period, roomId } }].
 * Identical classes (e.g. three lectures of one subject) are paired so that only real moves count.
 */
export function diffMoves(previous, next) {
  const before = new Map()
  for (const e of previous) before.set(unitKey(e), [...(before.get(unitKey(e)) ?? []), e])
  const after = new Map()
  for (const e of next) after.set(unitKey(e), [...(after.get(unitKey(e)) ?? []), e])
  const moves = []
  for (const [key, now] of after) {
    const was = before.get(key) ?? []
    const wasPlaces = new Map()
    for (const e of was) wasPlaces.set(placeKey(e), (wasPlaces.get(placeKey(e)) ?? 0) + 1)
    const stayed = (e) => {
      const n = wasPlaces.get(placeKey(e)) ?? 0
      if (n) wasPlaces.set(placeKey(e), n - 1)
      return n > 0
    }
    const moved = now.filter((e) => !stayed(e))
    const gone = was.filter((e) => {
      const n = wasPlaces.get(placeKey(e)) ?? 0
      if (n) wasPlaces.set(placeKey(e), n - 1)
      return n > 0
    })
    moved.forEach((entry, i) => gone[i] && moves.push({ entry, from: { day: gone[i].day, period: gone[i].period, roomId: gone[i].roomId } }))
  }
  return moves
}

/** The new entries with `movedFrom` set on the ones that moved (and cleared on the rest). */
export function markMoved(next, moves) {
  const from = new Map(moves.map((m) => [m.entry, m.from]))
  return next.map((e) => {
    const { movedFrom, ...rest } = e
    return from.has(e) ? { ...rest, movedFrom: from.get(e) } : rest
  })
}

/** "Wed 10:30–11:30". */
export function whenText(data, day, period, length = 1) {
  const { periods } = periodTimes(data.time)
  const name = data.time.days[day] ?? '?'
  return `${name} ${periods[period]?.start ?? '?'}–${periods[period + length - 1]?.end ?? '?'}`
}

/** One line per moved class: "D3 CS A · Object Oriented Programming lab (A1): Wed 10:30–12:30 in Lab 2 → Thu 14:30–16:30 in Lab 2". */
export function moveLines(data, entries) {
  const subjects = new Map(data.subjects.map((s) => [s.id, s]))
  const sections = new Map(data.sections.map((s) => [s.id, s]))
  const rooms = new Map(data.rooms.map((r) => [r.id, r]))
  return entries
    .filter((e) => e.movedFrom)
    .sort((a, b) => (sections.get(a.sectionId)?.name ?? '').localeCompare(sections.get(b.sectionId)?.name ?? '') || a.day - b.day || a.period - b.period)
    .map((e) => {
      const kind = e.kind === 'lecture' ? 'lecture' : e.kind
      const what = `${subjects.get(e.subjectId)?.name ?? 'Class'} ${kind}${e.group ? ` (${e.group})` : ''}`
      const was = `${whenText(data, e.movedFrom.day, e.movedFrom.period, e.length)} in ${rooms.get(e.movedFrom.roomId)?.name ?? '?'}`
      const now = `${whenText(data, e.day, e.period, e.length)} in ${rooms.get(e.roomId)?.name ?? '?'}`
      return { entry: e, section: sections.get(e.sectionId)?.name ?? '?', what, was, now, text: `${sections.get(e.sectionId)?.name ?? '?'} · ${what}: ${was} → ${now}` }
    })
}

/**
 * Exact facts for the announcement draft (api/change.js, mode "announce"): the applied changes, how many classes
 * moved, and which (at most `limit` lines). Claude may only reword these facts.
 */
export function announcementFacts(data, items, entries, limit = 40) {
  const lines = moveLines(data, entries)
  const total = entries.length
  return [
    'CHANGES:',
    ...items.filter((i) => i.ok).map((i) => `- ${i.label}`),
    '',
    `RESULT: ${lines.length} of ${total} classes moved; every other class stays where it was.`,
    '',
    'MOVED CLASSES (section · class: before → after):',
    ...lines.slice(0, limit).map((l) => `- ${l.text}`),
    ...(lines.length > limit ? [`- and ${lines.length - limit} more`] : []),
  ].join('\n')
}
