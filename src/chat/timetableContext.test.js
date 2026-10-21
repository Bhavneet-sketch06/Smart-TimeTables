import { test, expect } from 'vitest'
import { gndecCse } from '../data/gndecCse.js'
import { generateTimetable } from '../scheduler.js'
import { buildTimetableContext } from './timetableContext.js'

test('context lists every class with time, teacher and room, and is deterministic', () => {
  const data = gndecCse()
  data.timetable = generateTimetable(data, { seed: 3 })
  const text = buildTimetableContext(data)

  expect(text).toContain('College: GNDEC Ludhiana')
  expect(text).toContain('Break: 12:30 - 13:30')
  expect(text).toContain('## D3 CS F')
  // One "|"-separated item per entry across all sections.
  const items = text
    .split('\n')
    .filter((l) => /^(Mon|Tue|Wed|Thu|Fri): /.test(l) && !l.endsWith('no classes'))
    .flatMap((l) => l.split(' | '))
  expect(items).toHaveLength(data.timetable.entries.length)
  // Same input, same text: required for prompt caching.
  expect(buildTimetableContext(data)).toBe(text)
})

test('context says when no timetable has been generated', () => {
  expect(buildTimetableContext(gndecCse())).toContain('TIMETABLE: not generated yet')
})
