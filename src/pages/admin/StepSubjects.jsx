import { useState } from 'react'
import { roomTypesOf, uid } from '../../data/schema.js'
import { ALL, deptById, subjectsOf } from '../../data/departments.js'
import { Button, EmptyState, Field, Select } from '../../components/ui.jsx'
import { patchItem, removeItem, toNumber } from './listUtils.js'

const list = (value) => [...new Set(value.split(',').map((f) => f.trim()).filter(Boolean))]

/** Which room a subject's lectures (and tutorials) or labs need: a room type and/or facilities. */
function RoomNeeds({ data, s, patch }) {
  const types = roomTypesOf(data)
  const row = (kind, typeKey, needsKey, anyLabel) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Select
        label={`${kind} room type`}
        value={s[typeKey] ?? ''}
        options={[{ value: '', label: anyLabel }].concat(types.map((t) => ({ value: t.id, label: t.name })))}
        onChange={(e) => patch(s.id, { [typeKey]: e.target.value || undefined })}
      />
      <Field
        key={`${s.id}:${needsKey}:${(s[needsKey] ?? []).join('|')}`}
        label={`${kind} room must have`}
        placeholder="e.g. Computers, Projector"
        defaultValue={(s[needsKey] ?? []).join(', ')}
        onBlur={(e) => patch(s.id, { [needsKey]: list(e.target.value) })}
      />
    </div>
  )
  return (
    <div className="col-span-full space-y-2 rounded-lg bg-slate-50 p-3">
      {row('Lecture', 'lectureRoomType', 'lectureNeeds', 'Any classroom')}
      {s.labHours > 0 && row('Lab', 'labRoomType', 'labNeeds', 'Any lab')}
      <p className="text-xs text-slate-500">Facilities must match the names used on rooms (Setup → Rooms).</p>
    </div>
  )
}

export default function StepSubjects({ data, update, deptId = ALL }) {
  const [open, setOpen] = useState(null)
  const dept = deptId === ALL ? null : deptById(data, deptId)
  const shown = subjectsOf(data, deptId)
  const add = () =>
    update('subjects', (subjects) => [
      ...subjects,
      { id: uid('sub'), name: 'New subject', code: '', lectureHours: 3, labHours: 0, deptId: dept?.id ?? null },
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
  const summary = (s) => {
    const bits = [
      s.lectureRoomType && `lectures in ${roomTypesOf(data).find((t) => t.id === s.lectureRoomType)?.name}`,
      s.lectureNeeds?.length && `lectures need ${s.lectureNeeds.join(', ')}`,
      s.labHours > 0 && s.labRoomType && `labs in ${roomTypesOf(data).find((t) => t.id === s.labRoomType)?.name}`,
      s.labHours > 0 && s.labNeeds?.length && `labs need ${s.labNeeds.join(', ')}`,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : 'any suitable room'
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Lectures can run as single or double periods. Tutorials are single periods for each lab group (or the whole
        section). A lab is one block of consecutive periods in a lab room; lab sessions is how many such blocks each
        group gets per week.
      </p>
      {shown.length === 0 && <EmptyState>No subjects{dept ? ` in ${dept.short}` : ''} yet.</EmptyState>}
      {shown.map((s) => (
        <div key={s.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]">
          <Field label="Name" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} className="col-span-2 sm:col-span-2 lg:col-span-1" />
          <Field label="Code" value={s.code} onChange={(e) => patch(s.id, { code: e.target.value })} />
          <Field label="Lectures / week" type="number" min={0} value={s.lectureHours} onChange={(e) => patch(s.id, { lectureHours: toNumber(e.target.value) })} />
          <Select
            label="Lectures as"
            value={s.lectureBlock || 1}
            options={[
              { value: 1, label: 'Single periods' },
              { value: 2, label: 'Double periods' },
              { value: 3, label: 'Triple periods' },
            ]}
            onChange={(e) => patch(s.id, { lectureBlock: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })}
          />
          <Field label="Tutorials / week" type="number" min={0} value={s.tutorialHours || 0} onChange={(e) => patch(s.id, { tutorialHours: toNumber(e.target.value) || undefined })} />
          <Field label="Lab block (periods)" type="number" min={0} value={s.labHours} onChange={(e) => patch(s.id, { labHours: toNumber(e.target.value) })} />
          <Field
            label="Lab sessions / week"
            type="number"
            min={1}
            disabled={!s.labHours}
            value={s.labHours ? s.labSessions || 1 : ''}
            onChange={(e) => patch(s.id, { labSessions: toNumber(e.target.value, 1) })}
          />
          <Button variant="danger" onClick={() => remove(s.id)}>
            Remove
          </Button>
          <button className="col-span-full text-left text-sm text-indigo-600 hover:underline" onClick={() => setOpen(open === s.id ? null : s.id)}>
            {open === s.id ? 'Hide' : 'Edit'} room needs <span className="text-slate-500">({summary(s)})</span>
          </button>
          {open === s.id && <RoomNeeds data={data} s={s} patch={patch} />}
        </div>
      ))}
      <Button variant="secondary" onClick={add}>
        + Add subject
      </Button>
    </div>
  )
}
