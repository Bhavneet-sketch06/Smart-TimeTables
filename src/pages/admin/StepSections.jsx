import { uid } from '../../data/schema.js'
import { Button, EmptyState, Field, Select } from '../../components/ui.jsx'
import { patchItem, removeItem, toNumber } from './listUtils.js'

export default function StepSections({ data, update }) {
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]))
  const add = () =>
    update('sections', (sections) => [
      ...sections,
      { id: uid('sec'), name: `Section ${sections.length + 1}`, department: '', students: 60, assignments: [] },
    ])
  const patch = (id, changes) => update('sections', (sections) => patchItem(sections, id, changes))

  const setAssignments = (sec, assignments) => patch(sec.id, { assignments })

  const addSubject = (sec, subjectId) => {
    if (!subjectId || sec.assignments.some((a) => a.subjectId === subjectId)) return
    const teacher = data.teachers.find((t) => t.subjectIds.includes(subjectId))
    setAssignments(sec, [...sec.assignments, { subjectId, teacherId: teacher?.id || '' }])
  }

  return (
    <div className="space-y-3">
      {data.sections.length === 0 && <EmptyState>No sections yet.</EmptyState>}
      {data.sections.map((sec) => {
        const hours = sec.assignments.reduce((n, a) => {
          const s = subjectById.get(a.subjectId)
          return n + (s ? s.lectureHours + s.labHours : 0)
        }, 0)
        const unused = data.subjects.filter((s) => !sec.assignments.some((a) => a.subjectId === s.id))
        return (
          <div key={sec.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Name" value={sec.name} onChange={(e) => patch(sec.id, { name: e.target.value })} className="col-span-2 sm:col-span-1" />
              <Field label="Department" value={sec.department} onChange={(e) => patch(sec.id, { department: e.target.value })} />
              <Field label="Students" type="number" min={1} value={sec.students} onChange={(e) => patch(sec.id, { students: toNumber(e.target.value, 1) })} />
              <Button variant="danger" onClick={() => update('sections', (sections) => removeItem(sections, sec.id))}>
                Remove
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-600">
                Subjects &amp; teachers <span className="font-normal text-slate-400">({hours} periods / week)</span>
              </div>
              {sec.assignments.map((a, i) => {
                const sub = subjectById.get(a.subjectId)
                const qualified = data.teachers.filter((t) => t.subjectIds.includes(a.subjectId))
                return (
                  <div key={a.subjectId} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-40 flex-1 text-sm">
                      {sub?.name ?? 'Unknown subject'}{' '}
                      <span className="text-xs text-slate-400">
                        {sub?.lectureHours}L{sub?.labHours ? ` + ${sub.labHours} lab` : ''}
                      </span>
                    </span>
                    <Select
                      value={a.teacherId}
                      options={[{ value: '', label: qualified.length ? 'Pick teacher' : 'No qualified teacher' }].concat(
                        qualified.map((t) => ({ value: t.id, label: t.name })),
                      )}
                      onChange={(e) =>
                        setAssignments(sec, sec.assignments.map((x, j) => (j === i ? { ...x, teacherId: e.target.value } : x)))
                      }
                      className="min-w-48"
                    />
                    <Button variant="ghost" onClick={() => setAssignments(sec, sec.assignments.filter((_, j) => j !== i))}>
                      ✕
                    </Button>
                  </div>
                )
              })}
              {unused.length > 0 && (
                <Select
                  value=""
                  options={[{ value: '', label: '+ Add subject…' }].concat(unused.map((s) => ({ value: s.id, label: s.name })))}
                  onChange={(e) => addSubject(sec, e.target.value)}
                  className="max-w-xs"
                />
              )}
            </div>
          </div>
        )
      })}
      <Button variant="secondary" onClick={add}>
        + Add section
      </Button>
    </div>
  )
}
