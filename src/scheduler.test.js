import { describe, test, expect } from 'vitest'
import { demoCollege } from './data/demoCollege.js'
import { precheck, generateTimetable, findClashes, scoreQuality } from './scheduler.js'

describe('scheduler on demo college', () => {
  test('pre-check passes', () => {
    expect(precheck(demoCollege())).toEqual({ ok: true, problems: [] })
  })

  test.each([1, 2, 3, 42, 2024])('generates a complete, clash-free timetable (seed %i)', (seed) => {
    const data = demoCollege()
    const result = generateTimetable(data, { seed })

    expect(result.reason).toBe('')
    expect(result.ok).toBe(true)
    expect(result.stats.placed).toBe(result.stats.total)
    expect(result.unplaced).toEqual([])
    expect(findClashes(result.entries, data)).toEqual([])
    expect(result.stats.clashes).toBe(0)

    // Every section gets exactly the hours it asked for.
    for (const sec of data.sections) {
      const needed = sec.assignments.reduce((n, a) => {
        const sub = data.subjects.find((s) => s.id === a.subjectId)
        return n + sub.lectureHours + sub.labHours
      }, 0)
      const got = result.entries.filter((e) => e.sectionId === sec.id).reduce((n, e) => n + e.length, 0)
      expect(got).toBe(needed)
    }

    // Labs are single consecutive blocks in lab rooms.
    for (const e of result.entries.filter((x) => x.kind === 'lab')) {
      expect(data.rooms.find((r) => r.id === e.roomId).type).toBe('lab')
      expect(e.length).toBe(2)
    }
  })

  test('quality score is high on demo data', () => {
    const data = demoCollege()
    const { entries } = generateTimetable(data, { seed: 7 })
    expect(scoreQuality(entries, data).score).toBeGreaterThanOrEqual(70)
  })
})

describe('pre-check and failure reasons', () => {
  test('flags a teacher over their maximum hours', () => {
    const data = demoCollege()
    data.teachers.find((t) => t.id === 't12').maxHours = 4
    const { ok, problems } = precheck(data)
    expect(ok).toBe(false)
    expect(problems.join(' ')).toMatch(/Ms\. Sara Thomas is assigned 12 hours/)
  })

  test('flags missing lab rooms', () => {
    const data = demoCollege()
    data.rooms = data.rooms.filter((r) => r.type !== 'lab')
    const result = generateTimetable(data, { seed: 1 })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no lab room is big enough/)
  })

  test('flags a lab longer than any break-free stretch', () => {
    const data = demoCollege()
    data.subjects.find((s) => s.id === 'ds').labHours = 5
    expect(precheck(data).problems.join(' ')).toMatch(/longest stretch without a break is 4/)
  })

  test('flags too few lab blocks around the break', () => {
    // 12 two-period labs, 1 lab room, 4 days x (3 + 3 periods) = only 8 lab blocks a week.
    const data = demoCollege()
    data.rooms = data.rooms.filter((r) => r.id !== 'lab2')
    data.time.days = ['Mon', 'Tue', 'Wed', 'Thu']
    data.time.periodsPerDay = 6
    data.time.breakAfter = 3
    data.teachers.forEach((t) => (t.unavailable = []))
    expect(precheck(data).problems.join(' ')).toMatch(/12 2-period lab sessions .* only hold 8 per week/)
  })

  test('explains a search failure in plain language', () => {
    // Every section grows to 100 students: only the seminar hall fits them, which the
    // pre-check (counting rooms by type) can't see, so the search itself must fail.
    const data = demoCollege()
    data.sections.forEach((s) => (s.students = 100))
    data.rooms.forEach((r) => r.type === 'lab' && (r.capacity = 100))
    expect(precheck(data).ok).toBe(true)
    const result = generateTimetable(data, { seed: 1, timeLimitMs: 500 })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/^Couldn't place .+ Try adding/)
  })

  test('findClashes detects a double-booked teacher', () => {
    const data = demoCollege()
    const entries = [
      { sectionId: 'cse-a', subjectId: 'os', teacherId: 't3', roomId: 'r101', day: 0, period: 0, length: 1, kind: 'lecture' },
      { sectionId: 'cse-b', subjectId: 'os', teacherId: 't3', roomId: 'r102', day: 0, period: 0, length: 1, kind: 'lecture' },
    ]
    const clashes = findClashes(entries, data)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].type).toBe('teacher')
  })
})
