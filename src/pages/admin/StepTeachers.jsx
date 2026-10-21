import { useState } from 'react'
import { slotKey, uid } from '../../data/schema.js'
import { Button, EmptyState, Field } from '../../components/ui.jsx'
import { patchItem, removeItem, toNumber } from './listUtils.js'

function UnavailableGrid({ time, value, onChange }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <tbody>
          {time.days.map((day) => (
            <tr key={day}>
              <th className="pr-2 text-left font-medium text-slate-500">{day}</th>
              {Array.from({ length: time.periodsPerDay }, (_, p) => {
                const key = slotKey(day, p)
                const off = value.includes(key)
                return (
                  <td key={p} className="p-0.5">
                    <button
                      onClick={() => toggle(key)}
                      title={off ? 'Unavailable' : 'Available'}
                      className={`h-7 w-9 rounded ${off ? 'bg-red-400 text-white' : 'bg-emerald-100 text-emerald-700'}`}
                    >
                      P{p + 1}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function StepTeachers({ data, update }) {
  const [open, setOpen] = useState(null)
  const add = () =>
    update('teachers', (teachers) => [
      ...teachers,
      { id: uid('t'), name: 'New teacher', department: '', subjectIds: [], maxHours: 16, unavailable: [] },
    ])
  const patch = (id, changes) => update('teachers', (teachers) => patchItem(teachers, id, changes))
  const remove = (id) => {
    update('teachers', (teachers) => removeItem(teachers, id))
    update('sections', (sections) =>
      sections.map((s) => ({
        ...s,
        assignments: s.assignments.map((a) => (a.teacherId === id ? { ...a, teacherId: '' } : a)),
      })),
    )
  }

  return (
    <div className="space-y-3">
      {data.teachers.length === 0 && <EmptyState>No teachers yet.</EmptyState>}
      {data.teachers.map((t) => (
        <div key={t.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Field label="Name" value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} className="col-span-2 sm:col-span-1" />
            <Field label="Department" value={t.department} onChange={(e) => patch(t.id, { department: e.target.value })} />
            <Field label="Max hours / week" type="number" min={1} value={t.maxHours} onChange={(e) => patch(t.id, { maxHours: toNumber(e.target.value, 1) })} />
            <Button variant="danger" onClick={() => remove(t.id)}>
              Remove
            </Button>
          </div>
          <div>
            <span className="text-sm font-medium text-slate-600">Can teach</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {data.subjects.map((s) => {
                const on = t.subjectIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      patch(t.id, { subjectIds: on ? t.subjectIds.filter((x) => x !== s.id) : [...t.subjectIds, s.id] })
                    }
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-500'
                    }`}
                  >
                    {s.name}
                  </button>
                )
              })}
              {data.subjects.length === 0 && <span className="text-xs text-slate-400">Add subjects first.</span>}
            </div>
          </div>
          <div>
            <button className="text-sm text-indigo-600 hover:underline" onClick={() => setOpen(open === t.id ? null : t.id)}>
              {open === t.id ? 'Hide' : 'Edit'} unavailable slots ({t.unavailable.length})
            </button>
            {open === t.id && (
              <div className="mt-2">
                <UnavailableGrid time={data.time} value={t.unavailable} onChange={(unavailable) => patch(t.id, { unavailable })} />
              </div>
            )}
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={add}>
        + Add teacher
      </Button>
    </div>
  )
}
