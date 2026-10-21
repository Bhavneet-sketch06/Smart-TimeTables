import { useState } from 'react'
import { Button, Card } from '../../components/ui.jsx'
import { generateTimetable, precheck } from '../../scheduler.js'
import StepTime from './StepTime.jsx'
import StepRooms from './StepRooms.jsx'
import StepTeachers from './StepTeachers.jsx'
import StepSubjects from './StepSubjects.jsx'
import StepSections from './StepSections.jsx'

const STEPS = [
  { title: 'Time structure', Component: StepTime, count: (d) => `${d.time.days.length}×${d.time.periodsPerDay}` },
  { title: 'Rooms', Component: StepRooms, count: (d) => d.rooms.length },
  { title: 'Subjects', Component: StepSubjects, count: (d) => d.subjects.length },
  { title: 'Teachers', Component: StepTeachers, count: (d) => d.teachers.length },
  { title: 'Sections', Component: StepSections, count: (d) => d.sections.length },
]

export default function AdminWizard({ college, onGenerated }) {
  const { data, update, loadDemo, loadGndec, reset, setTimetable } = college
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState([])
  const { title, Component } = STEPS[step]
  const last = step === STEPS.length - 1

  const generate = () => {
    const check = precheck(data)
    setProblems(check.problems)
    if (!check.ok) return
    setBusy(true)
    // Yield to the browser so the "Generating" state paints before the synchronous search.
    setTimeout(() => {
      const result = generateTimetable(data)
      setTimetable({ ...result, generatedAt: new Date().toISOString() })
      setBusy(false)
      onGenerated()
    }, 30)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">College setup</h1>
          {data.meta && <p className="text-slate-500">Loaded: {data.meta.name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { loadGndec(); setProblems([]) }}>
            Load GNDEC CSE (real data)
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
              <span className="block text-xs text-slate-400">Step {i + 1}</span>
              <span className="font-medium">{s.title}</span>
              <span className="ml-1 text-xs text-slate-400">({s.count(data)})</span>
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        <Component data={data} update={update} />
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

      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {last ? (
          <Button onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate timetable'}
          </Button>
        ) : (
          <Button onClick={() => setStep(step + 1)}>Next</Button>
        )}
      </div>
    </div>
  )
}
