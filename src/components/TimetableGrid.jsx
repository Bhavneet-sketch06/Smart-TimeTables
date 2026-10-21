import { periodTimes } from '../data/schema.js'

// Full class names so Tailwind can see them at build time.
const PALETTE = [
  'bg-sky-100 border-sky-300 text-sky-900',
  'bg-emerald-100 border-emerald-300 text-emerald-900',
  'bg-amber-100 border-amber-300 text-amber-900',
  'bg-rose-100 border-rose-300 text-rose-900',
  'bg-violet-100 border-violet-300 text-violet-900',
  'bg-lime-100 border-lime-300 text-lime-900',
  'bg-orange-100 border-orange-300 text-orange-900',
  'bg-teal-100 border-teal-300 text-teal-900',
  'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900',
  'bg-cyan-100 border-cyan-300 text-cyan-900',
  'bg-indigo-100 border-indigo-300 text-indigo-900',
  'bg-pink-100 border-pink-300 text-pink-900',
  'bg-yellow-100 border-yellow-300 text-yellow-900',
  'bg-blue-100 border-blue-300 text-blue-900',
]

const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }

export function makeLookup(data) {
  const map = (list) => new Map(list.map((x) => [x.id, x]))
  const subjectColor = new Map(data.subjects.map((s, i) => [s.id, PALETTE[i % PALETTE.length]]))
  return {
    subjects: map(data.subjects),
    teachers: map(data.teachers),
    rooms: map(data.rooms),
    sections: map(data.sections),
    color: (subjectId) => subjectColor.get(subjectId) || 'bg-slate-100 border-slate-300 text-slate-800',
  }
}

// What to show under the subject name depends on whose timetable this is.
function detailLines(e, mode, lk) {
  const teacher = lk.teachers.get(e.teacherId)?.name ?? '?'
  const room = lk.rooms.get(e.roomId)?.name ?? '?'
  const section = (lk.sections.get(e.sectionId)?.name ?? '?') + (e.group ? ` · ${e.group}` : '')
  if (mode === 'teacher') return [section, room]
  if (mode === 'room') return [section, teacher]
  return [teacher, room]
}

function ClassCard({ e, mode, lk, compact = false }) {
  const sub = lk.subjects.get(e.subjectId)
  const [a, b] = detailLines(e, mode, lk)
  if (compact) {
    // Narrow lane next to a parallel lab group: badge on top, smaller text.
    return (
      <div className={`h-full rounded-lg border px-2 py-1.5 text-left text-sm ${lk.color(e.subjectId)}`}>
        <span className="mb-0.5 inline-block rounded bg-white/70 px-1.5 text-xs font-bold uppercase">
          {e.kind === 'lab' ? 'Lab' : ''} {mode === 'section' ? e.group : ''}
        </span>
        <div className="font-semibold leading-tight hyphens-auto break-words">{sub?.name ?? '?'}</div>
        <div className="mt-0.5 leading-tight opacity-85">{a}</div>
        <div className="leading-tight opacity-85">{b}</div>
      </div>
    )
  }
  return (
    <div className={`h-full rounded-lg border px-2.5 py-2 text-left ${lk.color(e.subjectId)}`}>
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold leading-snug hyphens-auto break-words">{sub?.name ?? "?"}</span>
        {e.kind === 'lab' && (
          <span className="shrink-0 rounded bg-white/70 px-1.5 text-xs font-bold uppercase">
            Lab{mode === 'section' && e.group ? ` ${e.group}` : ''}
          </span>
        )}
      </div>
      <div className="mt-1 text-sm leading-snug opacity-85">{a}</div>
      <div className="text-sm leading-snug opacity-85">{b}</div>
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

/** Days across the top, time slots down the side (desktop); stacked day cards on phones. */
export default function TimetableGrid({ data, entries, mode = 'section' }) {
  const lk = makeLookup(data)
  const { days, periodsPerDay: P, breakAfter } = data.time
  const { periods, breakSlot } = periodTimes(data.time)

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
    if (breakSlot && p === breakAfter) {
      rows.push(
        <tr key="break">
          <th className="whitespace-nowrap px-2 py-2 text-left text-sm font-medium text-amber-700">{breakSlot.label}</th>
          <td colSpan={days.length} className="rounded-lg bg-amber-50 py-2 text-center text-sm font-medium tracking-widest text-amber-700">
            BREAK
          </td>
        </tr>,
      )
    }
    const cells = days.map((_, d) => {
      const key = `${d}|${p}`
      if (covered.has(key)) return null
      const block = blocks.get(key)
      if (!block) return <td key={d} className="rounded-lg bg-slate-50" />
      const span = block.end - block.start
      for (let k = 1; k < span; k++) covered.add(`${d}|${p + k}`)
      return (
        <td key={d} rowSpan={span} className="relative h-full align-top">
          {/* Multi-period blocks use an absolute fill so they stretch over every row they span;
              single-period cells stay in normal flow so the row grows to fit larger text. */}
          {span > 1 ? (
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
      <tr key={p} className="h-28">
        <th className="whitespace-nowrap px-2 text-left align-top">
          <div className="font-semibold text-slate-700">{periods[p].label}</div>
          <div className="text-sm font-normal text-slate-400">Period {p + 1}</div>
        </th>
        {cells}
      </tr>,
    )
  }

  const perDay = days.map((_, d) => entries.filter((e) => e.day === d).sort((x, y) => x.period - y.period))

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-separate border-spacing-1.5">
          <thead>
            <tr>
              <th className="w-36" />
              {days.map((day) => (
                <th key={day} className="rounded-lg bg-indigo-600 py-2.5 text-base font-semibold text-white">
                  {DAY_NAMES[day] ?? day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {days.map((day, d) => (
          <div key={day} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h3 className="bg-indigo-600 px-4 py-2.5 text-lg font-semibold text-white">{DAY_NAMES[day] ?? day}</h3>
            <div className="p-3">
              {perDay[d].length === 0 ? (
                <p className="text-slate-400">No classes</p>
              ) : (
                <ul className="space-y-2.5">
                  {perDay[d].map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-20 shrink-0 pt-1.5 text-sm font-semibold leading-tight text-slate-600">
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
    </>
  )
}
