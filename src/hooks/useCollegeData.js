import { useEffect, useState } from 'react'
import { STORAGE_KEY, emptyCollege } from '../data/schema.js'
import { demoCollege } from '../data/demoCollege.js'
import { gndecCse } from '../data/gndecCse.js'
import { checkRoom, seedBookings } from '../booking.js'

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyCollege(), ...JSON.parse(raw) }
  } catch {
    // corrupted or blocked storage: fall through to a fresh college
  }
  return null
}

const withDemoBookings = (data) => ({ ...data, bookings: seedBookings(data) })

function write(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable; keep working in memory
  }
}

export function useCollegeData() {
  const [data, setData] = useState(() => readStored() ?? emptyCollege())

  // Autosave. Saved bookings are the source of truth: they only change through the explicit booking actions
  // below (which write immediately), so this never overwrites a booking another tab saved meanwhile.
  useEffect(() => {
    const stored = readStored()
    write(stored ? { ...data, bookings: stored.bookings ?? [] } : data)
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
          setData({ ...emptyCollege(), ...JSON.parse(e.newValue) })
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
  const saveBookings = (bookings) => replaceAll({ ...data, bookings })

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

  /** Adds the demo bookings (for data saved before Book a Space existed). */
  const addSampleBookings = () => {
    const bookings = latestBookings()
    const ids = new Set(bookings.map((b) => b.id))
    saveBookings([...bookings, ...seedBookings(data).filter((b) => !ids.has(b.id))])
  }

  return {
    data,
    update,
    setTimetable: (timetable) => setData((d) => ({ ...d, timetable })),
    bookSpace,
    cancelBooking,
    addSampleBookings,
    loadDemo: () => replaceAll(withDemoBookings(demoCollege())),
    loadGndec: () => replaceAll(withDemoBookings(gndecCse())),
    reset: () => replaceAll(emptyCollege()),
  }
}
