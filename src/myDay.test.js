import { describe, expect, test } from 'vitest'
import { planDay, untilText } from './myDay.js'

// 08:30 start, 60-minute periods, break after P4 (12:30 - 13:30); P5 starts 13:30.
const data = {
  time: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], periodsPerDay: 7, breakAfter: 4, startTime: '08:30', periodMinutes: 60, breakMinutes: 60 },
}
const entries = [
  { subjectId: 'math', day: 0, period: 1, length: 1, kind: 'lecture' }, // Mon 09:30 - 10:30
  { subjectId: 'phy', day: 0, period: 0, length: 1, kind: 'lecture' }, // Mon 08:30 - 09:30
  { subjectId: 'lab', day: 0, period: 4, length: 2, kind: 'lab', group: 'A2' }, // Mon 13:30 - 15:30
  { subjectId: 'lab2', day: 0, period: 4, length: 2, kind: 'lab', group: 'A1' },
  { subjectId: 'chem', day: 2, period: 2, length: 1, kind: 'lecture' }, // Wed 10:30
]
// 2026-10-26 is a Monday.
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00`)

describe('My Day', () => {
  test('lists today in time order with clock times', () => {
    const plan = planDay(data, entries, at('2026-10-26', '07:00'))
    expect(plan.state).toBe('active')
    expect(plan.classes.map((c) => `${c.start}-${c.end} ${c.entry.subjectId}`)).toEqual([
      '08:30-09:30 phy',
      '09:30-10:30 math',
      '13:30-15:30 lab2',
      '13:30-15:30 lab',
    ])
    expect(plan.highlight.map((c) => c.entry.subjectId)).toEqual(['phy'])
    expect(plan.highlight[0].status).toBe('next')
  })

  test('a class in progress is highlighted instead of the next one', () => {
    const plan = planDay(data, entries, at('2026-10-26', '09:45'))
    expect(plan.highlight.map((c) => c.entry.subjectId)).toEqual(['math'])
    expect(plan.highlight[0].status).toBe('now')
    expect(plan.classes[0].status).toBe('done')
  })

  test('side-by-side lab groups are highlighted together, and the break is noticed', () => {
    const plan = planDay(data, entries, at('2026-10-26', '12:45'))
    expect(plan.onBreak).toBe(true)
    expect(plan.highlight.map((c) => c.entry.group)).toEqual(['A1', 'A2'])
  })

  test('after the last class the day is finished, with the next class to come', () => {
    const plan = planDay(data, entries, at('2026-10-26', '16:00'))
    expect(plan.state).toBe('finished')
    expect(plan.highlight).toEqual([])
    expect(plan.upcoming).toMatchObject({ dayName: 'Wed', inDays: 2, first: { start: '10:30' } })
  })

  test('a configured day without classes is free; a weekend is off', () => {
    expect(planDay(data, entries, at('2026-10-27', '10:00')).state).toBe('free') // Tuesday
    const sunday = planDay(data, entries, at('2026-10-25', '10:00'))
    expect(sunday.state).toBe('off')
    expect(sunday.teachingDay).toBe(false)
    expect(sunday.upcoming).toMatchObject({ dayName: 'Mon', inDays: 1 })
  })

  test('formats waiting times', () => {
    expect(untilText(600, 605)).toBe('5 min')
    expect(untilText(600, 680)).toBe('1 h 20 min')
    expect(untilText(600, 720)).toBe('2 h')
  })
})
