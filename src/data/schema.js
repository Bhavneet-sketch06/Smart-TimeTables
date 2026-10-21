/**
 * Data shapes (all stored together in localStorage under STORAGE_KEY):
 *
 * time:     { days: string[], periodsPerDay, breakAfter, startTime: 'HH:MM', periodMinutes, breakMinutes }
 *           breakAfter = number of periods before the break (0 = no break)
 * rooms:    { id, name, capacity, type: 'classroom' | 'lab' | 'seminar' }
 * teachers: { id, name, department, subjectIds: string[], maxHours, unavailable: string[] }
 *           unavailable slot keys look like "Mon-1" (1-based period)
 * subjects: { id, name, code, lectureHours, labHours }
 *           labHours = length of one lab block in consecutive periods (0 = no lab)
 * sections: { id, name, department, students, assignments: { subjectId, teacherId }[] }
 * timetable: null | { entries, stats, generatedAt }
 */

export const STORAGE_KEY = 'ttgen:v1'

export const ROOM_TYPES = ['classroom', 'lab', 'seminar']

export const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyCollege() {
  return {
    time: { ...DEFAULT_TIME },
    rooms: [],
    teachers: [],
    subjects: [],
    sections: [],
    timetable: null,
  }
}

export const DEFAULT_TIME = {
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  periodsPerDay: 7,
  breakAfter: 4,
  startTime: '09:00',
  periodMinutes: 60,
  breakMinutes: 30,
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const toHHMM = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/**
 * Clock times for each period and the break, e.g. [{ label: '08:30 - 09:30' }, ...].
 * Older saved data without clock fields falls back to DEFAULT_TIME.
 */
export function periodTimes(time) {
  const t = { ...DEFAULT_TIME, ...time }
  const periods = []
  let at = toMinutes(t.startTime)
  let breakSlot = null
  for (let p = 0; p < t.periodsPerDay; p++) {
    if (p === t.breakAfter && p > 0) {
      breakSlot = { start: toHHMM(at), end: toHHMM(at + t.breakMinutes), label: `${toHHMM(at)} - ${toHHMM(at + t.breakMinutes)}` }
      at += t.breakMinutes
    }
    periods.push({ start: toHHMM(at), end: toHHMM(at + t.periodMinutes), label: `${toHHMM(at)} - ${toHHMM(at + t.periodMinutes)}` })
    at += t.periodMinutes
  }
  return { periods, breakSlot }
}

export function slotKey(dayName, periodIndex) {
  return `${dayName}-${periodIndex + 1}`
}

export function departmentsOf(data) {
  const set = new Set([
    ...data.sections.map((s) => s.department),
    ...data.teachers.map((t) => t.department),
  ])
  return [...set].filter(Boolean).sort()
}
