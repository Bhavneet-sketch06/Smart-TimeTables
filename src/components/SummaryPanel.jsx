import { collegeQuality, findClashes, scoreQuality } from '../scheduler.js'
import { ALL, deptById, entriesOf, expectedClasses, fixedFor } from '../data/departments.js'
import { RefreshCcw } from 'lucide-react'
import { Card } from './ui.jsx'
import FailureGuidance from './FailureGuidance.jsx'

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

/**
 * Runs that didn't produce a full timetable: the selected department's, or every department's for "All".
 * Data without departments has one college-wide run (the timetable itself).
 */
function failedRuns(data, deptId) {
  const tt = data.timetable
  const byDept = Object.entries(tt.byDept ?? {})
  if (!byDept.length) return tt.ok === false ? [{ deptId: ALL, run: tt, fixedEntries: [] }] : []
  return byDept
    .filter(([id, r]) => !r.ok && (deptId === ALL || id === deptId))
    .map(([id, r]) => ({
      deptId: id,
      run: r,
      fixedEntries: fixedFor(data, id),
      heading: deptId === ALL ? `${deptById(data, id)?.name ?? id}: not every class could be placed` : undefined,
    }))
}

/** After a change: how much of the previous timetable stayed the same. */
function ChangesNote({ changes }) {
  return (
    <Card className="flex items-start gap-2 border-emerald-200 bg-emerald-50 text-sm text-emerald-900">
      <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0" />
      {changes.rebuilt ? (
        <span>Updated after your change. The affected classes couldn't be fitted around the rest, so this was rebuilt from scratch.</span>
      ) : (
        <span>
          Updated after your change: <b>{changes.moved}</b> {changes.moved === 1 ? 'class' : 'classes'} moved, <b>{changes.kept}</b> kept exactly
          where {changes.kept === 1 ? 'it was' : 'they were'}.
        </span>
      )}
    </Card>
  )
}

/** Stats for the selected department (or the whole college). Clashes are always checked college-wide. */
export default function SummaryPanel({ data, deptId = ALL }) {
  const tt = data.timetable
  const all = deptId === ALL
  const dept = all ? null : deptById(data, deptId)
  const entries = entriesOf(data, deptId)
  const run = all ? tt : tt.byDept?.[deptId]
  // Recompute from the stored entries so the numbers are always verified, not just reported.
  const clashes = findClashes(tt.entries, data)
  const quality = all ? { score: collegeQuality(entries, data) } : scoreQuality(entries, data)
  const total = all ? (tt.stats.total ?? entries.length) : expectedClasses(data, deptId)
  const complete = entries.length >= total

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={`Classes placed${dept ? ` · ${dept.short}` : ''}`}
          value={`${entries.length}/${total}`}
          tone={complete ? 'green' : 'amber'}
        />
        <Stat label="Clashes" value={clashes.length} tone={clashes.length ? 'red' : 'green'} hint="checked across all departments" />
        <Stat
          label="Quality score"
          value={`${quality.score}/100`}
          tone={quality.score >= 80 ? 'green' : 'amber'}
          hint={all ? 'weighted across departments' : `${quality.repeats} repeats · ${quality.longRuns} long runs · ${quality.gaps} gaps`}
        />
        <Stat
          label="Generated in"
          value={run?.stats?.ms != null ? `${run.stats.ms} ms` : '—'}
          hint={run?.stats ? `${run.stats.steps} steps · ${run.stats.restarts} restarts` : 'with the whole college'}
        />
      </div>
      {run?.changes && <ChangesNote changes={run.changes} />}
      {failedRuns(data, deptId).map((f) => (
        <FailureGuidance key={f.deptId} data={data} run={f.run} deptId={f.deptId} fixedEntries={f.fixedEntries} heading={f.heading} />
      ))}
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
