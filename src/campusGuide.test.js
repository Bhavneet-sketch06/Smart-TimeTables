import { describe, expect, test } from 'vitest'
import { gndecCollege } from './data/gndecCollege.js'
import { normalizeCollege } from './data/departments.js'
import { generateCollege } from './scheduler.js'
import { checkRoom, createBooking, nextWorkingDay, seedBookings } from './booking.js'
import {
  commonFreeSlots,
  jointTimes,
  createRequest,
  needsApproval,
  nextDateFor,
  publicReason,
  reviewRequest,
  roomOverview,
  searchSpaces,
  seedRequests,
  sharedRoomUse,
  upcomingClasses,
} from './campusGuide.js'

// A generated GNDEC college with the demo bookings, on a fixed Saturday (so "next working day" is Monday).
const NOW = new Date('2026-10-24T09:00:00')
const college = () => {
  const data = normalizeCollege(gndecCollege())
  data.timetable = generateCollege(data, { seed: 2 })
  data.bookings = seedBookings(data, NOW)
  return data
}
const MONDAY = '2026-10-26'

describe('Campus Guide', () => {
  test('search is from the timetable and confirmed bookings; non-admins see no private details', () => {
    const data = college()
    const req = { date: MONDAY, start: '10:30', duration: 60, attendance: 40, setup: 0, cleanup: 0, roomType: 'any', facilities: [] }
    const admin = searchSpaces(data, data.bookings, req, { audience: 'admin' })
    const pub = searchSpaces(data, data.bookings, req, { audience: 'student' })
    expect(pub.available.length).toBeGreaterThan(0)
    // At least one room busy with a class and one with a booking (the hall's workshop).
    const reasons = pub.unavailable.flatMap((u) => u.reasons)
    expect(reasons.some((r) => r.kind === 'class')).toBe(true)
    expect(reasons.some((r) => r.kind === 'booking')).toBe(true)
    for (const r of reasons) expect(r.text).not.toMatch(/ for D\d|Workshop|BK-/)
    expect(admin.unavailable.flatMap((u) => u.reasons).some((r) => / for D\d/.test(r.text))).toBe(true)
    expect(publicReason({ kind: 'class', text: 'Class 10:30–11:30: Data Structures lecture for D2 CS A' }).text).toBe('A scheduled class uses it 10:30–11:30')
  })

  test('a pending request never holds the room; confirming re-checks it and refuses an overlap', () => {
    const data = college()
    const req = { title: 'Club meetup', eventType: 'Club meeting', organizerName: 'Aman', attendance: 30, date: MONDAY, start: '18:00', duration: 60 }
    const room = data.rooms.find((r) => r.type === 'classroom' && checkRoom(data, data.bookings, r, req).available)
    const request = createRequest(req, room, { role: 'student', name: 'Aman', clientId: 'x' })
    expect(request.status).toBe('pending')
    expect(checkRoom(data, data.bookings, room, req).available).toBe(true) // still free: requests don't block
    expect(reviewRequest(data, data.bookings, request).available).toBe(true)
    // Someone else books the room for an overlapping time: the request can no longer be confirmed there.
    const other = createBooking({ ...req, title: 'Meeting', start: '18:30', organizerName: 'X' }, room, { role: 'admin' })
    const review = reviewRequest(data, [...data.bookings, other], request)
    expect(review.available).toBe(false)
    expect(review.reasons[0].kind).toBe('booking')
    expect(review.alternatives.length).toBeGreaterThan(0)
    expect(review.alternatives.every((r) => r.id !== room.id)).toBe(true)
  })

  test('who must ask: students always, staff for shared or other departments\' rooms, admin never', () => {
    const own = { deptId: 'cse' }
    const shared = { deptId: null }
    expect(needsApproval('student', own, 'cse')).toBe(true)
    expect(needsApproval('faculty', own, 'cse')).toBe(false)
    expect(needsApproval('faculty', shared, 'cse')).toBe(true)
    expect(needsApproval('hod', { deptId: 'ece' }, 'cse')).toBe(true)
    expect(needsApproval('admin', shared, 'cse')).toBe(false)
  })

  test('upcoming classes for a teacher continue on the following days', () => {
    const data = college()
    const teacher = data.timetable.entries[0].teacherId
    const mine = data.timetable.entries.filter((e) => e.teacherId === teacher)
    const list = upcomingClasses(data, mine, NOW, { limit: 5 })
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((c) => c.date >= MONDAY)).toBe(true) // Saturday and Sunday have no classes
    expect(list.map((c) => `${c.date} ${c.start}`)).toEqual([...list.map((c) => `${c.date} ${c.start}`)].sort())
  })

  test('joint times: fully free slots really are free; otherwise best partial times and after classes', () => {
    const data = college()
    const ids = ['D2 CS A', 'D2 EC A'].map((n) => data.sections.find((s) => s.name === n).id)
    const slots = commonFreeSlots(data, ids)
    expect(slots.length).toBeGreaterThan(0)
    const both = data.sections.filter((s) => s.deptId === 'cse' || s.deptId === 'ece').map((s) => s.id)
    const joint = jointTimes(data, both)
    expect(joint.partial.length).toBeGreaterThan(0)
    expect(joint.partial.every((p) => p.free < p.total && p.free >= p.total / 2)).toBe(true)
    expect(joint.after).toHaveLength(data.time.days.length)
    expect(joint.after[0].start).toBe('17:30')
    for (const slot of slots) {
      for (const e of data.timetable.entries.filter((x) => ids.includes(x.sectionId) && x.day === slot.day)) {
        expect(e.period + e.length <= slot.from || e.period >= slot.to).toBe(true)
      }
    }
    expect(nextDateFor('Mon', '09:00', NOW)).toBe(MONDAY)
  })

  test('admin overview lists the day\'s classes and bookings per room, and shared-room use', () => {
    const data = college()
    const overview = roomOverview(data, data.bookings, MONDAY, NOW)
    const hall = overview.find((o) => o.room.eventsOnly)
    expect(hall.items.some((x) => x.kind === 'booking')).toBe(true)
    expect(overview.some((o) => o.items.some((x) => x.kind === 'class'))).toBe(true)
    const shared = sharedRoomUse(data)
    expect(shared.some((s) => s.byDept.length > 1)).toBe(true)
  })

  test('demo requests: one awaiting approval in a free room, one declined', () => {
    const data = college()
    const date = nextWorkingDay(data, NOW)
    const requests = seedRequests(data, data.bookings, date, 'me')
    expect(requests.map((r) => r.status)).toEqual(['pending', 'declined'])
    expect(reviewRequest(data, data.bookings, requests[0]).available).toBe(true)
    expect(requests.every((r) => r.requester.clientId === 'me')).toBe(true)
  })
})
