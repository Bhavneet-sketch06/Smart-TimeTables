import { Building2, Lock } from 'lucide-react'
import { ALL, deptById } from '../data/departments.js'
import { Button, Card, EmptyState } from './ui.jsx'

function SourceBadge({ dept }) {
  if (!dept?.source) return null
  if (dept.source === 'import') {
    return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">Imported data</span>
  }
  return dept.source === 'gndec' ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">From GNDEC documents</span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Sample data</span>
  )
}

/**
 * The department context for the whole app: current department name plus department tabs.
 * `allowAll` adds a college-wide option (Administrator); `locked` shows a single fixed department (HOD).
 */
export default function DepartmentBar({ data, value, onChange, allowAll = false, locked = false, onUnlock }) {
  const departments = data.departments ?? []
  if (!departments.length) return null
  const current = value === ALL ? null : deptById(data, value)
  const options = [...(allowAll ? [{ id: ALL, short: 'All departments', name: 'All departments' }] : []), ...departments]

  return (
    <section aria-label="Department" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Department</div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{current ? current.name : 'All departments · college-wide'}</h1>
              <SourceBadge dept={current} />
            </div>
            {current?.source === 'sample' && current.note && <p className="text-sm text-slate-500">{current.note}</p>}
          </div>
        </div>
        {locked && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Lock className="h-4 w-4" /> Your department (demo assignment)
            {onUnlock && (
              <Button variant="ghost" onClick={onUnlock}>
                Change
              </Button>
            )}
          </div>
        )}
      </div>
      {!locked && (
        <div role="tablist" aria-label="Choose department" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {options.map((d) => {
            const active = d.id === value
            return (
              <button
                key={d.id}
                role="tab"
                aria-selected={active}
                title={d.name}
                onClick={() => onChange(d.id)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-300'
                }`}
              >
                {d.short}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** One-time demo "sign-in" for HODs: pick the department you coordinate. */
export function HodDepartmentPicker({ data, onPick }) {
  const departments = data.departments ?? []
  if (!departments.length) {
    return <EmptyState>No departments yet. The administrator needs to set up the college first.</EmptyState>
  }
  return (
    <Card className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">Which department do you coordinate?</h1>
      <p className="mt-1 text-slate-500">
        This prototype has no sign-in, so pick your department once. You will only see and manage that department; use
        "Change" to pick again.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {departments.map((d) => (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-bold">{d.short}</span>
              <SourceBadge dept={d} />
            </div>
            <div className="text-slate-600">{d.name}</div>
          </button>
        ))}
      </div>
    </Card>
  )
}
