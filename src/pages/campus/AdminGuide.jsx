import { useMemo, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Inbox, LayoutList, XCircle } from 'lucide-react'
import { Button, Card, EmptyState, Field, Select } from '../../components/ui.jsx'
import { isoDate, nextWorkingDay, toHHMM, weekdayOf } from '../../booking.js'
import { roomTypeName } from '../../data/schema.js'
import { deptById } from '../../data/departments.js'
import { isPast, reviewRequest, roomOverview, sharedRoomUse, sortRequests } from '../../campusGuide.js'
import { RequestSummary } from './RequestsList.jsx'

/** One pending request with a live check of the room, an optional note, and Confirm / Decline. */
function ReviewCard({ college, request }) {
  const { data } = college
  const review = useMemo(() => reviewRequest(data, data.bookings ?? [], request), [data, request])
  const [roomId, setRoomId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const past = isPast(request)
  const confirmRoom = review.available ? request.roomId : roomId

  const decide = (decision) => {
    const r = college.decideRequest(request.id, decision, { note: note.trim(), roomId: confirmRoom || undefined })
    if (!r.ok) setError(`Can't confirm: ${r.reasons.map((x) => x.text).join('; ')}.`)
  }

  return (
    <RequestSummary data={data} request={request} showRequester>
      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {past ? (
          <p className="text-sm text-slate-500">This time has passed; it can only be declined.</p>
        ) : review.available ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> The room is still free for the whole time.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-1.5 text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Not free any more: {review.reasons.map((r) => r.text).join('; ')}.
            </p>
            {review.alternatives.length > 0 ? (
              <Select
                label="Confirm in another free room instead"
                value={roomId}
                options={[{ value: '', label: 'Choose a room…' }].concat(review.alternatives.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} seats, ${roomTypeName(data, r.type)})` })))}
                onChange={(e) => setRoomId(e.target.value)}
                className="max-w-md"
              />
            ) : (
              <p className="text-slate-600">No other suitable room is free then; decline with a suggested time.</p>
            )}
          </div>
        )}
        <Field label="Note to the requester (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please keep the room tidy" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide('approve')} disabled={past || !confirmRoom}>
            <CheckCircle2 className="h-4 w-4" /> Confirm{confirmRoom && confirmRoom !== request.roomId ? ' in the chosen room' : ''}
          </Button>
          <Button variant="danger" onClick={() => decide('decline')}>
            <XCircle className="h-4 w-4" /> Decline
          </Button>
        </div>
      </div>
    </RequestSummary>
  )
}

/** Each room on a date: what's on now and next, and every class and confirmed booking of the day. */
function RoomOverview({ data }) {
  const today = isoDate(new Date())
  const [date, setDate] = useState(data.time.days.includes(weekdayOf(today)) ? today : nextWorkingDay(data))
  const [filter, setFilter] = useState('all')
  const rows = roomOverview(data, data.bookings ?? [], date)
  const shown = rows.filter((r) => (filter === 'shared' ? !r.room.deptId : filter === 'busy' ? r.items.length : true))
  const teaching = data.time.days.includes(weekdayOf(date))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select
          label="Show"
          value={filter}
          options={[
            { value: 'all', label: 'All rooms' },
            { value: 'shared', label: 'Shared rooms' },
            { value: 'busy', label: 'Rooms in use that day' },
          ]}
          onChange={(e) => setFilter(e.target.value)}
        />
        {!teaching && <p className="pb-2 text-sm text-slate-500">No regular classes on {weekdayOf(date)}; only bookings are shown.</p>}
      </div>
      {!data.rooms.length ? (
        <EmptyState>No rooms are set up yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {shown.map(({ room, items, now, next, conflicts }) => (
            <li key={room.id} className="grid gap-2 p-3 md:grid-cols-[14rem_1fr]">
              <div>
                <p className="font-semibold text-slate-900">
                  {room.name}
                  {room.eventsOnly && <span className="ml-2 text-xs font-normal text-slate-400">events only</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {roomTypeName(data, room.type)} · {room.capacity} seats · {room.deptId ? deptById(data, room.deptId)?.short : 'Shared'}
                </p>
                <p className={`mt-1 text-sm font-medium ${now ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {date === today ? (now ? `In use now: ${now.label}` : 'Free now') : `${items.length} use${items.length === 1 ? '' : 's'} that day`}
                </p>
                {date === today && next && <p className="text-sm text-slate-500">Next: {toHHMM(next.from)} {next.label}</p>}
              </div>
              <div className="flex flex-wrap content-start gap-1.5">
                {items.length === 0 && <span className="text-sm text-slate-400">Free all day</span>}
                {items.map((x, i) => (
                  <span
                    key={i}
                    title={x.label}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      x.kind === 'booking' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-700'
                    } ${conflicts.includes(x) ? 'ring-2 ring-red-400' : ''}`}
                  >
                    <b>
                      {toHHMM(x.from)}–{toHHMM(x.to)}
                    </b>{' '}
                    {x.label}
                    {x.dept ? ` · ${x.dept}` : ''}
                  </span>
                ))}
                {conflicts.length > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> A booking overlaps a class (the timetable changed after it was booked)
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Shared rooms and rooms used by several departments: each department's weekly periods there. */
function SharedRooms({ data }) {
  const rows = sharedRoomUse(data)
  if (!data.timetable) return <EmptyState>Generate the timetable to see how departments share rooms.</EmptyState>
  if (!rows.length) return <EmptyState>No room is shared between departments.</EmptyState>
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {rows.map(({ room, byDept, used, free }) => (
        <li key={room.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="font-semibold text-slate-900">
            {room.name} <span className="font-normal text-slate-500">· {room.deptId ? `${deptById(data, room.deptId)?.short}'s, used by others` : 'shared'}</span>
          </p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {byDept.map(([d, n], i) => (
              <span key={d} style={{ width: `${(n / (used + free)) * 100}%` }} className={['bg-indigo-500', 'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500'][i % 5]} />
            ))}
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            {byDept.length ? byDept.map(([d, n]) => `${d} ${n}`).join(' · ') : 'No classes'} · {free} periods free a week
          </p>
        </li>
      ))}
    </ul>
  )
}

const TABS = [
  { id: 'requests', label: 'Requests', Icon: Inbox },
  { id: 'rooms', label: 'Room overview', Icon: LayoutList },
  { id: 'shared', label: 'Shared rooms', Icon: Building2 },
]

/** Administrator Campus Guide: review space requests, see every room's day, and how departments share rooms. */
export default function AdminGuide({ college }) {
  const { data } = college
  const [tab, setTab] = useState('requests')
  const requests = data.requests ?? []
  const pending = sortRequests(requests.filter((r) => r.status === 'pending'))
  const decided = sortRequests(requests.filter((r) => r.status !== 'pending'))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition ${
              tab === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
            {id === 'requests' && pending.length > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">{pending.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="space-y-4">
          <p className="text-slate-600">
            Requests from students and staff. Nothing is reserved until you confirm; confirming checks the room again against
            classes and confirmed bookings.
          </p>
          {pending.length === 0 ? (
            <Card className="text-center text-slate-500">
              No requests are waiting.
              {requests.length === 0 && data.rooms.length > 0 && (
                <Button variant="secondary" className="ml-3" onClick={college.addSampleRequests}>
                  Add demo requests
                </Button>
              )}
            </Card>
          ) : (
            <ul className="space-y-3">
              {pending.map((r) => (
                <ReviewCard key={r.id} college={college} request={r} />
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <summary className="cursor-pointer font-medium text-slate-700">Decided requests ({decided.length})</summary>
              <ul className="mt-3 space-y-2">
                {decided.map((r) => (
                  <RequestSummary key={r.id} data={data} request={r} showRequester />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {tab === 'rooms' && <RoomOverview data={data} />}
      {tab === 'shared' && <SharedRooms data={data} />}
    </div>
  )
}
