import { useState } from 'react'
import { AlertTriangle, CalendarClock, MapPin, Receipt, UserRound, UsersRound } from 'lucide-react'
import { checkRoom, timeRange, upcomingBookings } from '../../booking.js'
import { Button, EmptyState } from '../../components/ui.jsx'
import BookingReceipt from './BookingReceipt.jsx'

function BookingCard({ booking, data, canCancel, onCancel }) {
  const [open, setOpen] = useState(false)
  const room = data.rooms.find((r) => r.id === booking.roomId)
  const d = new Date(`${booking.date}T00:00:00`)
  const cancelled = booking.status === 'cancelled'
  // A regenerated timetable may have put a class in this room at this time.
  const classClash =
    !cancelled && room ? checkRoom(data, [], room, { ...booking, attendance: 0, facilities: [], roomType: 'any' }).reasons.find((r) => r.kind === 'class') : null

  return (
    <li className="space-y-3">
      <div className={`flex flex-wrap items-stretch gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${cancelled ? 'opacity-60' : ''}`}>
        <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-indigo-50 py-2 text-center text-indigo-700">
          <div>
            <div className="text-xs font-semibold uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
            <div className="text-2xl font-extrabold leading-none">{d.getDate()}</div>
            <div className="text-xs">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
          </div>
        </div>
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{booking.title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{booking.eventType}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                cancelled ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {cancelled ? 'Cancelled' : 'Confirmed'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> {timeRange(booking)}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {room?.name ?? 'Room removed'}</span>
            <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" /> {booking.organizerName}</span>
            <span className="inline-flex items-center gap-1.5"><UsersRound className="h-4 w-4" /> {booking.attendance}</span>
            <span className="font-mono text-slate-400">{booking.id}</span>
          </div>
          {classClash && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The current timetable now has a class here: {classClash.text}. Rebook or move the class.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setOpen(!open)}>
            <Receipt className="h-4 w-4" /> {open ? 'Hide' : 'Receipt'}
          </Button>
          {canCancel(booking) && !cancelled && (
            <Button
              variant="danger"
              onClick={() =>
                window.confirm(`Cancel "${booking.title}" on ${booking.date} (${timeRange(booking)})? The room will be released.`) &&
                onCancel(booking.id)
              }
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
      {open && <BookingReceipt booking={booking} data={data} />}
    </li>
  )
}

/** Upcoming bookings first; past and cancelled ones tucked away below. */
export default function BookingsList({ data, bookings, canCancel, onCancel, onAddSamples, title }) {
  const upcoming = upcomingBookings(bookings)
  const upcomingIds = new Set(upcoming.map((b) => b.id))
  const rest = bookings
    .filter((b) => !upcomingIds.has(b.id))
    .sort((a, b) => `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-slate-500">{upcoming.length} upcoming</p>
        </div>
        {onAddSamples && (
          <Button variant="secondary" onClick={onAddSamples}>
            Add sample bookings
          </Button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <EmptyState>No upcoming bookings. Use "Book a space" to reserve a room for an event.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((b) => (
            <BookingCard key={b.id} booking={b} data={data} canCancel={canCancel} onCancel={onCancel} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-medium text-slate-600">Past and cancelled ({rest.length})</summary>
          <ul className="mt-3 space-y-3">
            {rest.map((b) => (
              <BookingCard key={b.id} booking={b} data={data} canCancel={() => false} onCancel={onCancel} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
