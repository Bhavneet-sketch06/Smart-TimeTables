import { describe, expect, test } from 'vitest'
import { emptyCollege } from '../data/schema.js'
import { demoCollege } from '../data/demoCollege.js'
import { findClashes, generateCollege } from '../scheduler.js'
import { FileFormatError, parseCsv, readXlsx, toCsv, writeXlsx } from './formats.js'
import { autoMap, buildImport, detectTable, readUpload, sheetFrom } from './collegeImport.js'
import { TABLE_KEYS, TABLES, templateRows, templateSheets } from './tables.js'

const text = (rows) => rows.map((r) => r.map((c) => String(c)))
const sampleSheets = () => TABLE_KEYS.map((k) => sheetFrom(`${TABLES[k].file}.csv`, text(templateRows(k))))
const errors = (result) => result.issues.filter((i) => i.level === 'error')

describe('file formats', () => {
  test('CSV: quotes, embedded separators and newlines, semicolon files, blank rows kept in place', () => {
    expect(parseCsv('name,notes\r\n"Lab, 1","say ""hi""\nthere"\r\n\r\nB,2\r\n')).toEqual([
      ['name', 'notes'],
      ['Lab, 1', 'say "hi"\nthere'],
      [''],
      ['B', '2'],
    ])
    expect(parseCsv('﻿a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
    expect(() => parseCsv('a,b\n"open,2')).toThrow(FileFormatError)
    expect(parseCsv(toCsv([['x', 'a,b', 'q"q']]))).toEqual([['x', 'a,b', 'q"q']])
  })

  test('xlsx: a written workbook reads back sheet by sheet', async () => {
    const bytes = writeXlsx([
      { name: 'Rooms', rows: [['name', 'capacity'], ['Lab <1> & Co', 35], ['', ''], ['B', 2]] },
      { name: 'Notes', rows: [['hello']] },
    ])
    const sheets = await readXlsx(bytes)
    expect(sheets.map((s) => s.name)).toEqual(['Rooms', 'Notes'])
    expect(sheets[0].rows).toEqual([['name', 'capacity'], ['Lab <1> & Co', '35'], [], ['B', '2']])
    await expect(readXlsx(new TextEncoder().encode('not a zip'))).rejects.toThrow(/not an .xlsx/)
  })

  test('uploads: unsupported, empty and oversized files get clear messages', async () => {
    const file = (name, content) => new File([content], name)
    await expect(readUpload(file('data.xls', 'x'))).rejects.toThrow(/\.xls files aren't supported/)
    await expect(readUpload(file('data.json', '{}'))).rejects.toThrow(/only CSV/)
    await expect(readUpload(file('rooms.csv', ''))).rejects.toThrow(/empty/)
    await expect(readUpload(file('rooms.csv', 'x'.repeat(2 * 1024 * 1024 + 1)))).rejects.toThrow(/up to 2 MB/)
    const [sheet] = await readUpload(file('Rooms.csv', 'Room No,Seats,Kind\nA1,40,classroom\n'))
    expect(sheet.table).toBe('rooms')
    expect(sheet.mapping).toMatchObject({ name: 0, capacity: 1, type: 2, department: -1 })
  })

  test('the template workbook reads back as every table, and Instructions is ignored', async () => {
    const sheets = (await readXlsx(writeXlsx(templateSheets()))).map((s) => sheetFrom(`template.xlsx › ${s.name}`, s.rows, s.name))
    expect(sheets.map((s) => s.table)).toEqual([...TABLE_KEYS, 'ignore'])
  })
})

describe('import college data', () => {
  test('the sample template imports cleanly and generates a clash-free timetable', () => {
    const result = buildImport(sampleSheets(), emptyCollege())
    expect(errors(result)).toEqual([])
    expect(result.issues.filter((i) => i.level === 'warning')).toEqual([])
    expect(result.counts).toMatchObject({ departments: 3, rooms: 10, subjects: 8, teachers: 8, sections: 4, assignments: 20, time: true })
    const { data } = result
    expect(data.meta.source).toBe('import')
    expect(data.time).toMatchObject({ startTime: '09:00', breakMinutes: 45, periodsPerDay: 7 })
    expect(data.rooms.find((r) => r.name === 'Seminar Hall').eventsOnly).toBe(true)
    expect(data.teachers.find((t) => t.name === 'Dr. Asha Mehta').unavailable).toEqual(['Mon-1', 'Mon-2'])
    const tt = generateCollege(data, { seed: 2 })
    expect(tt.ok).toBe(true)
    expect(findClashes(tt.entries, data)).toEqual([])
  })

  test('detects tables by name or by headers, and maps differently named columns', () => {
    expect(detectTable('Faculty list.csv', ['Name'])).toBe('teachers')
    expect(detectTable('subject allotment.csv', [])).toBe('assignments')
    expect(detectTable('data.csv', ['Section', 'Subject Code', 'Faculty'])).toBe('assignments')
    expect(detectTable('Instructions', ['anything'])).toBe('ignore')
    expect(autoMap('subjects', ['Course Code', 'Title', 'L', 'P'])).toMatchObject({ code: 0, name: 1, lecture_hours: 2, lab_hours: 3 })
  })

  test('reports row-level errors for bad values, duplicates and missing references', () => {
    const sheets = sampleSheets()
    const rooms = sheets.find((s) => s.table === 'rooms')
    rooms.rows[2] = ['A-102', 'forty', 'gym', 'CSE', '', 'maybe']
    rooms.rows[3] = ['A-101', '70', 'classroom', 'XYZ', '', 'no']
    const assignments = sheets.find((s) => s.table === 'assignments')
    assignments.rows[1] = ['CSE-3A', 'CS999', 'Dr. Nobody', '']
    const teachers = sheets.find((s) => s.table === 'teachers')
    teachers.rows[1][4] = 'Sun-1;Mon-9;lunch'
    const result = buildImport(sheets, emptyCollege())
    expect(result.ok).toBe(false)
    const says = (line, field, re) =>
      expect(errors(result).some((i) => i.line === line && i.field === field && re.test(i.message)), `${line} ${field} ${re}`).toBe(true)
    says(3, 'capacity', /"forty" is not a whole number/)
    says(3, 'type', /"gym" isn't a room type/)
    says(3, 'events_only', /should be yes or no/)
    says(4, 'name', /appears twice \(also on row 2\)/)
    says(2, 'subject', /Subject "CS999" isn't in the subjects table/)
    says(2, 'teacher', /Teacher "Dr. Nobody" isn't in the teachers table/)
    says(2, 'unavailable', /"Sun-1": Sun isn't one of the working days/)
    says(2, 'unavailable', /"Mon-9": the day has periods 1 to 7/)
    says(2, 'unavailable', /"lunch" isn't a slot/)
    expect(errors(result).every((i) => i.source && i.table)).toBe(true)
  })

  test('a missing required column or table is reported, not skipped', () => {
    const sheets = sampleSheets().filter((s) => s.table !== 'assignments')
    sheets.find((s) => s.table === 'rooms').mapping.capacity = -1
    const msgs = errors(buildImport(sheets, emptyCollege())).map((i) => i.message).join(' ')
    expect(msgs).toMatch(/No column is chosen for "capacity"/)
    expect(msgs).toMatch(/An? assignments table is needed/)
  })

  test('adding never overwrites: existing records are errors, the current setup is kept', () => {
    const current = demoCollege()
    const sheets = sampleSheets()
    const result = buildImport(sheets, current, { mode: 'add' })
    expect(result.mode).toBe('add')
    // The demo college already has a Seminar Hall and the same subject codes.
    expect(errors(result).some((i) => i.line === 11 && /"Seminar Hall" is already in your current setup/.test(i.message))).toBe(true)
    expect(errors(result).some((i) => /"CS201" is already in your current setup/.test(i.message))).toBe(true)
    expect(result.issues.some((i) => i.table === 'Time structure' && /Not applied/.test(i.message))).toBe(true)
    expect(result.data.rooms.filter((r) => r.name === 'Seminar Hall')).toHaveLength(1)
    expect(result.data.time).toEqual(current.time)
  })

  test('replacing swaps the setup but keeps ids of records with the same name', () => {
    const current = buildImport(sampleSheets(), emptyCollege()).data
    const lab = current.rooms.find((r) => r.name === 'Computer Lab 1')
    const result = buildImport(sampleSheets(), current, { mode: 'replace' })
    expect(errors(result)).toEqual([])
    expect(result.data.rooms).toHaveLength(10)
    expect(result.data.rooms.find((r) => r.name === 'Computer Lab 1').id).toBe(lab.id)
  })

  test('without a departments table, departments are created from the codes (with a warning)', () => {
    const result = buildImport(sampleSheets().filter((s) => s.table !== 'departments'), emptyCollege())
    expect(errors(result)).toEqual([])
    expect(result.data.departments.map((d) => d.short).sort()).toEqual(['AS', 'CSE', 'ECE'])
    expect(result.issues.some((i) => /created from the codes used/.test(i.message))).toBe(true)
  })
})

test('a row with its own error does not cause misleading errors in rows that refer to it', () => {
  const sheets = sampleSheets()
  const teachers = sheets.find((s) => s.table === 'teachers')
  teachers.rows[1][2] = '' // Dr. Asha Mehta: max_hours missing
  const found = errors(buildImport(sheets, emptyCollege()))
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ line: 2, field: 'max_hours' })
})
