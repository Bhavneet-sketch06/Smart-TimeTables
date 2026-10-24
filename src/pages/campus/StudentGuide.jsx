import { useEffect, useState } from 'react'
import { Clock, FlaskConical, Info, MapPin, Sparkles } from 'lucide-react'
import { Card, EmptyState } from '../../components/ui.jsx'
import { ALL, sectionsOf } from '../../data/departments.js'
import { roomTypeName } from '../../data/schema.js'
import { planDay, untilText } from '../../myDay.js'
import { STUDENT_EVENT_TYPES, createRequest } from '../../campusGuide.js'
import { studentClientId } from '../../hooks/useCollegeData.js'
import { readPick } from '../StudentView.jsx'
import SpaceFinder from './SpaceFinder.jsx'
import RequestsList from './RequestsList.jsx'

const NAME_KEY = 'ttgen:studentName'
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/** The student's next class (today if any is left, else the next teaching day). */
function NextClass({ data, section, group }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!section) return <EmptyState>Choose your section on the My timetable tab to see your next class.</EmptyState>
  if (!data.timetable) return <EmptyState>There's no timetable yet. Your next class appears here once the administrator generates it.</EmptyState>
  const entries = data.timetable.entries.filter((e) => e.sectionId === section.id && (!group || !e.group || e.group === group))
  const plan = planDay(data, entries, now)
  const c = plan.highlight[0] ?? plan.upcoming?.first
  if (!c) return <EmptyState>No classes are scheduled for {section.name} this week.</EmptyState>
  const subject = data.subjects.find((s) => s.id === c.entry.subjectId)
  const room = data.rooms.find((r) => r.id === c.entry.roomId)
  const when = plan.highlight.length
    ? c.status === 'now'
      ? `Now, until ${c.end} (${untilText(plan.minutes, c.endMin)} left)`
      : `Today ${c.start}–${c.end} (in ${untilText(plan.minutes, c.startMin)})`
    : `${plan.upcoming.inDays === 1 ? 'Tomorrow' : plan.upcoming.dayName} ${c.start}–${c.end}`
  return (
    <Card className="flex flex-wrap items-center gap-4 border-indigo-200 bg-indigo-50/60">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white">
        <Clock className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-indigo-700">{plan.highlight[0]?.status === 'now' ? 'Class on now' : 'Your next class'}</p>
        <p className="text-lg font-bold text-slate-900">
          {subject?.name ?? 'Class'}
          {c.entry.kind !== 'lecture' && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 align-middle text-xs font-semibold text-indigo-700">
              <FlaskConical className="h-3 w-3" /> {c.entry.kind === 'lab' ? 'Lab' : 'Tutorial'}
              {c.entry.group ? ` ${c.entry.group}` : ''}
            </span>
          )}
        </p>
        <p className="flex flex-wrap gap-x-3 text-slate-600">
          <span>{when}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" /> {room?.name ?? '?'} {room ? `(${roomTypeName(data, room.type)})` : ''}
          </span>
        </p>
      </div>
    </Card>
  )
}

/** Student Campus Guide: next class, find a space for a student activity, and their own requests. */
export default function StudentGuide({ college, deptId = ALL }) {
  const { data, requestSpace, withdrawRequest } = college
  const pick = readPick()
  const sections = sectionsOf(data, deptId)
  const section = sections.find((s) => s.id === pick.section) ?? sections[0]
  const dept = (data.departments ?? []).find((d) => d.id === section?.deptId)
  const clientId = studentClientId()
  const mine = (data.requests ?? []).filter((r) => r.requester?.role === 'student' && r.requester.clientId === clientId)

  const onAction = (room, req) => {
    try {
      localStorage.setItem(NAME_KEY, req.organizerName.trim())
    } catch {
      // remembering the name is optional
    }
    requestSpace(
      createRequest({ ...req, department: dept?.short ?? '', deptId: dept?.id }, room, {
        role: 'student',
        name: req.organizerName.trim(),
        clientId,
        sectionId: section?.id,
        deptId: dept?.id,
      }),
    )
    return { ok: true, message: `Request sent for ${room.name}. It is not confirmed yet: you'll see "Confirmed" or "Declined" under My requests once the administrator decides.` }
  }

  return (
    <div className="space-y-6">
      <NextClass data={data} section={section} group={pick.group} />
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Sparkles className="h-5 w-5 text-indigo-600" /> Find a space for a student activity
        </h2>
        <SpaceFinder
          data={data}
          bookings={data.bookings ?? []}
          eventTypes={STUDENT_EVENT_TYPES}
          askName
          initial={{ organizerName: readName(), eventType: 'Interdepartmental event', attendance: 40 }}
          actionFor={() => ({ label: 'Request', kind: 'request' })}
          onAction={onAction}
          intro={
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              Shows rooms free for your whole time (classes and confirmed bookings checked). A request is not a booking: the room is
              yours only once the administrator confirms it.
            </p>
          }
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">My requests</h2>
        <RequestsList data={data} requests={mine} onWithdraw={withdrawRequest} empty="You haven't requested a space yet." />
      </section>
    </div>
  )
}
