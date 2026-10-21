import { uid } from '../../data/schema.js'
import { Button, EmptyState, Field } from '../../components/ui.jsx'
import { patchItem, removeItem, toNumber } from './listUtils.js'

export default function StepSubjects({ data, update }) {
  const add = () =>
    update('subjects', (subjects) => [
      ...subjects,
      { id: uid('sub'), name: 'New subject', code: '', lectureHours: 3, labHours: 0 },
    ])
  const patch = (id, changes) => update('subjects', (subjects) => patchItem(subjects, id, changes))

  const remove = (id) => {
    update('subjects', (subjects) => removeItem(subjects, id))
    // Keep references consistent: drop the subject from teachers and sections too.
    update('teachers', (teachers) => teachers.map((t) => ({ ...t, subjectIds: t.subjectIds.filter((s) => s !== id) })))
    update('sections', (sections) =>
      sections.map((s) => ({ ...s, assignments: s.assignments.filter((a) => a.subjectId !== id) })),
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Lab hours are scheduled as one block of consecutive periods in a lab room (e.g. 2 = a double period).
      </p>
      {data.subjects.length === 0 && <EmptyState>No subjects yet.</EmptyState>}
      {data.subjects.map((s) => (
        <div key={s.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Field label="Name" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} className="col-span-2 sm:col-span-1" />
          <Field label="Code" value={s.code} onChange={(e) => patch(s.id, { code: e.target.value })} />
          <Field label="Lectures / week" type="number" min={0} value={s.lectureHours} onChange={(e) => patch(s.id, { lectureHours: toNumber(e.target.value) })} />
          <Field label="Lab periods / week" type="number" min={0} value={s.labHours} onChange={(e) => patch(s.id, { labHours: toNumber(e.target.value) })} />
          <Button variant="danger" onClick={() => remove(s.id)}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={add}>
        + Add subject
      </Button>
    </div>
  )
}
