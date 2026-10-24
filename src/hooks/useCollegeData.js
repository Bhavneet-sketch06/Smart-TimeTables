import { useEffect, useState } from 'react'
import { STORAGE_KEY, emptyCollege } from '../data/schema.js'
import { demoCollege } from '../data/demoCollege.js'
import { gndecCollege } from '../data/gndecCollege.js'
import { normalizeCollege } from '../data/departments.js'
import { checkRoom, createBooking, nextWorkingDay, seedBookings } from '../booking.js'
import { seedRequests } from '../campusGuide.js'

/** This browser's anonymous student id, so a student can see their own space requests (no accounts). */
export function studentClientId() {
  try {
    let id = localStorage.getItem('ttgen:studentId')
    if (!id) localStorage.setItem('ttgen:studentId', (id = `stu-${Math.random().toString(36).slice(2, 10)}`))
    return id
  } catch {
    return 'stu-local'
  }
}

// Older saved data has no department list: normalizeCollege upgrades it on every load.
const fromJson = (raw) => normalizeCollege({ ...emptyCollege(), ...JSON.parse(raw) })

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return fromJson(raw)
  } catch {
    // corrupted or blocked storage: fall through to a fresh college
  }
  return null
}

const withDemoBookings = (data) => {
  const college = normalizeCollege(data)
  const bookings = seedBookings(college)
  return { ...college, bookings, requests: seedRequests(college, bookings, nextWorkingDay(college), studentClientId()) }
}

function write(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable; keep working in memory
  }
}

export function useCollegeData() {
  const [data, setData] = useState(() => readStored() ?? emptyCollege())

  // Autosave. Saved bookings and space requests are the source of truth: they only change through the explicit
  // actions below (which write immediately), so this never overwrites one another tab saved meanwhile.
  useEffect(() => {
    const stored = readStored()
    write(stored ? { ...data, bookings: stored.bookings ?? [], requests: stored.requests ?? [] } : data)
  }, [data])

  /** Replaces everything, bookings included (loading a dataset, clearing all). */
  const replaceAll = (next) => {
    write(next)
    setData(next)
  }

  // Another tab saved changes (e.g. a booking): pick them up so both tabs see the same rooms as taken.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setData(fromJson(e.newValue))
        } catch {
          // ignore malformed writes
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Editing any input invalidates a previously generated timetable.
  const update = (key, value) =>
    setData((d) => ({ ...d, [key]: typeof value === 'function' ? value(d[key]) : value, timetable: null }))

  // Bookings change without touching the timetable. Each change re-reads the latest saved bookings first and
  // writes straight back, so a booking made meanwhile in another tab or window is never overwritten.
  const latestBookings = () => readStored()?.bookings ?? data.bookings ?? []
  const latestRequests = () => readStored()?.requests ?? data.requests ?? []
  const saveBookings = (bookings) => replaceAll({ ...data, bookings, requests: latestRequests() })
  const saveRequests = (requests, bookings = latestBookings()) => replaceAll({ ...data, bookings, requests })

  /** Confirms a booking if its room is still free; otherwise returns the reasons it is not. */
  const bookSpace = (booking) => {
    const bookings = latestBookings()
    const room = data.rooms.find((r) => r.id === booking.roomId)
    if (!room) return { ok: false, reasons: [{ kind: 'room', text: 'This room no longer exists.' }] }
    const check = checkRoom(data, bookings, room, booking)
    if (!check.available) {
      // Show what the other tab booked so the room drops out of this tab's results too.
      setData((d) => ({ ...d, bookings }))
      return { ok: false, reasons: check.reasons }
    }
    saveBookings([...bookings, booking])
    return { ok: true }
  }

  const cancelBooking = (id) =>
    saveBookings(
      latestBookings().map((b) => (b.id === id ? { ...b, status: 'cancelled', cancelledAt: new Date().toISOString() } : b)),
    )

  // Space requests (Campus Guide): kept apart from bookings until an administrator confirms them.
  const requestSpace = (request) => saveRequests([...latestRequests(), request])
  const withdrawRequest = (id) =>
    saveRequests(latestRequests().map((r) => (r.id === id && r.status === 'pending' ? { ...r, status: 'withdrawn', decidedAt: new Date().toISOString() } : r)))

  /**
   * Confirms a request as a booking (in `roomId`, default the requested room) if the room is still free for the
   * whole time, or declines it. Returns { ok, reasons } like bookSpace.
   */
  const decideRequest = (id, decision, { note = '', roomId } = {}) => {
    const requests = latestRequests()
    const request = requests.find((r) => r.id === id)
    if (!request || request.status !== 'pending') return { ok: false, reasons: [{ kind: 'state', text: 'This request was already decided.' }] }
    const decidedAt = new Date().toISOString()
    if (decision === 'decline') {
      saveRequests(requests.map((r) => (r.id === id ? { ...r, status: 'declined', decidedAt, decisionNote: note } : r)))
      return { ok: true }
    }
    const bookings = latestBookings()
    const room = data.rooms.find((r) => r.id === (roomId ?? request.roomId))
    if (!room) return { ok: false, reasons: [{ kind: 'room', text: 'This room no longer exists.' }] }
    const check = checkRoom(data, bookings, room, request)
    if (!check.available) {
      setData((d) => ({ ...d, bookings, requests }))
      return { ok: false, reasons: check.reasons }
    }
    const booking = { ...createBooking(request, room, { role: 'admin', requestId: id, requestedBy: request.requester }), organizerId: request.requester?.teacherId }
    saveRequests(
      requests.map((r) => (r.id === id ? { ...r, status: 'approved', decidedAt, decisionNote: note, bookingId: booking.id, roomId: room.id } : r)),
      [...bookings, booking],
    )
    return { ok: true, booking }
  }

  /** Adds the demo bookings (for data saved before Book a Space existed). */
  const addSampleBookings = () => {
    const bookings = latestBookings()
    const ids = new Set(bookings.map((b) => b.id))
    saveBookings([...bookings, ...seedBookings(data).filter((b) => !ids.has(b.id))])
  }

  /** Adds the demo space requests (for data saved before the Campus Guide existed). */
  const addSampleRequests = () => {
    const requests = latestRequests()
    const ids = new Set(requests.map((r) => r.id))
    const fresh = seedRequests(data, latestBookings(), nextWorkingDay(data), studentClientId()).filter((r) => !ids.has(r.id))
    saveRequests([...requests, ...fresh])
  }

  return {
    data,
    update,
    setTimetable: (timetable) => setData((d) => ({ ...d, timetable })),
    bookSpace,
    cancelBooking,
    addSampleBookings,
    requestSpace,
    withdrawRequest,
    decideRequest,
    addSampleRequests,
    /** Saves imported setup data (already validated by buildImport); saved bookings and requests are kept as they are. */
    importCollege: (next) => replaceAll({ ...next, timetable: null, bookings: latestBookings(), requests: latestRequests() }),
    loadDemo: () => replaceAll(withDemoBookings(demoCollege())),
    loadGndec: () => replaceAll(withDemoBookings(gndecCollege())),
    reset: () => replaceAll(emptyCollege()),
  }
}
