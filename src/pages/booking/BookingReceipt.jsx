import { useRef } from 'react'
import { CheckCircle2, Printer, XCircle } from 'lucide-react'
import { formatDate, timeRange, toHHMM, windowOf } from '../../booking.js'
import { roomTypeName } from '../../data/schema.js'
import { Button } from '../../components/ui.jsx'

/** Prints only this element: everything else is hidden by the `printing-one` rules in index.css. */
function printOnly(el) {
  const root = document.documentElement
  el.setAttribute('data-print-target', '')
  root.classList.add('printing-one')
  const done = () => {
    root.classList.remove('printing-one')
    el.removeAttribute('data-print-target')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  )
}

/** Receipt-style summary of one booking, printable on its own. */
export default function BookingReceipt({ booking, data }) {
  const ref = useRef(null)
  const room = data.rooms.find((r) => r.id === booking.roomId)
  const w = windowOf(booking)
  const cancelled = booking.status === 'cancelled'
  const buffers = booking.setup || booking.cleanup

  return (
    <article ref={ref} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-slate-300 print:shadow-none">
      <header
        className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${
          cancelled ? 'bg-slate-100 text-slate-700' : 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900'
        }`}
      >
        <div className="flex items-center gap-3">
          {cancelled ? <XCircle className="h-8 w-8 text-slate-400" /> : <CheckCircle2 className="h-8 w-8 text-emerald-500" />}
          <div>
            <div className="text-lg font-bold">{cancelled ? 'Booking cancelled' : 'Booking confirmed'}</div>
            <div className="text-sm opacity-80">Smart TimeTables · Book a Space</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-70">Booking ID</div>
          <div className="font-mono text-xl font-bold tracking-wide">{booking.id}</div>
        </div>
      </header>

      <dl className="px-5 py-3">
        <Row label="Event">{booking.title}</Row>
        <Row label="Type">{booking.eventType}</Row>
        <Row label="Organizer">{booking.organizerName}</Row>
        <Row label="Department">{booking.department || '—'}</Row>
        <Row label="Date">{formatDate(booking.date)}</Row>
        <Row label="Time">
          {timeRange(booking)}
          {buffers ? (
            <span className="ml-2 font-normal text-slate-500">
              (room held {toHHMM(w.from)}–{toHHMM(w.to)} for setup and cleanup)
            </span>
          ) : null}
        </Row>
        <Row label="Room">
          {room ? `${room.name} · ${roomTypeName(data, room.type)} · ${room.capacity} seats` : 'Room no longer exists'}
        </Row>
        <Row label="Attendance">{booking.attendance} people</Row>
        {booking.facilities?.length > 0 && <Row label="Equipment">{booking.facilities.join(', ')}</Row>}
        {booking.notes && <Row label="Notes">{booking.notes}</Row>}
      </dl>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-500">
        <span>
          Booked {new Date(booking.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          {cancelled && booking.cancelledAt &&
            ` · cancelled ${new Date(booking.cancelledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`}
        </span>
        <Button variant="secondary" onClick={() => printOnly(ref.current)} className="print:hidden">
          <Printer className="h-4 w-4" /> Print receipt
        </Button>
      </footer>
    </article>
  )
}
