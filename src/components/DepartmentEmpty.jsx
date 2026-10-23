import { CalendarCog, Settings2 } from 'lucide-react'
import { ALL, deptById, departmentStatus } from '../data/departments.js'
import { Button } from './ui.jsx'

/**
 * Shown instead of a timetable when the selected department isn't set up or hasn't been generated yet.
 * Returns null when the department has a timetable, so callers can render `<DepartmentEmpty …/> ?? content`.
 */
export function departmentNeedsAttention(data, deptId) {
  if (deptId === ALL) return !data.timetable
  const s = departmentStatus(data, deptId)
  return !s.ready || !s.generated
}

export default function DepartmentEmpty({ data, deptId, canManage = false, onSetup, onGenerate }) {
  const dept = deptId === ALL ? null : deptById(data, deptId)
  const status = deptId === ALL ? { ready: data.sections.length > 0, generated: !!data.timetable } : departmentStatus(data, deptId)
  const label = dept?.short ?? 'the college'

  const notSetUp = !status.ready
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
        {notSetUp ? <Settings2 className="h-6 w-6" /> : <CalendarCog className="h-6 w-6" />}
      </span>
      <h2 className="mt-3 text-xl font-bold">
        {notSetUp ? `${dept?.name ?? 'This college'} isn't set up yet` : `No timetable for ${label} yet`}
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-slate-500">
        {notSetUp
          ? `Add ${label}'s sections, subjects and teachers in Setup, then generate its timetable. Rooms are shared with the rest of the college.`
          : `${label} is set up but its timetable hasn't been generated. Generating it keeps every other department's classes and avoids their rooms and teachers.`}
      </p>
      {canManage ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {notSetUp
            ? onSetup && (
                <Button onClick={onSetup}>
                  <Settings2 className="h-4 w-4" /> Set up {label}
                </Button>
              )
            : onGenerate && (
                <Button onClick={onGenerate}>
                  <CalendarCog className="h-4 w-4" /> Generate {label}
                </Button>
              )}
        </div>
      ) : (
        <p className="mt-4 text-sm font-medium text-slate-600">Ask your administrator to set this up.</p>
      )}
    </div>
  )
}
