import { CalendarClock, MapPin, Search } from 'lucide-react'
import { EmptyState } from '../../components/ui.jsx'
import { ALL } from '../../data/departments.js'
import { formatDate, timeRange, upcomingBookings } from '../../booking.js'
import { upcomingClasses } from '../../campusGuide.js'
import { currentFacultyId } from '../FacultyView.jsx'
import SpaceFinder, { RoomFacts } from './SpaceFinder.jsx'
import RequestsList from './RequestsList.jsx'
import { STAFF_EVENT_TYPES, staffActions } from './staffActions.js'

/** Faculty Campus Guide: their own upcoming classes, a room finder, and their own bookings and requests. */
export default function FacultyGuide({ college, deptId = ALL, teacherId: signedIn }) {
  const { data } = college
  const teacherId = signedIn ?? currentFacultyId(data, deptId)
  const teacher = data.teachers.find((t) => t.id === teacherId)
  if (!teacher) return <EmptyState>No faculty members are set up for this department yet.</EmptyState>

  // A signed-in faculty member acts for the department on their account (the database checks the same one).
  const homeDept = signedIn ? deptId : teacher.deptId
  const dept = (data.departments ?? []).find((d) => d.id === homeDept)
  const classes = data.timetable ? upcomingClasses(data, data.timetable.entries.filter((e) => e.teacherId === teacherId), new Date(), { limit: 5 }) : []
  const subjects = new Map(data.subjects.map((s) => [s.id, s]))
  const sections = new Map(data.sections.map((s) => [s.id, s]))
  const bookings = upcomingBookings((data.bookings ?? []).filter((b) => b.organizerId === teacherId || b.createdBy?.teacherId === teacherId))
  const requests = (data.requests ?? []).filter((r) => r.requester?.teacherId === teacherId)
  const { actionFor, onAction } = staffActions(college, {
    role: 'faculty',
    name: teacher.name,
    teacherId,
    deptId: homeDept,
    department: dept?.short ?? teacher.department ?? '',
  })

  return (
    <div className="space-y-6">
      {!signedIn && (
        <p className="text-slate-500">
          Showing <b className="text-slate-700">{teacher.name}</b>. Change who you are on the My timetable tab.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <CalendarClock className="h-5 w-5 text-indigo-600" /> Your upcoming classes
        </h2>
        {!data.timetable ? (
          <EmptyState>There's no timetable yet. Your classes appear here once the administrator generates it.</EmptyState>
        ) : classes.length === 0 ? (
          <EmptyState>No classes in the coming week.</EmptyState>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {classes.map((c) => {
              const room = data.rooms.find((r) => r.id === c.entry.roomId)
              return (
                <li key={`${c.date}-${c.entry.period}-${c.entry.sectionId}-${c.entry.group ?? ''}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-medium text-indigo-700">
                    {c.today ? 'Today' : c.dayName} · {c.start}–{c.end}
                  </p>
                  <p className="font-semibold text-slate-900">
                    {subjects.get(c.entry.subjectId)?.name ?? 'Class'}
                    <span className="font-normal text-slate-500">
                      {' '}
                      · {sections.get(c.entry.sectionId)?.name}
                      {c.entry.group ? ` (${c.entry.group})` : ''}
                      {c.entry.kind !== 'lecture' ? ` · ${c.entry.kind}` : ''}
                    </span>
                  </p>
                  {room && (
                    <p className="mt-1 flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <MapPin className="h-4 w-4" /> {room.name}
                      </span>
                      <RoomFacts data={data} room={room} />
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Search className="h-5 w-5 text-indigo-600" /> Find a room
        </h2>
        <SpaceFinder
          key={teacherId}
          data={data}
          bookings={data.bookings ?? []}
          eventTypes={STAFF_EVENT_TYPES}
          initial={{ organizerName: teacher.name, eventType: 'Extra Class', attendance: 60, start: '16:30' }}
          actionFor={actionFor}
          onAction={onAction}
          intro={<p className="text-sm text-slate-600">Your department's rooms are booked straight away; shared and other departments' rooms are sent to the administrator as requests.</p>}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-bold">My bookings</h2>
          {bookings.length === 0 ? (
            <EmptyState>No upcoming bookings.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {bookings.map((b) => (
                <li key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{b.title}</p>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Confirmed</span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {formatDate(b.date)}, {timeRange(b)} · {data.rooms.find((r) => r.id === b.roomId)?.name ?? '?'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-bold">My requests</h2>
          <RequestsList data={data} requests={requests} onWithdraw={college.withdrawRequest} empty="No requests: shared and other departments' rooms you ask for appear here." />
        </div>
      </section>
    </div>
  )
}
