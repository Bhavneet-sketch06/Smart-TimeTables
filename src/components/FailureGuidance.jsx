import { useMemo, useState } from 'react'
import { CircleCheck, CircleHelp, FlaskConical, Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react'
import { diagnose, testChange } from '../diagnose.js'
import { Button } from './ui.jsx'

const CERTAINTY = {
  confirmed: { label: 'Confirmed cause', Icon: OctagonAlert, chip: 'bg-red-100 text-red-800', border: 'border-red-200' },
  likely: { label: 'Most likely cause', Icon: TriangleAlert, chip: 'bg-amber-100 text-amber-800', border: 'border-amber-200' },
  unknown: { label: 'Cause not certain', Icon: CircleHelp, chip: 'bg-slate-200 text-slate-700', border: 'border-slate-300' },
}

const CHECKED = {
  'passes-precheck': 'Checked: the inputs then pass every pre-check',
  'clears-check': 'Checked: this problem goes away (others remain)',
}

const SHOWN = 3

/** One suggested change, with its pre-check result and an optional quick test generation. */
function Remedy({ remedy, onTest, test }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg bg-white/70 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p>{remedy.text}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {remedy.where && <span>{remedy.where}</span>}
          {remedy.checked && (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <CircleCheck className="h-3.5 w-3.5" /> {CHECKED[remedy.checked]}
            </span>
          )}
          {test?.result && (
            <span className={`font-medium ${test.result.ok ? 'text-emerald-700' : 'text-slate-600'}`}>
              {test.result.ok
                ? `Tested: a full timetable (${test.result.placed}/${test.result.total} classes) was generated with this change. Nothing was saved.`
                : test.result.total
                  ? `Tested: still ${test.result.total - test.result.placed} of ${test.result.total} classes unplaced in a quick try. It may need another change too.`
                  : `Tested: the inputs would still fail the pre-check (${test.result.problems[0]})`}
            </span>
          )}
        </div>
      </div>
      {remedy.change && onTest && (
        <Button variant="secondary" className="shrink-0 self-start py-1" disabled={test?.running} onClick={onTest}>
          <FlaskConical className="h-3.5 w-3.5" /> {test?.running ? 'Testing…' : test?.result ? 'Test again' : 'Test this'}
        </Button>
      )}
    </li>
  )
}

/**
 * Explains why a generation run failed and what could be changed. `run` is a department's entry in
 * timetable.byDept (or a whole result); `fixedEntries` are the other departments' classes it was scheduled around.
 */
export default function FailureGuidance({ data, run, deptId, fixedEntries = [], heading }) {
  const departmentId = deptId && deptId !== 'all' ? deptId : undefined
  // fixedEntries is derived from data, so it isn't a separate dependency (callers needn't memoise it).
  const items = useMemo(() => diagnose(data, run, { departmentId, fixedEntries }), [data, run, departmentId])
  const [tests, setTests] = useState({})
  const [all, setAll] = useState(false)
  if (!items.length) return null

  const runTest = (remedy) => {
    setTests((t) => ({ ...t, [remedy.id]: { running: true } }))
    // Let the "Testing…" state paint before the synchronous search.
    setTimeout(() => {
      const result = testChange(data, remedy.change, { departmentId, fixedEntries })
      setTests((t) => ({ ...t, [remedy.id]: { result } }))
    }, 30)
  }

  const confirmed = items.some((d) => d.certainty === 'confirmed')
  const shown = all ? items : items.slice(0, SHOWN)
  return (
    <section className={`rounded-xl border p-4 ${confirmed ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
      <h3 className={`font-semibold ${confirmed ? 'text-red-800' : 'text-amber-900'}`}>
        {heading ??
          (confirmed ? 'These inputs make a timetable impossible' : "The generator couldn't place every class")}
      </h3>
      <p className="mt-0.5 text-sm text-slate-600">
        {items.length > 1 ? `${items.length} issues, most important first.` : 'What stopped it, and what could help.'}
      </p>

      <ol className="mt-3 space-y-3">
        {shown.map((d) => {
          const c = CERTAINTY[d.certainty]
          return (
            <li key={d.id} className={`rounded-xl border bg-white/60 p-3 text-sm ${c.border}`}>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${c.chip}`}>
                <c.Icon className="h-3.5 w-3.5" /> {c.label}
              </span>
              <h4 className="mt-1.5 text-base font-semibold text-slate-900">{d.title}</h4>
              <p className="mt-0.5 text-slate-700">{d.cause}</p>
              {d.facts.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-slate-600">
                  {d.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              {d.remedies.length > 0 && (
                <>
                  <p className="mt-3 inline-flex items-center gap-1.5 font-semibold text-slate-800">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Changes that could help
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {d.remedies.map((r) => (
                      <Remedy key={r.id} remedy={r} test={tests[r.id]} onTest={() => runTest(r)} />
                    ))}
                  </ul>
                </>
              )}
            </li>
          )
        })}
      </ol>
      {items.length > SHOWN && (
        <Button variant="ghost" className="mt-2" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show ${items.length - SHOWN} more`}
        </Button>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Suggestions are possible fixes, not guarantees, and nothing is changed until you edit the setup. "Checked" means the
        pre-check was re-run with that change; "Test this" runs a quick generation with it (it can't prove that no
        timetable exists when it fails).
      </p>
    </section>
  )
}
