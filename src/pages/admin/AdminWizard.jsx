import { useState } from 'react'
import { Building2, CalendarCog, FileUp } from 'lucide-react'
import { Button, Card } from '../../components/ui.jsx'
import FailureGuidance from '../../components/FailureGuidance.jsx'
import { generateCollege, generateTimetable, precheck } from '../../scheduler.js'
import { ALL, deptById, entriesOf, fixedFor, mergeDepartmentTimetable, sectionsOf, subjectsOf, teachersOf } from '../../data/departments.js'
import StepTime from './StepTime.jsx'
import StepRooms from './StepRooms.jsx'
import StepTeachers from './StepTeachers.jsx'
import StepSubjects from './StepSubjects.jsx'
import StepSections from './StepSections.jsx'
import ImportData from './ImportData.jsx'

const STEPS = [
  { title: 'Time structure', Component: StepTime, count: (d) => `${d.time.days.length}×${d.time.periodsPerDay}`, shared: true },
  { title: 'Rooms', Component: StepRooms, count: (d) => d.rooms.length, shared: true },
  { title: 'Subjects', Component: StepSubjects, count: (d, dept) => subjectsOf(d, dept).length },
  { title: 'Teachers', Component: StepTeachers, count: (d, dept) => teachersOf(d, dept).length },
  { title: 'Sections', Component: StepSections, count: (d, dept) => sectionsOf(d, dept).length },
]

/**
 * Generates one department around the classes every other department already has (shared rooms and teachers
 * stay clash-free). Returns { failures } when the inputs make it impossible, else { failures: [], timetable }.
 * A failure is { deptId, run, fixedEntries } for FailureGuidance.
 *
 * After an edit the timetable is cleared, but its last version (`data.previous`) still holds the other departments'
 * classes (scheduled around) and this department's own (kept in place where they still fit, when `keepInPlace`).
 */
export function generateDepartment(data, deptId, { keepInPlace = true } = {}) {
  const base = { ...data, timetable: data.timetable ?? data.previous ?? null }
  const fixed = fixedFor(base, deptId)
  const check = precheck(data, { departmentId: deptId, fixedEntries: fixed })
  if (!check.ok) return { failures: [{ deptId, run: { ok: false, ...check }, fixedEntries: fixed }] }
  const keep = keepInPlace && !data.timetable && data.previous ? entriesOf(base, deptId) : []
  const result = generateTimetable(data, { departmentId: deptId, fixedEntries: fixed, keep })
  return { failures: [], timetable: mergeDepartmentTimetable(base, deptId, fixed, result) }
}

export default function AdminWizard({ college, deptId = ALL, onGenerated, initialFailures = [] }) {
  const { data, update, loadDemo, loadGndec, reset, setTimetable } = college
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState('')
  // Departments whose inputs make a timetable impossible: { deptId, run, fixedEntries }.
  const [failures, setFailures] = useState(initialFailures)
  // Import College Data replaces the wizard until the administrator goes back to manual setup.
  const [importing, setImporting] = useState(false)
  // After a change, regenerate around the classes it doesn't affect (they stay where they were).
  const [keepInPlace, setKeepInPlace] = useState(true)
  const canKeep = !data.timetable && !!data.previous?.entries?.length
  const { title, Component, shared } = STEPS[step]
  // With accounts these replace the college for everyone (bookings and requests included), so ask first.
  const sure = (what) => !college.shared || window.confirm(`${what} the shared college data for everyone, including all bookings and space requests?`)
  const last = step === STEPS.length - 1
  const dept = deptId === ALL ? null : deptById(data, deptId)

  // Yield to the browser so the "Generating" state paints before the synchronous search.
  const run = (label, work) => {
    setBusy(label)
    setFailures([])
    setTimeout(() => {
      const found = work()
      setBusy('')
      setFailures(found)
      if (!found.length) onGenerated()
    }, 30)
  }
  const generateThis = () =>
    run('dept', () => {
      const r = generateDepartment(data, deptId, { keepInPlace })
      if (r.timetable) setTimetable(r.timetable)
      return r.failures
    })
  const generateAll = () =>
    run('all', () => {
      if (!data.sections.length) return [{ deptId: ALL, run: { ok: false, ...precheck(data) }, fixedEntries: [] }]
      const result = generateCollege(data, { keep: keepInPlace && canKeep ? data.previous.entries : [] })
      setTimetable({ ...result, generatedAt: new Date().toISOString() })
      const byDept = Object.entries(result.byDept ?? {})
      // Only impossible inputs keep you on Setup; an incomplete search is explained on the Timetable tab.
      if (!byDept.length) return result.issues?.length ? [{ deptId: ALL, run: result, fixedEntries: [] }] : []
      return byDept
        .filter(([, r]) => r.issues?.length)
        .map(([id, r]) => ({ deptId: id, run: r, fixedEntries: fixedFor(data, id, result.entries) }))
    })

  if (importing) {
    return (
      <ImportData
        college={college}
        onManual={() => (setImporting(false), setStep(0))}
        onContinue={() => (setImporting(false), setFailures([]), setStep(STEPS.length - 1))}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Setup · {dept ? dept.name : 'All departments'}</h2>
          {data.meta && <p className="text-slate-500">Loaded: {data.meta.name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setImporting(true)}>
            <FileUp className="h-4 w-4" /> Import college data
          </Button>
          <Button variant="secondary" onClick={() => { if (sure('Replace')) { loadGndec(); setFailures([]) } }}>
            Load GNDEC demo (CSE + sample departments)
          </Button>
          <Button variant="secondary" onClick={() => { if (sure('Replace')) { loadDemo(); setFailures([]) } }}>
            Load demo college
          </Button>
          <Button
            variant="danger"
            onClick={() => (college.shared ? sure('Clear') : window.confirm('Clear all college data?')) && (reset(), setFailures([]), setStep(0))}
          >
            Clear all
          </Button>
        </div>
      </div>

      <ol className="flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex-1">
            <button
              onClick={() => setStep(i)}
              className={`w-full min-w-28 rounded-lg border px-3 py-2 text-left text-sm ${
                i === step ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <span className="block text-xs text-slate-400">
                Step {i + 1}
                {s.shared ? ' · college-wide' : dept ? ` · ${dept.short}` : ''}
              </span>
              <span className="font-medium">{s.title}</span>
              <span className="ml-1 text-xs text-slate-400">({s.count(data, deptId)})</span>
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
            <Building2 className="h-4 w-4" />
            {shared
              ? 'Shared by every department'
              : dept
                ? `Showing ${dept.short} only; new items are added to ${dept.short}`
                : 'Showing every department'}
          </span>
        </div>
        <Component data={data} update={update} deptId={deptId} />
      </Card>

      {failures.map((f) => (
        <FailureGuidance
          key={f.deptId}
          data={data}
          run={f.run}
          deptId={f.deptId}
          fixedEntries={f.fixedEntries}
          heading={
            failures.length > 1 || deptId === ALL
              ? `${deptById(data, f.deptId)?.name ?? 'The college'}: these inputs make a timetable impossible`
              : undefined
          }
        />
      ))}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {last ? (
          <div className="flex flex-wrap gap-2">
            {dept && (
              <Button onClick={generateThis} disabled={!!busy}>
                <CalendarCog className="h-4 w-4" /> {busy === 'dept' ? 'Generating…' : `Generate ${dept.short} timetable`}
              </Button>
            )}
            <Button variant={dept ? 'secondary' : 'primary'} onClick={generateAll} disabled={!!busy}>
              {busy === 'all' ? 'Generating…' : 'Generate whole college'}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setStep(step + 1)}>Next</Button>
        )}
      </div>
      {last && canKeep && (
        <label className="flex items-start justify-end gap-2 text-right text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={keepInPlace} onChange={(e) => setKeepInPlace(e.target.checked)} />
          <span>
            <b>Keep unaffected classes in place.</b> Only the classes your change affects move; everyone else keeps their week.
          </span>
        </label>
      )}
      {last && dept && (
        <p className="text-right text-sm text-slate-500">
          Generating {dept.short} keeps every other department's classes and works around their rooms and shared teachers.
        </p>
      )}
    </div>
  )
}
