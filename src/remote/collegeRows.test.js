import { describe, expect, it } from 'vitest'
import { gndecCollege } from '../data/gndecCollege.js'
import { normalizeCollege } from '../data/departments.js'
import { generateCollege } from '../scheduler.js'
import { checkRoom, seedBookings } from '../booking.js'
import { commonFreeSlots, searchSpaces } from '../campusGuide.js'
import { collegeCounts, replaceAllPayload, rowsToCollege, verifyCopy } from './collegeRows.js'

const MON = '2026-11-02' // a Monday

/** What save_college() stores, turned back into the rows Supabase returns (all of them: an administrator). */
function adminRows(data) {
  const p = replaceAllPayload(data)
  const list = (items) => items.map((x, i) => ({ data: x, sort: i }))
  const strip = ({ maxHours, maxPerDay, unavailable, ...pub }) => pub
  return {
    settings: { time: p.time, meta: p.meta },
    departments: list(p.departments),
    roomTypes: list(p.roomTypes),
    rooms: list(p.rooms),
    subjects: list(p.subjects),
    teachers: list(p.teachers.map(strip)),
    teacherPrivate: p.teachers.map((t) => ({
      teacher_id: t.id,
      data: JSON.parse(JSON.stringify({ maxHours: t.maxHours, maxPerDay: t.maxPerDay, unavailable: t.unavailable })),
    })),
    sections: list(p.sections),
    meta: p.timetable && { data: (({ entries, ...rest }) => rest)(p.timetable) },
    entries: (p.timetable?.entries ?? []).map((e) => ({ data: e })),
    bookings: p.bookings.map((b) => ({ data: b })),
    requests: p.requests.map((r) => ({ data: r })),
  }
}

const college = (() => {
  const data = normalizeCollege(gndecCollege())
  const result = generateCollege(data, { seed: 3 })
  const withTimetable = { ...data, timetable: { ...result, generatedAt: '2026-10-25T10:00:00.000Z' } }
  return { ...withTimetable, bookings: seedBookings(withTimetable, new Date('2026-11-01T09:00:00')) }
})()

describe('rowsToCollege', () => {
  it('round-trips the whole college for an administrator', () => {
    const back = rowsToCollege(adminRows(college))
    expect(verifyCopy(college, back)).toEqual([])
    expect(collegeCounts(back)).toEqual(collegeCounts(college))
    expect(back.busy).toEqual({ rooms: [], sections: [], holds: [] })
  })

  it('reports what is missing after a copy', () => {
    const rows = adminRows(college)
    rows.sections = rows.sections.slice(1)
    rows.entries = rows.entries.slice(5)
    rows.bookings = []
    const problems = verifyCopy(college, rowsToCollege(rows))
    expect(problems.join(' | ')).toMatch(/1 sections missing/)
    expect(problems.join(' | ')).toMatch(/timetable has/)
    expect(problems.join(' | ')).toMatch(/bookings missing/)
  })

  it("keeps other departments' classes as free/busy only, and still finds every clash", () => {
    // A student of the first CSE section: their own entries in detail, every room's busy periods without detail.
    const section = college.sections.find((s) => s.deptId === 'cse')
    const all = college.timetable.entries
    const rows = adminRows(college)
    const student = rowsToCollege({
      ...rows,
      teacherPrivate: [],
      meta: null,
      generatedAt: college.timetable.generatedAt,
      entries: all.filter((e) => e.sectionId === section.id).map((e) => ({ data: e })),
      bookings: [],
      requests: [],
      roomBusy: all.map((e) => ({ room_id: e.roomId, day: e.day, period: e.period, length: e.length })),
      holds: college.bookings.map((b) => ({ room_id: b.roomId, date: b.date, start: b.start, duration: b.duration, setup: b.setup, cleanup: b.cleanup })),
    })
    expect(student.timetable.entries.every((e) => e.sectionId === section.id)).toBe(true)
    expect(student.busy.rooms.length).toBeGreaterThan(0)
    expect(student.busy.rooms.some((b) => 'sectionId' in b || 'teacherId' in b || 'subjectId' in b)).toBe(false)

    // Room availability is the same as with full data, for every room, through the day.
    for (const start of ['08:30', '10:30', '13:30', '15:30']) {
      const req = { date: MON, start, duration: 60, attendance: 1, facilities: [] }
      for (const room of college.rooms) {
        expect(checkRoom(student, [], room, req).available, `${room.name} ${start}`).toBe(checkRoom(college, college.bookings, room, req).available)
      }
    }
    // ...and the reasons never name the class or booking.
    const busyRoom = searchSpaces(student, [], { date: MON, start: '10:30', duration: 60, attendance: 1, facilities: [] }).unavailable[0]
    expect(busyRoom.reasons.map((r) => r.text).join(' ')).not.toMatch(/for |Workshop|Lecture/)
  })

  it('finds joint free times from section free/busy alone', () => {
    const all = college.timetable.entries
    const ids = college.sections.filter((s) => s.deptId === 'cse' || s.deptId === 'ece').map((s) => s.id)
    const hod = rowsToCollege({
      ...adminRows(college),
      entries: all.filter((e) => college.sections.find((s) => s.id === e.sectionId)?.deptId === 'cse').map((e) => ({ data: e })),
      sectionBusy: all.map((e) => ({ section_id: e.sectionId, day: e.day, period: e.period, length: e.length })),
    })
    expect(commonFreeSlots(hod, ids)).toEqual(commonFreeSlots(college, ids))
  })
})
