import { describe, test, expect } from 'vitest'
import { demoCollege } from './data/demoCollege.js'
import { gndecCollege } from './data/gndecCollege.js'
import {
  batchesOf,
  departmentStatus,
  entriesOf,
  normalizeCollege,
  sectionsOf,
  teachersOf,
} from './data/departments.js'
import { findClashes, generateCollege, generateTimetable, precheck } from './scheduler.js'

const college = () => normalizeCollege(gndecCollege())
const deptOfSection = (data) => new Map(data.sections.map((s) => [s.id, s.deptId]))

describe('department data', () => {
  test('older data without departments is upgraded from the sections’ department labels', () => {
    const data = normalizeCollege(demoCollege())
    expect(data.departments.map((d) => d.short)).toEqual(['CSE', 'ECE', 'ME'])
    expect(data.sections.every((s) => s.deptId)).toBe(true)
    expect(data.teachers.find((t) => t.id === 't1').deptId).toBe('cse')
    expect(data.teachers.find((t) => t.id === 't10').deptId).toBeNull() // Mathematics: no sections of its own
    expect(normalizeCollege(data)).toEqual(data) // idempotent
  })

  test('the GNDEC demo keeps the real CSE data and adds distinct sample departments', () => {
    const data = college()
    expect(data.departments.map((d) => d.short)).toEqual(['CSE', 'ECE', 'ME', 'Civil', 'EE'])
    expect(sectionsOf(data, 'cse')).toHaveLength(12)
    expect(sectionsOf(data, 'cse')[0]).toMatchObject({ name: 'D2 CS A', batch: '3rd Sem (D2)' })
    for (const id of ['ece', 'me', 'civil']) expect(sectionsOf(data, id)).toHaveLength(4)
    expect(batchesOf(data, 'ece')).toEqual(['3rd Sem (D2)', '5th Sem (D3)'])
    // Departments have different teachers, apart from shared service-department staff.
    const ece = new Set(teachersOf(data, 'ece').map((t) => t.id))
    const me = new Set(teachersOf(data, 'me').map((t) => t.id))
    expect([...ece].filter((id) => me.has(id)).sort()).toEqual(['s-env', 's-hum', 's-math1'])
  })

  test('a department with no sections reports that it needs setting up', () => {
    const data = college()
    expect(departmentStatus(data, 'ee')).toMatchObject({ sections: 0, ready: false, generated: false })
    expect(precheck(data, { departmentId: 'ee' }).problems).toEqual(['Add at least one section with subjects to this department.'])
  })
})

describe('scheduling several departments', () => {
  test('whole-college generation places every class with no clashes, sharing rooms and teachers', () => {
    const data = college()
    const r = generateCollege(data, { seed: 2 })
    expect(r.ok).toBe(true)
    expect(Object.keys(r.byDept).sort()).toEqual(['civil', 'cse', 'ece', 'me'])
    for (const d of Object.values(r.byDept)) expect(d.stats.placed).toBe(d.stats.total)
    expect(findClashes(r.entries, data)).toEqual([])

    const dept = deptOfSection(data)
    const theatreUsers = new Set(r.entries.filter((e) => e.roomId.startsWith('lt')).map((e) => dept.get(e.sectionId)))
    expect(theatreUsers.size).toBeGreaterThan(1) // shared rooms really are shared
    const mathUsers = new Set(r.entries.filter((e) => e.teacherId === 's-math1').map((e) => dept.get(e.sectionId)))
    expect([...mathUsers].sort()).toEqual(['ece', 'me']) // one teacher, two departments, no clash
    expect(r.stats.quality).toBeGreaterThanOrEqual(70)
  })

  test('one department is scheduled around the rooms and teachers other departments already use', () => {
    const data = college()
    const e101 = data.rooms.find((r) => r.id === 'e101')
    // Another department has E-101 all week (spread over several of its teachers), and the shared maths
    // teacher for the first two periods of every day.
    const fixed = []
    data.time.days.forEach((_, day) => {
      for (let period = 0; period < data.time.periodsPerDay; period++) {
        const teacherId = ['m1', 'm2', 'm3', 'm4', 'm5'][day]
        fixed.push({ sectionId: 'me-d2-a', subjectId: 'me-td', teacherId, roomId: e101.id, day, period, length: 1, kind: 'lecture' })
      }
      for (let period = 0; period < 2; period++) {
        fixed.push({ sectionId: 'me-d2-b', subjectId: 'ma3', teacherId: 's-math1', roomId: 'm101', day, period, length: 1, kind: 'lecture' })
      }
    })
    const r = generateTimetable(data, { seed: 3, departmentId: 'ece', fixedEntries: fixed })
    expect(r.reason).toBe('')
    expect(r.ok).toBe(true)
    expect(r.entries.every((e) => data.sections.find((s) => s.id === e.sectionId).deptId === 'ece')).toBe(true)
    expect(r.entries.some((e) => e.roomId === 'e101')).toBe(false)
    expect(r.entries.filter((e) => e.teacherId === 's-math1').every((e) => e.period >= 2)).toBe(true)
    expect(r.stats.clashes).toBe(0)
  })

  test("a shared teacher's load counts classes in other departments", () => {
    const data = college()
    data.teachers.find((t) => t.id === 's-math1').maxHours = 10
    const ece = generateTimetable(data, { seed: 1, departmentId: 'ece' })
    expect(ece.ok).toBe(true) // 8 hours in ECE alone is fine
    const problems = precheck(data, { departmentId: 'me', fixedEntries: ece.entries }).problems.join(' ')
    expect(problems).toMatch(/Dr\. Neha Malhotra is assigned 16 hours a week, more than their maximum of 10/)
  })

  test('entriesOf scopes the timetable to a department', () => {
    const data = college()
    data.timetable = generateCollege(data, { seed: 5 })
    const civil = entriesOf(data, 'civil')
    expect(civil.length).toBe(data.timetable.byDept.civil.stats.total)
    expect(entriesOf(data, 'all')).toHaveLength(data.timetable.entries.length)
  })
})
