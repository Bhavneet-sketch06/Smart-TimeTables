// Campus Guide: role-specific views of rooms, classes and space requests. Pure JS (no React).
//
// Requests are kept apart from confirmed bookings (data.requests vs data.bookings): a pending request never
// holds a room. Confirming one re-checks the room and turns it into a booking (see useCollegeData).
//
// Request: { id, status: 'pending' | 'approved' | 'declined' | 'withdrawn', ...the booking fields (eventType,
//            title, department, deptId, organizerName, attendance, notes, facilities, roomId, date, start,
//            duration, setup, cleanup), requester: { role, name, clientId?, teacherId?, sectionId?, deptId? },
//            createdAt, decidedAt?, decisionNote?, bookingId? }
//
// Privacy: only the administrator sees what occupies a room. Everyone else gets publicReasons(): "a scheduled
// class uses it then", never which class, section or teacher.

import { DAY_NAMES, isClosed, openPeriodsOf, periodTimes, periodsOn, roomTypesOf } from './data/schema.js'
import { OPEN_UNTIL, checkRoom, findSpaces, isoDate, toHHMM, toMinutes, weekdayOf, windowOf } from './booking.js'
import { WEEKDAYS } from './myDay.js'

export const REQUEST_STATUS = {
  pending: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Confirmed', tone: 'emerald' },
  declined: { label: 'Declined', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'slate' },
}

export const STUDENT_EVENT_TYPES = ['Club meeting', 'Interdepartmental event', 'Cultural event', 'Study group', 'Sports or fitness', 'Other']

// ---------- requests ----------

export function makeRequestId(date) {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `RQ-${date.replaceAll('-', '').slice(2)}-${random}`
}

/** A pending request for a room (nothing is reserved until an administrator confirms it). */
export function createRequest(req, room, requester) {
  return {
    id: makeRequestId(req.date),
    status: 'pending',
    eventType: req.eventType,
    title: req.title.trim(),
    department: req.department ?? '',
    deptId: req.deptId || undefined,
    organizerName: req.organizerName.trim(),
    attendance: Number(req.attendance),
    notes: req.notes?.trim() || '',
    facilities: req.facilities || [],
    roomId: room.id,
    date: req.date,
    start: req.start,
    duration: Number(req.duration),
    setup: Number(req.setup || 0),
    cleanup: Number(req.cleanup || 0),
    requester,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Whether a role must ask before using a room. Students always ask. Faculty and HODs book their own
 * department's rooms directly and ask for shared or other departments' rooms. Administrators book directly.
 */
export function needsApproval(role, room, deptId) {
  if (role === 'student') return true
  if (role === 'admin') return false
  return !room.deptId || room.deptId !== deptId
}

/** Upcoming first, then the rest newest first. */
export function sortRequests(requests) {
  const order = { pending: 0, approved: 1, declined: 2, withdrawn: 3 }
  return [...requests].sort((a, b) => order[a.status] - order[b.status] || `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`))
}

// ---------- availability ----------

/** The reason a room can't be used, without revealing whose class or booking it is. */
export function publicReason(r) {
  if (r.kind === 'class') return { kind: 'class', text: `A scheduled class uses it ${r.text.match(/\d\d:\d\d–\d\d:\d\d/)?.[0] ?? 'then'}` }
  if (r.kind === 'booking') return { kind: 'booking', text: `Already booked ${r.text.match(/\d\d:\d\d–\d\d:\d\d/)?.[0] ?? 'then'}` }
  return r
}

/**
 * Room search for a role. Availability comes from the regular timetable and confirmed bookings (never pending
 * requests); a room is available only if it's free for the whole interval, setup and cleanup included.
 * Non-admin audiences get public reasons and public room details only.
 */
export function searchSpaces(data, bookings, req, { audience = 'public' } = {}) {
  const found = findSpaces(data, bookings, req)
  // Ordinary rooms before labs and workshops (which suit fewer activities), then the snuggest fit.
  const kinds = new Map(roomTypesOf(data).map((t) => [t.id, t.kind]))
  const available = [...found.available].sort((a, b) => (kinds.get(a.room.type) === 'lab') - (kinds.get(b.room.type) === 'lab'))
  const unavailable = found.unavailable
  if (audience === 'admin') return { available, unavailable }
  return {
    available,
    unavailable: unavailable.map((u) => ({ ...u, reasons: u.reasons.map(publicReason) })),
  }
}

/** The admin's view of a pending request right now: still free? if not, why, and which rooms are free instead. */
export function reviewRequest(data, bookings, request) {
  const room = data.rooms.find((r) => r.id === request.roomId)
  if (!room) return { available: false, reasons: [{ kind: 'room', text: 'This room no longer exists.' }], alternatives: [] }
  const check = checkRoom(data, bookings, room, request)
  const alternatives = check.available ? [] : findSpaces(data, bookings, request).available.map((a) => a.room)
  return { available: check.available, reasons: check.reasons, alternatives }
}

/** True once a request's time has passed (it can no longer be confirmed). */
export const isPast = (r, now = new Date()) => new Date(`${r.date}T${toHHMM(windowOf(r).end)}:00`) < now

// ---------- classes ----------

/**
 * The next occurrences of a set of weekly classes from now, across the coming days:
 * [{ date, dayName, start, end, entry, today }], soonest first.
 */
export function upcomingClasses(data, entries, now = new Date(), { limit = 6, days = 8 } = {}) {
  const { periods } = periodTimes(data.time)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const out = []
  for (let i = 0; i < days && out.length < limit; i++) {
    const date = new Date(now)
    date.setDate(now.getDate() + i)
    const name = WEEKDAYS[date.getDay()]
    const d = data.time.days.indexOf(name)
    if (d < 0) continue
    const today = entries
      .filter((e) => e.day === d)
      .map((e) => ({ entry: e, start: periods[e.period]?.start, end: periods[Math.min(e.period + e.length, periods.length) - 1]?.end }))
      .filter((c) => c.start && (i > 0 || toMinutes(c.end) > nowMin))
      .sort((a, b) => a.start.localeCompare(b.start))
    for (const c of today) out.push({ ...c, date: isoDate(date), dayName: DAY_NAMES[name] ?? name, today: i === 0 })
  }
  return out.slice(0, limit)
}

/**
 * Times in the week when every listed section is free (no lecture, lab or tutorial for any of its groups),
 * merged into runs of at least `minPeriods`: [{ day, dayName, from, to, start, end, periods }].
 * Only free/busy is computed: nothing about who teaches what is returned.
 */
export function commonFreeSlots(data, sectionIds, { minPeriods = 1 } = {}) {
  const P = data.time.periodsPerDay
  const { periods } = periodTimes(data.time)
  const ids = new Set(sectionIds)
  const busy = new Set()
  for (const e of data.timetable?.entries ?? []) {
    if (!ids.has(e.sectionId)) continue
    for (let k = 0; k < e.length; k++) busy.add(`${e.day}|${e.period + k}`)
  }
  const slots = []
  data.time.days.forEach((name, d) => {
    let from = null
    for (let p = 0; p <= P; p++) {
      const free = p < P && !busy.has(`${d}|${p}`) && !isClosed(data.time, name, p)
      if (free && from === null) from = p
      if (!free && from !== null) {
        if (p - from >= minPeriods) {
          slots.push({ day: d, dayName: DAY_NAMES[name] ?? name, short: name, from, to: p, start: periods[from].start, end: periods[p - 1].end, periods: p - from })
        }
        from = null
      }
    }
  })
  return slots
}

/**
 * Times for a joint session of several sections, best first: { full, partial, after }.
 *   full     everyone is free (from commonFreeSlots)
 *   partial  when no time suits everyone: the times when most sections are free, as counts only
 *            ("7 of 8 sections free"), never which sections are busy
 *   after    each working day after its last period, until rooms close: no regular classes at all
 */
export function jointTimes(data, sectionIds, { minPeriods = 1, partialLimit = 4 } = {}) {
  const full = commonFreeSlots(data, sectionIds, { minPeriods })
  const P = data.time.periodsPerDay
  const { periods } = periodTimes(data.time)
  const total = sectionIds.length
  const busyBy = new Map() // "day|period" -> sections busy
  const ids = new Set(sectionIds)
  for (const e of data.timetable?.entries ?? []) {
    if (!ids.has(e.sectionId)) continue
    for (let k = 0; k < e.length; k++) {
      const key = `${e.day}|${e.period + k}`
      busyBy.set(key, (busyBy.get(key) ?? new Set()).add(e.sectionId))
    }
  }
  const partial = []
  if (full.length < 3 && total > 1) {
    data.time.days.forEach((name, d) => {
      for (let p = 0; p + minPeriods <= P; p++) {
        let freeCount = total
        let ok = true
        for (let k = 0; k < minPeriods; k++) {
          if (isClosed(data.time, name, p + k)) ok = false
          freeCount = Math.min(freeCount, total - (busyBy.get(`${d}|${p + k}`)?.size ?? 0))
        }
        if (!ok || freeCount === total || freeCount < Math.ceil(total / 2)) continue
        partial.push({ day: d, dayName: DAY_NAMES[name] ?? name, short: name, from: p, to: p + minPeriods, start: periods[p].start, end: periods[p + minPeriods - 1].end, free: freeCount, total })
      }
    })
    partial.sort((a, b) => b.free - a.free || a.day - b.day || a.from - b.from)
    partial.splice(partialLimit)
  }
  const after = data.time.days
    .map((name, d) => {
      const last = periodsOn(data.time, name)
      const start = last ? periods[last - 1].end : periods[0]?.start
      return { day: d, dayName: DAY_NAMES[name] ?? name, short: name, start, end: toHHMM(OPEN_UNTIL), after: true }
    })
    .filter((s) => s.start && toMinutes(s.start) + 30 <= OPEN_UNTIL)
  return { full, partial, after }
}

/** The next date (from today, today included if still ahead) that falls on a weekday name. */
export function nextDateFor(dayShort, start, now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    if (WEEKDAYS[d.getDay()] !== dayShort) continue
    if (i === 0 && toMinutes(start) <= now.getHours() * 60 + now.getMinutes()) continue
    return isoDate(d)
  }
  return isoDate(now)
}

// ---------- administrator overview ----------

/**
 * Every room on a date: what is on now and next, and all of the day's classes and confirmed bookings.
 * [{ room, items: [{ from, to, kind: 'class' | 'booking', label, dept }], now, next, conflicts }]
 */
export function roomOverview(data, bookings, date, now = new Date()) {
  const day = data.time.days.indexOf(weekdayOf(date))
  const { periods } = periodTimes(data.time)
  const subjects = new Map(data.subjects.map((s) => [s.id, s]))
  const sections = new Map(data.sections.map((s) => [s.id, s]))
  const depts = new Map((data.departments ?? []).map((d) => [d.id, d.short]))
  const nowMin = date === isoDate(now) ? now.getHours() * 60 + now.getMinutes() : -1
  return data.rooms.map((room) => {
    const classes = day < 0
      ? []
      : (data.timetable?.entries ?? [])
          .filter((e) => e.roomId === room.id && e.day === day)
          .map((e) => {
            const sec = sections.get(e.sectionId)
            return {
              from: toMinutes(periods[e.period].start),
              to: toMinutes(periods[e.period + e.length - 1].end),
              kind: 'class',
              label: `${subjects.get(e.subjectId)?.name ?? 'Class'} · ${sec?.name ?? '?'}${e.group ? ` (${e.group})` : ''}`,
              dept: depts.get(sec?.deptId) ?? '',
            }
          })
    const booked = bookings
      .filter((b) => b.status === 'confirmed' && b.roomId === room.id && b.date === date)
      .map((b) => ({ ...windowOf(b), kind: 'booking', label: `${b.title} (${b.eventType})`, dept: b.department ?? '', id: b.id }))
    const items = [...classes, ...booked].sort((a, b) => a.from - b.from)
    // A confirmed booking that overlaps a class (possible after the timetable is regenerated).
    const conflicts = booked.filter((b) => classes.some((c) => b.from < c.to && c.from < b.to))
    return {
      room,
      items,
      now: items.find((x) => x.from <= nowMin && nowMin < x.to) ?? null,
      next: items.find((x) => x.from > nowMin) ?? null,
      conflicts,
    }
  })
}

/**
 * Rooms used by more than one department in the weekly timetable (shared rooms), with each department's
 * periods per week, so overlapping demand on shared rooms is visible.
 */
export function sharedRoomUse(data) {
  const depts = new Map((data.departments ?? []).map((d) => [d.id, d.short]))
  const deptOf = new Map(data.sections.map((s) => [s.id, s.deptId]))
  const use = new Map()
  for (const e of data.timetable?.entries ?? []) {
    const d = depts.get(deptOf.get(e.sectionId)) ?? '?'
    const row = use.get(e.roomId) ?? new Map()
    row.set(d, (row.get(d) ?? 0) + e.length)
    use.set(e.roomId, row)
  }
  const openPeriods = openPeriodsOf(data.time)
  return data.rooms
    .filter((r) => !r.eventsOnly && (!r.deptId || (use.get(r.id)?.size ?? 0) > 1))
    .map((room) => {
      const row = use.get(room.id) ?? new Map()
      const used = [...row.values()].reduce((a, b) => a + b, 0)
      return { room, byDept: [...row].sort((a, b) => b[1] - a[1]), used, free: Math.max(0, openPeriods - used) }
    })
    .sort((a, b) => b.byDept.length - a.byDept.length || b.used - a.used)
}

// ---------- demo requests ----------

/**
 * Two sample student requests on the next working day so the review flow can be shown straight away:
 * one waiting for approval (an interdepartmental club meetup in a free shared room after classes) and one
 * declined (it asked for the seminar hall while a workshop is on). `clientId` makes them this browser's own.
 */
export function seedRequests(data, bookings, date, clientId) {
  const section = data.sections[0]
  const dept = (data.departments ?? []).find((d) => d.id === section?.deptId)
  const roomsByCap = [...data.rooms].filter((r) => !r.eventsOnly).sort((a, b) => b.capacity - a.capacity)
  const hall = data.rooms.find((r) => r.eventsOnly)
  const base = {
    department: dept?.short ?? '',
    deptId: dept?.id,
    organizerName: 'Aman Gill',
    notes: '',
    facilities: [],
    date,
    setup: 0,
    cleanup: 0,
  }
  const requester = { role: 'student', name: 'Aman Gill', clientId, sectionId: section?.id, deptId: dept?.id }
  const meetup = { ...base, eventType: 'Interdepartmental event', title: 'Coding Club: inter-department hackathon kick-off', attendance: 60, start: '17:45', duration: 60 }
  const room = roomsByCap.find((r) => r.capacity >= 60 && checkRoom(data, bookings, r, meetup).available)
  const out = []
  if (room) out.push({ ...createRequest(meetup, room, requester), id: 'RQ-DEMO-CLUB', createdAt: new Date(`${date}T08:00:00`).toISOString() })
  if (hall) {
    out.push({
      ...createRequest({ ...base, eventType: 'Cultural event', title: 'Dance society rehearsal', attendance: 40, start: '11:00', duration: 60 }, hall, requester),
      id: 'RQ-DEMO-DANCE',
      status: 'declined',
      decidedAt: new Date(`${date}T08:30:00`).toISOString(),
      decisionNote: 'The hall is booked for a workshop then. Please request 16:30 or a classroom after 17:30.',
    })
  }
  return out
}
