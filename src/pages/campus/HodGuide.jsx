import { useState } from 'react'
import { CalendarRange, Moon, Search, Users } from 'lucide-react'
import { Card, EmptyState, Select } from '../../components/ui.jsx'
import { batchOf, batchesOf, deptById, sectionsOf } from '../../data/departments.js'
import { formatDate, timeRange, toHHMM, toMinutes, upcomingBookings } from '../../booking.js'
import { jointTimes, nextDateFor } from '../../campusGuide.js'
import SpaceFinder from './SpaceFinder.jsx'
import RequestsList from './RequestsList.jsx'
import { STAFF_EVENT_TYPES, staffActions } from './staffActions.js'

const ANY = ''

function SlotButton({ slot, onPick, children }) {
  return (
    <button
      onClick={() => onPick(slot)}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
    >
      <span className="block font-semibold text-slate-900">
        {slot.dayName} {slot.start}
        {slot.after ? ' onwards' : `–${slot.end}`}
      </span>
      <span className="block text-sm text-slate-500">{children}</span>
    </button>
  )
}

/**
 * HOD Campus Guide, scoped to their department: when its sections and another department's are free together
 * (free/busy only, never whose class it is), shared spaces for a joint session, and the department's bookings
 * and requests.
 */
export default function HodGuide({ college, deptId }) {
  const { data } = college
  const dept = deptById(data, deptId)
  const [myBatch, setMyBatch] = useState(ANY)
  const [other, setOther] = useState(ANY)
  const [otherBatch, setOtherBatch] = useState(ANY)
  const [length, setLength] = useState(1)
  const [plan, setPlan] = useState(null) // the time chosen for the finder
  if (!dept) return <EmptyState>Choose the department you coordinate first.</EmptyState>

  const others = (data.departments ?? []).filter((d) => d.id !== deptId && sectionsOf(data, d.id).length)
  const mine = sectionsOf(data, deptId).filter((s) => !myBatch || batchOf(s) === myBatch)
  const theirs = other ? sectionsOf(data, other).filter((s) => !otherBatch || batchOf(s) === otherBatch) : []
  const chosen = [...mine, ...theirs]
  const students = chosen.reduce((n, s) => n + s.students, 0)
  const times = data.timetable && chosen.length ? jointTimes(data, chosen.map((s) => s.id), { minPeriods: length }) : null

  const pickSlot = (slot) => {
    const duration = slot.after ? 60 : toMinutes(slot.end) - toMinutes(slot.start)
    setPlan({ key: `${slot.short}-${slot.start}-${Date.now()}`, date: nextDateFor(slot.short, slot.start), start: slot.start, duration, attendance: students })
  }
  const { actionFor, onAction } = staffActions(college, { role: 'hod', name: `${dept.short} coordinator`, deptId, department: dept.short })
  const inDept = (b) => b.deptId === deptId || (!b.deptId && b.department === dept.short)
  const bookings = upcomingBookings((data.bookings ?? []).filter(inDept))
  const requests = (data.requests ?? []).filter((r) => r.requester?.role !== 'student' && (r.deptId === deptId || r.requester?.deptId === deptId))

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Sections', sectionsOf(data, deptId).length],
          ['Students', sectionsOf(data, deptId).reduce((n, s) => n + s.students, 0)],
          ['Upcoming bookings', bookings.length],
        ].map(([label, value]) => (
          <Card key={label} className="p-3">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <CalendarRange className="h-5 w-5 text-indigo-600" /> Find a time for a joint session
        </h2>
        <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={`${dept.short} sections`}
            value={myBatch}
            options={[{ value: ANY, label: `All ${dept.short}` }].concat(batchesOf(data, deptId).filter(Boolean).map((b) => ({ value: b, label: b })))}
            onChange={(e) => setMyBatch(e.target.value)}
          />
          <Select
            label="With"
            value={other}
            options={[{ value: ANY, label: `Only ${dept.short}` }].concat(others.map((d) => ({ value: d.id, label: d.name })))}
            onChange={(e) => (setOther(e.target.value), setOtherBatch(ANY))}
          />
          <Select
            label="Their sections"
            value={otherBatch}
            disabled={!other}
            options={[{ value: ANY, label: other ? 'All sections' : '—' }].concat(other ? batchesOf(data, other).filter(Boolean).map((b) => ({ value: b, label: b })) : [])}
            onChange={(e) => setOtherBatch(e.target.value)}
          />
          <Select
            label="Length"
            value={length}
            options={[1, 2, 3].map((n) => ({ value: n, label: `${n} period${n > 1 ? 's' : ''}` }))}
            onChange={(e) => setLength(Number(e.target.value))}
          />
        </Card>
        {!data.timetable ? (
          <EmptyState>There's no timetable yet, so free times can't be worked out. The administrator generates it first.</EmptyState>
        ) : (
          times && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <Users className="h-4 w-4" /> {chosen.length} sections, {students} students. Only free and busy times are used; no one's
                schedule is shown.
              </p>
              {times.full.length > 0 ? (
                <div>
                  <h3 className="mb-2 font-semibold text-emerald-700">Everyone is free</h3>
                  <div className="flex flex-wrap gap-2">
                    {times.full.map((s) => (
                      <SlotButton key={`${s.day}-${s.from}`} slot={s} onPick={pickSlot}>
                        {s.periods} period{s.periods > 1 ? 's' : ''} free
                      </SlotButton>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                  No class period has every chosen section free. Try fewer sections, a shorter length, or a time after classes.
                </p>
              )}
              {times.partial.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold text-slate-700">Most are free</h3>
                  <div className="flex flex-wrap gap-2">
                    {times.partial.map((s) => (
                      <SlotButton key={`${s.day}-${s.from}`} slot={s} onPick={pickSlot}>
                        {s.free} of {s.total} sections free
                      </SlotButton>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-slate-700">
                  <Moon className="h-4 w-4" /> After classes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {times.after.map((s) => (
                    <SlotButton key={`after-${s.day}`} slot={s} onPick={pickSlot}>
                      No classes, rooms open until {s.end}
                    </SlotButton>
                  ))}
                </div>
              </div>
            </div>
          )
        )}
      </section>

      {plan && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Search className="h-5 w-5 text-indigo-600" /> Spaces for {formatDate(plan.date)}, {plan.start}–{toHHMM(toMinutes(plan.start) + plan.duration)}
          </h2>
          <SpaceFinder
            key={plan.key}
            data={data}
            bookings={data.bookings ?? []}
            eventTypes={STAFF_EVENT_TYPES}
            initial={{ ...plan, eventType: 'Joint session', organizerName: `${dept.short} coordinator` }}
            actionFor={actionFor}
            onAction={onAction}
            intro={<p className="text-sm text-slate-600">{dept.short} rooms are booked straight away; shared and other departments' rooms go to the administrator as requests.</p>}
          />
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-bold">{dept.short} bookings</h2>
          {bookings.length === 0 ? (
            <EmptyState>No upcoming bookings for {dept.short}.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {bookings.map((b) => (
                <li key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">{b.title}</p>
                  <p className="text-sm text-slate-600">
                    {formatDate(b.date)}, {timeRange(b)} · {data.rooms.find((r) => r.id === b.roomId)?.name ?? '?'} · {b.organizerName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-bold">{dept.short} requests</h2>
          <RequestsList data={data} requests={requests} onWithdraw={college.withdrawRequest} empty={`No requests from ${dept.short} staff.`} />
        </div>
      </section>
    </div>
  )
}
