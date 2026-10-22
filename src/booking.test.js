import { describe, test, expect } from 'vitest'
import { gndecCse } from './data/gndecCse.js'
import { generateTimetable } from './scheduler.js'
import { periodTimes } from './data/schema.js'
import {
  checkRoom,
  createBooking,
  findSpaces,
  isoDate,
  seedBookings,
  suggestAlternatives,
  upcomingBookings,
  validateRequest,
  weekdayOf,
} from './booking.js'

const NOW = new Date('2026-10-19T07:00:00') // a Monday morning
const collegeWithTimetable = () => {
  const data = gndecCse()
  data.timetable = generateTimetable(data, { seed: 1 })
  return data
}
/** Next date on or after NOW that falls on the given weekday ('Mon'...). */
function nextDateFor(weekday) {
  const d = new Date(NOW)
  while (weekdayOf(isoDate(d)) !== weekday) d.setDate(d.getDate() + 1)
  return isoDate(d)
}
const request = (fields) => ({
  eventType: 'Workshop', title: 'Test event', department: 'CSE', organizerName: 'Dr. Test',
  attendance: 20, notes: '', facilities: [], roomType: 'any', setup: 0, cleanup: 0, duration: 60, ...fields,
})

describe('checking a room', () => {
  test('a room holding a regular class at that time is unavailable, with the class named', () => {
    const data = collegeWithTimetable()
    const e = data.timetable.entries.find((x) => x.kind === 'lecture')
    const room = data.rooms.find((r) => r.id === e.roomId)
    const { periods } = periodTimes(data.time)
    const date = nextDateFor(data.time.days[e.day])
    const busy = checkRoom(data, [], room, request({ date, start: periods[e.period].start }))
    expect(busy.available).toBe(false)
    expect(busy.reasons[0].kind).toBe('class')
    expect(busy.reasons[0].text).toMatch(/lecture for D\d CS [A-F]/)
    // After the teaching day the same room is free.
    expect(checkRoom(data, [], room, request({ date, start: '18:00' })).available).toBe(true)
  })

  test('no regular classes on a day the college does not teach', () => {
    const data = collegeWithTimetable()
    const room = data.rooms.find((r) => r.id === 'g12')
    expect(checkRoom(data, [], room, request({ date: nextDateFor('Sat'), start: '10:00' })).available).toBe(true)
  })

  test('bookings block their whole interval including setup and cleanup buffers', () => {
    const data = collegeWithTimetable()
    const hall = data.rooms.find((r) => r.id === 'wshall')
    const date = nextDateFor('Tue')
    const existing = createBooking(request({ date, start: '10:00', duration: 60, cleanup: 15 }), hall, { role: 'hod' })
    const at = (start, setup = 0) => checkRoom(data, [existing], hall, request({ date, start, setup })).available
    expect(at('10:30')).toBe(false) // overlaps the event
    expect(at('11:10')).toBe(false) // overlaps the cleanup buffer
    expect(at('11:15')).toBe(true) // starts right after cleanup
    expect(at('11:20', 10)).toBe(false) // this request's own setup reaches back into the buffer
    // Cancelled bookings no longer block the room.
    expect(checkRoom(data, [{ ...existing, status: 'cancelled' }], hall, request({ date, start: '10:30' })).available).toBe(true)
  })

  test('capacity, room type and equipment are respected', () => {
    const data = collegeWithTimetable()
    const lab = data.rooms.find((r) => r.id === 'sl1')
    const date = nextDateFor('Sat')
    const reasons = (fields) => checkRoom(data, [], lab, request({ date, start: '10:00', ...fields })).reasons.map((r) => r.kind)
    expect(reasons({ attendance: 50 })).toEqual(['capacity'])
    expect(reasons({ roomType: 'seminar' })).toEqual(['type'])
    expect(reasons({ facilities: ['Sound system'] })).toEqual(['facilities'])
    expect(reasons({ facilities: ['Computers'] })).toEqual([])
  })
})

describe('finding spaces', () => {
  test('lists only free, suitable rooms, smallest fit first', () => {
    const data = collegeWithTimetable()
    const { available, unavailable } = findSpaces(data, [], request({ date: nextDateFor('Sat'), start: '10:00', attendance: 30 }))
    expect(available.every((r) => r.available && r.room.capacity >= 30)).toBe(true)
    const caps = available.map((r) => r.room.capacity)
    expect(caps).toEqual([...caps].sort((a, b) => a - b))
    expect(unavailable.map((r) => r.room.id)).toContain('oslab') // 25 seats
  })

  test('suggests nearby times when every suitable room is taken', () => {
    const data = collegeWithTimetable()
    const date = nextDateFor('Wed')
    const hall = data.rooms.find((r) => r.id === 'wshall')
    const workshop = createBooking(request({ date, start: '10:00', duration: 180 }), hall, { role: 'hod' })
    const req = request({ date, start: '11:00', attendance: 120 }) // only the hall seats 120
    expect(findSpaces(data, [workshop], req).available).toHaveLength(0)
    const { slots } = suggestAlternatives(data, [workshop], req, { now: NOW })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0]).toMatchObject({ date, rooms: 1 })
    // The nearest free starts on either side of the workshop are both offered, plus other days.
    const sameDay = slots.filter((s) => s.date === date).map((s) => s.start)
    expect(sameDay).toEqual(expect.arrayContaining(['09:00', '13:00']))
    expect(slots.some((s) => s.date !== date && s.start === '11:00')).toBe(true)
  })

  test('explains when no room is big enough at any time', () => {
    const data = collegeWithTimetable()
    const { slots, reason } = suggestAlternatives(data, [], request({ date: nextDateFor('Wed'), start: '10:00', attendance: 500 }), { now: NOW })
    expect(slots).toEqual([])
    expect(reason).toMatch(/largest room \(WS Seminar Hall\) seats 150/)
  })
})

describe('validation and demo data', () => {
  test('plain-language validation messages', () => {
    const errors = validateRequest(request({ title: '', date: '2026-10-18', start: '06:00' }), NOW)
    expect(errors.details).toContain('Give the event a name.')
    expect(errors.schedule.join(' ')).toMatch(/between 07:00 and 21:00/)
    expect(errors.schedule.join(' ')).toMatch(/already passed/)
    const ok = validateRequest(request({ date: nextDateFor('Tue'), start: '10:00' }), NOW)
    expect(ok).toEqual({ details: [], schedule: [] })
  })

  test('demo bookings are upcoming and never clash with classes or each other', () => {
    const data = collegeWithTimetable()
    const seeds = seedBookings(data, NOW)
    expect(seeds.length).toBe(3)
    expect(upcomingBookings(seeds, NOW)).toHaveLength(3)
    for (const b of seeds) {
      const room = data.rooms.find((r) => r.id === b.roomId)
      const others = seeds.filter((x) => x.id !== b.id)
      expect(checkRoom(data, others, room, b).available).toBe(true)
    }
  })
})
