import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, MapPin, Search, Users } from 'lucide-react'
import { Button, Card, Field, Select } from '../../components/ui.jsx'
import { formatDate, nextWorkingDay, suggestAlternatives, validateRequest } from '../../booking.js'
import { roomTypeName, roomTypesOf } from '../../data/schema.js'
import { deptById } from '../../data/departments.js'
import { searchSpaces } from '../../campusGuide.js'

const DURATIONS = [30, 45, 60, 90, 120, 180, 240]
const minutesLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`)

export function blankSearch(data, overrides = {}) {
  return {
    title: '',
    eventType: '',
    organizerName: '',
    attendance: 30,
    notes: '',
    facilities: [],
    roomType: 'any',
    date: nextWorkingDay(data),
    start: '16:00',
    duration: 60,
    setup: 0,
    cleanup: 0,
    ...overrides,
  }
}

/** A room's public details: what anyone may know about it. */
export function RoomFacts({ data, room }) {
  const home = room.deptId ? deptById(data, room.deptId)?.short : 'Shared'
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-500">
      <span>{roomTypeName(data, room.type)}</span>
      <span className="inline-flex items-center gap-1">
        <Users className="h-3.5 w-3.5" /> {room.capacity} seats
      </span>
      <span>{home}</span>
      {room.facilities?.length > 0 && <span>{room.facilities.join(' · ')}</span>}
    </span>
  )
}

/**
 * Find a free space for an activity and request (or book) it. Availability comes from the regular timetable
 * and confirmed bookings, for the whole requested time. `audience` 'admin' sees what occupies busy rooms;
 * everyone else only sees that a room is busy then.
 *
 * actionFor(room) -> { label, kind: 'request' | 'book' }; onAction(room, req) -> { ok, message, reasons? }
 */
export default function SpaceFinder({ data, bookings, audience = 'public', initial, eventTypes, askName = false, actionFor, onAction, intro }) {
  const [req, setReq] = useState(() => blankSearch(data, { eventType: eventTypes[0], ...initial }))
  const [result, setResult] = useState(null)
  const set = (changes) => {
    setResult(null)
    setReq((r) => ({ ...r, ...changes }))
  }
  const allFacilities = useMemo(() => [...new Set(data.rooms.flatMap((r) => r.facilities || []))].sort(), [data.rooms])
  const scheduleErrors = validateRequest({ ...req, title: 'x', organizerName: 'x' }).schedule
  const search = useMemo(
    () => (scheduleErrors.length || !(Number(req.attendance) >= 1) ? null : searchSpaces(data, bookings, req, { audience })),
    [data, bookings, req.date, req.start, req.duration, req.attendance, req.roomType, req.facilities.join('|'), audience, scheduleErrors.length],
  )
  // Busy-but-suitable rooms explain conflicts; unsuitable ones (too small, wrong type) just make noise.
  const busy = search?.unavailable.filter((u) => u.reasons.every((r) => r.kind === 'class' || r.kind === 'booking')) ?? []
  const alternatives = useMemo(
    () => (search && !search.available.length ? suggestAlternatives(data, bookings, req) : null),
    [search],
  )

  const act = async (room) => {
    const problems = validateRequest(req).details.filter((p) => askName || !/organizer/.test(p))
    if (problems.length) {
      setResult({ ok: false, message: problems.join(' ') })
      return
    }
    setResult(await onAction(room, req))
  }

  return (
    <div className="space-y-4">
      {intro}
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="What's it for?" placeholder="e.g. Coding Club meetup" value={req.title} onChange={(e) => set({ title: e.target.value })} className="sm:col-span-2" />
          <Select label="Type" value={req.eventType} options={eventTypes} onChange={(e) => set({ eventType: e.target.value })} />
          {askName ? (
            <Field label="Your name" value={req.organizerName} onChange={(e) => set({ organizerName: e.target.value })} />
          ) : (
            <Field label="People expected" type="number" min={1} value={req.attendance} onChange={(e) => set({ attendance: e.target.value })} />
          )}
          <Field label="Date" type="date" value={req.date} onChange={(e) => set({ date: e.target.value })} />
          <Field label="Start" type="time" value={req.start} onChange={(e) => set({ start: e.target.value })} />
          <Select label="Duration" value={req.duration} options={DURATIONS.map((m) => ({ value: m, label: minutesLabel(m) }))} onChange={(e) => set({ duration: Number(e.target.value) })} />
          {askName && <Field label="People expected" type="number" min={1} value={req.attendance} onChange={(e) => set({ attendance: e.target.value })} />}
          <Select
            label="Room type"
            value={req.roomType}
            options={[{ value: 'any', label: 'Any room type' }].concat(roomTypesOf(data).map((t) => ({ value: t.id, label: t.name })))}
            onChange={(e) => set({ roomType: e.target.value })}
          />
        </div>
        {allFacilities.length > 0 && (
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">Needs</div>
            <div className="flex flex-wrap gap-1.5">
              {allFacilities.map((f) => {
                const on = req.facilities.includes(f)
                return (
                  <button
                    key={f}
                    onClick={() => set({ facilities: on ? req.facilities.filter((x) => x !== f) : [...req.facilities, f] })}
                    className={`rounded-full border px-2.5 py-0.5 text-sm transition ${
                      on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {f}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {scheduleErrors.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {scheduleErrors.join(' ')}
        </p>
      )}
      {result && (
        <p
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 ${
            result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
          <span>{result.message}</span>
        </p>
      )}

      {search && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <Search className="h-4 w-4 text-indigo-600" />
            {search.available.length
              ? `${search.available.length} space${search.available.length === 1 ? '' : 's'} free · ${formatDate(req.date)}, ${req.start} for ${minutesLabel(Number(req.duration))}`
              : 'No suitable space is free at that time'}
          </h3>
          {search.available.length > 0 && (
            <ul className="grid gap-2 md:grid-cols-2">
              {search.available.slice(0, 12).map(({ room }) => {
                const action = actionFor(room)
                return (
                  <li key={room.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-200 hover:shadow-sm">
                    <MapPin className="h-5 w-5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">{room.name}</span>
                      <RoomFacts data={data} room={room} />
                    </span>
                    <Button variant={action.kind === 'book' ? 'primary' : 'secondary'} onClick={() => act(room)} className="shrink-0">
                      {action.label}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {alternatives && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {alternatives.slots.length ? (
                <>
                  <p className="text-slate-700">Suitable spaces are free at these times instead:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alternatives.slots.map((s) => (
                      <Button key={`${s.date} ${s.start}`} variant="secondary" onClick={() => set({ date: s.date, start: s.start })}>
                        <Clock className="h-4 w-4" /> {s.date === req.date ? 'Same day' : formatDate(s.date).split(',')[0]} {s.start} · {s.rooms} free
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-slate-700">{alternatives.reason || 'No nearby time has a suitable free space. Try another day or fewer requirements.'}</p>
              )}
            </div>
          )}
          {busy.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-600">
                {busy.length} suitable space{busy.length === 1 ? ' is' : 's are'} busy at that time
              </summary>
              <ul className="mt-2 space-y-1.5 text-sm">
                {busy.map(({ room, reasons }) => (
                  <li key={room.id} className="flex flex-wrap gap-x-2">
                    <b className="text-slate-800">{room.name}</b>
                    <span className="text-slate-500">{reasons.map((r) => r.text).join('; ')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
