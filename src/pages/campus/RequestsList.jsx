import { CalendarClock, MapPin, Users } from 'lucide-react'
import { Button, EmptyState } from '../../components/ui.jsx'
import { formatDate, timeRange } from '../../booking.js'
import { REQUEST_STATUS, isPast, sortRequests } from '../../campusGuide.js'

const TONES = {
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-800',
  slate: 'bg-slate-200 text-slate-700',
}

export function StatusChip({ status }) {
  const s = REQUEST_STATUS[status] ?? REQUEST_STATUS.pending
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[s.tone]}`}>{s.label}</span>
}

/** One request: what, where, when, its status and (when decided) the administrator's note. */
export function RequestSummary({ data, request: r, showRequester = false, children }) {
  const room = data.rooms.find((x) => x.id === r.roomId)
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{r.title}</p>
          <p className="text-sm text-slate-500">
            {r.eventType}
            {showRequester && r.requester ? ` · requested by ${r.requester.name} (${r.requester.role})` : ''}
            {r.department ? ` · ${r.department}` : ''}
          </p>
        </div>
        <StatusChip status={r.status === 'pending' && isPast(r) ? 'withdrawn' : r.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-4 w-4" /> {formatDate(r.date)}, {timeRange(r)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-4 w-4" /> {room?.name ?? 'Room no longer exists'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-4 w-4" /> {r.attendance}
        </span>
      </div>
      {r.status === 'pending' && isPast(r) && <p className="mt-2 text-sm text-slate-500">The time has passed without a decision.</p>}
      {r.decisionNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Administrator: {r.decisionNote}</p>}
      {children}
    </li>
  )
}

/** A person's own requests, newest decisions after the ones still waiting; pending ones can be withdrawn. */
export default function RequestsList({ data, requests, onWithdraw, empty = 'No requests yet.' }) {
  if (!requests.length) return <EmptyState>{empty}</EmptyState>
  return (
    <ul className="space-y-2">
      {sortRequests(requests).map((r) => (
        <RequestSummary key={r.id} data={data} request={r}>
          {onWithdraw && r.status === 'pending' && !isPast(r) && (
            <Button variant="ghost" className="mt-2 -ml-2" onClick={() => onWithdraw(r.id)}>
              Withdraw request
            </Button>
          )}
        </RequestSummary>
      ))}
    </ul>
  )
}
