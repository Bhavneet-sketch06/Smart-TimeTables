import { findClashes, scoreQuality } from '../scheduler.js'
import { Card } from './ui.jsx'

function Stat({ label, value, tone = 'slate', hint }) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  }
  return (
    <Card className="p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </Card>
  )
}

export default function SummaryPanel({ data }) {
  const tt = data.timetable
  // Recompute from the stored entries so the numbers are always verified, not just reported.
  const clashes = findClashes(tt.entries, data)
  const quality = scoreQuality(tt.entries, data)
  const complete = tt.stats.placed === tt.stats.total

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Classes placed" value={`${tt.stats.placed}/${tt.stats.total}`} tone={complete ? 'green' : 'amber'} />
        <Stat label="Clashes" value={clashes.length} tone={clashes.length ? 'red' : 'green'} hint="teacher, room, section" />
        <Stat
          label="Quality score"
          value={`${quality.score}/100`}
          tone={quality.score >= 80 ? 'green' : 'amber'}
          hint={`${quality.repeats} repeats · ${quality.longRuns} long runs · ${quality.gaps} gaps`}
        />
        <Stat label="Generated in" value={`${tt.stats.ms} ms`} hint={`${tt.stats.steps} steps · ${tt.stats.restarts} restarts`} />
      </div>
      {tt.reason && (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold">Why the timetable is incomplete</p>
          <p className="mt-1">{tt.reason}</p>
          {tt.unplaced?.length > 0 && (
            <p className="mt-1 text-xs">Unplaced: {[...new Set(tt.unplaced)].join(', ')}</p>
          )}
        </Card>
      )}
      {clashes.length > 0 && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-800">
          <ul className="list-disc pl-5">
            {clashes.slice(0, 10).map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
