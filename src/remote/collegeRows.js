// Shared college data in Supabase <-> the app's college object. PURE JS (no React, no network), so it can be tested.
//
// Each table row keeps the app's own object in `data` (see supabase/migrations). Row Level Security decides which
// rows a user receives; the free/busy functions add what a user may know about the rest without any detail:
//   data.busy = { rooms:    [{ roomId, day, period, length }]              classes in rooms (whose is hidden)
//                 sections: [{ sectionId, day, period, length }]           classes of sections (HOD joint times)
//                 holds:    [{ roomId, date, start, duration, setup, cleanup }]  confirmed bookings (whose is hidden) }
// Only what the user can't already see in detail is kept there, so nothing is counted twice.

import { emptyCollege } from '../data/schema.js'
import { normalizeCollege } from '../data/departments.js'

/** App keys that are lists of records, and their tables. */
export const LIST_TABLES = {
  departments: 'departments',
  roomTypes: 'room_types',
  rooms: 'rooms',
  subjects: 'subjects',
  teachers: 'teachers',
  sections: 'sections',
}
/** Keys an administrator's setup edits can change (time and meta are the college settings row). */
export const SETUP_KEYS = ['time', 'meta', ...Object.keys(LIST_TABLES)]

const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0)
const listOf = (rows) => [...(rows ?? [])].sort(bySort).map((r) => r.data)

const entryKey = (e) => `${e.roomId}|${e.day}|${e.period}|${e.length}`
const sectionKey = (e) => `${e.sectionId}|${e.day}|${e.period}|${e.length}`
const holdKey = (b) => `${b.roomId}|${b.date}|${b.start}|${Number(b.duration)}`

/**
 * Builds the college object from what the database returned to this user.
 * `rows`: { settings, departments, roomTypes, rooms, subjects, teachers, teacherPrivate, sections, meta, entries,
 *           bookings, requests, generatedAt, roomBusy, sectionBusy, holds } (any may be missing).
 */
export function rowsToCollege(rows) {
  const limits = new Map((rows.teacherPrivate ?? []).map((r) => [r.teacher_id, r.data]))
  // A teacher's limits are only sent to those allowed to see them; others get neutral defaults.
  const teachers = listOf(rows.teachers).map((t) => ({ unavailable: [], maxHours: 0, ...t, ...(limits.get(t.id) ?? {}) }))
  const entries = (rows.entries ?? []).map((r) => r.data)
  const generatedAt = rows.meta?.data?.generatedAt ?? rows.generatedAt ?? null
  const timetable = rows.meta ? { ...rows.meta.data, entries } : generatedAt ? { entries, generatedAt, stats: null } : null
  const bookings = (rows.bookings ?? []).map((r) => r.data)

  const seenRooms = new Set(entries.map(entryKey))
  const seenSections = new Set(entries.map(sectionKey))
  const seenHolds = new Set(bookings.filter((b) => b.status === 'confirmed').map(holdKey))
  const busy = {
    rooms: (rows.roomBusy ?? [])
      .map((r) => ({ roomId: r.room_id, day: r.day, period: r.period, length: r.length }))
      .filter((e) => !seenRooms.has(entryKey(e))),
    sections: (rows.sectionBusy ?? [])
      .map((r) => ({ sectionId: r.section_id, day: r.day, period: r.period, length: r.length }))
      .filter((e) => !seenSections.has(sectionKey(e))),
    holds: (rows.holds ?? [])
      .map((r) => ({ roomId: r.room_id, date: r.date, start: r.start, duration: r.duration, setup: r.setup, cleanup: r.cleanup }))
      .filter((h) => !seenHolds.has(holdKey(h))),
  }

  const base = emptyCollege()
  return normalizeCollege({
    ...base,
    meta: rows.settings?.meta ?? null,
    time: rows.settings?.time ?? base.time,
    departments: listOf(rows.departments),
    roomTypes: listOf(rows.roomTypes),
    rooms: listOf(rows.rooms),
    subjects: listOf(rows.subjects),
    teachers,
    sections: listOf(rows.sections),
    timetable,
    bookings,
    requests: (rows.requests ?? []).map((r) => r.data),
    busy,
  })
}

/** The save_college() payload for some parts of the college ('timetable' and the setup keys). */
export function savePayload(data, keys) {
  const p = {}
  for (const key of keys) {
    if (key === 'timetable') p.timetable = data.timetable ?? null
    else if (key === 'meta') p.meta = data.meta ?? null
    else if (key === 'time') p.time = data.time
    else if (LIST_TABLES[key]) p[key] = data[key] ?? []
  }
  return p
}

/** The whole college as a payload: setup, timetable, and every booking and request replaced (demo load, clear all). */
export function replaceAllPayload(data) {
  return { ...savePayload(data, [...SETUP_KEYS, 'timetable']), bookings: data.bookings ?? [], requests: data.requests ?? [] }
}

// ---------- browser data -> database ----------

/** What a college object holds, for the import preview and for verifying the copy afterwards. */
export function collegeCounts(data) {
  return {
    departments: data.departments?.length ?? 0,
    rooms: data.rooms?.length ?? 0,
    subjects: data.subjects?.length ?? 0,
    teachers: data.teachers?.length ?? 0,
    sections: data.sections?.length ?? 0,
    classes: data.timetable?.entries?.length ?? 0,
    bookings: data.bookings?.length ?? 0,
    requests: data.requests?.length ?? 0,
  }
}

/**
 * Checks that the database now holds everything from the browser copy: the same setup records (by id, with the
 * same content), the same timetable size, and every booking and request id. Returns a list of plain-language
 * problems (empty = verified).
 */
export function verifyCopy(local, remote) {
  const problems = []
  for (const key of Object.keys(LIST_TABLES)) {
    const want = new Map((local[key] ?? []).map((x) => [x.id, x]))
    const have = new Map((remote[key] ?? []).map((x) => [x.id, x]))
    const missing = [...want.keys()].filter((id) => !have.has(id))
    const different = [...want.keys()].filter((id) => have.has(id) && !sameRecord(want.get(id), have.get(id), key))
    if (missing.length) problems.push(`${missing.length} ${key} missing in the database`)
    if (different.length) problems.push(`${different.length} ${key} differ from the browser copy`)
  }
  if (JSON.stringify(local.time) !== JSON.stringify(remote.time)) problems.push('The time structure differs')
  const want = local.timetable?.entries?.length ?? 0
  const have = remote.timetable?.entries?.length ?? 0
  if (want !== have) problems.push(`The timetable has ${have} classes in the database, ${want} in the browser`)
  for (const key of ['bookings', 'requests']) {
    const ids = new Set((remote[key] ?? []).map((x) => x.id))
    const missing = (local[key] ?? []).filter((x) => !ids.has(x.id)).length
    if (missing) problems.push(`${missing} ${key} missing in the database`)
  }
  return problems
}

// Compare with the same normalisation as the round trip: key order doesn't matter, teachers' limits may be defaulted.
function sameRecord(a, b, key) {
  if (key === 'teachers') {
    const fill = (t) => ({ unavailable: [], maxHours: 0, ...t })
    return canonical(fill(a)) === canonical(fill(b))
  }
  return canonical(a) === canonical(b)
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined && value[k] !== null)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
