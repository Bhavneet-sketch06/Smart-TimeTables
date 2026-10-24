/**
 * Data shapes (all stored together in localStorage under STORAGE_KEY):
 *
 * time:     { days: string[], periodsPerDay, startTime: 'HH:MM', periodMinutes,
 *             breaks: [{ after, minutes, label }],   breaks after period `after` (1-based count of periods before it)
 *             dayPeriods?: { Sat: 4 },                 shorter days (periods taught that day; default periodsPerDay)
 *             blocked?: { 'Wed-6': 'Sports' } }        college-wide slots with no classes (assembly, sports, ...)
 *           days may be any of Mon..Sun, in the college's week order. Older data has a single break
 *           (breakAfter / breakMinutes); breaksOf() reads both and normalizeTime() upgrades it.
 * roomTypes: [{ id, name, kind: 'lecture' | 'lab' }]   the college's room types (defaults: classroom, lab, seminar)
 *           kind says what a type is for: 'lecture' rooms hold lectures and tutorials, 'lab' rooms hold labs
 * rooms:    { id, name, capacity, type: roomTypes id, facilities?: string[], eventsOnly?: boolean }
 *           eventsOnly rooms are never used for regular classes, only for Book a Space bookings
 * teachers: { id, name, department, subjectIds: string[], maxHours, unavailable: string[] }
 *           unavailable slot keys look like "Mon-1" (1-based period)
 * subjects: { id, name, code, lectureHours, labHours,
 *             lectureRoomType?, lectureNeeds?: string[], labRoomType?, labNeeds?: string[] }
 *           labHours = length of one lab block in consecutive periods (0 = no lab)
 *           *RoomType = the room type a class needs (default: any room of the right kind);
 *           *Needs = facilities the room must have (e.g. ['Computers'])
 * sections: { id, name, department, students, assignments: { subjectId, teacherId }[] }
 * timetable: null | { entries, stats, generatedAt }
 * meta:     null | { name, note }   where the data came from (shown in the UI)
 * bookings: one-off room bookings (see src/booking.js); kept when the timetable is regenerated
 * sections may also have labGroups (e.g. 2) and groupNames (e.g. ['A1', 'A2']); labs then run per group.
 * subjects may have labSessions (lab blocks per group per week, default 1);
 * assignments may have labTeacherId when the lab is taught by someone else.
 */

export const STORAGE_KEY = 'ttgen:v1'

export const ROOM_TYPES = ['classroom', 'lab', 'seminar']
export const DEFAULT_ROOM_TYPES = [
  { id: 'classroom', name: 'Classroom', kind: 'lecture' },
  { id: 'lab', name: 'Lab', kind: 'lab' },
  { id: 'seminar', name: 'Seminar hall', kind: 'lecture' },
]
export const ROOM_KINDS = { lecture: 'Lectures & tutorials', lab: 'Labs & practicals' }

/** A sensible kind for a room type known only by name, e.g. "Computer lab" or "Drawing hall" hold labs. */
export const guessKind = (name) => (/lab|workshop|studio|practical|drawing|clinic|kitchen/i.test(name) ? 'lab' : 'lecture')

/** The college's room types: its own list (or the defaults), plus any type a room uses that isn't listed. */
export function roomTypesOf(data) {
  const list = data.roomTypes?.length ? [...data.roomTypes] : [...DEFAULT_ROOM_TYPES]
  for (const r of data.rooms ?? []) {
    if (r.type && !list.some((t) => t.id === r.type)) list.push({ id: r.type, name: r.type, kind: guessKind(r.type) })
  }
  return list
}

export const roomTypeName = (data, id) => roomTypesOf(data).find((t) => t.id === id)?.name ?? id ?? ''

export const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyCollege() {
  return {
    meta: null,
    time: { ...DEFAULT_TIME },
    rooms: [],
    teachers: [],
    subjects: [],
    departments: [],
    sections: [],
    timetable: null,
    bookings: [],
    requests: [],
  }
}

export const DEFAULT_TIME = {
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  periodsPerDay: 7,
  startTime: '09:00',
  periodMinutes: 60,
  breaks: [{ after: 4, minutes: 30, label: 'Lunch break' }],
}

/**
 * The breaks of a day, sorted, one per position: [{ after, minutes, label }]. Reads older data with a single
 * break (breakAfter / breakMinutes) too. A break must sit between two periods (0 < after < periodsPerDay).
 */
export function breaksOf(time) {
  const P = time.periodsPerDay
  const list = Array.isArray(time.breaks)
    ? time.breaks
    : time.breakAfter > 0
      ? [{ after: time.breakAfter, minutes: time.breakMinutes ?? 30, label: 'Lunch break' }]
      : []
  const seen = new Set()
  return list
    .map((b) => ({ after: Number(b.after), minutes: Math.max(0, Number(b.minutes) || 0), label: b.label || 'Break' }))
    .filter((b) => b.after > 0 && b.after < P && !seen.has(b.after) && seen.add(b.after))
    .sort((a, b) => a.after - b.after)
}

/** Periods taught on a day: a shorter day (e.g. a Saturday half day) ends early. */
export const periodsOn = (time, day) => Math.max(0, Math.min(time.periodsPerDay, time.dayPeriods?.[day] ?? time.periodsPerDay))

/** The stretches of periods between breaks, as [from, to) pairs: e.g. [[0, 2], [2, 4], [4, 7]]. Blocks never cross them. */
export function segmentsOf(time) {
  const cuts = [0, ...breaksOf(time).map((b) => b.after), time.periodsPerDay]
  return cuts.slice(1).map((to, i) => [cuts[i], to])
}

/** College-wide blocked slots, e.g. { 'Wed-6': 'Sports' } (slot keys like teacher unavailability). */
export const blockedOf = (time) => time.blocked ?? {}

/** Whether a slot has no classes: beyond that day's last period, or blocked college-wide. `p` is 0-based. */
export const isClosed = (time, day, p) => p >= periodsOn(time, day) || slotKey(day, p) in blockedOf(time)

/** Periods in the week that can hold classes (shorter days and no-class slots left out). */
export const openPeriodsOf = (time) =>
  time.days.reduce((n, day) => n + Array.from({ length: time.periodsPerDay }, (_, p) => !isClosed(time, day, p)).filter(Boolean).length, 0)

/** Whole blocks of `len` periods that fit in a week without crossing a break or a no-class slot. */
export function blocksPerWeek(time, len) {
  let n = 0
  for (const day of time.days) {
    for (const [from, to] of segmentsOf(time)) {
      let run = 0
      for (let p = from; p < to; p++) {
        run = isClosed(time, day, p) ? 0 : run + 1
        if (run === len) {
          n++
          run = 0
        }
      }
    }
  }
  return n
}

/** The longest block (in periods) that fits anywhere in the week. */
export function longestBlockOf(time) {
  let len = 0
  while (len < time.periodsPerDay && blocksPerWeek(time, len + 1) > 0) len++
  return len
}

/**
 * A time structure with defaults filled in. The default break only applies when the data says nothing about
 * breaks: older data's single break (breakAfter, 0 = none) is kept, not replaced by the default.
 */
export function withDefaults(time = {}) {
  const legacy = !Array.isArray(time.breaks) && 'breakAfter' in time
  return { ...DEFAULT_TIME, ...time, breaks: legacy ? breaksOf({ ...DEFAULT_TIME, ...time, breaks: undefined }) : time.breaks ?? DEFAULT_TIME.breaks }
}

/** Upgrades an older time structure (single break) to the current shape. Safe to run on every load. */
export function normalizeTime(time) {
  const { breakAfter, breakMinutes, ...rest } = withDefaults(time)
  return { ...rest, breaks: breaksOf(rest) }
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const toHHMM = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/**
 * Clock times for each period and each break, e.g. periods [{ start, end, label: '08:30 - 09:30' }] and
 * breaks [{ after, start, end, label, name }]. breakSlot is the first break (kept for older callers).
 * Older saved data without clock fields falls back to DEFAULT_TIME.
 */
export function periodTimes(time) {
  const t = withDefaults(time)
  const byAfter = new Map(breaksOf(t).map((b) => [b.after, b]))
  const periods = []
  const breaks = []
  let at = toMinutes(t.startTime)
  for (let p = 0; p < t.periodsPerDay; p++) {
    const b = byAfter.get(p)
    if (b) {
      breaks.push({ after: p, start: toHHMM(at), end: toHHMM(at + b.minutes), label: `${toHHMM(at)} - ${toHHMM(at + b.minutes)}`, name: b.label })
      at += b.minutes
    }
    periods.push({ start: toHHMM(at), end: toHHMM(at + t.periodMinutes), label: `${toHHMM(at)} - ${toHHMM(at + t.periodMinutes)}` })
    at += t.periodMinutes
  }
  return { periods, breaks, breakSlot: breaks[0] ?? null }
}

export function slotKey(dayName, periodIndex) {
  return `${dayName}-${periodIndex + 1}`
}

/** Department short names (falls back to the free-text labels of older data). */
export function departmentsOf(data) {
  if (data.departments?.length) return data.departments.map((d) => d.short)
  const set = new Set([
    ...data.sections.map((s) => s.department),
    ...data.teachers.map((t) => t.department),
  ])
  return [...set].filter(Boolean).sort()
}
