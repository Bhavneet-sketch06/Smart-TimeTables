import { describe, expect, test } from 'vitest'
import { demoCollege } from './data/demoCollege.js'
import { generateTimetable, precheck } from './scheduler.js'
import { applyChange, diagnose, testChange } from './diagnose.js'

describe('failure guidance', () => {
  test('a successful run needs no guidance', () => {
    const data = demoCollege()
    expect(diagnose(data, generateTimetable(data, { seed: 1 }))).toEqual([])
  })

  test('explains an over-loaded teacher and checks the suggested fixes', () => {
    const data = demoCollege()
    data.teachers.find((t) => t.id === 't12').maxHours = 4
    const [d] = diagnose(data, generateTimetable(data, { seed: 1 }))
    expect(d.certainty).toBe('confirmed')
    expect(d.title).toMatch(/Ms\. Sara Thomas has more hours than their maximum/)
    expect(d.facts.join(' ')).toMatch(/8 periods over/)
    const raise = d.remedies.find((r) => r.id === 'max-t12')
    expect(raise.text).toMatch(/from 4 to 12/)
    expect(raise.checked).toBe('passes-precheck')
  })

  test('lists the most fundamental problem first', () => {
    const data = demoCollege()
    data.teachers.find((t) => t.id === 't12').maxHours = 4
    data.rooms = data.rooms.filter((r) => r.type !== 'lab')
    const items = diagnose(data, generateTimetable(data, { seed: 1 }))
    expect(items[0].title).toMatch(/There are no labs for regular classes/)
    expect(items.at(-1).title).toMatch(/Sara Thomas/)
    // Adding a lab clears that problem; the teacher's maximum is still wrong, so it can't pass the whole pre-check.
    expect(items[0].remedies.find((r) => r.change?.type === 'addRoom').checked).toBe('clears-check')
  })

  test('suggests more lab rooms or a different break when lab blocks run out', () => {
    const data = demoCollege()
    data.rooms = data.rooms.filter((r) => r.id !== 'lab2')
    data.time.days = ['Mon', 'Tue', 'Wed', 'Thu']
    data.time.periodsPerDay = 6
    data.time.breakAfter = 3
    data.teachers.forEach((t) => (t.unavailable = []))
    const d = diagnose(data, generateTimetable(data, { seed: 1 })).find((x) => x.title.match(/2-period lab slots/))
    expect(d.facts[0]).toMatch(/12 lab sessions of 2 periods .* = 8/)
    const addLabs = d.remedies.find((r) => r.change?.type === 'addRoom' || r.change?.type === 'many')
    expect(addLabs.checked).not.toBeNull()
    expect(d.remedies.some((r) => r.id.startsWith('break-'))).toBe(true)
  })

  test('explains a search failure without claiming certainty, and can test a suggestion', () => {
    const data = demoCollege()
    data.sections.forEach((s) => (s.students = 100))
    data.rooms.forEach((r) => r.type === 'lab' && (r.capacity = 100))
    data.rooms.find((r) => r.id === 'sh1').eventsOnly = false
    const run = generateTimetable(data, { seed: 1, timeLimitMs: 500 })
    expect(run.ok).toBe(false)
    const [d] = diagnose(data, run)
    expect(['likely', 'unknown']).toContain(d.certainty)
    expect(d.cause).toMatch(/possible start times/)
    const withChange = d.remedies.find((r) => r.change)
    expect(withChange).toBeTruthy()
    const result = testChange(data, withChange.change, { timeLimitMs: 300 })
    expect(result).toHaveProperty('ok')
    expect(result.total).toBeGreaterThan(0)
  })

  test('applyChange never edits the original data', () => {
    const data = demoCollege()
    const before = JSON.stringify(data)
    const changed = applyChange(data, { type: 'time', patch: { periodsPerDay: 9 } })
    expect(changed.time.periodsPerDay).toBe(9)
    expect(JSON.stringify(data)).toBe(before)
    expect(precheck(changed).ok).toBe(true)
  })
})
