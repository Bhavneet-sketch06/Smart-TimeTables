// Room requirements and teaching rules: custom room types, required facilities, double periods, tutorials and
// daily limits, checked end to end through the generator and the clash verifier.
import { describe, expect, test } from 'vitest'
import { demoCollege } from './data/demoCollege.js'
import { findClashes, generateTimetable, lectureBlocksOf, precheck } from './scheduler.js'
import { diagnose } from './diagnose.js'

const generate = (data, seed = 2) => {
  const r = generateTimetable(data, { seed })
  expect(r.reason).toBe('')
  expect(r.ok).toBe(true)
  expect(findClashes(r.entries, data)).toEqual([])
  return r.entries
}

describe('room requirements', () => {
  test('a subject that needs a room type or facilities only uses matching rooms', () => {
    const data = demoCollege()
    data.roomTypes = [
      { id: 'classroom', name: 'Classroom', kind: 'lecture' },
      { id: 'computer-lab', name: 'Computer lab', kind: 'lab' },
      { id: 'lab', name: 'Lab', kind: 'lab' },
      { id: 'seminar', name: 'Seminar hall', kind: 'lecture' },
    ]
    data.rooms.find((r) => r.id === 'lab1').type = 'computer-lab'
    data.subjects.find((s) => s.id === 'ds').labRoomType = 'computer-lab'
    data.subjects.find((s) => s.id === 'dbms').labNeeds = ['computers']
    data.subjects.find((s) => s.id === 'pc').lectureNeeds = ['Projector']
    const entries = generate(data)
    const rooms = (subjectId, kind) => new Set(entries.filter((e) => e.subjectId === subjectId && e.kind === kind).map((e) => e.roomId))
    expect([...rooms('ds', 'lab')]).toEqual(['lab1'])
    expect([...rooms('dbms', 'lab')]).toEqual(['lab1'])
    // Labs without a requirement may use any lab, including the computer lab.
    for (const id of rooms('pc', 'lecture')) expect(data.rooms.find((r) => r.id === id).facilities).toContain('Projector')
  })

  test('an impossible requirement is reported with a fix', () => {
    const data = demoCollege()
    data.subjects.find((s) => s.id === 'fm').labNeeds = ['Flow bench']
    const issue = precheck(data).issues.find((i) => i.kind === 'room-requirement')
    expect(issue.message).toMatch(/Fluid Mechanics labs need a lab with Flow bench, but no room matches/)
    const [d] = diagnose(data, { ok: false, issues: precheck(data).issues })
    expect(d.title).toMatch(/No room matches what Fluid Mechanics labs need/)
    expect(d.remedies.find((r) => r.id.startsWith('facilities-')).checked).toBe('passes-precheck')
  })
})

describe('teaching rules', () => {
  test('lecture hours split into double periods that never cross a break', () => {
    expect(lectureBlocksOf({ lectureHours: 5, lectureBlock: 2 })).toEqual([2, 2, 1])
    const data = demoCollege()
    data.subjects.find((s) => s.id === 'os').lectureBlock = 2
    const entries = generate(data)
    const os = entries.filter((e) => e.subjectId === 'os' && e.sectionId === 'cse-a')
    expect(os.map((e) => e.length).sort()).toEqual([1, 2])
    for (const e of os) if (e.period < 4) expect(e.period + e.length).toBeLessThanOrEqual(4)
  })

  test('tutorials run per lab group in classrooms', () => {
    const data = demoCollege()
    const cse = data.sections.find((s) => s.id === 'cse-a')
    cse.labGroups = 2
    cse.groupNames = ['A1', 'A2']
    data.subjects.find((s) => s.id === 'dm').tutorialHours = 1
    const entries = generate(data)
    const tuts = entries.filter((e) => e.kind === 'tutorial' && e.sectionId === 'cse-a')
    expect(tuts.map((e) => e.group).sort()).toEqual(['A1', 'A2'])
    for (const e of tuts) expect(['classroom', 'seminar']).toContain(data.rooms.find((r) => r.id === e.roomId).type)
    // CSE-B has no lab groups, so it gets one tutorial for the whole section.
    expect(entries.filter((e) => e.kind === 'tutorial' && e.sectionId === 'cse-b')).toHaveLength(1)
  })

  test('daily limits for teachers and sections are respected', () => {
    const data = demoCollege()
    data.teachers.find((t) => t.id === 't10').maxPerDay = 2
    data.sections.find((s) => s.id === 'ece-a').maxPerDay = 5
    const entries = generate(data)
    const perDay = (filter) => {
      const days = new Map()
      for (const e of entries.filter(filter)) days.set(e.day, (days.get(e.day) || 0) + e.length)
      return Math.max(...days.values())
    }
    expect(perDay((e) => e.teacherId === 't10')).toBeLessThanOrEqual(2)
    expect(perDay((e) => e.sectionId === 'ece-a')).toBeLessThanOrEqual(5)
  })

  test('a daily limit that cannot fit the week is reported before generating', () => {
    const data = demoCollege()
    data.teachers.find((t) => t.id === 't10').maxPerDay = 1
    const { problems, issues } = precheck(data)
    expect(problems.join(' ')).toMatch(/Dr. Priya Kapoor is assigned 9 periods a week, but at most 1 a day over 5 days allows only 5/)
    const d = diagnose(data, { ok: false, issues }).find((x) => x.id.startsWith('teacher-daily'))
    expect(d.remedies[0].text).toMatch(/from 1 to 2/)
  })
})
