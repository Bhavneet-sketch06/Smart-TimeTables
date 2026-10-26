// Sudden changes after a timetable is published: the administrator records the change and regenerates. The new
// timetable must respect the change, place every class, clash nowhere, and move ONLY the classes the change
// affects (everyone else keeps their week). Test-case IDs S-01 to S-04 match the "Smart TimeTables – Test Cases"
// document.
import { describe, expect, test } from 'vitest'
import { gndecCollege } from './data/gndecCollege.js'
import { entriesOf, fixedFor, mergeDepartmentTimetable, normalizeCollege } from './data/departments.js'
import { findClashes, generateCollege, generateTimetable, precheck } from './scheduler.js'
import { slotKey } from './data/schema.js'

const CSE = 'cse'
// Results depend on the seed, not on how busy the computer is (the app's default budget is 4 s per department).
const STEADY = { timeLimitMs: 60_000 }

/** The published timetable everyone starts from. */
function published() {
  const data = normalizeCollege(gndecCollege())
  return { ...data, timetable: { ...generateCollege(data, { seed: 1, ...STEADY }), generatedAt: '2026-10-26T09:00:00Z' } }
}

/**
 * What the Generate button does for one department after a change: schedule it around every other department's
 * classes, keeping its own previous classes wherever they still fit.
 */
function regenerate(data, deptId) {
  const started = Date.now()
  const fixed = fixedFor(data, deptId)
  const check = precheck(data, { departmentId: deptId, fixedEntries: fixed })
  if (!check.ok) return { ok: false, check, ms: Date.now() - started }
  const result = generateTimetable(data, { departmentId: deptId, fixedEntries: fixed, keep: entriesOf(data, deptId), seed: 1, ...STEADY })
  const timetable = mergeDepartmentTimetable(data, deptId, fixed, result)
  return { ok: result.ok, result, timetable, ms: Date.now() - started }
}

/** Every class of the department placed, nothing clashes anywhere in the college. */
function expectComplete(data, run, deptId) {
  expect(run.ok, run.result?.reason ?? run.check?.problems?.join(' ')).toBe(true)
  expect(run.result.unplaced ?? []).toHaveLength(0)
  expect(findClashes(run.timetable.entries, data)).toHaveLength(0)
  expect(entriesOf({ ...data, timetable: run.timetable }, deptId).length).toBe(entriesOf(data, deptId).length)
}

/** Classes of the new timetable that are exactly where they were before (same day, period and room). */
function unchanged(before, after) {
  const key = (e) => [e.sectionId, e.subjectId, e.kind, e.groupIndex ?? '', e.teacherId, e.day, e.period, e.roomId].join('|')
  const old = new Set(before.map(key))
  return after.filter((e) => old.has(key(e))).length
}

const dayIndex = (data, day) => data.time.days.indexOf(day)
const covers = (e, d, p) => e.day === d && e.period <= p && p < e.period + e.length

describe('Sudden changes are absorbed by regenerating', () => {
  test('S-01 A busy teacher goes on leave for a whole day: their classes move, nothing clashes', () => {
    const before = published()
    const wed = dayIndex(before, 'Wed')
    // The CSE teacher with the most Wednesday classes.
    const load = new Map()
    for (const e of entriesOf(before, CSE)) if (e.day === wed) load.set(e.teacherId, (load.get(e.teacherId) ?? 0) + e.length)
    const [teacherId, wedPeriods] = [...load].sort((a, b) => b[1] - a[1])[0]
    expect(wedPeriods).toBeGreaterThan(0)

    const leave = Array.from({ length: before.time.periodsPerDay }, (_, p) => slotKey('Wed', p))
    const after = { ...before, teachers: before.teachers.map((t) => (t.id === teacherId ? { ...t, unavailable: [...t.unavailable, ...leave] } : t)) }
    const run = regenerate(after, CSE)

    expectComplete(after, run, CSE)
    expect(run.timetable.entries.filter((e) => e.teacherId === teacherId && e.day === wed)).toHaveLength(0)
    // Only that teacher's Wednesday classes move; every other CSE class stays exactly where it was.
    const affected = entriesOf(before, CSE).filter((e) => e.teacherId === teacherId && e.day === wed).length
    expect(run.result.changes).toEqual({ kept: entriesOf(before, CSE).length - affected, moved: affected, rebuilt: false })
    expect(unchanged(entriesOf(before, CSE), run.result.entries)).toBe(entriesOf(before, CSE).length - affected)
    expect(run.ms).toBeLessThan(30_000)
  })

  test('S-02 A lab closes for maintenance: its classes move to other suitable labs', () => {
    const before = published()
    const used = new Map()
    for (const e of entriesOf(before, CSE)) if (e.kind === 'lab') used.set(e.roomId, (used.get(e.roomId) ?? 0) + 1)
    const closed = [...used].sort((a, b) => b[1] - a[1])[0][0] // the busiest CSE lab
    const after = { ...before, rooms: before.rooms.filter((r) => r.id !== closed) }
    const run = regenerate(after, CSE)

    expectComplete(after, run, CSE)
    expect(run.timetable.entries.filter((e) => e.roomId === closed)).toHaveLength(0)
    const affected = entriesOf(before, CSE).filter((e) => e.roomId === closed).length
    expect(run.result.changes.moved).toBe(affected)
  })

  test('S-03 The college announces an event: two periods on Friday become class-free for everyone', () => {
    const before = published()
    const blocked = { ...(before.time.blocked ?? {}), [slotKey('Fri', 0)]: 'Convocation', [slotKey('Fri', 1)]: 'Convocation' }
    const after = { ...before, time: { ...before.time, blocked }, timetable: null }
    const started = Date.now()
    const result = generateCollege(after, { seed: 1, keep: before.timetable.entries, ...STEADY })
    const fri = dayIndex(after, 'Fri')

    expect(result.unplaced ?? []).toHaveLength(0)
    expect(findClashes(result.entries, after)).toHaveLength(0)
    expect(result.entries.filter((e) => covers(e, fri, 0) || covers(e, fri, 1))).toHaveLength(0)
    expect(result.entries.length).toBe(before.timetable.entries.length)
    // The classes on Friday's first two periods move, plus at most a small ripple in their own sections; nothing is
    // rebuilt from scratch, and most of the college keeps its week.
    const affected = before.timetable.entries.filter((e) => covers(e, fri, 0) || covers(e, fri, 1)).length
    expect(result.changes.rebuilt).toBe(false)
    expect(result.changes.moved).toBeGreaterThanOrEqual(affected)
    console.info(`S-03: ${affected} classes hit by the event, ${result.changes.moved} moved, ${result.changes.kept} kept`)
    expect(unchanged(before.timetable.entries, result.entries)).toBeGreaterThan(before.timetable.entries.length * 0.6)
    expect(Date.now() - started).toBeLessThan(60_000)
  })

  test("S-04 A change that cannot fit is explained (a teacher's hours cut below their load); nothing is replaced", () => {
    const before = published()
    const teacherId = entriesOf(before, CSE)[0].teacherId
    const after = { ...before, teachers: before.teachers.map((t) => (t.id === teacherId ? { ...t, maxHours: 2 } : t)) }
    const run = regenerate(after, CSE)

    expect(run.ok).toBe(false)
    const name = before.teachers.find((t) => t.id === teacherId).name
    expect(run.check.problems.join(' ')).toContain(name)
    expect(run.timetable).toBeUndefined()
  })
})
