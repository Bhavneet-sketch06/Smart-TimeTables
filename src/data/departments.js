// Departments: the college-wide list, plus helpers that scope sections, teachers, subjects and timetable
// entries to one department. Rooms are shared college-wide (a room may have a home department, `deptId`).
//
// department: { id, short, name, source?: 'gndec' | 'sample', note? }
// section.deptId / section.batch (e.g. '3rd Sem (D2)'), teacher.deptId (home department, null for service
// departments such as Applied Sciences), subject.deptId (optional), room.deptId (optional home department).

import { collegeQuality, findClashes, lectureBlocksOf, runSummary } from '../scheduler.js'
import { normalizeTime, roomTypesOf } from './schema.js'

export const ALL = 'all'

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dept'

/** "CSE - 3rd Sem (D2)" -> { short: 'CSE', batch: '3rd Sem (D2)' }; "ECE" -> { short: 'ECE', batch: '' }. */
function splitLegacy(label = '') {
  const m = String(label).match(/^\s*([^-]+?)\s+-\s+(.+)$/)
  return m ? { short: m[1].trim(), batch: m[2].trim() } : { short: String(label).trim(), batch: '' }
}

/**
 * Upgrades data saved before departments existed (and fills gaps in new data): creates the department list
 * from the sections' old free-text `department`, and sets section.deptId / batch and teacher.deptId.
 * Idempotent and safe to run on every load.
 */
export function normalizeCollege(data) {
  if (!data) return data
  let departments = Array.isArray(data.departments) ? [...data.departments] : []
  const byShort = new Map(departments.map((d) => [d.short.toLowerCase(), d]))
  const ensure = (short) => {
    if (!short) return null
    const key = short.toLowerCase()
    if (!byShort.has(key)) {
      const dept = { id: slug(short), short, name: short }
      departments.push(dept)
      byShort.set(key, dept)
    }
    return byShort.get(key)
  }

  const sections = data.sections.map((s) => {
    if (s.deptId && departments.some((d) => d.id === s.deptId)) return { ...s, batch: s.batch ?? '' }
    const { short, batch } = splitLegacy(s.department)
    const dept = ensure(short || 'General')
    return { ...s, deptId: dept.id, batch: s.batch ?? batch }
  })
  const teachers = data.teachers.map((t) =>
    t.deptId !== undefined ? t : { ...t, deptId: byShort.get(String(t.department || '').toLowerCase())?.id ?? null },
  )
  return { ...data, time: normalizeTime(data.time), roomTypes: roomTypesOf(data), departments, sections, teachers }
}

export const deptById = (data, id) => (data.departments || []).find((d) => d.id === id)
export const batchOf = (section) => section.batch || ''

/** Sections of a department ('all' = every section). */
export const sectionsOf = (data, deptId) =>
  !deptId || deptId === ALL ? data.sections : data.sections.filter((s) => s.deptId === deptId)

/** Teachers whose home department it is, plus anyone teaching (lecture or lab) in its sections. */
export function teachersOf(data, deptId) {
  if (!deptId || deptId === ALL) return data.teachers
  const teaching = new Set(
    sectionsOf(data, deptId).flatMap((s) => s.assignments.flatMap((a) => [a.teacherId, a.labTeacherId])),
  )
  return data.teachers.filter((t) => t.deptId === deptId || teaching.has(t.id))
}

/** Subjects owned by the department or used by its sections. */
export function subjectsOf(data, deptId) {
  if (!deptId || deptId === ALL) return data.subjects
  const used = new Set(sectionsOf(data, deptId).flatMap((s) => s.assignments.map((a) => a.subjectId)))
  return data.subjects.filter((s) => s.deptId === deptId || used.has(s.id))
}

/** Timetable entries for the department's sections. */
export function entriesOf(data, deptId) {
  const entries = data.timetable?.entries ?? []
  if (!deptId || deptId === ALL) return entries
  const ids = new Set(sectionsOf(data, deptId).map((s) => s.id))
  return entries.filter((e) => ids.has(e.sectionId))
}

/** Every other department's classes: what a department is scheduled around. */
export function fixedFor(data, deptId, entries = data.timetable?.entries ?? []) {
  const deptOf = new Map(data.sections.map((s) => [s.id, s.deptId]))
  return entries.filter((e) => deptOf.get(e.sectionId) !== deptId)
}

/** Batches (semester / class labels) in a department, in a stable order. */
export const batchesOf = (data, deptId) =>
  [...new Set(sectionsOf(data, deptId).map(batchOf))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

/** How far a department is set up; drives the "set up this department" prompts. */
export function departmentStatus(data, deptId) {
  const sections = sectionsOf(data, deptId)
  const withSubjects = sections.filter((s) => s.assignments.length > 0)
  const entries = entriesOf(data, deptId)
  return {
    sections: sections.length,
    ready: withSubjects.length > 0,
    generated: entries.length > 0,
    entries: entries.length,
  }
}

/**
 * Builds the college timetable after generating one department: that department's classes are replaced, every
 * other department's classes are kept (they were passed to the scheduler as fixed), and totals are recomputed.
 * `result` is generateTimetable(..., { departmentId }) output; `fixedEntries` the other departments' classes.
 */
export function mergeDepartmentTimetable(data, deptId, fixedEntries, result) {
  const previous = data.timetable?.byDept ?? {}
  const byDept = {
    ...previous,
    [deptId]: runSummary(result),
  }
  const entries = [...fixedEntries, ...result.entries]
  const results = Object.values(byDept)
  const sum = (key) => results.reduce((n, r) => n + (r.stats?.[key] ?? 0), 0)
  return {
    entries,
    byDept,
    ok: results.every((r) => r.ok),
    reason: result.reason,
    unplaced: result.unplaced,
    problems: result.problems,
    issues: result.issues ?? [],
    failure: result.failure ?? null,
    stats: {
      placed: sum('placed'),
      total: sum('total'),
      clashes: findClashes(entries, data).length,
      quality: collegeQuality(entries, data),
      steps: sum('steps'),
      restarts: sum('restarts'),
      ms: result.stats.ms,
    },
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Number of classes a department's sections need per week, counted as the scheduler places them: one per lecture
 * block (a double period is one class), one per tutorial per lab group, and every lab session of every lab group.
 */
export function expectedClasses(data, deptId) {
  const subjects = new Map(data.subjects.map((s) => [s.id, s]))
  let n = 0
  for (const sec of sectionsOf(data, deptId)) {
    const groups = Math.max(1, sec.labGroups || 1)
    for (const a of sec.assignments) {
      const sub = subjects.get(a.subjectId)
      if (!sub) continue
      n += lectureBlocksOf(sub).length + (sub.tutorialHours || 0) * groups + (sub.labHours > 0 ? Math.max(1, sub.labSessions || 1) * groups : 0)
    }
  }
  return n
}
