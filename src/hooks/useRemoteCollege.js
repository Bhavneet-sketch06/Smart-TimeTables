import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { emptyCollege } from '../data/schema.js'
import { demoCollege } from '../data/demoCollege.js'
import { gndecCollege } from '../data/gndecCollege.js'
import { normalizeCollege } from '../data/departments.js'
import { checkRoom, createBooking, isoDate, nextWorkingDay, seedBookings } from '../booking.js'
import { publicReason, seedRequests } from '../campusGuide.js'
import { SETUP_KEYS, replaceAllPayload, rowsToCollege, savePayload } from '../remote/collegeRows.js'

// Same interface as useCollegeData, backed by Supabase. Every permission is enforced by the database (RLS,
// triggers, save_college / decide_request); this hook only shapes requests and explains refusals.
// Mutations are async: callers await them (awaiting useCollegeData's plain results works the same way).

const PAGE = 1000 // PostgREST returns at most this many rows per request by default

async function pages(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}
const table = (name, key = 'id') => pages(() => supabase.from(name).select('*').order(key))
const rpcRows = (fn, args, order) => pages(() => order.reduce((q, col) => q.order(col), supabase.rpc(fn, args)))
const single = async (query) => {
  const { data, error } = await query
  if (error) throw error
  return data
}

/** Everything this user may see, as the app's college object (see rowsToCollege for free/busy). */
async function fetchCollege(role) {
  const admin = role === 'admin'
  const yesterday = isoDate(new Date(Date.now() - 86_400_000))
  const skip = Promise.resolve(undefined)
  const [settings, departments, roomTypes, rooms, subjects, teachers, teacherPrivate, sections, meta, entries, bookings, requests, generatedAt, roomBusy, sectionBusy, holds] =
    await Promise.all([
      single(supabase.from('college_settings').select('time, meta').maybeSingle()),
      table('departments'),
      table('room_types'),
      table('rooms'),
      table('subjects'),
      table('teachers'),
      table('teacher_private', 'teacher_id'),
      table('sections'),
      role === 'student' ? skip : single(supabase.from('timetable_meta').select('data').maybeSingle()),
      table('timetable_entries'),
      role === 'student' ? skip : table('bookings'),
      table('requests'),
      role === 'student' ? single(supabase.rpc('timetable_generated_at')) : skip,
      admin ? skip : rpcRows('room_busy', {}, ['room_id', 'day', 'period', 'length']),
      role !== 'hod' ? skip : rpcRows('section_busy', {}, ['section_id', 'day', 'period', 'length']),
      admin ? skip : rpcRows('booking_holds', { p_from: yesterday }, ['room_id', 'date', 'start', 'duration']),
    ])
  return rowsToCollege({ settings, departments, roomTypes, rooms, subjects, teachers, teacherPrivate, sections, meta, entries, bookings, requests, generatedAt, roomBusy, sectionBusy, holds })
}

/** Plain-language text for a refused write. */
export function friendlyDbError(error) {
  const msg = error?.message ?? String(error ?? '')
  if (error?.code === '23P01' || /bookings_no_overlap/.test(msg)) return 'Someone has just booked this room for an overlapping time.'
  if (error?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return /Only administrators|only cancel|only withdraw|cannot (book|request)|own administrator/i.test(msg)
      ? msg
      : "Your account isn't allowed to do that. Rooms that are shared or belong to another department need a request."
  }
  if (error?.code === '23505') return 'That item already exists. Reload and try again.'
  if (/fetch|network/i.test(msg)) return 'Could not reach the database. Check your connection and try again.'
  return msg || 'The database refused the change.'
}

const withDemoItems = (data) => {
  const college = normalizeCollege(data)
  const bookings = seedBookings(college)
  return { ...college, bookings, requests: seedRequests(college, bookings, nextWorkingDay(college), 'demo') }
}

export function useRemoteCollege(profile) {
  const role = profile.role
  const isAdmin = role === 'admin'
  const [data, setData] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: '' })
  const [saveState, setSaveState] = useState({ saving: false, error: '', savedAt: null })
  // Latest data, updated synchronously so a save right after an edit sends the edit.
  const dataRef = useRef(null)
  const dirty = useRef(new Set())
  const timer = useRef(null)
  const queue = useRef(Promise.resolve())

  const commit = (next) => {
    dataRef.current = next
    setData(next)
  }

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus({ loading: true, error: '' })
    try {
      const next = await fetchCollege(role)
      // `previous` lives only in this browser; keep it while the shared timetable is still cleared.
      const previous = !next.timetable ? dataRef.current?.previous ?? null : null
      commit(previous ? { ...next, previous } : next)
      setStatus({ loading: false, error: '' })
      return next
    } catch (error) {
      setStatus({ loading: false, error: friendlyDbError(error) })
      return null
    }
  }, [role])

  useEffect(() => {
    load()
  }, [load])

  // Writes go one after another, in order.
  const enqueue = (work) => {
    const run = queue.current.then(work, work)
    queue.current = run.catch(() => {})
    return run
  }

  const saveParts = (payload) =>
    enqueue(async () => {
      setSaveState((s) => ({ ...s, saving: true, error: '' }))
      const { error } = await supabase.rpc('save_college', { p: payload })
      if (error) {
        setSaveState({ saving: false, error: friendlyDbError(error), savedAt: null })
        throw error
      }
      setSaveState({ saving: false, error: '', savedAt: new Date() })
    })

  /** Sends every edited part now (setup edits are otherwise sent shortly after typing stops). */
  const flush = () => {
    clearTimeout(timer.current)
    const keys = [...dirty.current]
    dirty.current.clear()
    return keys.length ? saveParts(savePayload(dataRef.current, keys)).catch(() => keys.forEach((k) => dirty.current.add(k))) : queue.current
  }

  /** Re-reads the shared data (after saving anything pending, so edits are never lost). */
  const refresh = async () => {
    await flush()
    return (await load({ quiet: true })) ?? dataRef.current
  }

  // Pick up other people's changes (bookings, requests, a new timetable) when the tab becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && dataRef.current && !dirty.current.size) load({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // Warn before leaving with setup edits that have not reached the database.
  useEffect(() => {
    const onLeave = (e) => {
      if (dirty.current.size || saveState.saving) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [saveState.saving])

  // ---------- administrator: setup and timetable ----------

  // Editing any input invalidates the shared timetable, exactly as in the browser-only version.
  const update = (key, value) => {
    const d = dataRef.current
    // The cleared timetable stays in memory as `previous`: the next generation keeps unaffected classes in place.
    commit({ ...d, [key]: typeof value === 'function' ? value(d[key]) : value, timetable: null, previous: d.timetable ?? d.previous ?? null })
    dirty.current.add(key)
    dirty.current.add('timetable')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 800)
  }

  const setTimetable = (timetable) => {
    commit({ ...dataRef.current, timetable, previous: null })
    dirty.current.add('timetable')
    return flush()
  }

  /** Replaces the whole college (demo data, clear all); shows it at once and saves it. */
  const replaceAll = async (next) => {
    clearTimeout(timer.current)
    dirty.current.clear()
    commit(next)
    // A refused save is shown through saveState; reloading then shows what the database really holds.
    await saveParts(replaceAllPayload(next)).catch(() => {})
    await load({ quiet: true })
  }

  const importCollege = async (next) => {
    const d = dataRef.current
    commit({ ...next, timetable: null, bookings: d.bookings, requests: d.requests, busy: d.busy })
    SETUP_KEYS.forEach((k) => dirty.current.add(k))
    dirty.current.add('timetable')
    await flush()
    await load({ quiet: true })
  }

  // ---------- bookings and requests ----------

  const asReasons = (error) => [{ kind: 'booking', text: friendlyDbError(error) }]
  const visibleReasons = (reasons) => (isAdmin ? reasons : reasons.map(publicReason))

  /** Confirms a booking if its room is still free; the database rejects overlaps and rooms outside your scope. */
  const bookSpace = async (booking) => {
    const fresh = await refresh()
    const room = fresh.rooms.find((r) => r.id === booking.roomId)
    if (!room) return { ok: false, reasons: [{ kind: 'room', text: 'This room no longer exists.' }] }
    const check = checkRoom(fresh, fresh.bookings ?? [], room, booking)
    if (!check.available) return { ok: false, reasons: visibleReasons(check.reasons) }
    const { error } = await supabase.from('bookings').insert({ id: booking.id, data: booking })
    if (error) return { ok: false, reasons: asReasons(error) }
    await load({ quiet: true })
    return { ok: true }
  }

  const cancelBooking = async (id) => {
    const b = (dataRef.current.bookings ?? []).find((x) => x.id === id)
    if (!b) return { ok: false, reasons: [{ kind: 'state', text: 'This booking is no longer listed.' }] }
    const { error } = await supabase
      .from('bookings')
      .update({ data: { ...b, status: 'cancelled', cancelledAt: new Date().toISOString() } })
      .eq('id', id)
    await load({ quiet: true })
    if (error) {
      window.alert(friendlyDbError(error))
      return { ok: false, reasons: asReasons(error) }
    }
    return { ok: true }
  }

  const requestSpace = async (request) => {
    const { error } = await supabase.from('requests').insert({ id: request.id, data: request })
    await load({ quiet: true })
    return error ? { ok: false, reasons: asReasons(error) } : { ok: true }
  }

  const withdrawRequest = async (id) => {
    const r = (dataRef.current.requests ?? []).find((x) => x.id === id)
    if (!r || r.status !== 'pending') return { ok: false }
    const { error } = await supabase
      .from('requests')
      .update({ data: { ...r, status: 'withdrawn', decidedAt: new Date().toISOString() } })
      .eq('id', id)
    await load({ quiet: true })
    if (error) window.alert(friendlyDbError(error))
    return { ok: !error }
  }

  /** Administrator: confirm (re-checked against classes and bookings) or decline a request. */
  const decideRequest = async (id, decision, { note = '', roomId } = {}) => {
    const fresh = await refresh()
    const request = (fresh.requests ?? []).find((r) => r.id === id)
    if (!request || request.status !== 'pending') return { ok: false, reasons: [{ kind: 'state', text: 'This request was already decided.' }] }
    if (decision === 'decline') {
      const { error } = await supabase.rpc('decide_request', { p_id: id, p_decision: 'decline', p_note: note })
      await load({ quiet: true })
      return error ? { ok: false, reasons: asReasons(error) } : { ok: true }
    }
    const room = fresh.rooms.find((r) => r.id === (roomId ?? request.roomId))
    if (!room) return { ok: false, reasons: [{ kind: 'room', text: 'This room no longer exists.' }] }
    const check = checkRoom(fresh, fresh.bookings ?? [], room, request)
    if (!check.available) return { ok: false, reasons: check.reasons }
    const booking = {
      ...createBooking(request, room, { role: 'admin', requestId: id, requestedBy: request.requester }),
      organizerId: request.requester?.teacherId,
    }
    const { error } = await supabase.rpc('decide_request', { p_id: id, p_decision: 'approve', p_note: note, p_booking: booking })
    await load({ quiet: true })
    return error ? { ok: false, reasons: asReasons(error) } : { ok: true, booking }
  }

  const addSampleBookings = async () => {
    await saveParts({ addBookings: seedBookings(dataRef.current) }).catch(() => {})
    await load({ quiet: true })
  }
  /** The change notice shown on every timetable (null removes it); saved without touching the timetable. */
  const publishNotice = async (notice) => {
    const meta = { ...(dataRef.current.meta ?? {}), notice: notice ?? undefined }
    commit({ ...dataRef.current, meta })
    await saveParts({ meta }).catch(() => {})
  }

  const addSampleRequests = async () => {
    const d = dataRef.current
    await saveParts({ addRequests: seedRequests(d, d.bookings ?? [], nextWorkingDay(d), 'demo') }).catch(() => {})
    await load({ quiet: true })
  }

  const noop = () => {}
  return {
    shared: true,
    data,
    status,
    saveState,
    reload: () => load(),
    retrySave: () => {
      ;[...SETUP_KEYS, 'timetable'].forEach((k) => dirty.current.add(k))
      return flush()
    },
    refresh,
    update: isAdmin ? update : noop,
    setTimetable: isAdmin ? setTimetable : noop,
    bookSpace,
    cancelBooking,
    addSampleBookings,
    requestSpace,
    withdrawRequest,
    decideRequest,
    addSampleRequests,
    importCollege,
    publishNotice: isAdmin ? publishNotice : noop,
    loadDemo: () => replaceAll(withDemoItems(demoCollege())),
    loadGndec: () => replaceAll(withDemoItems(gndecCollege())),
    reset: () => replaceAll(emptyCollege()),
  }
}
