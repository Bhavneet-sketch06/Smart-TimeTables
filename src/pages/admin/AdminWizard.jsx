import { useState } from 'react'
import { Building2, CalendarCog } from 'lucide-react'
import { Button, Card } from '../../components/ui.jsx'
import { generateCollege, generateTimetable, precheck } from '../../scheduler.js'
import { ALL, deptById, mergeDepartmentTimetable, sectionsOf, subjectsOf, teachersOf } from '../../data/departments.js'
import StepTime from './StepTime.jsx'
import StepRooms from './StepRooms.jsx'
import StepTeachers from './StepTeachers.jsx'
import StepSubjects from './StepSubjects.jsx'
import StepSections from './StepSections.jsx'

const STEPS = [
  { title: 'Time structure', Component: StepTime, count: (d) => `${d.time.days.length}×${d.time.periodsPerDay}`, shared: true },
  { title: 'Rooms', Component: StepRooms, count: (d) => d.rooms.length, shared: true },
  { title: 'Subjects', Component: StepSubjects, count: (d, dept) => subjectsOf(d, dept).length },
  { title: 'Teachers', Component: StepTeachers, count: (d, dept) => teachersOf(d, dept).length },
  { title: 'Sections', Component: StepSections, count: (d, dept) => sectionsOf(d, dept).length },
]

/**
 * Generates one department around the classes every other department already has (shared rooms and teachers
 * stay clash-free). Returns { problems } when the department can't be scheduled, else { timetable }.
 */
export function generateDepartment(data, deptId) {
  const deptOf = new Map(data.sections.map((s) => [s.id, s.deptId]))
  const fixed = (data.timetable?.entries ?? []).filter((e) => deptOf.get(e.sectionId) !== deptId)
  const check = precheck(data, { departmentId: deptId, fixedEntries: fixed })
  if (!check.ok) return { problems: check.problems }
  const result = generateTimetable(data, { departmentId: deptId, fixedEntries: fixed })
  return { problems: [], timetable: mergeDepartmentTimetable(data, deptId, fixed, result) }
}

export default function AdminWizard({ college, deptId = ALL, onGenerated }) {
  const { data, update, loadDemo, loadGndec, reset, setTimetable } = college
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState('')
  const [problems, setProblems] = useState([])
  const { title, Component, shared } = STEPS[step]
  const last = step === STEPS.length - 1
  const dept = deptId === ALL ? null : deptById(data, deptId)

  // Yield to the browser so the "Generating" state paints before the synchronous search.
  const run = (label, work) => {
    setBusy(label)
    setProblems([])
    setTimeout(() => {
      const problemsFound = work()
      setBusy('')
      setProblems(problemsFound)
      if (!problemsFound.length) onGenerated()
    }, 30)
  }
  const generateThis = () =>
    run('dept', () => {
      const r = generateDepartment(data, deptId)
      if (r.timetable) setTimetable(r.timetable)
      return r.problems
    })
  const generateAll = () =>
    run('all', () => {
      if (!data.sections.length) return precheck(data).problems
      const result = generateCollege(data)
      setTimetable({ ...result, generatedAt: new Date().toISOString() })
      return result.problems
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Setup · {dept ? dept.name : 'All departments'}</h2>
          {data.meta && <p className="text-slate-500">Loaded: {data.meta.name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { loadGndec(); setProblems([]) }}>
            Load GNDEC demo (CSE + sample departments)
          </Button>
          <Button variant="secondary" onClick={() => { loadDemo(); setProblems([]) }}>
            Load demo college
          </Button>
          <Button
            variant="danger"
            onClick={() => window.confirm('Clear all college data?') && (reset(), setProblems([]), setStep(0))}
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

      {problems.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <h3 className="font-semibold text-red-700">These inputs make a timetable impossible:</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>
      )}

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
      {last && dept && (
        <p className="text-right text-sm text-slate-500">
          Generating {dept.short} keeps every other department's classes and works around their rooms and shared teachers.
        </p>
      )}
    </div>
  )
}
