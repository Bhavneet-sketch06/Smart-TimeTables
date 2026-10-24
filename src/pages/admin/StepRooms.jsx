import { X } from 'lucide-react'
import { ROOM_KINDS, roomTypesOf, uid } from '../../data/schema.js'
import { Button, EmptyState, Field, Select } from '../../components/ui.jsx'
import { patchItem, removeItem, toNumber } from './listUtils.js'

/** The college's own room types (Computer lab, Drawing hall, Workshop...), each used either for lectures or labs. */
function RoomTypes({ data, update }) {
  const types = roomTypesOf(data)
  const used = new Set(data.rooms.map((r) => r.type))
  const set = (next) => update('roomTypes', next)
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div>
        <h4 className="font-medium text-slate-700">Room types</h4>
        <p className="text-sm text-slate-500">
          Add the kinds of rooms your college has. Subjects can then ask for a type (e.g. Data Structures labs in a Computer lab).
        </p>
      </div>
      {types.map((t) => (
        <div key={t.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Field label="Type" value={t.name} onChange={(e) => set(patchItem(types, t.id, { name: e.target.value }))} />
          <Select
            label="Used for"
            value={t.kind}
            options={Object.entries(ROOM_KINDS).map(([value, label]) => ({ value, label }))}
            onChange={(e) => set(patchItem(types, t.id, { kind: e.target.value }))}
          />
          <Button
            variant="ghost"
            disabled={used.has(t.id) || types.length <= 1}
            title={used.has(t.id) ? 'Rooms use this type' : 'Remove type'}
            onClick={() => set(removeItem(types, t.id))}
            aria-label={`Remove ${t.name}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => set([...types, { id: uid('type'), name: 'New room type', kind: 'lab' }])}>
        + Add room type
      </Button>
    </div>
  )
}

export default function StepRooms({ data, update }) {
  const types = roomTypesOf(data)
  const add = () =>
    update('rooms', (rooms) => [
      ...rooms,
      { id: uid('room'), name: `Room ${rooms.length + 1}`, capacity: 60, type: types.find((t) => t.kind === 'lecture')?.id ?? types[0].id },
    ])
  const patch = (id, changes) => update('rooms', (rooms) => patchItem(rooms, id, changes))

  return (
    <div className="space-y-3">
      <RoomTypes data={data} update={update} />
      {data.rooms.length === 0 && <EmptyState>No rooms yet. Add classrooms, labs and halls.</EmptyState>}
      {data.rooms.map((r) => (
        <div key={r.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label="Name" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} className="col-span-2 sm:col-span-1" />
          <Field label="Capacity" type="number" min={1} value={r.capacity} onChange={(e) => patch(r.id, { capacity: toNumber(e.target.value, 1) })} />
          <Select
            label="Type"
            value={r.type}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => patch(r.id, { type: e.target.value })}
          />
          <Button variant="danger" onClick={() => update('rooms', (rooms) => removeItem(rooms, r.id))} className="col-span-2 sm:col-span-1">
            Remove
          </Button>
          {/* Saved on blur so typing commas isn't fought by re-formatting. */}
          <Field
            key={`${r.id}:${(r.facilities || []).join('|')}`}
            label="Facilities (comma separated; subjects and bookings can require them)"
            defaultValue={(r.facilities || []).join(', ')}
            placeholder="e.g. Projector, Computers, Sound system"
            onBlur={(e) =>
              patch(r.id, { facilities: [...new Set(e.target.value.split(',').map((f) => f.trim()).filter(Boolean))] })
            }
            className="col-span-2"
          />
          <Select
            label="Home department"
            value={r.deptId ?? ''}
            options={[{ value: '', label: 'Shared (any department)' }].concat(
              (data.departments ?? []).map((d) => ({ value: d.id, label: d.short })),
            )}
            onChange={(e) => patch(r.id, { deptId: e.target.value || null })}
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
