import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarPlus, Check, Clock, Info, MapPin, UsersRound } from 'lucide-react'
import {
  EVENT_TYPES,
  ROOM_TYPE_LABELS,
  createBooking,
  findSpaces,
  formatDate,
  isoDate,
  nextWorkingDay,
  suggestAlternatives,
  timeRange,
  toHHMM,
  validateRequest,
  weekdayOf,
  windowOf,
} from '../../booking.js'
import { departmentsOf, periodTimes } from '../../data/schema.js'
import { deptById } from '../../data/departments.js'
import { Button, Card, Field, Select } from '../../components/ui.jsx'
import BookingReceipt from './BookingReceipt.jsx'
import { DAY_NAMES } from '../../components/TimetableGrid.jsx'

const STEPS = ['Event details', 'Date & time', 'Choose a space', 'Review']
const DURATIONS = [30, 60, 90, 120, 180, 240, 300]
const BUFFERS = [0, 15, 30, 45, 60]
const minutesLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`)

function initialRequest(data, teacher, deptId) {
  const dept = deptById(data, deptId) ?? deptById(data, teacher?.deptId)
  return {
    eventType: 'Workshop',
    title: '',
    organizerId: teacher?.id ?? '',
    organizerName: teacher?.name ?? '',
    department: dept?.short ?? teacher?.department ?? departmentsOf(data)[0] ?? '',
    deptId: dept?.id ?? null,
    attendance: 30,
    notes: '',
    facilities: [],
    roomType: 'any',
    date: nextWorkingDay(data),
    start: '10:00',
    duration: 60,
    setup: 0,
    cleanup: 0,
  }
}

function Problems({ items, tone = 'red' }) {
  if (!items?.length) return null
  const styles = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
  return (
    <div className={`flex gap-2 rounded-xl border px-4 py-3 ${styles}`}>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <ul className="space-y-0.5">
        {items.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-300'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Book a room for a one-off event. `organizer` is the signed-in faculty member when known (pre-fills the form);
 * `createdBy` is stored on the booking so "My bookings" can find it.
 */
export default function BookSpace({ college, organizer, createdBy, deptId, onViewBookings }) {
  const { data, bookSpace } = college
  const [req, setReq] = useState(() => initialRequest(data, organizer, deptId))
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState([])
  const [roomId, setRoomId] = useState('')
  const [conflict, setConflict] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const set = (changes) => setReq((r) => ({ ...r, ...changes }))

  const teachers = useMemo(() => [...data.teachers].sort((a, b) => a.name.localeCompare(b.name)), [data.teachers])
  const departments = departmentsOf(data)
  const allFacilities = [...new Set(data.rooms.flatMap((r) => r.facilities || []))].sort()
  const bookings = data.bookings ?? []

  const search = useMemo(() => (step >= 2 ? findSpaces(data, bookings, req) : null), [step, data, bookings, req])
  const alternatives = useMemo(
    () => (search && search.available.length === 0 ? suggestAlternatives(data, bookings, req) : null),
    [search, data, bookings, req],
  )
  const room = data.rooms.find((r) => r.id === roomId)
  const held = req.start && Number(req.duration) > 0 ? windowOf(req) : null

  const goNext = () => {
    const v = validateRequest(req)
    const stepErrors = step === 0 ? v.details : step === 1 ? v.schedule : []
    if (step === 2 && !search.available.some((r) => r.room.id === roomId)) {
      setErrors(['Select one of the available spaces to continue.'])
      return
    }
    setErrors(stepErrors)
    if (!stepErrors.length) setStep(step + 1)
  }

  const confirm = () => {
    const v = validateRequest(req)
    if (v.details.length || v.schedule.length) {
      setErrors([...v.details, ...v.schedule])
      return
    }
    const booking = createBooking(req, room, createdBy)
    // Re-checks against the latest saved bookings, so two people can't take the same room and time.
    const result = bookSpace(booking)
    if (!result.ok) {
      setConflict(`${room.name} is no longer free: ${result.reasons[0].text}. Please choose another space or time.`)
      setRoomId('')
      setStep(2)
      return
    }
    setConfirmed(booking)
  }

  const reset = () => {
    setReq(initialRequest(data, organizer, deptId))
    setStep(0)
    setRoomId('')
    setErrors([])
    setConflict('')
    setConfirmed(null)
  }

  // ---------- confirmation ----------
  if (confirmed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BookingReceipt booking={confirmed} data={data} />
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button onClick={reset}>
            <CalendarPlus className="h-4 w-4" /> Book another space
          </Button>
          {onViewBookings && (
            <Button variant="secondary" onClick={onViewBookings}>
              View my bookings
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ---------- day context for step 2 ----------
  const weekday = req.date ? weekdayOf(req.date) : ''
  const teaches = data.time.days.includes(weekday)
  const { periods } = periodTimes(data.time)
  const dayNote = !req.date
    ? ''
    : teaches
      ? `Regular classes run ${periods[0]?.start}–${periods.at(-1)?.end} on ${DAY_NAMES[weekday] ?? weekday}s; rooms busy with a class are left out.`
      : `No regular classes on ${DAY_NAMES[weekday] ?? weekday}s, so only other bookings are checked.`

  return (
    <div className="mx-auto max-w-5xl space-y-4 print:hidden">
      <div>
        <h2 className="text-2xl font-bold">Book a space</h2>
        <p className="text-slate-500">
          Reserve a room for a workshop, seminar, guest lecture, meeting or extra class. Only rooms free for the whole
          time are offered.
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((title, i) => (
          <li
            key={title}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
              i === step
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : i < step
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white' : 'bg-slate-100'
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {title}
          </li>
        ))}
      </ol>

      <Card className="space-y-5 p-5">
        {/* ---------- Step 1: event details ---------- */}
        {step === 0 && (
          <>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-600">Event type</div>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => (
                  <Chip key={t} active={req.eventType === t} onClick={() => set({ eventType: t })}>
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
            <Field
              label="Event / session name"
              value={req.title}
              placeholder="e.g. Hands-on Python Workshop"
              maxLength={120}
              onChange={(e) => set({ title: e.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Organizer"
                value={req.organizerId || (req.organizerName ? '__other' : '')}
                options={[{ value: '', label: 'Choose organizer…' }]
                  .concat(teachers.map((t) => ({ value: t.id, label: t.name })))
                  .concat([{ value: '__other', label: 'Someone else…' }])}
                onChange={(e) => {
                  const t = teachers.find((x) => x.id === e.target.value)
                  if (t) set({ organizerId: t.id, organizerName: t.name })
                  else set({ organizerId: '', organizerName: e.target.value === '__other' ? ' ' : '' })
                }}
              />
              <Select
                label="Department"
                value={req.department}
                options={[...new Set([req.department, ...departments])].filter(Boolean)}
                onChange={(e) => set({ department: e.target.value, deptId: (data.departments ?? []).find((d) => d.short === e.target.value)?.id ?? null })}
              />
              <Field
                label="Expected attendance"
                type="number"
                min={1}
                value={req.attendance}
                onChange={(e) => set({ attendance: e.target.value })}
              />
            </div>
            {!req.organizerId && req.organizerName !== '' && (
              <Field
                label="Organizer name"
                value={req.organizerName.trimStart()}
                placeholder="Full name"
                onChange={(e) => set({ organizerName: e.target.value || ' ' })}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Select
                label="Room type"
                value={req.roomType}
                options={[{ value: 'any', label: 'Any room type' }].concat(
                  Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => ({ value, label })),
                )}
                onChange={(e) => set({ roomType: e.target.value })}
              />
              {allFacilities.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-medium text-slate-600">Equipment needed</div>
                  <div className="flex flex-wrap gap-2">
                    {allFacilities.map((f) => {
                      const on = req.facilities.includes(f)
                      return (
                        <Chip
                          key={f}
                          active={on}
                          onClick={() => set({ facilities: on ? req.facilities.filter((x) => x !== f) : [...req.facilities, f] })}
                        >
                          {f}
                        </Chip>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Notes (optional)</span>
              <textarea
                rows={2}
                maxLength={500}
                value={req.notes}
                placeholder="Purpose, seating, anything the room should have…"
                onChange={(e) => set({ notes: e.target.value })}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus:border-indigo-500 focus:outline-none"
              />
            </label>
          </>
        )}

        {/* ---------- Step 2: date and time ---------- */}
        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date" type="date" value={req.date} min={isoDate(new Date())} onChange={(e) => set({ date: e.target.value })} />
              <Field label="Start time" type="time" step={300} value={req.start} onChange={(e) => set({ start: e.target.value })} />
              <Select
                label="Duration"
                value={String(req.duration)}
                options={[...new Set([...DURATIONS, Number(req.duration)])].sort((a, b) => a - b).map((m) => ({ value: String(m), label: minutesLabel(m) }))}
                onChange={(e) => set({ duration: Number(e.target.value) })}
              />
              <Select
                label="Setup time before"
                value={String(req.setup)}
                options={BUFFERS.map((m) => ({ value: String(m), label: m ? minutesLabel(m) : 'None' }))}
                onChange={(e) => set({ setup: Number(e.target.value) })}
              />
              <Select
                label="Cleanup time after"
                value={String(req.cleanup)}
                options={BUFFERS.map((m) => ({ value: String(m), label: m ? minutesLabel(m) : 'None' }))}
                onChange={(e) => set({ cleanup: Number(e.target.value) })}
              />
            </div>
            {held && req.date && (
              <div className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-indigo-900">
                <Clock className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="font-semibold">
                    {formatDate(req.date)}, {timeRange(req)}
                  </div>
                  <div className="text-sm">
                    {req.setup || req.cleanup
                      ? `The room will be held ${toHHMM(held.from)}–${toHHMM(held.to)} including setup and cleanup. `
                      : ''}
                    {dayNote}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------- Step 3: choose a space ---------- */}
        {step === 2 && search && (
          <>
            <Problems items={conflict ? [conflict] : []} />
            {!data.timetable && (
              <Problems
                tone="amber"
                items={['No timetable has been generated yet, so regular classes are not being checked — only other bookings.']}
              />
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">
                {search.available.length} space{search.available.length === 1 ? '' : 's'} available
              </h3>
              <span className="text-slate-500">
                {formatDate(req.date)} · {timeRange(req)} · {req.attendance} people
              </span>
            </div>

            {search.available.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {search.available.map(({ room: r }) => {
                  const selected = r.id === roomId
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRoomId(r.id)}
                      aria-pressed={selected}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        selected ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-sm text-slate-500">{ROOM_TYPE_LABELS[r.type] ?? r.type}</div>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          <Check className="h-3 w-3" /> Available
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
                        <UsersRound className="h-4 w-4" /> {r.capacity} seats
                        {r.eventsOnly && <span className="ml-1 rounded bg-violet-100 px-1.5 text-xs font-semibold text-violet-700">Events hall</span>}
                      </div>
                      {r.facilities?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.facilities.map((f) => (
                            <span key={f} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                      {selected && <div className="mt-3 text-sm font-semibold text-indigo-700">Selected</div>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <Problems
                  tone="amber"
                  items={[alternatives?.reason || 'Every suitable space is taken for this time (see the reasons below).']}
                />
                {alternatives?.slots.length > 0 && (
                  <div>
                    <div className="mb-2 font-medium text-slate-700">Free at these nearby times — tap one to use it:</div>
                    <div className="flex flex-wrap gap-2">
                      {alternatives.slots.map((s) => (
                        <button
                          key={`${s.date}${s.start}`}
                          type="button"
                          onClick={() => {
                            set({ date: s.date, start: s.start })
                            setRoomId('')
                            setConflict('')
                          }}
                          className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm hover:bg-indigo-100"
                        >
                          <div className="font-semibold text-indigo-800">
                            {s.date === req.date ? 'Same day' : new Date(`${s.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                            · {timeRange({ ...req, start: s.start })}
                          </div>
                          <div className="text-indigo-600">
                            {s.rooms} space{s.rooms === 1 ? '' : 's'} free
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {search.unavailable.length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <summary className="cursor-pointer font-medium text-slate-600">
                  Why other spaces aren't shown ({search.unavailable.length})
                </summary>
                <ul className="mt-2 divide-y divide-slate-200">
                  {search.unavailable.map(({ room: r, reasons }) => (
                    <li key={r.id} className="flex flex-wrap gap-x-3 py-2 text-sm">
                      <span className="w-40 shrink-0 font-medium text-slate-700">
                        {r.name} <span className="font-normal text-slate-400">· {r.capacity}</span>
                      </span>
                      <span className="flex-1 text-slate-500">{reasons.map((x) => x.text).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {/* ---------- Step 4: review ---------- */}
        {step === 3 && room && (
          <div className="space-y-4">
            <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
              Bookings are confirmed immediately. Check the details, then confirm.
            </div>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {[
                ['Event', `${req.title} (${req.eventType})`],
                ['Organizer', `${req.organizerName.trim()}${req.department ? ` · ${req.department}` : ''}`],
                ['Date', formatDate(req.date)],
                [
                  'Time',
                  `${timeRange(req)}${req.setup || req.cleanup ? ` (room held ${toHHMM(held.from)}–${toHHMM(held.to)})` : ''}`,
                ],
                ['Room', `${room.name} · ${ROOM_TYPE_LABELS[room.type] ?? room.type} · ${room.capacity} seats`],
                ['Attendance', `${req.attendance} people`],
                ...(req.facilities.length ? [['Equipment', req.facilities.join(', ')]] : []),
                ...(req.notes.trim() ? [['Notes', req.notes.trim()]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <Problems items={errors} />

        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
          <Button
            variant="secondary"
            disabled={step === 0}
            onClick={() => {
              setErrors([])
              setStep(step - 1)
            }}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={goNext} disabled={step === 2 && !roomId}>
              {step === 2 ? 'Review booking' : 'Next'} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={confirm}>
              <MapPin className="h-4 w-4" /> Confirm booking
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
