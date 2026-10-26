// Book a Space: one-off room bookings (workshops, seminars, meetings, extra classes), checked against the
// regular weekly timetable and other confirmed bookings. Pure JS, no React, so it can be unit-tested.
//
// Booking: { id, status: 'confirmed' | 'cancelled', eventType, title, department, organizerId?, organizerName,
//            attendance, notes, facilities: string[], roomId, date: 'YYYY-MM-DD', start: 'HH:MM',
//            duration (min), setup (min), cleanup (min), createdAt, createdBy: { role, teacherId? }, cancelledAt? }

import { periodTimes, roomTypeName } from './data/schema.js'

export const EVENT_TYPES = ['Workshop', 'Seminar', 'Guest Lecture', 'Extra Class', 'Meeting', 'Other']
export const OPEN_FROM = 7 * 60 // bookings allowed between 07:00 ...
export const OPEN_UNTIL = 21 * 60 // ... and 21:00 (including buffers)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_REASONS = new Set(['class', 'booking'])

// ---------- time helpers ----------

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}
export const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDate = (iso) => new Date(`${iso}T00:00:00`)
const addDays = (iso, n) => {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}
export const weekdayOf = (iso) => WEEKDAYS[parseDate(iso).getDay()]
export const formatDate = (iso) =>
  parseDate(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Event time and the full interval the room is held for (including setup and cleanup). */
export function windowOf(b) {
  const start = toMinutes(b.start)
  const end = start + Number(b.duration)
  return { start, end, from: start - Number(b.setup || 0), to: end + Number(b.cleanup || 0) }
}
export const timeRange = (b) => {
  const w = windowOf(b)
  return `${toHHMM(w.start)}–${toHHMM(w.end)}`
}
const overlaps = (a, b) => a.from < b.to && b.from < a.to

/** First working day (from the timetable's days) strictly after `today`. */
export function nextWorkingDay(data, today = new Date()) {
  let iso = isoDate(today)
  for (let i = 0; i < 14; i++) {
    iso = addDays(iso, 1)
    if (data.time.days.includes(weekdayOf(iso))) return iso
  }
  return addDays(isoDate(today), 1)
}

// ---------- what occupies a room ----------

/**
 * Regular classes held in a room on a given date (the weekly timetable repeats every week). With shared data,
 * classes the user may not see in detail come from data.busy.rooms and are labelled only "Class".
 */
export function classIntervals(data, roomId, date) {
  const day = data.time.days.indexOf(weekdayOf(date))
  if (day < 0) return []
  const { periods } = periodTimes(data.time)
  const subjects = new Map(data.subjects.map((s) => [s.id, s]))
  const sections = new Map(data.sections.map((s) => [s.id, s]))
  const span = (e) => ({ from: toMinutes(periods[e.period].start), to: toMinutes(periods[e.period + e.length - 1].end) })
  const visible = (data.timetable?.entries ?? [])
    .filter((e) => e.roomId === roomId && e.day === day)
    .map((e) => ({
      ...span(e),
      label: `${subjects.get(e.subjectId)?.name ?? 'Class'} ${e.kind} for ${sections.get(e.sectionId)?.name ?? '?'}${
        e.group ? ` (${e.group})` : ''
      }`,
    }))
  const hidden = (data.busy?.rooms ?? [])
    .filter((e) => e.roomId === roomId && e.day === day && periods[e.period + e.length - 1])
    .map((e) => ({ ...span(e), label: 'Class' }))
  return [...visible, ...hidden]
}

/** Confirmed bookings of a room on a date, as held intervals (buffers included). */
export function bookingIntervals(bookings, roomId, date, ignoreId) {
  return bookings
    .filter((b) => b.status === 'confirmed' && b.roomId === roomId && b.date === date && b.id !== ignoreId)
    .map((b) => ({ ...windowOf(b), label: `${b.title} (${b.eventType}, ${b.id})` }))
}

/** Other people's confirmed bookings of a room on a date (shared data: times only, from data.busy.holds). */
export function holdIntervals(data, roomId, date) {
  return (data.busy?.holds ?? [])
    .filter((h) => h.roomId === roomId && h.date === date)
    .map((h) => ({ ...windowOf(h), label: 'another booking' }))
}

// ---------- validation and room search ----------

/** Plain-language problems with a request, grouped by wizard step ('details' | 'schedule'). */
export function validateRequest(req, now = new Date()) {
  const errors = { details: [], schedule: [] }
  if (!req.title?.trim()) errors.details.push('Give the event a name.')
  if (!req.organizerName?.trim()) errors.details.push('Choose or enter the organizer.')
  if (!(Number(req.attendance) >= 1)) errors.details.push('Expected attendance must be at least 1.')

  if (!req.date) errors.schedule.push('Pick a date.')
  if (!req.start) errors.schedule.push('Pick a start time.')
  if (!(Number(req.duration) > 0)) errors.schedule.push('Duration must be more than 0 minutes.')
  if (req.date && req.start && Number(req.duration) > 0) {
    const w = windowOf(req)
    if (w.from < OPEN_FROM || w.to > OPEN_UNTIL) {
      errors.schedule.push(
        `Rooms can be booked between ${toHHMM(OPEN_FROM)} and ${toHHMM(OPEN_UNTIL)}; with setup and cleanup this booking runs ${toHHMM(w.from)}–${toHHMM(w.to)}.`,
      )
    }
    const startsAt = new Date(`${req.date}T${req.start}:00`)
    if (startsAt < now) errors.schedule.push('That time has already passed. Pick a future date or time.')
  }
  return errors
}

/** Does a room suit the event, and is it free for the whole held interval? */
export function checkRoom(data, bookings, room, req, ignoreId) {
  const reasons = []
  if (room.outOfService) reasons.push({ kind: 'closed', text: 'Out of service' })
  if (room.capacity < Number(req.attendance)) {
    reasons.push({ kind: 'capacity', text: `Only ${room.capacity} seats (needs ${req.attendance})` })
  }
  if (req.roomType && req.roomType !== 'any' && room.type !== req.roomType) {
    reasons.push({ kind: 'type', text: `It is a ${roomTypeName(data, room.type).toLowerCase()}` })
  }
  const missing = (req.facilities || []).filter((f) => !(room.facilities || []).includes(f))
  if (missing.length) reasons.push({ kind: 'facilities', text: `No ${missing.join(', ').toLowerCase()}` })

  const held = windowOf(req)
  for (const c of classIntervals(data, room.id, req.date)) {
    if (overlaps(held, c)) reasons.push({ kind: 'class', text: `Class ${toHHMM(c.from)}–${toHHMM(c.to)}: ${c.label}` })
  }
  for (const b of [...bookingIntervals(bookings, room.id, req.date, ignoreId), ...holdIntervals(data, room.id, req.date)]) {
    if (overlaps(held, b)) reasons.push({ kind: 'booking', text: `Booked ${toHHMM(b.from)}–${toHHMM(b.to)}: ${b.label}` })
  }
  return { room, available: reasons.length === 0, reasons }
}

/** All rooms split into available (best fit first) and unavailable (with reasons). */
export function findSpaces(data, bookings, req) {
  const results = data.rooms.map((room) => checkRoom(data, bookings, room, req))
  const available = results
    .filter((r) => r.available)
    .sort((a, b) => a.room.capacity - b.room.capacity || a.room.name.localeCompare(b.room.name))
  const unavailable = results.filter((r) => !r.available)
  return { available, unavailable }
}

/** Rooms that suit the event (size, type, facilities) regardless of time. */
export function suitableRooms(data, req) {
  return data.rooms.filter((room) =>
    checkRoom({ ...data, timetable: null }, [], room, req).reasons.every((r) => TIME_REASONS.has(r.kind)),
  )
}

/**
 * When nothing is free: explain why, and suggest nearby times (same day first, then the following days)
 * at which at least one suitable room is free for the whole period.
 */
export function suggestAlternatives(data, bookings, req, { limit = 4, now = new Date() } = {}) {
  const suitable = suitableRooms(data, req)
  if (!suitable.length) {
    const sameType = data.rooms.filter((r) => !req.roomType || req.roomType === 'any' || r.type === req.roomType)
    const biggest = sameType.reduce((a, r) => (r.capacity > (a?.capacity ?? 0) ? r : a), null)
    const parts = []
    if (biggest && biggest.capacity < Number(req.attendance)) {
      parts.push(`the largest ${req.roomType && req.roomType !== 'any' ? roomTypeName(data, req.roomType).toLowerCase() : 'room'} (${biggest.name}) seats ${biggest.capacity}`)
    }
    if (req.facilities?.length) parts.push(`check whether every room really needs ${req.facilities.join(', ').toLowerCase()}`)
    if (req.roomType && req.roomType !== 'any') parts.push('try "Any room type"')
    return {
      slots: [],
      reason: `No room matches the size, type and equipment you asked for at any time${parts.length ? `: ${parts.join('; ')}.` : '.'}`,
    }
  }

  const duration = Number(req.duration)
  const setup = Number(req.setup || 0)
  const cleanup = Number(req.cleanup || 0)
  const original = toMinutes(req.start)
  const freeAt = (date, start) => {
    const trial = { ...req, date, start: toHHMM(start) }
    if (new Date(`${trial.date}T${trial.start}:00`) < now) return null
    const free = suitable.filter((room) => checkRoom(data, bookings, room, trial).available).length
    return free ? { date, start: trial.start, rooms: free } : null
  }
  // Same-day starts every 30 minutes, split into earlier (nearest first) and later (nearest first).
  const sameDay = []
  for (let s = OPEN_FROM + setup; s + duration + cleanup <= OPEN_UNTIL; s += 30) if (s !== original) sameDay.push(s)
  const earlier = sameDay.filter((s) => s < original).reverse()
  const later = sameDay.filter((s) => s > original)
  const firstFree = (starts) => {
    for (const s of starts) {
      const slot = freeAt(req.date, s)
      if (slot) return slot
    }
    return null
  }

  // The nearest free time after and before the request, then the same time on the following days,
  // then more same-day options, so suggestions aren't all bunched at one end of the day.
  const slots = [firstFree(later), firstFree(earlier)].filter(Boolean)
  for (let i = 1; i <= 7 && slots.length < limit; i++) {
    if (!data.time.days.includes(weekdayOf(addDays(req.date, i)))) continue // only the college's working days
    const slot = freeAt(addDays(req.date, i), original)
    if (slot) slots.push(slot)
  }
  for (const s of [...later, ...earlier]) {
    if (slots.length >= limit) break
    if (slots.some((x) => x.date === req.date && x.start === toHHMM(s))) continue
    const slot = freeAt(req.date, s)
    if (slot) slots.push(slot)
  }
  slots.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
  return { slots: slots.slice(0, limit), reason: '' }
}

// ---------- creating bookings ----------

export function makeBookingId(date) {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `BK-${date.replaceAll('-', '').slice(2)}-${random}`
}

export function createBooking(req, room, createdBy) {
  return {
    id: makeBookingId(req.date),
    status: 'confirmed',
    eventType: req.eventType,
    title: req.title.trim(),
    department: req.department,
    deptId: req.deptId || undefined,
    organizerId: req.organizerId || undefined,
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
    createdAt: new Date().toISOString(),
    createdBy,
  }
}

/** Confirmed bookings that have not ended yet, soonest first. */
export function upcomingBookings(bookings, now = new Date()) {
  const nowKey = `${isoDate(now)} ${toHHMM(now.getHours() * 60 + now.getMinutes())}`
  return bookings
    .filter((b) => b.status === 'confirmed' && `${b.date} ${toHHMM(windowOf(b).end)}` >= nowKey)
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
}

// ---------- demo bookings ----------

/**
 * A few sample bookings on the next working day so the feature can be demonstrated straight away:
 * the events-only seminar hall is busy in the morning and afternoon, and a classroom is booked after hours.
 * Seminar halls marked eventsOnly never hold regular classes, so these never clash with the timetable.
 */
export function seedBookings(data, today = new Date()) {
  const date = nextWorkingDay(data, today)
  const hall = data.rooms.find((r) => r.eventsOnly) ?? data.rooms.find((r) => r.type === 'seminar')
  const classroom = data.rooms.find((r) => r.type === 'classroom')
  const byName = (part) => data.teachers.find((t) => t.name.includes(part)) ?? data.teachers[0]
  const make = (room, teacher, fields) =>
    room &&
    teacher && {
      ...createBooking(
        { ...fields, date, organizerId: teacher.id, organizerName: teacher.name, department: teacher.department, deptId: teacher.deptId, setup: 15, cleanup: 15 },
        room,
        { role: 'faculty', teacherId: teacher.id },
      ),
      id: `BK-DEMO-${fields.key}`,
    }
  return [
    make(hall, byName('Amit Jain'), {
      key: 'WRK1', eventType: 'Workshop', title: 'Hands-on Generative AI Workshop', attendance: 100,
      notes: 'Needs projector and microphones.', start: '10:00', duration: 180,
    }),
    make(hall, byName('Kiran Jyoti'), {
      key: 'GL01', eventType: 'Guest Lecture', title: 'Industry Talk: Careers in Cloud Computing', attendance: 110,
      notes: '', start: '14:30', duration: 90,
    }),
    make(classroom, byName('Kamaldeep'), {
      key: 'MTG1', eventType: 'Meeting', title: 'Department Faculty Meeting', attendance: 30,
      notes: '', start: '17:45', duration: 60,
    }),
  ].filter(Boolean)
}
