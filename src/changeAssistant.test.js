// The change assistant's checks and effects, with the AI's answer written by hand: nothing here calls Claude.
import { describe, expect, test } from 'vitest'
import { gndecCollege } from './data/gndecCollege.js'
import { entriesOf, normalizeCollege } from './data/departments.js'
import { findClashes, generateCollege } from './scheduler.js'
import { checkRoom } from './booking.js'
import {
  announcementFacts,
  applyChanges,
  buildCatalog,
  diffMoves,
  moveLines,
  resolveProposal,
  slotsText,
  updateTimetable,
} from './changeAssistant.js'

const STEADY = { timeLimitMs: 60_000 }
function published() {
  const data = normalizeCollege(gndecCollege())
  return { ...data, timetable: { ...generateCollege(data, { seed: 1, ...STEADY }), generatedAt: '2026-10-26T09:00:00Z' } }
}
const kapil = (data) => data.teachers.find((t) => t.name === 'Dr. Kapil Sharma')
const wholeDay = (data, day) => Array.from({ length: data.time.periodsPerDay }, (_, i) => ({ day, period: i + 1 }))

describe('what Claude is told', () => {
  test('the catalogue lists every teacher and room with its id, and is the same text every time', () => {
    const data = published()
    const text = buildCatalog(data)
    expect(text).toContain(`${kapil(data).id} | Dr. Kapil Sharma | CSE`)
    for (const r of data.rooms) expect(text).toContain(`${r.id} | ${r.name}`)
    expect(text).toContain('Periods: P1 08:30-09:30')
    expect(buildCatalog(data)).toBe(text) // stable, so the server can cache it
    expect(text).not.toMatch(/students/i)
  })
})

describe('checking a proposal', () => {
  test('valid changes get plain-language labels; anything not in the college is left out', () => {
    const data = published()
    const lab = data.rooms.find((r) => r.type === 'lab')
    const { items, question } = resolveProposal(data, {
      kind: 'changes',
      question: '',
      summary: 'Leave and a closed lab',
      changes: [
        { type: 'teacher_unavailable', teacherId: kapil(data).id, roomId: '', reason: 'Leave', slots: wholeDay(data, 'Wed') },
        { type: 'block_slots', teacherId: '', roomId: '', reason: 'Convocation', slots: [{ day: 'Fri', period: 1 }, { day: 'Fri', period: 2 }] },
        { type: 'room_out_of_service', teacherId: '', roomId: lab.id, reason: 'Maintenance', slots: [] },
        { type: 'teacher_unavailable', teacherId: 'made-up-id', roomId: '', reason: '', slots: [{ day: 'Mon', period: 1 }] },
        { type: 'block_slots', teacherId: '', roomId: '', reason: '', slots: [{ day: 'Sun', period: 1 }, { day: 'Mon', period: 99 }] },
        { type: 'delete_everything', teacherId: '', roomId: '', reason: '', slots: [] },
      ],
    })
    expect(question).toBe('')
    expect(items.map((i) => i.ok)).toEqual([true, true, true, false, false, false])
    expect(items[0].label).toBe('Dr. Kapil Sharma unavailable: Wed all day (Leave)')
    expect(items[1].label).toBe('No classes for anyone: Fri P1–P2 (Convocation)')
    expect(items[2].label).toBe(`${lab.name} out of service (Maintenance)`)
  })

  test('a question from Claude is passed on, with no changes', () => {
    const data = published()
    const r = resolveProposal(data, { kind: 'question', question: 'Which Sharma: Kapil or Diksha?', summary: '', changes: [] })
    expect(r).toMatchObject({ question: 'Which Sharma: Kapil or Diksha?', items: [] })
  })

  test('slots are shown compactly', () => {
    const data = published()
    expect(slotsText(data, [{ day: 'Mon', period: 3 }, { day: 'Mon', period: 5 }, { day: 'Mon', period: 6 }, { day: 'Tue', period: 1 }])).toBe('Mon P3, P5–P6; Tue P1')
  })
})

describe('applying changes', () => {
  test('only the touched setup lists change', () => {
    const data = published()
    const { items } = resolveProposal(data, {
      kind: 'changes',
      changes: [{ type: 'teacher_unavailable', teacherId: kapil(data).id, roomId: '', reason: '', slots: [{ day: 'Wed', period: 2 }] }],
    })
    const patch = applyChanges(data, items)
    expect(Object.keys(patch)).toEqual(['teachers'])
    expect(patch.teachers.find((t) => t.id === kapil(data).id).unavailable).toContain('Wed-2')
  })

  test('a room out of service takes no classes and no bookings', () => {
    const data = published()
    const lab = data.rooms.find((r) => r.type === 'lab')
    const { items } = resolveProposal(data, { kind: 'changes', changes: [{ type: 'room_out_of_service', roomId: lab.id, teacherId: '', reason: '', slots: [] }] })
    const after = { ...data, ...applyChanges(data, items) }
    const closed = after.rooms.find((r) => r.id === lab.id)
    expect(checkRoom(after, [], closed, { date: '2026-11-07', start: '18:00', duration: 30, attendance: 1, facilities: [] }).reasons[0].text).toBe('Out of service')
    const result = generateCollege(after, { seed: 1, keep: data.timetable.entries, ...STEADY })
    expect(result.entries.filter((e) => e.roomId === lab.id)).toHaveLength(0)
    expect(findClashes(result.entries, after)).toHaveLength(0)
  })
})

describe('updating the timetable after a change', () => {
  test("a teacher's day of leave: only their classes that day move, and each moved class says where it was", () => {
    const data = published()
    const wed = data.time.days.indexOf('Wed')
    const theirs = data.timetable.entries.filter((e) => e.teacherId === kapil(data).id && e.day === wed)
    expect(theirs.length).toBeGreaterThan(0)
    const { items } = resolveProposal(data, {
      kind: 'changes',
      changes: [{ type: 'teacher_unavailable', teacherId: kapil(data).id, roomId: '', reason: 'Leave', slots: wholeDay(data, 'Wed') }],
    })
    const run = updateTimetable(data, items, { seed: 1, ...STEADY })

    expect(run.ok).toBe(true)
    expect(run.moved).toBe(theirs.length)
    expect(run.timetable.entries.filter((e) => e.movedFrom)).toHaveLength(theirs.length)
    expect(run.timetable.entries.filter((e) => e.teacherId === kapil(data).id && e.day === wed)).toHaveLength(0)
    expect(findClashes(run.timetable.entries, { ...data, ...run.patch })).toHaveLength(0)
    expect(entriesOf({ ...data, timetable: run.timetable }, 'cse')).toHaveLength(entriesOf(data, 'cse').length)

    const lines = moveLines(data, run.timetable.entries)
    expect(lines).toHaveLength(theirs.length)
    expect(lines[0].was).toMatch(/^Wed \d\d:\d\d–\d\d:\d\d in /)
    const facts = announcementFacts(data, items, run.timetable.entries)
    expect(facts).toContain('Dr. Kapil Sharma unavailable: Wed all day (Leave)')
    expect(facts).toContain(`RESULT: ${theirs.length} of ${data.timetable.entries.length} classes moved`)
  })

  test('a change that cannot fit returns the reason and nothing to save', () => {
    const data = published()
    const all = data.time.days.flatMap((d) => wholeDay(data, d))
    const { items } = resolveProposal(data, { kind: 'changes', changes: [{ type: 'teacher_unavailable', teacherId: kapil(data).id, roomId: '', reason: '', slots: all }] })
    const run = updateTimetable(data, items, { seed: 1, ...STEADY })
    expect(run.ok).toBe(false)
    expect(run.timetable).toBeNull()
    expect(run.result.problems.join(' ')).toContain('Kapil Sharma')
  })

  test('identical classes that swap places are not counted as moves', () => {
    const a = { sectionId: 's', subjectId: 'm', kind: 'lecture', teacherId: 't', length: 1, roomId: 'r', day: 0, period: 0 }
    const b = { ...a, day: 1 }
    expect(diffMoves([a, b], [b, a])).toHaveLength(0)
    expect(diffMoves([a, b], [b, { ...a, day: 2 }])).toEqual([{ entry: { ...a, day: 2 }, from: { day: 0, period: 0, roomId: 'r' } }])
  })
})
