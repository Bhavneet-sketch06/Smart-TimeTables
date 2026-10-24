// Import College Data: turns uploaded tables into the app's data model, with row-level validation.
// Pure JS (no React). Parsing lives in formats.js and the accepted tables in tables.js.
//
//   readUpload(file)                          -> Promise<Sheet[]>   one Sheet per CSV file or workbook sheet
//   sheetFrom(source, rows)                   -> Sheet             { id, source, rows, headerIndex, headers, table, mapping }
//   suggestMode(sheets, current)              -> { mode, reason, matches, total }
//   buildImport(sheets, current, { mode })    -> { ok, data, issues, counts, mode }
//
// Nothing is changed until the caller saves `data`. Modes, when the current setup isn't empty:
//   'add'     new records are added; a record that already exists is an error (never overwritten)
//   'update'  records that already exist (same code or name) are updated from the columns the file has, new ones
//             are added, and nothing is removed; a section's assignments are replaced by the file's rows for it
//   'replace' the file becomes the whole setup (records with the same name keep their identity)
// Issues: { level: 'error' | 'warning' | 'info', table, source, line, field, message }; any error blocks the import.

import { ALL_DAYS, DEFAULT_ROOM_TYPES, breaksOf, emptyCollege, guessKind, roomTypesOf, uid, withDefaults } from '../data/schema.js'
import { normalizeCollege } from '../data/departments.js'
import { MAX_LAB_GROUPS, precheck } from '../scheduler.js'
import { FileFormatError, parseCsv, readXlsx } from './formats.js'
import { TABLES, TABLE_KEYS, TIME_SETTINGS } from './tables.js'

export const LIMITS = { fileBytes: 2 * 1024 * 1024, files: 12, rows: 2000 }

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const keyOf = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const isBlankRow = (r) => !r || r.every((c) => String(c ?? '').trim() === '')
const splitList = (s) => String(s ?? '').split(/[;|,\n]/).map((x) => x.trim()).filter(Boolean)
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'type'

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
  // Assignments first ("subject allotment" is an assignment file), room types before rooms, time last
  // ("timetable rooms" is rooms).
  const byName = ['assignments', 'room_types', 'departments', 'rooms', 'subjects', 'teachers', 'sections', 'time'].find((k) =>
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

// ---------- collecting rows ----------

/** True when the setup has nothing a timetable is built from (departments alone don't count). */
export const isSetupEmpty = (data) => !data.rooms.length && !data.subjects.length && !data.teachers.length && !data.sections.length

/** Data rows of every sheet, as { source, line, table, values, mapped } per table, plus sheet-level issues. */
function collect(sheets) {
  const issues = []
  const records = Object.fromEntries(TABLE_KEYS.map((k) => [k, []]))
  for (const sheet of sheets) {
    if (sheet.table === 'ignore' || !TABLES[sheet.table]) {
      issues.push({ level: 'info', table: 'Not imported', source: sheet.source, message: 'Not used: choose what this file holds if it should be imported.' })
      continue
    }
    const def = TABLES[sheet.table]
    const where = { table: def.label, source: sheet.source }
    const missing = def.fields.filter((x) => x.required && !(sheet.mapping[x.key] >= 0))
    for (const x of missing) {
      issues.push({ level: 'error', ...where, field: x.key, message: `No column is chosen for "${x.key}", which is required. Pick it under Columns, or add the column to the file.` })
    }
    const seen = new Map()
    for (const [key, i] of Object.entries(sheet.mapping).filter(([, i]) => i >= 0)) {
      if (seen.has(i)) issues.push({ level: 'warning', ...where, field: key, message: `The column "${sheet.headers[i]}" is used for both "${seen.get(i)}" and "${key}".` })
      seen.set(i, key)
    }
    if (missing.length) continue
    const body = sheet.rows
      .map((r, i) => ({ r, line: i + 1 }))
      .slice(sheet.headerIndex + 1)
      .filter(({ r }) => !isBlankRow(r))
    if (!body.length) {
      issues.push({ level: 'error', ...where, message: 'The header row is there but there are no data rows below it.' })
      continue
    }
    if (body.length > LIMITS.rows) {
      issues.push({ level: 'error', ...where, message: `${body.length} rows is more than the ${LIMITS.rows} rows allowed per table. Split the file.` })
      continue
    }
    const mapped = new Set(def.fields.filter((x) => sheet.mapping[x.key] >= 0).map((x) => x.key))
    for (const { r, line } of body) {
      const values = {}
      for (const x of def.fields) values[x.key] = mapped.has(x.key) ? String(r[sheet.mapping[x.key]] ?? '').trim() : ''
      records[sheet.table].push({ source: sheet.source, line, values, table: def.label, mapped })
    }
  }
  return { records, issues }
}

// The record key each table is matched on (against the current setup and within the file).
const KEYS = {
  departments: { field: 'code', of: (x) => x.short },
  room_types: { field: 'name', of: (x) => x.name },
  rooms: { field: 'name', of: (x) => x.name },
  subjects: { field: 'code', of: (x) => x.code },
  teachers: { field: 'name', of: (x) => x.name },
  sections: { field: 'name', of: (x) => x.name },
}
const LISTS = { departments: 'departments', room_types: 'roomTypes', rooms: 'rooms', subjects: 'subjects', teachers: 'teachers', sections: 'sections' }

/**
 * Which mode fits the file: 'replace' when it looks like a complete, different college; 'update' when most of its
 * records are already in the setup; 'add' when none are. The administrator can always choose another.
 */
export function suggestMode(sheets, current) {
  if (isSetupEmpty(current)) return { mode: 'replace', reason: 'The setup is empty, so the file becomes the college setup.', matches: 0, total: 0 }
  const { records } = collect(sheets)
  let matches = 0
  let total = 0
  for (const [table, { field, of }] of Object.entries(KEYS)) {
    const existing = new Set((table === 'room_types' ? roomTypesOf(current) : current[LISTS[table]] ?? []).map((x) => keyOf(of(x))))
    for (const rec of records[table]) {
      if (!rec.values[field]) continue
      total++
      if (existing.has(keyOf(rec.values[field]))) matches++
    }
  }
  const complete = ['rooms', 'subjects', 'teachers', 'sections', 'assignments'].every((k) => records[k].length)
  if (matches === 0) return { mode: 'add', reason: 'Nothing in the file is in the current setup yet, so it can be added alongside it.', matches, total }
  if (complete && matches / Math.max(1, total) < 0.5) {
    return {
      mode: 'replace',
      reason: `This looks like a complete, different college: only ${matches} of its ${total} records match the current setup.`,
      matches,
      total,
    }
  }
  return { mode: 'update', reason: `${matches} of the ${total} records in the file are already in the setup; Update & add updates them and adds the rest.`, matches, total }
}

// ---------- validation & building ----------

/**
 * Validates the mapped sheets and builds the college data they describe.
 * current: the app's data now. mode: 'add' | 'update' | 'replace' (an empty setup is always replaced).
 */
export function buildImport(sheets, current, { mode = 'add' } = {}) {
  const collected = collect(sheets)
  const records = collected.records
  const issues = [...collected.issues]
  const report = (level, where, message) => issues.push({ level, line: null, field: null, ...where, message })
  const effective = isSetupEmpty(current) ? 'replace' : mode
  const replacing = effective === 'replace'
  const updating = effective === 'update'
  const keep = (list) => (replacing ? [] : [...(list ?? [])])
  const given = (k) => records[k].length > 0
  const inSetup = replacing ? '' : ' or the current setup'

  if (!TABLE_KEYS.some(given) && !issues.some((i) => i.level === 'error')) {
    report('error', { table: 'Files' }, 'None of the files holds a table the app can import. Use the template headers, or choose what each file holds.')
  }
  if (replacing) {
    for (const k of ['rooms', 'subjects', 'teachers', 'sections', 'assignments']) {
      if (!given(k) && !issues.some((i) => i.table === TABLES[k].label && i.level === 'error')) {
        report('error', { table: TABLES[k].label }, `A ${TABLES[k].label.toLowerCase()} table is needed${mode === 'replace' ? ' to replace the setup' : ' for a new setup'}. Add the ${TABLES[k].file} file or sheet (see the template).`)
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

  // Keys of rejected rows (a clash with the current setup in add mode, or a row with its own errors) are remembered,
  // so rows referring to them don't produce misleading follow-on messages: the problem is reported on the row itself.
  const rejected = Object.fromEntries(TABLE_KEYS.map((k) => [k, new Set()]))
  const drop = (table, key) => key && rejected[table].add(keyOf(key))

  /**
   * Rows of a table with their matching current record (when updating). Duplicates within the file are errors;
   * in add mode, so is a record that already exists.
   */
  const rowsOf = (table, label, currentList, { shared = false } = {}) => {
    const { field, of } = KEYS[table]
    const seen = new Map()
    const out = []
    for (const rec of records[table]) {
      const k = keyOf(rec.values[field])
      if (!k) {
        report('error', at(rec, field), 'This value is required but the cell is empty.')
        continue
      }
      if (seen.has(k)) {
        const first = seen.get(k)
        const where = first.source === rec.source ? `row ${first.line}` : `${first.source}, row ${first.line}`
        report('error', at(rec, field), `"${rec.values[field]}" appears twice (also on ${where}). Each ${label} must be listed once.`)
        continue
      }
      seen.set(k, rec)
      const existing = replacing ? null : currentList.find((x) => keyOf(of(x)) === k)
      // Departments and room types are shared vocabulary: when adding, an existing one is simply reused.
      if (existing && !updating && shared) {
        out.push({ rec, existing, id: existing.id, reuse: true })
        continue
      }
      if (existing && !updating) {
        drop(table, k)
        report('error', at(rec, field), `"${rec.values[field]}" is already in your current setup. Choose "Update & add" to update it from the file, or Replace.`)
        continue
      }
      // Ids stay the same for records with the same key (when replacing too), so bookings and saved choices stay valid.
      const id = existing?.id ?? currentList.find((x) => keyOf(of(x)) === k)?.id
      out.push({ rec, existing, id })
    }
    return out
  }

  /** When updating, only the columns the file has change an existing record; everything else is kept. */
  const merge = (existing, built, rec, props) => {
    if (!existing) return built
    const next = { ...existing }
    for (const [field, keys] of Object.entries(props)) if (rec.mapped.has(field)) for (const k of keys) next[k] = built[k]
    return next
  }
  const counts = { added: {}, updated: {} }
  const tally = (table, existing) => {
    const bucket = existing ? counts.updated : counts.added
    bucket[table] = (bucket[table] ?? 0) + 1
  }

  // ----- time -----
  let time = withDefaults(current.time)
  if (given('time')) {
    const next = { ...time }
    const seen = new Set()
    const slotOf = (rec, token) => {
      const m = token.match(/^([a-z]+)\s*[-\s]\s*p?(\d+)$/i)
      const day = m && ALL_DAYS.find((d) => d.toLowerCase() === m[1].slice(0, 3).toLowerCase())
      if (!m || !day) {
        report('error', at(rec, 'value'), `"${token}" isn't a slot. Write day-period, e.g. Wed-7.`)
        return null
      }
      return `${day}-${Number(m[2])}`
    }
    for (const rec of records.time) {
      const known = TIME_SETTINGS.find((s) => norm(s.key) === norm(rec.values.setting))
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
      const number = (min, max) => int({ ...rec, values: { value: raw } }, 'value', { min, max, required: true })
      if (known.key === 'days') {
        const days = splitList(raw).map((d) => ALL_DAYS.find((x) => x.toLowerCase() === d.slice(0, 3).toLowerCase()))
        if (!days.length || days.some((d) => !d)) report('error', at(rec, 'value'), `"${raw}" should list days like Mon;Tue;Wed;Thu;Fri (any of Mon to Sun).`)
        else if (new Set(days).size !== days.length) report('error', at(rec, 'value'), 'A day is listed twice.')
        else next.days = days // in the college's week order, as written
      } else if (known.key === 'start_time') {
        // Excel may store 09:00 as a fraction of a day (0.375).
        const asFraction = /^0?\.\d+$|^0$/.test(raw) ? Math.round(Number(raw) * 1440) : null
        const hhmm = asFraction != null ? `${String(Math.floor(asFraction / 60)).padStart(2, '0')}:${String(asFraction % 60).padStart(2, '0')}` : raw
        const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) report('error', at(rec, 'value'), `"${raw}" should be a time like 09:00.`)
        else next.startTime = `${m[1].padStart(2, '0')}:${m[2]}`
      } else if (known.key === 'periods_per_day') {
        const n = number(1, 14)
        if (n != null) next.periodsPerDay = n
      } else if (known.key === 'period_minutes') {
        const n = number(10, 240)
        if (n != null) next.periodMinutes = n
      } else if (known.key === 'breaks') {
        const list = []
        for (const token of splitList(raw)) {
          const [after, minutes, ...name] = token.split(':').map((x) => x.trim())
          if (!/^\d+$/.test(after ?? '') || !/^\d+$/.test(minutes ?? '')) {
            report('error', at(rec, 'value'), `"${token}" should be after-period:minutes:name, e.g. 4:45:Lunch.`)
            continue
          }
          list.push({ after: Number(after), minutes: Number(minutes), label: name.join(':') || 'Break' })
        }
        next.breaks = list
      } else if (known.key === 'break_after' || known.key === 'break_minutes') {
        const n = known.key === 'break_after' ? number(0, 13) : number(0, 240)
        if (n != null) next[known.key === 'break_after' ? 'breakAfter' : 'breakMinutes'] = n
      } else if (known.key === 'day_periods') {
        const dayPeriods = {}
        for (const token of splitList(raw)) {
          const [d, n] = token.split(':').map((x) => x.trim())
          const day = ALL_DAYS.find((x) => x.toLowerCase() === String(d).slice(0, 3).toLowerCase())
          if (!day || !/^\d+$/.test(n ?? '')) report('error', at(rec, 'value'), `"${token}" should be day:periods, e.g. Sat:4.`)
          else dayPeriods[day] = Number(n)
        }
        next.dayPeriods = dayPeriods
      } else if (known.key === 'blocked') {
        const blocked = {}
        for (const token of splitList(raw)) {
          const [slot, ...why] = token.split(':')
          const key = slotOf(rec, slot.trim())
          if (key) blocked[key] = why.join(':').trim()
        }
        next.blocked = blocked
      }
    }
    // A single break given the older way (break_after / break_minutes) replaces the breaks.
    if (seen.has('break_after') || seen.has('break_minutes')) {
      if (seen.has('breaks')) report('warning', { table: TABLES.time.label, source: records.time[0].source }, 'Both breaks and break_after are set; breaks is used.')
      else {
        const after = seen.has('break_after') ? next.breakAfter : breaksOf(time)[0]?.after ?? 0
        const minutes = seen.has('break_minutes') ? next.breakMinutes : breaksOf(time)[0]?.minutes ?? 30
        next.breaks = after > 0 ? [{ after, minutes, label: 'Lunch break' }] : []
      }
    }
    delete next.breakAfter
    delete next.breakMinutes
    const where = { table: TABLES.time.label, source: records.time[0].source }
    for (const b of next.breaks ?? []) {
      if (b.after < 1 || b.after >= next.periodsPerDay) report('error', { ...where, field: 'breaks' }, `A break after period ${b.after} isn't between two periods (the day has ${next.periodsPerDay}).`)
    }
    for (const [day, n] of Object.entries(next.dayPeriods ?? {})) {
      if (!next.days.includes(day)) report('error', { ...where, field: 'day_periods' }, `${day} isn't one of the working days (${next.days.join(', ')}).`)
      else if (n > next.periodsPerDay) report('error', { ...where, field: 'day_periods' }, `${day} has ${n} periods, more than periods_per_day (${next.periodsPerDay}).`)
    }
    for (const slot of Object.keys(next.blocked ?? {})) {
      const [day, p] = slot.split('-')
      if (!next.days.includes(day) || Number(p) < 1 || Number(p) > next.periodsPerDay) {
        report('error', { ...where, field: 'blocked' }, `"${slot}" isn't a period of the week (${next.days.join(', ')}, periods 1 to ${next.periodsPerDay}).`)
      }
    }
    if (replacing || updating) time = next
    else report('warning', where, 'Not applied: when adding to the current setup, the current time structure is kept. Choose Update & add or Replace to use the file\'s.')
    if (updating) report('info', where, 'The time structure will be updated from the file.')
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
  const deptResults = []
  for (const { rec, existing, id, reuse } of rowsOf('departments', 'department', current.departments ?? [], { shared: true })) {
    if (reuse) continue
    const code = need(rec, 'code')
    const name = need(rec, 'name')
    if (!code || !name) {
      drop('departments', code)
      continue
    }
    const d = merge(existing, { id: id ?? uid('dept'), short: code, name, source: existing?.source ?? 'import' }, rec, { code: ['short'], name: ['name'] })
    deptResults.push({ record: d, existing })
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
    report('error', at(rec, field), `Department "${v}" isn't in the departments table${inSetup}.`)
    return null
  }

  // ----- room types -----
  const currentTypes = roomTypesOf(current)
  const types = replacing ? [] : [...currentTypes]
  const typeLookup = new Map()
  const indexType = (t) => {
    typeLookup.set(keyOf(t.name), t)
    typeLookup.set(keyOf(t.id), t)
  }
  types.forEach(indexType)
  const KINDS = { lecture: 'lecture', lectures: 'lecture', classroom: 'lecture', theory: 'lecture', tutorial: 'lecture', lab: 'lab', labs: 'lab', practical: 'lab', practicals: 'lab', laboratory: 'lab' }
  const typeResults = []
  for (const { rec, existing, id, reuse } of rowsOf('room_types', 'room type', currentTypes, { shared: true })) {
    if (reuse) continue
    const name = need(rec, 'name')
    const kind = rec.values.used_for ? KINDS[norm(rec.values.used_for)] : guessKind(name ?? '')
    if (rec.values.used_for && !kind) report('error', at(rec, 'used_for'), `"${rec.values.used_for}" should be lectures or labs.`)
    if (!name || !kind) {
      drop('room_types', name)
      continue
    }
    const preset = DEFAULT_ROOM_TYPES.find((t) => keyOf(t.name) === keyOf(name) || t.id === keyOf(name))
    const t = merge(existing, { id: id ?? preset?.id ?? `${slug(name)}-${uid('t').slice(2, 6)}`, name, kind }, rec, { name: ['name'], used_for: ['kind'] })
    typeResults.push({ record: t, existing })
    indexType(t)
  }
  const autoTypes = []
  // Rooms may use the default type words (classroom, lab, seminar) or any type of their own.
  const SYNONYMS = { class: 'classroom', lecture: 'classroom', lecturehall: 'classroom', lecturetheatre: 'classroom', laboratory: 'lab', practical: 'lab', seminarhall: 'seminar', hall: 'seminar', auditorium: 'seminar' }
  const roomType = (rec, field, { create = false } = {}) => {
    const v = rec.values[field]
    if (!v) return null
    if (rejected.room_types.has(keyOf(v))) return null
    const found = typeLookup.get(keyOf(v))
    if (found) return found
    const preset = DEFAULT_ROOM_TYPES.find((t) => t.id === (SYNONYMS[norm(v)] ?? norm(v)))
    if (preset) {
      const t = typeLookup.get(preset.id) ?? { ...preset }
      if (!typeLookup.has(preset.id)) {
        autoTypes.push(t)
        indexType(t)
      }
      return t
    }
    if (!create) {
      report('error', at(rec, field), `Room type "${v}" isn't used by any room or listed in the room types table${inSetup}.`)
      return null
    }
    const t = { id: `${slug(v)}-${uid('t').slice(2, 6)}`, name: v, kind: guessKind(v) }
    autoTypes.push(t)
    indexType(t)
    return t
  }

  // ----- rooms -----
  const roomResults = []
  for (const { rec, existing, id } of rowsOf('rooms', 'room', current.rooms ?? [])) {
    const name = need(rec, 'name')
    const capacity = int(rec, 'capacity', { min: 1, max: 5000, required: true })
    if (!rec.values.type) report('error', at(rec, 'type'), 'The room type is required (classroom, lab, seminar or your own type).')
    const type = roomType(rec, 'type', { create: true })
    const home = dept(rec, 'department')
    const eventsOnly = yesNo(rec, 'events_only')
    if (!name || capacity == null || !type) continue
    const room = merge(
      existing,
      { id: id ?? uid('room'), name, capacity, type: type.id, deptId: home?.id ?? null, facilities: splitList(rec.values.facilities), eventsOnly },
      rec,
      { name: ['name'], capacity: ['capacity'], type: ['type'], department: ['deptId'], facilities: ['facilities'], events_only: ['eventsOnly'] },
    )
    roomResults.push({ record: room, existing })
  }
  const newTypes = autoTypes.filter((t) => !currentTypes.some((c) => c.id === t.id) || replacing)
  const customAuto = autoTypes.filter((t) => !DEFAULT_ROOM_TYPES.some((d) => d.id === t.id))
  if (customAuto.length) {
    report('info', { table: TABLES.room_types.label }, `New room types from the rooms file: ${customAuto.map((t) => `${t.name} (${t.kind === 'lab' ? 'labs' : 'lectures'})`).join(', ')}. Change what a type is used for in Setup → Rooms if needed.`)
  }

  // ----- subjects -----
  const subjects = keep(current.subjects)
  const subjectLookup = new Map()
  const indexSubject = (s) => {
    if (s.code) subjectLookup.set(keyOf(s.code), s)
    subjectLookup.set(keyOf(s.name), s)
  }
  subjects.forEach(indexSubject)
  const subjectResults = []
  for (const { rec, existing, id } of rowsOf('subjects', 'subject code', current.subjects ?? [])) {
    const code = need(rec, 'code')
    const name = need(rec, 'name')
    const lectureHours = int(rec, 'lecture_hours', { min: 0, max: 30, required: true })
    const lectureBlock = int(rec, 'lecture_block', { min: 1, max: 4, fallback: 1 })
    const tutorialHours = int(rec, 'tutorial_hours', { min: 0, max: 10, fallback: 0 })
    const labHours = int(rec, 'lab_hours', { min: 0, max: 8, fallback: 0 })
    const labSessions = int(rec, 'lab_sessions', { min: 1, max: 6, fallback: 1 })
    const home = dept(rec, 'department')
    const lectureType = roomType(rec, 'lecture_room_type')
    const labType = roomType(rec, 'lab_room_type')
    const bad = [lectureHours, lectureBlock, tutorialHours, labHours, labSessions].some((v) => v == null)
    if (!code || !name || bad || (rec.values.lecture_room_type && !lectureType) || (rec.values.lab_room_type && !labType)) {
      drop('subjects', code)
      continue
    }
    if (lectureHours + labHours + tutorialHours === 0) {
      report('error', at(rec, 'lecture_hours'), 'This subject has no lectures, tutorials or lab, so there is nothing to schedule.')
      drop('subjects', code)
      continue
    }
    if (!labHours && rec.values.lab_sessions && labSessions > 1) report('warning', at(rec, 'lab_sessions'), 'Lab sessions are ignored because lab_hours is 0 (no lab).')
    if (!labHours && (labType || rec.values.lab_needs)) report('warning', at(rec, 'lab_room_type'), 'Lab room needs are ignored because lab_hours is 0 (no lab).')
    if (lectureType && lectureType.kind !== 'lecture') report('warning', at(rec, 'lecture_room_type'), `${lectureType.name} is a lab type; lectures will only use those rooms.`)
    const s = merge(
      existing,
      {
        id: id ?? uid('sub'),
        name,
        code,
        lectureHours,
        lectureBlock: lectureBlock > 1 ? lectureBlock : undefined,
        tutorialHours: tutorialHours || undefined,
        labHours,
        labSessions: labHours && labSessions > 1 ? labSessions : undefined,
        deptId: home?.id ?? null,
        lectureRoomType: lectureType?.id,
        lectureNeeds: splitList(rec.values.lecture_needs),
        labRoomType: labHours ? labType?.id : undefined,
        labNeeds: labHours ? splitList(rec.values.lab_needs) : [],
      },
      rec,
      {
        code: ['code'],
        name: ['name'],
        lecture_hours: ['lectureHours'],
        lecture_block: ['lectureBlock'],
        tutorial_hours: ['tutorialHours'],
        lab_hours: ['labHours'],
        lab_sessions: ['labSessions'],
        department: ['deptId'],
        lecture_room_type: ['lectureRoomType'],
        lecture_needs: ['lectureNeeds'],
        lab_room_type: ['labRoomType'],
        lab_needs: ['labNeeds'],
      },
    )
    subjectResults.push({ record: s, existing })
    indexSubject(s)
  }
  const subject = (rec, field, v = rec.values[field]) => {
    if (rejected.subjects.has(keyOf(v))) return null
    const found = subjectLookup.get(keyOf(v))
    if (!found) report('error', at(rec, field), `Subject "${v}" isn't in the subjects table${inSetup}.`)
    return found ?? null
  }

  // ----- teachers -----
  const teachers = keep(current.teachers)
  const teacherLookup = new Map(teachers.map((t) => [keyOf(t.name), t]))
  const teacherResults = []
  for (const { rec, existing, id } of rowsOf('teachers', 'teacher', current.teachers ?? [])) {
    const name = need(rec, 'name')
    const home = dept(rec, 'department')
    const maxHours = int(rec, 'max_hours', { min: 1, max: 80, required: true })
    const maxPerDay = int(rec, 'max_per_day', { min: 1, max: 14, fallback: 0 })
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
    if (!name || maxHours == null || maxPerDay == null) {
      drop('teachers', name)
      continue
    }
    const t = merge(
      existing,
      { id: id ?? uid('t'), name, department: home?.short ?? '', deptId: home?.id ?? null, subjectIds, maxHours, maxPerDay: maxPerDay || undefined, unavailable },
      rec,
      { name: ['name'], department: ['deptId', 'department'], max_hours: ['maxHours'], max_per_day: ['maxPerDay'], can_teach: ['subjectIds'], unavailable: ['unavailable'] },
    )
    teacherResults.push({ record: t, existing })
    teacherLookup.set(keyOf(name), t)
  }
  // Teachers the file may change (its own, and current ones when updating); others are read-only.
  const editableTeachers = new Set(teacherResults.map((r) => r.record))
  const teacher = (rec, field) => {
    if (rejected.teachers.has(keyOf(rec.values[field]))) return null
    const found = teacherLookup.get(keyOf(rec.values[field]))
    if (!found) report('error', at(rec, field), `Teacher "${rec.values[field]}" isn't in the teachers table${inSetup}.`)
    return found ?? null
  }

  // ----- sections -----
  const sectionLookup = new Map(keep(current.sections).map((s) => [keyOf(s.name), s]))
  const sectionResults = []
  for (const { rec, existing, id } of rowsOf('sections', 'section', current.sections ?? [])) {
    const name = need(rec, 'name')
    const home = dept(rec, 'department', { required: true })
    const students = int(rec, 'students', { min: 1, max: 5000, required: true })
    const labGroups = int(rec, 'lab_groups', { min: 1, max: MAX_LAB_GROUPS, fallback: 1 })
    const maxPerDay = int(rec, 'max_per_day', { min: 1, max: 14, fallback: 0 })
    const groupNames = splitList(rec.values.group_names)
    if (groupNames.length && labGroups != null && groupNames.length !== labGroups) {
      report('error', at(rec, 'group_names'), `${plural(groupNames.length, 'group name')} given for ${plural(labGroups, 'lab group')}.`)
    }
    if (!name || !home || students == null || labGroups == null || maxPerDay == null) {
      drop('sections', name)
      continue
    }
    const s = merge(
      existing,
      {
        id: id ?? uid('sec'),
        name,
        department: home.short,
        deptId: home.id,
        batch: rec.values.semester,
        students,
        labGroups,
        groupNames: labGroups > 1 && groupNames.length === labGroups ? groupNames : undefined,
        maxPerDay: maxPerDay || undefined,
        assignments: existing?.assignments ?? [],
      },
      rec,
      { name: ['name'], department: ['deptId', 'department'], semester: ['batch'], students: ['students'], lab_groups: ['labGroups', 'groupNames'], group_names: ['groupNames'], max_per_day: ['maxPerDay'] },
    )
    sectionResults.push({ record: s, existing })
    sectionLookup.set(keyOf(name), s)
  }

  // ----- assignments -----
  // A section named in the assignments file gets exactly the file's rows (when updating, they replace its current
  // subjects). In add mode, sections already in the setup can't be changed.
  const editableSections = new Map(sectionResults.map((r) => [r.record.id, r.record]))
  const assigned = new Map() // section id -> assignments from the file
  const pairs = new Map()
  for (const rec of records.assignments) {
    if (rejected.sections.has(keyOf(rec.values.section))) continue
    let sec = rec.values.section ? sectionLookup.get(keyOf(rec.values.section)) : null
    if (!rec.values.section) report('error', at(rec, 'section'), 'The section is required.')
    else if (!sec) report('error', at(rec, 'section'), `Section "${rec.values.section}" isn't in the sections table${inSetup}.`)
    else if (!editableSections.has(sec.id)) {
      if (!updating) {
        report('error', at(rec, 'section'), `"${sec.name}" is already in your current setup; choose "Update & add" to change its subjects from the file, or Replace.`)
        continue
      }
      sec = { ...sec }
      editableSections.set(sec.id, sec)
      sectionResults.push({ record: sec, existing: sec, assignmentsOnly: true })
    }
    sec = sec && editableSections.get(sec.id)
    const sub = rec.values.subject ? subject(rec, 'subject') : (report('error', at(rec, 'subject'), 'The subject code is required.'), null)
    let t = rec.values.teacher ? teacher(rec, 'teacher') : (report('error', at(rec, 'teacher'), 'The teacher is required.'), null)
    const lab = rec.values.lab_teacher ? teacher(rec, 'lab_teacher') : null
    if (!sec || !sub || !t || (rec.values.lab_teacher && !lab)) continue
    const pair = `${sec.id}|${sub.id}`
    if (pairs.has(pair)) {
      report('error', at(rec, 'subject'), `${sec.name} already has ${sub.code || sub.name} on row ${pairs.get(pair)}. List each subject once per section.`)
      continue
    }
    pairs.set(pair, rec.line)
    if (!(t.subjectIds ?? []).includes(sub.id)) {
      if (!editableTeachers.has(t) && !updating) {
        report('error', at(rec, 'teacher'), `${t.name} (already in your setup) isn't listed for ${sub.name}. Add it in Setup → Teachers, or choose "Update & add".`)
        continue
      }
      report('warning', at(rec, 'teacher'), `${t.name} isn't listed as teaching ${sub.code || sub.name} (can_teach); it will be added to their subjects.`)
      if (!editableTeachers.has(t)) {
        // Updating a current teacher who isn't in the teachers file: only their subjects change.
        const copy = { ...t }
        teacherResults.push({ record: copy, existing: t, subjectsOnly: true })
        editableTeachers.add(copy)
        teacherLookup.set(keyOf(t.name), copy)
        t = copy
      }
      t.subjectIds = [...(t.subjectIds ?? []), sub.id]
    }
    if (lab && !sub.labHours) report('warning', at(rec, 'lab_teacher'), `${sub.name} has no lab, so the lab teacher is ignored.`)
    const list = assigned.get(sec.id) ?? []
    list.push({ subjectId: sub.id, teacherId: t.id, ...(lab && sub.labHours && lab.id !== t.id ? { labTeacherId: lab.id } : {}) })
    assigned.set(sec.id, list)
  }
  for (const [id, list] of assigned) editableSections.get(id).assignments = list
  for (const { record: s, existing, assignmentsOnly } of sectionResults) {
    if (!assignmentsOnly && !existing && !s.assignments.length) {
      report('warning', { table: TABLES.sections.label, source: records.sections.find((r) => keyOf(r.values.name) === keyOf(s.name))?.source }, `${s.name} has no subjects in the assignments table, so it gets no classes.`)
    }
  }
  if (autoDepts.length) {
    report('warning', { table: TABLES.departments.label }, `There is no departments table, so ${plural(autoDepts.length, 'department')} will be created from the codes used: ${autoDepts.map((d) => d.short).join(', ')}.`)
  }

  // ----- the resulting college -----
  /** The kept current records with updates applied, then the new ones (deduplicated by id). */
  const combine = (kept, results, table) => {
    const byId = new Map(results.map((r) => [r.record.id, r]))
    const out = kept.map((x) => byId.get(x.id)?.record ?? x)
    const ids = new Set(out.map((x) => x.id))
    for (const r of results) {
      if (table && !r.subjectsOnly && !r.assignmentsOnly) tally(table, r.existing)
      if (!ids.has(r.record.id)) {
        out.push(r.record)
        ids.add(r.record.id)
      }
    }
    return out
  }
  const sources = [...new Set(sheets.filter((s) => s.table !== 'ignore').map((s) => s.source.split(' › ')[0]))]
  const data = normalizeCollege({
    ...emptyCollege(),
    ...current,
    meta: replacing
      ? { name: 'Imported college data', note: `Imported from ${sources.join(', ')} on ${new Date().toLocaleDateString()}. Timetables are generated by this app.`, source: 'import' }
      : current.meta,
    time,
    departments: combine(departments, [...deptResults, ...autoDepts.map((d) => ({ record: d }))], 'departments'),
    roomTypes: combine(types, [...typeResults, ...newTypes.map((t) => ({ record: t }))]),
    rooms: combine(keep(current.rooms), roomResults, 'rooms'),
    subjects: combine(subjects, subjectResults, 'subjects'),
    teachers: combine(teachers, teacherResults, 'teachers'),
    sections: combine(keep(current.sections), sectionResults, 'sections'),
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

  const sum = (k) => (counts.added[k] ?? 0) + (counts.updated[k] ?? 0)
  const result = {
    departments: sum('departments'),
    rooms: sum('rooms'),
    subjects: sum('subjects'),
    teachers: sum('teachers'),
    sections: sum('sections'),
    assignments: [...assigned.values()].reduce((n, list) => n + list.length, 0),
    roomTypes: customAuto.length + typeResults.filter((r) => !r.existing).length,
    time: given('time') && (replacing || updating),
    updated: counts.updated,
  }
  const order = { error: 0, warning: 1, info: 2 }
  issues.sort((a, b) => order[a.level] - order[b.level])
  return { ok, data, issues, counts: result, mode: effective }
}
