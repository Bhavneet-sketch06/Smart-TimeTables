import { ROOM_TYPES, uid } from '../../data/schema.js'
import { Button, EmptyState, Field, Select } from '../../components/ui.jsx'
import { patchItem, removeItem, toNumber } from './listUtils.js'

const TYPE_LABELS = { classroom: 'Classroom', lab: 'Lab', seminar: 'Seminar hall' }

export default function StepRooms({ data, update }) {
  const add = () =>
    update('rooms', (rooms) => [
      ...rooms,
      { id: uid('room'), name: `Room ${rooms.length + 1}`, capacity: 60, type: 'classroom' },
    ])
  const patch = (id, changes) => update('rooms', (rooms) => patchItem(rooms, id, changes))

  return (
    <div className="space-y-3">
      {data.rooms.length === 0 && <EmptyState>No rooms yet. Add classrooms, labs and seminar halls.</EmptyState>}
      {data.rooms.map((r) => (
        <div key={r.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label="Name" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} className="col-span-2 sm:col-span-1" />
          <Field label="Capacity" type="number" min={1} value={r.capacity} onChange={(e) => patch(r.id, { capacity: toNumber(e.target.value, 1) })} />
          <Select
            label="Type"
            value={r.type}
            options={ROOM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
            onChange={(e) => patch(r.id, { type: e.target.value })}
          />
          <Button variant="danger" onClick={() => update('rooms', (rooms) => removeItem(rooms, r.id))} className="col-span-2 sm:col-span-1">
            Remove
          </Button>
          {/* Saved on blur so typing commas isn't fought by re-formatting. */}
          <Field
            key={`${r.id}:${(r.facilities || []).join('|')}`}
            label="Facilities (comma separated, used by Book a Space)"
            defaultValue={(r.facilities || []).join(', ')}
            placeholder="e.g. Projector, Computers, Sound system"
            onBlur={(e) =>
              patch(r.id, { facilities: [...new Set(e.target.value.split(',').map((f) => f.trim()).filter(Boolean))] })
            }
            className="col-span-2 sm:col-span-3"
          />
          <label className="col-span-2 flex items-center gap-2 pb-2 text-sm text-slate-600 sm:col-span-1">
            <input
              type="checkbox"
              checked={!!r.eventsOnly}
              onChange={(e) => patch(r.id, { eventsOnly: e.target.checked })}
              className="h-4 w-4 accent-indigo-600"
            />
            Events only (no classes)
          </label>
        </div>
      ))}
      <Button variant="secondary" onClick={add}>
        + Add room
      </Button>
    </div>
  )
}
