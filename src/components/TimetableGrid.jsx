import { useState } from 'react'
import { CalendarDays, Coffee, FlaskConical, LayoutList, MapPin, MoveHorizontal, MoveRight, UserRound, UsersRound } from 'lucide-react'
import { DAY_NAMES, blockedOf, periodTimes, periodsOn, slotKey } from '../data/schema.js'

// Full class names so Tailwind can see them at build time.
// card: soft tinted card; bar: strong accent stripe and legend dot; chip: badges on the card.
const PALETTE = [
  { card: 'bg-sky-50 border-sky-200 text-sky-950', bar: 'bg-sky-500', chip: 'bg-sky-100 text-sky-800' },
  { card: 'bg-emerald-50 border-emerald-200 text-emerald-950', bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  { card: 'bg-amber-50 border-amber-200 text-amber-950', bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  { card: 'bg-rose-50 border-rose-200 text-rose-950', bar: 'bg-rose-500', chip: 'bg-rose-100 text-rose-800' },
  { card: 'bg-violet-50 border-violet-200 text-violet-950', bar: 'bg-violet-500', chip: 'bg-violet-100 text-violet-800' },
  { card: 'bg-lime-50 border-lime-200 text-lime-950', bar: 'bg-lime-500', chip: 'bg-lime-100 text-lime-800' },
  { card: 'bg-orange-50 border-orange-200 text-orange-950', bar: 'bg-orange-500', chip: 'bg-orange-100 text-orange-800' },
  { card: 'bg-teal-50 border-teal-200 text-teal-950', bar: 'bg-teal-500', chip: 'bg-teal-100 text-teal-800' },
  { card: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-950', bar: 'bg-fuchsia-500', chip: 'bg-fuchsia-100 text-fuchsia-800' },
  { card: 'bg-cyan-50 border-cyan-200 text-cyan-950', bar: 'bg-cyan-500', chip: 'bg-cyan-100 text-cyan-800' },
  { card: 'bg-indigo-50 border-indigo-200 text-indigo-950', bar: 'bg-indigo-500', chip: 'bg-indigo-100 text-indigo-800' },
  { card: 'bg-pink-50 border-pink-200 text-pink-950', bar: 'bg-pink-500', chip: 'bg-pink-100 text-pink-800' },
  { card: 'bg-yellow-50 border-yellow-200 text-yellow-950', bar: 'bg-yellow-500', chip: 'bg-yellow-100 text-yellow-800' },
  { card: 'bg-blue-50 border-blue-200 text-blue-950', bar: 'bg-blue-500', chip: 'bg-blue-100 text-blue-800' },
]
const NEUTRAL = { card: 'bg-slate-50 border-slate-200 text-slate-900', bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-700' }

export { DAY_NAMES }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function makeLookup(data) {
  const map = (list) => new Map(list.map((x) => [x.id, x]))
  const subjectColor = new Map(data.subjects.map((s, i) => [s.id, PALETTE[i % PALETTE.length]]))
  return {
    subjects: map(data.subjects),
    teachers: map(data.teachers),
    rooms: map(data.rooms),
    sections: map(data.sections),
    days: data.time.days,
    starts: periodTimes(data.time).periods.map((p) => p.start),
    color: (subjectId) => subjectColor.get(subjectId) || NEUTRAL,
  }
}

// What to show under the subject name depends on whose timetable this is.
function detailLines(e, mode, lk) {
  const teacher = { Icon: UserRound, text: lk.teachers.get(e.teacherId)?.name ?? '?' }
  const room = { Icon: MapPin, text: lk.rooms.get(e.roomId)?.name ?? '?' }
  const section = {
    Icon: UsersRound,
    text: (lk.sections.get(e.sectionId)?.name ?? '?') + (e.group ? ` · ${e.group}` : ''),
  }
  if (mode === 'teacher') return [section, room]
  if (mode === 'room') return [section, teacher]
  return [teacher, room]
}

function ClassCard({ e, mode, lk, compact = false }) {
  const sub = lk.subjects.get(e.subjectId)
  const c = lk.color(e.subjectId)
  const lines = detailLines(e, mode, lk)
  // Labs and tutorials get a chip (with the group, on a section's timetable); lectures don't.
  const chip = e.kind === 'lab' || e.kind === 'tutorial'
  const KindIcon = e.kind === 'lab' ? FlaskConical : UsersRound
  const labLabel = `${e.kind === 'lab' ? 'Lab' : 'Tutorial'}${mode === 'section' && e.group ? ` ${e.group}` : ''}`
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-xl border shadow-sm ${c.card} ${
        compact ? 'py-1.5 pl-3 pr-2 text-sm' : 'py-2 pl-3.5 pr-2.5'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${c.bar}`} />
      {compact && chip && (
        <span className={`mb-1 inline-flex w-fit items-center gap-1 rounded-full px-1.5 text-xs font-bold ${c.chip}`}>
          <KindIcon className="h-3 w-3" /> {labLabel}
        </span>
      )}
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-semibold leading-snug hyphens-auto break-words">{sub?.name ?? '?'}</span>
        {!compact && chip && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${c.chip}`}>
            <KindIcon className="h-3.5 w-3.5" /> {labLabel}
          </span>
        )}
      </div>
      {!compact && sub?.code && <span className="text-xs font-semibold tracking-wide opacity-60">{sub.code}</span>}
      {e.movedFrom && (
        <span
          title={`Moved here after a change; it was ${lk.days[e.movedFrom.day] ?? ''} ${lk.starts[e.movedFrom.period] ?? ''} in ${lk.rooms.get(e.movedFrom.roomId)?.name ?? '?'}`}
          className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#fef3c7] px-1.5 text-xs font-bold text-[#92400e]"
        >
          <MoveRight className="h-3 w-3" /> Moved
        </span>
      )}
      <div className={`mt-auto space-y-0.5 ${compact ? 'pt-1 text-xs' : 'pt-2 text-sm'}`}>
        {lines.map(({ Icon, text }, i) => (
          <div key={i} className="flex items-center gap-1.5 opacity-85">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A multi-period cell. Classes that overlap (lab groups running side by side) get their own lane,
 * and each card sits on the exact rows of its periods.
 */
function BlockLanes({ block, span, mode, lk }) {
  const laneEnds = []
  const placed = block.items.map((e) => {
    let lane = laneEnds.findIndex((end) => end <= e.period)
    if (lane === -1) lane = laneEnds.push(0) - 1
    laneEnds[lane] = e.period + e.length
    return { e, lane }
  })
  return (
    <div
      className="absolute inset-0 grid gap-1"
      style={{
        gridTemplateRows: `repeat(${span}, minmax(0, 1fr))`,
        gridTemplateColumns: `repeat(${laneEnds.length}, minmax(0, 1fr))`,
      }}
    >
      {placed.map(({ e, lane }, i) => (
        <div
          key={i}
          className="min-h-0 overflow-hidden"
          style={{ gridRow: `${e.period - block.start + 1} / span ${e.length}`, gridColumn: lane + 1 }}
        >
          <ClassCard e={e} mode={mode} lk={lk} compact={laneEnds.length > 1} />
        </div>
      ))}
    </div>
  )
}

/** Subjects shown in this timetable, with colour, code, who teaches them and weekly periods. */
function Legend({ entries, lk, mode }) {
  const rows = new Map()
  for (const e of entries) {
    const row = rows.get(e.subjectId) ?? { periods: 0, people: new Set() }
    row.periods += e.length
    row.people.add(mode === 'section' ? lk.teachers.get(e.teacherId)?.name : lk.sections.get(e.sectionId)?.name)
    rows.set(e.subjectId, row)
  }
  if (!rows.size) return null
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
      {[...rows].map(([id, row]) => {
        const sub = lk.subjects.get(id)
        return (
          <div key={id} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${lk.color(id).bar}`} />
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-slate-800">
                {sub?.name ?? '?'} {sub?.code && <span className="font-normal text-slate-400">· {sub.code}</span>}
              </div>
              <div className="truncate text-slate-500">
                {[...row.people].filter(Boolean).join(', ')} · {row.periods} periods/week
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const LAYOUT_KEY = 'ttgen:gridLayout'
const readLayout = () => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'day' ? 'day' : 'week'
  } catch {
    return 'week'
  }
}

/**
 * Days across the top, time slots down the side. On phones the same week grid scrolls sideways (the time column
 * stays put), or the viewer can switch to stacked day cards; the choice is remembered per browser.
 */
export default function TimetableGrid({ data, entries, mode = 'section', showLegend = true }) {
  const [layout, setLayout] = useState(readLayout)
  const chooseLayout = (next) => {
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // remembering the layout is optional
    }
  }
  const lk = makeLookup(data)
  const { days, periodsPerDay: P } = data.time
  const { periods, breaks } = periodTimes(data.time)
  const blocked = blockedOf(data.time)
  const today = days.indexOf(WEEKDAYS[new Date().getDay()])

  // Group overlapping classes per day into blocks (lab groups can run in parallel or staggered);
  // each block becomes one cell spanning all its periods.
  const blocks = new Map()
  const covered = new Set()
  days.forEach((_, d) => {
    const sorted = entries.filter((e) => e.day === d).sort((x, y) => x.period - y.period)
    let current = null
    for (const e of sorted) {
      const end = e.period + e.length
      if (current && e.period < current.end) {
        current.items.push(e)
        current.end = Math.max(current.end, end)
      } else {
        current = { start: e.period, end, items: [e] }
        blocks.set(`${d}|${e.period}`, current)
      }
    }
  })

  const rows = []
  for (let p = 0; p < P; p++) {
    for (const b of breaks.filter((x) => x.after === p)) {
      rows.push(
        <tr key={`break${p}`}>
          <th className="sticky left-0 z-[1] shadow-[0_0_0_0.375rem_var(--color-white)] md:shadow-none bg-white px-2 py-1 text-left text-sm font-semibold text-amber-700 md:static md:bg-transparent">{b.label}</th>
          <td colSpan={days.length}>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 py-2 font-semibold tracking-wide text-amber-800">
              <Coffee className="h-4 w-4" /> {b.name}
            </div>
          </td>
        </tr>,
      )
    }
    const cells = days.map((day, d) => {
      const key = `${d}|${p}`
      if (covered.has(key)) return null
      const block = blocks.get(key)
      if (!block && p >= periodsOn(data.time, day)) {
        return <td key={d} className="rounded-xl bg-slate-100/70" title="No periods: the day has ended" />
      }
      if (!block && slotKey(day, p) in blocked) {
        return (
          <td key={d} className="rounded-xl border border-amber-200 bg-amber-50 text-center text-sm font-semibold text-amber-800">
            {blocked[slotKey(day, p)] || 'No classes'}
          </td>
        )
      }
      if (!block) {
        return (
          <td
            key={d}
            className={`rounded-xl border border-dashed ${
              d === today ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/60'
            }`}
          />
        )
      }
      const span = block.end - block.start
      for (let k = 1; k < span; k++) covered.add(`${d}|${p + k}`)
      return (
        <td key={d} rowSpan={span} className="relative h-full align-top">
          {/* Multi-period blocks use an absolute fill so they stretch over every row they span;
              single-period cells stay in normal flow so the row grows to fit larger text. */}
          {span > 1 || block.items.length > 1 ? (
            <BlockLanes block={block} span={span} mode={mode} lk={lk} />
          ) : (
            <div className="h-full">
              <ClassCard e={block.items[0]} mode={mode} lk={lk} />
            </div>
          )}
        </td>
      )
    })
    rows.push(
      <tr key={p} className="h-32 print:h-[4.6rem]">
        <th className="sticky left-0 z-[1] shadow-[0_0_0_0.375rem_var(--color-white)] md:shadow-none whitespace-nowrap bg-white px-2 text-left align-top md:static md:bg-transparent">
          <div className="text-base font-bold leading-tight text-slate-800 sm:text-lg">{periods[p].start}</div>
          <div className="text-sm font-normal text-slate-400">to {periods[p].end}</div>
          <span className="mt-1 inline-block rounded-md bg-slate-100 px-1.5 text-xs font-semibold text-slate-500">
            P{p + 1}
          </span>
        </th>
        {cells}
      </tr>,
    )
  }

  const perDay = days.map((_, d) => entries.filter((e) => e.day === d).sort((x, y) => x.period - y.period))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 md:hidden print:hidden">
        <div role="tablist" aria-label="Timetable layout" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {[
            ['week', 'Week grid', CalendarDays],
            ['day', 'Day by day', LayoutList],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={layout === id}
              onClick={() => chooseLayout(id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                layout === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {layout === 'week' && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <MoveHorizontal className="h-3.5 w-3.5" /> Swipe sideways for every day
          </span>
        )}
      </div>

      <div
        className={`${layout === 'week' ? 'block' : 'hidden'} -mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1 md:block print:block`}
        style={{ '--grid-min': `${6 + days.length * 11}rem` }}
      >
        <table className="w-full min-w-[var(--grid-min)] table-fixed border-separate border-spacing-1.5 md:min-w-0 print:min-w-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] shadow-[0_0_0_0.375rem_var(--color-white)] md:shadow-none w-24 bg-white sm:w-32 md:static md:bg-transparent" />
              {days.map((day, d) => (
                <th
                  key={day}
                  className={`rounded-xl py-3 text-base font-bold ${
                    d === today
                      ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 print:bg-none print:bg-slate-100 print:text-slate-900 print:shadow-none'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {DAY_NAMES[day] ?? day}
                  {d === today && <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 text-xs print:hidden">Today</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      <div className={`${layout === 'day' ? 'block' : 'hidden'} space-y-4 md:hidden print:hidden`}>
        {days.map((day, d) => (
          <div key={day} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3
              className={`flex items-center justify-between px-4 py-3 text-lg font-bold ${
                d === today ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {DAY_NAMES[day] ?? day}
              {d === today && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">Today</span>}
            </h3>
            <div className="p-3">
              {perDay[d].length === 0 ? (
                <p className="text-slate-400">No classes</p>
              ) : (
                <ul className="space-y-2.5">
                  {perDay[d].map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-16 shrink-0 pt-1.5 text-sm font-bold leading-tight text-slate-700">
                        {periods[e.period].start}
                        <span className="block font-normal text-slate-400">
                          {periods[Math.min(P - 1, e.period + e.length - 1)].end}
                        </span>
                      </span>
                      <div className="flex-1">
                        <ClassCard e={e} mode={mode} lk={lk} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {showLegend && <Legend entries={entries} lk={lk} mode={mode} />}
    </div>
  )
}
