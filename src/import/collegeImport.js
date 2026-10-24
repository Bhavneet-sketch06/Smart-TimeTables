// Import College Data: turns uploaded tables into the app's data model, with row-level validation.
// Pure JS (no React). Parsing lives in formats.js and the accepted tables in tables.js.
//
//   readUpload(file)                          -> Promise<Sheet[]>   one Sheet per CSV file or workbook sheet
//   sheetFrom(source, rows)                   -> Sheet             { id, source, rows, headerIndex, headers, table, mapping }
//   buildImport(sheets, current, { mode })    -> { ok, data, issues, counts, mode }
//
// Nothing is changed until the caller saves `data`. In 'add' mode new records are added next to the current
// setup and a record that already exists is an error (never overwritten); 'replace' swaps the whole setup.
// Issues: { level: 'error' | 'warning' | 'info', table, source, line, field, message }; any error blocks the import.

import { DEFAULT_TIME, ALL_DAYS, emptyCollege, uid } from '../data/schema.js'
import { normalizeCollege } from '../data/departments.js'
import { precheck } from '../scheduler.js'
import { FileFormatError, parseCsv, readXlsx } from './formats.js'
import { TABLES, TABLE_KEYS, TIME_SETTINGS } from './tables.js'

export const LIMITS = { fileBytes: 2 * 1024 * 1024, files: 12, rows: 2000 }

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const keyOf = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const isBlankRow = (r) => !r || r.every((c) => String(c ?? '').trim() === '')
const splitList = (s) => String(s ?? '').split(/[;|,\n]/).map((x) => x.trim()).filter(Boolean)
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

// ---------- reading files ----------

/** Reads one uploaded File (CSV or .xlsx) into sheets. Throws FileFormatError with a plain-language message. */
export async function readUpload(file) {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (file.size > LIMITS.fileBytes) {
    throw new FileFormatError(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB; files up to 2 MB are accepted.`)
  }
  if (file.size === 0) throw new FileFormatError(`${file.name} is empty.`)
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const rows = parseCsv(await file.text())
    if (rows.every(isBlankRow)) throw new FileFormatError(`${file.name} has no rows.`)
    return [sheetFrom(file.name, rows)]
  }
  if (ext === 'xlsx') {
    const sheets = (await readXlsx(await file.arrayBuffer())).filter((s) => !s.rows.every(isBlankRow))
    if (!sheets.length) throw new FileFormatError(`${file.name} has no filled-in sheets.`)
    return sheets.map((s) => sheetFrom(`${file.name} › ${s.name}`, s.rows, s.name))
  }
  if (ext === 'xls' || ext === 'ods' || ext === 'numbers') {
    throw new FileFormatError(`${file.name}: .${ext} files aren't supported. Save it as .xlsx (Excel workbook) or CSV.`)
  }
  throw new FileFormatError(`${file.name}: only CSV (.csv) and Excel (.xlsx) files can be imported.`)
}

/** Which table a sheet holds: by its file or sheet name first, then by how many of its headers match. */
export function detectTable(name, headers) {
  const n = norm(name)
  if (/instruction|readme|help|notes/.test(n)) return 'ignore'
  // Assignments first ("subject allotment" is an assignment file); time last ("timetable rooms" is rooms).
  const byName = ['assignments', 'departments', 'rooms', 'subjects', 'teachers', 'sections', 'time'].find((k) =>
    TABLES[k].keywords.some((w) => n.includes(norm(w))),
  )
  if (byName) return byName
  let best = 'ignore'
  let bestScore = 0
  for (const k of TABLE_KEYS) {
    const map = autoMap(k, headers)
    const required = TABLES[k].fields.filter((x) => x.required)
    if (!required.every((x) => map[x.key] >= 0)) continue
    const score = Object.values(map).filter((i) => i >= 0).length / TABLES[k].fields.length
    if (score > bestScore) [best, bestScore] = [k, score]
  }
  return best
}

/** Matches each field of a table to a column, by name or a known alternative name. -1 = not found. */
export function autoMap(table, headers) {
  const cols = headers.map(norm)
  const used = new Set()
  const mapping = {}
  for (const field of TABLES[table]?.fields ?? []) {
    const names = [field.key, field.label, ...field.synonyms].map(norm)
    const i = cols.findIndex((c, j) => !used.has(j) && c && names.includes(c))
    mapping[field.key] = i
    if (i >= 0) used.add(i)
  }
  return mapping
}

let sheetCounter = 0
/** A sheet ready for review: the header is its first non-blank row; table and columns are guessed. */
export function sheetFrom(source, rows, name = source) {
  const headerIndex = Math.max(0, rows.findIndex((r) => !isBlankRow(r)))
  const headers = (rows[headerIndex] ?? []).map((h) => String(h ?? '').trim())
  const table = detectTable(name, headers)
  return { id: `sheet${++sheetCounter}`, source, rows, headerIndex, headers, table, mapping: autoMap(table, headers) }
}

// ---------- validation & building ----------

/** True when the setup has nothing a timetable is built from (departments alone don't count). */
export const isSetupEmpty = (data) => !data.rooms.length && !data.subjects.length && !data.teachers.length && !data.sections.length

/**
 * Validates the mapped sheets and builds the college data they describe.
 * current: the app's data now. mode: 'add' (keep the current setup, add new records) or 'replace'.
 */
export function buildImport(sheets, current, { mode = 'add' } = {}) {
  const issues = []
  const report = (level, where, message) => issues.push({ level, line: null, field: null, ...where, message })
  const replacing = mode === 'replace' || isSetupEmpty(current)
  const keep = (list) => (replacing ? [] : list ?? [])

  // ----- collect records from every sheet -----
  const records = Object.fromEntries(TABLE_KEYS.map((k) => [k, []]))
  for (const sheet of sheets) {
    if (sheet.table === 'ignore' || !TABLES[sheet.table]) {
      report('info', { table: 'Not imported', source: sheet.source }, 'Not used: choose what this file holds if it should be imported.')
      continue
    }
    const def = TABLES[sheet.table]
    const where = { table: def.label, source: sheet.source }
    const missing = def.fields.filter((x) => x.required && !(sheet.mapping[x.key] >= 0))
    for (const x of missing) {
      report('error', { ...where, field: x.key }, `No column is chosen for "${x.key}", which is required. Pick it under Columns, or add the column to the file.`)
    }
    const cols = Object.entries(sheet.mapping).filter(([, i]) => i >= 0)
    const seen = new Map()
    for (const [key, i] of cols) {
      if (seen.has(i)) report('warning', { ...where, field: key }, `The column "${sheet.headers[i]}" is used for both "${seen.get(i)}" and "${key}".`)
      seen.set(i, key)
    }
    if (missing.length) continue
    const body = sheet.rows
      .map((r, i) => ({ r, line: i + 1 }))
      .slice(sheet.headerIndex + 1)
      .filter(({ r }) => !isBlankRow(r))
    if (!body.length) {
      report('error', where, 'The header row is there but there are no data rows below it.')
      continue
    }
    if (body.length > LIMITS.rows) {
      report('error', where, `${body.length} rows is more than the ${LIMITS.rows} rows allowed per table. Split the file.`)
      continue
    }
    for (const { r, line } of body) {
      const values = {}
      for (const x of def.fields) values[x.key] = sheet.mapping[x.key] >= 0 ? String(r[sheet.mapping[x.key]] ?? '').trim() : ''
      records[sheet.table].push({ source: sheet.source, line, values, table: def.label })
    }
  }
  const given = (k) => records[k].length > 0
  if (!TABLE_KEYS.some(given) && !issues.some((i) => i.level === 'error')) {
    report('error', { table: 'Files' }, 'None of the files holds a table the app can import. Use the template headers, or choose what each file holds.')
  }
  if (replacing) {
    for (const k of ['rooms', 'subjects', 'teachers', 'sections', 'assignments']) {
      if (!given(k) && !issues.some((i) => i.table === TABLES[k].label && i.level === 'error')) {
        report(
          'error',
          { table: TABLES[k].label },
          `A ${TABLES[k].label.toLowerCase()} table is needed${mode === 'replace' ? ' to replace the setup' : ' for a new setup'}. Add the ${TABLES[k].file} file or sheet (see the template).`,
        )
      }
    }
  }

  // Field helpers: each reports its own row-level problem and returns null when the value is unusable.
  const at = (rec, field) => ({ table: rec.table, source: rec.source, line: rec.line, field })
  const need = (rec, field) => {
    const v = rec.values[field]
    if (!v) report('error', at(rec, field), 'This value is required but the cell is empty.')
    return v || null
  }
  const int = (rec, field, { min = 0, max = Infinity, fallback = null, required = false } = {}) => {
    const v = rec.values[field]
    if (!v) {
      if (required) report('error', at(rec, field), 'This value is required but the cell is empty.')
      return required ? null : fallback
    }
    if (!/^\d+(\.0+)?$/.test(v)) {
      report('error', at(rec, field), `"${v}" is not a whole number.`)
      return null
    }
    const n = Number(v)
    if (n < min || n > max) {
      report('error', at(rec, field), `${n} is out of range: use ${max === Infinity ? `${min} or more` : `${min} to ${max}`}.`)
      return null
    }
    return n
  }
  const yesNo = (rec, field) => {
    const v = keyOf(rec.values[field])
    if (!v) return false
    if (['yes', 'y', 'true', '1'].includes(v)) return true
    if (['no', 'n', 'false', '0'].includes(v)) return false
    report('error', at(rec, field), `"${rec.values[field]}" should be yes or no.`)
    return false
  }
  // Duplicate keys within the file, and (when adding) records that already exist. Keys of rejected rows (a clash with
  // the current setup, or a row with its own errors) are remembered, so rows referring to them don't produce
  // misleading follow-on messages: the problem is already reported on the row itself.
  const rejected = Object.fromEntries(TABLE_KEYS.map((k) => [k, new Set()]))
  const drop = (table, key) => {
    if (key) rejected[table].add(keyOf(key))
  }
  const unique = (table, keyField, existing, label) => {
    const seen = new Map()
    const ok = []
    for (const rec of records[table]) {
      const k = keyOf(rec.values[keyField])
      if (!k) continue
      if (seen.has(k)) {
        const first = seen.get(k)
        const where = first.source === rec.source ? `row ${first.line}` : `${first.source}, row ${first.line}`
        report('error', at(rec, keyField), `"${rec.values[keyField]}" appears twice (also on ${where}). Each ${label} must be listed once.`)
        continue
      }
      seen.set(k, rec)
      if (existing(k)) {
        rejected[table].add(k)
        report('error', at(rec, keyField), `"${rec.values[keyField]}" is already in your current setup. Remove it from the file, rename it, or choose Replace.`)
        continue
      }
      ok.push(rec)
    }
    return ok
  }
  // Keep the ids of records that match the current setup when replacing, so bookings and saved choices stay valid.
  const reuseId = (list, match, prefix) => list.find(match)?.id ?? uid(prefix)

  // ----- time -----
  let time = { ...DEFAULT_TIME, ...(current.time ?? {}) }
  if (given('time')) {
    const next = { ...time }
    const seen = new Set()
    for (const rec of records.time) {
      const key = norm(rec.values.setting)
      const known = TIME_SETTINGS.find((s) => norm(s.key) === key)
      if (!known) {
        report('error', at(rec, 'setting'), `Unknown setting "${rec.values.setting}". Use one of: ${TIME_SETTINGS.map((s) => s.key).join(', ')}.`)
        continue
      }
      if (seen.has(known.key)) {
        report('error', at(rec, 'setting'), `"${known.key}" is set twice.`)
        continue
      }
      seen.add(known.key)
      const raw = rec.values.value
      if (known.key === 'days') {
        const days = splitList(raw).map((d) => ALL_DAYS.find((x) => x.toLowerCase() === d.slice(0, 3).toLowerCase()))
        if (!days.length || days.some((d) => !d)) report('error', at(rec, 'value'), `"${raw}" should list days from Mon to Sat, e.g. Mon;Tue;Wed;Thu;Fri.`)
        else next.days = ALL_DAYS.filter((d) => days.includes(d))
      } else if (known.key === 'start_time') {
        // Excel may store 09:00 as a fraction of a day (0.375).
        const asFraction = /^0?\.\d+$|^0$/.test(raw) ? Math.round(Number(raw) * 1440) : null
        const hhmm = asFraction != null ? `${String(Math.floor(asFraction / 60)).padStart(2, '0')}:${String(asFraction % 60).padStart(2, '0')}` : raw
        const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) report('error', at(rec, 'value'), `"${raw}" should be a time like 09:00.`)
        else next.startTime = `${m[1].padStart(2, '0')}:${m[2]}`
      } else {
        const ranges = { periods_per_day: [1, 12], break_after: [0, 11], period_minutes: [10, 240], break_minutes: [0, 240] }
        const n = int({ ...rec, values: { value: raw } }, 'value', { min: ranges[known.key][0], max: ranges[known.key][1], required: true })
        const prop = { periods_per_day: 'periodsPerDay', break_after: 'breakAfter', period_minutes: 'periodMinutes', break_minutes: 'breakMinutes' }[known.key]
        if (n != null) next[prop] = n
      }
    }
    if (next.breakAfter >= next.periodsPerDay) {
      report('error', { table: TABLES.time.label, source: records.time[0].source, field: 'break_after' }, `The break comes after period ${next.breakAfter}, but the day only has ${next.periodsPerDay} periods.`)
    }
    if (replacing) time = next
    else {
      report('warning', { table: TABLES.time.label, source: records.time[0].source }, 'Not applied: when adding to the current setup, the current time structure is kept. Choose Replace to use the file\'s time structure.')
    }
  }
  const P = time.periodsPerDay

  // ----- departments -----
  const departments = keep(current.departments)
  const deptLookup = new Map()
  const indexDept = (d) => {
    deptLookup.set(keyOf(d.short), d)
    deptLookup.set(keyOf(d.name), d)
  }
  departments.forEach(indexDept)
  const newDepts = []
  for (const rec of unique('departments', 'code', (k) => !replacing && deptLookup.has(k), 'department')) {
    const code = need(rec, 'code')
    const name = need(rec, 'name')
    if (!code || !name) {
      drop('departments', code)
      continue
    }
    const d = { id: reuseId(current.departments ?? [], (x) => keyOf(x.short) === keyOf(code), 'dept'), short: code, name, source: 'import' }
    newDepts.push(d)
    indexDept(d)
  }
  const autoDepts = []
  const dept = (rec, field, { required = false } = {}) => {
    const v = rec.values[field]
    if (!v) {
      if (required) report('error', at(rec, field), 'A department code is required.')
      return null
    }
    if (rejected.departments.has(keyOf(v))) return null
    const found = deptLookup.get(keyOf(v))
    if (found) return found
    if (!given('departments')) {
      // No departments table: create the department from its code (reported once, below).
      const d = { id: uid('dept'), short: v, name: v, source: 'import' }
      autoDepts.push(d)
      indexDept(d)
      return d
    }
    report('error', at(rec, field), `Department "${v}" isn't in the departments table${replacing ? '' : ' or the current setup'}.`)
    return null
  }

  // ----- rooms -----
  const TYPES = { classroom: 'classroom', class: 'classroom', lecture: 'classroom', lecturehall: 'classroom', lecturetheatre: 'classroom', lab: 'lab', laboratory: 'lab', practical: 'lab', seminar: 'seminar', seminarhall: 'seminar', hall: 'seminar', auditorium: 'seminar' }
  const roomKeys = new Set(keep(current.rooms).map((r) => keyOf(r.name)))
  const newRooms = []
  for (const rec of unique('rooms', 'name', (k) => roomKeys.has(k), 'room')) {
    const name = need(rec, 'name')
    const capacity = int(rec, 'capacity', { min: 1, max: 2000, required: true })
    const type = TYPES[norm(rec.values.type)]
    if (rec.values.type && !type) report('error', at(rec, 'type'), `"${rec.values.type}" isn't a room type. Use classroom, lab or seminar.`)
    else if (!rec.values.type) report('error', at(rec, 'type'), 'The room type is required (classroom, lab or seminar).')
    const home = dept(rec, 'department')
    const eventsOnly = yesNo(rec, 'events_only')
    if (!name || capacity == null || !type) continue
    newRooms.push({
      id: reuseId(current.rooms ?? [], (x) => keyOf(x.name) === keyOf(name), 'room'),
      name,
      capacity,
      type,
      deptId: home?.id ?? null,
      facilities: splitList(rec.values.facilities),
      ...(eventsOnly ? { eventsOnly: true } : {}),
    })
  }

  // ----- subjects -----
  const subjects = keep(current.subjects)
  const subjectLookup = new Map()
  const indexSubject = (s) => {
    if (s.code) subjectLookup.set(keyOf(s.code), s)
    subjectLookup.set(keyOf(s.name), s)
  }
  subjects.forEach(indexSubject)
  const existingSubject = (k) => !replacing && subjects.some((s) => keyOf(s.code) === k)
  const newSubjects = []
  for (const rec of unique('subjects', 'code', existingSubject, 'subject code')) {
    const code = need(rec, 'code')
    const name = need(rec, 'name')
    const lectureHours = int(rec, 'lecture_hours', { min: 0, max: 20, required: true })
    const labHours = int(rec, 'lab_hours', { min: 0, max: 8, fallback: 0 })
    const labSessions = int(rec, 'lab_sessions', { min: 1, max: 6, fallback: 1 })
    const home = dept(rec, 'department')
    if (!code || !name || lectureHours == null || labHours == null || labSessions == null) {
      drop('subjects', code)
      continue
    }
    if (lectureHours + labHours === 0) {
      report('error', at(rec, 'lecture_hours'), 'This subject has no lecture hours and no lab, so there is nothing to schedule.')
      drop('subjects', code)
      continue
    }
    if (!labHours && rec.values.lab_sessions && labSessions > 1) {
      report('warning', at(rec, 'lab_sessions'), 'Lab sessions are ignored because lab_hours is 0 (no lab).')
    }
    const s = {
      id: reuseId(current.subjects ?? [], (x) => keyOf(x.code) === keyOf(code), 'sub'),
      name,
      code,
      lectureHours,
      labHours,
      ...(labHours && labSessions > 1 ? { labSessions } : {}),
      ...(home ? { deptId: home.id } : {}),
    }
    newSubjects.push(s)
    indexSubject(s)
  }
  const subject = (rec, field, v = rec.values[field]) => {
    if (rejected.subjects.has(keyOf(v))) return null
    const found = subjectLookup.get(keyOf(v))
    if (!found) report('error', at(rec, field), `Subject "${v}" isn't in the subjects table${replacing ? '' : ' or the current setup'}.`)
    return found ?? null
  }

  // ----- teachers -----
  const teachers = keep(current.teachers)
  const teacherLookup = new Map(teachers.map((t) => [keyOf(t.name), t]))
  const newTeachers = []
  for (const rec of unique('teachers', 'name', (k) => teacherLookup.has(k), 'teacher')) {
    const name = need(rec, 'name')
    const home = dept(rec, 'department')
    const maxHours = int(rec, 'max_hours', { min: 1, max: 60, required: true })
    const subjectIds = []
    for (const code of splitList(rec.values.can_teach)) {
      const s = subject(rec, 'can_teach', code)
      if (s && !subjectIds.includes(s.id)) subjectIds.push(s.id)
    }
    const unavailable = []
    for (const token of splitList(rec.values.unavailable)) {
      const m = token.match(/^([a-z]+)\s*[-\s]\s*p?(\d+)$/i)
      const day = m && time.days.find((d) => d.toLowerCase() === m[1].slice(0, 3).toLowerCase())
      if (!m) report('error', at(rec, 'unavailable'), `"${token}" isn't a slot. Write day-period, e.g. Mon-1 for Monday's first period.`)
      else if (!day) report('error', at(rec, 'unavailable'), `"${token}": ${m[1]} isn't one of the working days (${time.days.join(', ')}).`)
      else if (Number(m[2]) < 1 || Number(m[2]) > P) report('error', at(rec, 'unavailable'), `"${token}": the day has periods 1 to ${P}.`)
      else if (!unavailable.includes(`${day}-${Number(m[2])}`)) unavailable.push(`${day}-${Number(m[2])}`)
    }
    if (!name || maxHours == null) {
      drop('teachers', name)
      continue
    }
    const t = {
      id: reuseId(current.teachers ?? [], (x) => keyOf(x.name) === keyOf(name), 't'),
      name,
      department: home?.short ?? '',
      deptId: home?.id ?? null,
      subjectIds,
      maxHours,
      unavailable,
      fromFile: true,
    }
    newTeachers.push(t)
    teacherLookup.set(keyOf(name), t)
  }
  const teacher = (rec, field) => {
    if (rejected.teachers.has(keyOf(rec.values[field]))) return null
    const found = teacherLookup.get(keyOf(rec.values[field]))
    if (!found) report('error', at(rec, field), `Teacher "${rec.values[field]}" isn't in the teachers table${replacing ? '' : ' or the current setup'}.`)
    return found ?? null
  }

  // ----- sections -----
  const sectionLookup = new Map(keep(current.sections).map((s) => [keyOf(s.name), s]))
  const newSections = []
  for (const rec of unique('sections', 'name', (k) => sectionLookup.has(k), 'section')) {
    const name = need(rec, 'name')
    const home = dept(rec, 'department', { required: true })
    const students = int(rec, 'students', { min: 1, max: 1000, required: true })
    const labGroups = int(rec, 'lab_groups', { min: 1, max: 4, fallback: 1 })
    const groupNames = splitList(rec.values.group_names)
    if (groupNames.length && labGroups != null && groupNames.length !== labGroups) {
      report('error', at(rec, 'group_names'), `${plural(groupNames.length, 'group name')} given for ${plural(labGroups, 'lab group')}.`)
    }
    if (!name || !home || students == null || labGroups == null) {
      drop('sections', name)
      continue
    }
    const s = {
      id: reuseId(current.sections ?? [], (x) => keyOf(x.name) === keyOf(name), 'sec'),
      name,
      department: home.short,
      deptId: home.id,
      batch: rec.values.semester,
      students,
      labGroups,
      ...(labGroups > 1 && groupNames.length === labGroups ? { groupNames } : {}),
      assignments: [],
      fromFile: true,
    }
    newSections.push(s)
    sectionLookup.set(keyOf(name), s)
  }

  // ----- assignments -----
  const pairs = new Map()
  for (const rec of records.assignments) {
    if (rejected.sections.has(keyOf(rec.values.section))) continue
    const sec = rec.values.section ? sectionLookup.get(keyOf(rec.values.section)) : null
    if (!rec.values.section) report('error', at(rec, 'section'), 'The section is required.')
    else if (!sec) report('error', at(rec, 'section'), `Section "${rec.values.section}" isn't in the sections table${replacing ? '' : ' or the current setup'}.`)
    else if (!sec.fromFile) {
      report('error', at(rec, 'section'), `"${sec.name}" is already in your current setup; change its subjects in Setup → Sections, or choose Replace.`)
      continue
    }
    const sub = rec.values.subject ? subject(rec, 'subject') : (report('error', at(rec, 'subject'), 'The subject code is required.'), null)
    const t = rec.values.teacher ? teacher(rec, 'teacher') : (report('error', at(rec, 'teacher'), 'The teacher is required.'), null)
    const lab = rec.values.lab_teacher ? teacher(rec, 'lab_teacher') : null
    if (!sec || !sub || !t || (rec.values.lab_teacher && !lab)) continue
    const pair = `${sec.id}|${sub.id}`
    if (pairs.has(pair)) {
      report('error', at(rec, 'subject'), `${sec.name} already has ${sub.code || sub.name} on row ${pairs.get(pair)}. List each subject once per section.`)
      continue
    }
    pairs.set(pair, rec.line)
    if (!t.subjectIds.includes(sub.id)) {
      if (t.fromFile) {
        report('warning', at(rec, 'teacher'), `${t.name} isn't listed as teaching ${sub.code || sub.name} (can_teach); it will be added to their subjects.`)
        t.subjectIds = [...t.subjectIds, sub.id]
      } else {
        report('error', at(rec, 'teacher'), `${t.name} (already in your setup) isn't listed for ${sub.name}. Add it in Setup → Teachers, or choose Replace.`)
        continue
      }
    }
    if (lab && !sub.labHours) report('warning', at(rec, 'lab_teacher'), `${sub.name} has no lab, so the lab teacher is ignored.`)
    sec.assignments.push({ subjectId: sub.id, teacherId: t.id, ...(lab && sub.labHours && lab.id !== t.id ? { labTeacherId: lab.id } : {}) })
  }
  for (const s of newSections) {
    if (!s.assignments.length) {
      report('warning', { table: TABLES.sections.label, source: records.sections.find((r) => keyOf(r.values.name) === keyOf(s.name))?.source }, `${s.name} has no subjects in the assignments table, so it gets no classes.`)
    }
  }
  if (autoDepts.length) {
    report('warning', { table: TABLES.departments.label }, `There is no departments table, so ${plural(autoDepts.length, 'department')} will be created from the codes used: ${autoDepts.map((d) => d.short).join(', ')}.`)
  }

  // ----- the resulting college -----
  const strip = ({ fromFile, ...rest }) => rest
  const sources = [...new Set(sheets.filter((s) => s.table !== 'ignore').map((s) => s.source.split(' › ')[0]))]
  const data = normalizeCollege({
    ...emptyCollege(),
    ...current,
    meta: replacing
      ? {
          name: 'Imported college data',
          note: `Imported from ${sources.join(', ')} on ${new Date().toLocaleDateString()}. Timetables are generated by this app.`,
          source: 'import',
        }
      : current.meta,
    time,
    departments: [...departments, ...newDepts, ...autoDepts],
    rooms: [...keep(current.rooms), ...newRooms],
    subjects: [...subjects, ...newSubjects],
    teachers: [...teachers, ...newTeachers.map(strip)],
    sections: [...keep(current.sections), ...newSections.map(strip)],
    timetable: null,
    bookings: current.bookings ?? [],
  })

  const ok = !issues.some((i) => i.level === 'error')
  if (ok) {
    // The generator's own pre-check: these don't block the import (they can be fixed in Setup afterwards).
    for (const p of precheck(data).problems) {
      report('warning', { table: 'Timetable pre-check' }, `${p} The timetable can't be generated until this is fixed (after importing, in Setup).`)
    }
    if (replacing) {
      const roomIds = new Set(data.rooms.map((r) => r.id))
      const orphaned = (current.bookings ?? []).filter((b) => b.status === 'confirmed' && !roomIds.has(b.roomId))
      if (orphaned.length) {
        report('warning', { table: 'Bookings' }, `${plural(orphaned.length, 'room booking')} ${orphaned.length === 1 ? 'is' : 'are'} for rooms not in the imported data. Bookings are kept, but those rooms will show as unknown.`)
      }
    }
  }

  const counts = {
    departments: newDepts.length + autoDepts.length,
    rooms: newRooms.length,
    subjects: newSubjects.length,
    teachers: newTeachers.length,
    sections: newSections.length,
    assignments: newSections.reduce((n, s) => n + s.assignments.length, 0),
    time: given('time') && replacing,
  }
  const order = { error: 0, warning: 1, info: 2 }
  issues.sort((a, b) => order[a.level] - order[b.level])
  return { ok, data, issues, counts, mode: replacing ? 'replace' : 'add' }
}
