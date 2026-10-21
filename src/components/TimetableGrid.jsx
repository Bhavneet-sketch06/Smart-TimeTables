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
  const section = lk.sections.get(e.sectionId)?.name ?? '?'
  if (mode === 'teacher') return [section, room]
  if (mode === 'room') return [section, teacher]
  return [teacher, room]
}

function ClassCard({ e, mode, lk, compact }) {
  const sub = lk.subjects.get(e.subjectId)
  const [a, b] = detailLines(e, mode, lk)
  return (
    <div className={`h-full rounded-md border px-2 py-1 text-left ${lk.color(e.subjectId)}`}>
      <div className="flex items-start justify-between gap-1">
        <span className={`font-semibold leading-tight ${compact ? 'text-xs' : 'text-sm'}`}>{sub?.name ?? '?'}</span>
        {e.kind === 'lab' && <span className="rounded bg-white/70 px-1 text-[10px] font-bold uppercase">Lab</span>}
      </div>
      <div className="mt-0.5 text-[11px] leading-tight opacity-80">{a}</div>
      <div className="text-[11px] leading-tight opacity-80">{b}</div>
    </div>
  )
}

function byDay(entries, days) {
  return days.map((_, d) => entries.filter((e) => e.day === d).sort((x, y) => x.period - y.period))
}

/** Days × periods table (desktop) plus stacked day cards (mobile). */
export default function TimetableGrid({ data, entries, mode = 'section' }) {
  const lk = makeLookup(data)
  const { days, periodsPerDay: P, breakAfter } = data.time
  const hasBreak = breakAfter > 0 && breakAfter < P
  const perDay = byDay(entries, days)

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-separate border-spacing-1">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="w-14" />
              {Array.from({ length: P }, (_, p) => (
                <PeriodHeader key={p} p={p} showBreak={hasBreak && p === breakAfter} />
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, d) => {
              const cells = []
              for (let p = 0; p < P; ) {
                if (hasBreak && p === breakAfter) cells.push(<td key="break" className="w-6 rounded bg-amber-50" />)
                const e = perDay[d].find((x) => x.period === p)
                if (e) {
                  // A lab spans several period columns.
                  cells.push(
                    <td key={p} colSpan={e.length} className="h-20 align-top">
                      <ClassCard e={e} mode={mode} lk={lk} compact />
                    </td>,
                  )
                  p += e.length
                } else {
                  cells.push(<td key={p} className="h-20 rounded bg-slate-50" />)
                  p++
                }
              }
              return (
                <tr key={day}>
                  <th className="text-left text-sm font-semibold text-slate-600">{day}</th>
                  {cells}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {days.map((day, d) => (
          <div key={day} className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="mb-2 font-semibold">{day}</h3>
            {perDay[d].length === 0 ? (
              <p className="text-sm text-slate-400">No classes</p>
            ) : (
              <ul className="space-y-2">
                {perDay[d].map((e) => (
                  <li key={`${e.period}-${e.sectionId}`} className="flex gap-2">
                    <span className="w-14 shrink-0 pt-1 text-xs font-medium text-slate-500">
                      P{e.period + 1}
                      {e.length > 1 ? `–${e.period + e.length}` : ''}
                    </span>
                    <div className="flex-1">
                      <ClassCard e={e} mode={mode} lk={lk} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function PeriodHeader({ p, showBreak }) {
  return (
    <>
      {showBreak && <th className="w-6 text-[10px] font-medium text-amber-700">☕</th>}
      <th className="font-medium">P{p + 1}</th>
    </>
  )
}
