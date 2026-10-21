/**
 * Data shapes (all stored together in localStorage under STORAGE_KEY):
 *
 * time:     { days: string[], periodsPerDay: number, breakAfter: number }
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
    time: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], periodsPerDay: 7, breakAfter: 4 },
    rooms: [],
    teachers: [],
    subjects: [],
    sections: [],
    timetable: null,
  }
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
