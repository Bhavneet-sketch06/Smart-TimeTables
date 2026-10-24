// "My Day" for a student: today's classes in time order with clock times, and which one is on now or next.
// Pure JS (no React) so it can be tested with any date.

import { periodTimes } from './data/schema.js'

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Today's plan from a student's (already filtered) timetable entries.
 * Returns {
 *   dayName, teachingDay,   // today's short name; false when today isn't one of the configured days
 *   classes: [{ entry, start, end, startMin, endMin, status: 'done' | 'now' | 'next' | 'later' }],
 *   state: 'off' | 'free' | 'finished' | 'active',
 *   highlight,              // the classes on now, or else the next ones (several when lab groups run side by side)
 *   breaks, onBreak,        // the day's breaks [{ start, end, name, label }], and the one on right now (or null)
 *   upcoming,               // first class of the next day that has any: { dayName, inDays, first } or null
 * }
 */
export function planDay(data, entries, now = new Date()) {
  const { days } = data.time
  const { periods, breaks } = periodTimes(data.time)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const dayName = WEEKDAYS[now.getDay()]
  const day = days.indexOf(dayName)

  const timed = (entry) => {
    const first = periods[entry.period]
    const last = periods[Math.min(entry.period + entry.length, periods.length) - 1]
    if (!first || !last) return null
    return { entry, start: first.start, end: last.end, startMin: toMinutes(first.start), endMin: toMinutes(last.end) }
  }
  const onDay = (d) =>
    entries
      .filter((e) => e.day === d)
      .map(timed)
      .filter(Boolean)
      .sort((a, b) => a.startMin - b.startMin || (a.entry.group ?? '').localeCompare(b.entry.group ?? ''))

  const classes = day >= 0 ? onDay(day) : []
  for (const c of classes) c.status = c.endMin <= minutes ? 'done' : c.startMin <= minutes ? 'now' : 'later'
  let highlight = classes.filter((c) => c.status === 'now')
  if (!highlight.length) {
    const next = classes.find((c) => c.status === 'later')
    highlight = next ? classes.filter((c) => c.status === 'later' && c.startMin === next.startMin) : []
    highlight.forEach((c) => (c.status = 'next'))
  }

  // The next teaching day with classes, for the "nothing (more) today" states.
  let upcoming = null
  for (let i = 1; i <= 7 && !upcoming; i++) {
    const name = WEEKDAYS[(now.getDay() + i) % 7]
    const d = days.indexOf(name)
    if (d >= 0 && onDay(d).length) upcoming = { dayName: name, inDays: i, first: onDay(d)[0] }
  }

  const onBreak = (day >= 0 && breaks.find((b) => minutes >= toMinutes(b.start) && minutes < toMinutes(b.end))) || null
  const state = day < 0 ? 'off' : !classes.length ? 'free' : highlight.length ? 'active' : 'finished'
  return { dayName, teachingDay: day >= 0, classes, state, highlight, onBreak, breaks, upcoming, minutes }
}

/** "in 5 min", "in 1 h 20 min" */
export function untilText(fromMin, toMin) {
  const diff = Math.max(0, toMin - fromMin)
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)} h${diff % 60 ? ` ${diff % 60} min` : ''}`
}
