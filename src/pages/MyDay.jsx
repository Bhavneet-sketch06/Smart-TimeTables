import { useEffect, useState } from 'react'
import { CalendarCheck, CalendarDays, CircleCheck, Coffee, FlaskConical, MapPin, Moon, UserRound } from 'lucide-react'
import { DAY_NAMES, makeLookup } from '../components/TimetableGrid.jsx'
import { planDay, untilText } from '../myDay.js'
import { Button } from '../components/ui.jsx'

const TICK_MS = 30_000

/** Re-renders every 30 s so "now" and "next" move along during the day. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  return now
}

const longDay = (short) => DAY_NAMES[short] ?? short

function Details({ c, lk, light = false }) {
  const e = c.entry
  return (
    <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm ${light ? 'text-[#ffffff]/90' : 'text-slate-600'}`}>
      <span className="inline-flex items-center gap-1">
        <MapPin className="h-3.5 w-3.5" /> {lk.rooms.get(e.roomId)?.name ?? '?'}
      </span>
      <span className="inline-flex items-center gap-1">
        <UserRound className="h-3.5 w-3.5" /> {lk.teachers.get(e.teacherId)?.name ?? '?'}
      </span>
    </div>
  )
}

function LabChip({ e, className = '' }) {
  if (e.kind !== 'lab') return null
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${className}`}>
      <FlaskConical className="h-3 w-3" /> Lab{e.group ? ` ${e.group}` : ''}
    </span>
  )
}

/** The class on now (or next), in a prominent card. Lab groups running side by side are shown together. */
function Highlight({ plan, lk }) {
  const now = plan.highlight[0].status === 'now'
  const c0 = plan.highlight[0]
  return (
    <section className="rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] p-4 text-[#ffffff] shadow-md sm:p-5">
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-[#ffffff]/85">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffffff]/20 px-2.5 py-0.5 font-semibold text-[#ffffff]">
          {now && <span className="h-2 w-2 animate-pulse rounded-full bg-[#4ade80]" />}
          {now ? 'Happening now' : 'Up next'}
        </span>
        <span>
          {now ? `ends in ${untilText(plan.minutes, c0.endMin)}` : `starts in ${untilText(plan.minutes, c0.startMin)}`}
        </span>
      </div>
      {plan.highlight.map((c) => (
        <div key={`${c.entry.subjectId}-${c.entry.group ?? ''}`} className="mt-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xl font-bold leading-snug">{lk.subjects.get(c.entry.subjectId)?.name ?? '?'}</h3>
            <LabChip e={c.entry} className="bg-[#ffffff]/25 text-[#ffffff]" />
          </div>
          <p className="font-semibold text-[#ffffff]/90">
            {c.start} – {c.end}
          </p>
          <Details c={c} lk={lk} light />
        </div>
      ))}
    </section>
  )
}

function ClassRow({ c, lk }) {
  const e = c.entry
  const color = lk.color(e.subjectId)
  const ring = c.status === 'now' || c.status === 'next' ? 'ring-2 ring-indigo-500' : ''
  return (
    <li className={`flex gap-3 ${c.status === 'done' ? 'opacity-55' : ''}`}>
      <div className="w-14 shrink-0 pt-2 text-right text-sm leading-tight">
        <div className="font-semibold text-slate-800">{c.start}</div>
        <div className="text-slate-400">{c.end}</div>
      </div>
      <div className={`relative min-w-0 flex-1 overflow-hidden rounded-xl border py-2 pl-3.5 pr-2.5 ${color.card} ${ring}`}>
        <span className={`absolute inset-y-0 left-0 w-1.5 ${color.bar}`} />
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-snug">{lk.subjects.get(e.subjectId)?.name ?? '?'}</span>
          <span className="flex shrink-0 items-center gap-1">
            <LabChip e={e} className={color.chip} />
            {c.status === 'done' && <CircleCheck className="h-4 w-4 text-slate-500" aria-label="Finished" />}
            {c.status === 'now' && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">Now</span>}
            {c.status === 'next' && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">Next</span>}
          </span>
        </div>
        <Details c={c} lk={lk} />
      </div>
    </li>
  )
}

function BreakRow({ slot, on }) {
  return (
    <li className="flex items-center gap-3">
      <div className="w-14 shrink-0 text-right text-sm text-slate-400">{slot.start}</div>
      <div
        className={`flex flex-1 items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-sm ${
          on ? 'border-amber-300 bg-amber-50 font-semibold text-amber-800' : 'border-slate-300 text-slate-500'
        }`}
      >
        <Coffee className="h-4 w-4" /> {on ? 'Break now' : 'Break'} · {slot.label.replace(' - ', ' – ')}
      </div>
    </li>
  )
}

/** Friendly message when there is nothing (more) today, with the next class to look forward to. */
function Empty({ plan, lk, sectionName, onWeek }) {
  const { Icon, title, text } = {
    off: {
      Icon: Moon,
      title: `No classes today: it's ${longDay(plan.dayName)}`,
      text: 'Today is not a teaching day in this timetable. Enjoy the day off!',
    },
    free: {
      Icon: CalendarCheck,
      title: 'No classes scheduled today',
      text: `${sectionName} has a free ${longDay(plan.dayName)}.`,
    },
    finished: {
      Icon: CircleCheck,
      title: "You're done for today",
      text: `That was the last class of the day for ${sectionName}.`,
    },
  }[plan.state]
  const next = plan.upcoming
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
      <Icon className="mx-auto h-9 w-9 text-indigo-500" />
      <h3 className="mt-2 text-lg font-bold text-slate-900">{title}</h3>
      <p className="text-slate-500">{text}</p>
      {next && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Next class: <b>{next.inDays === 1 ? 'tomorrow' : longDay(next.dayName)}</b> at <b>{next.first.start}</b>,{' '}
          {lk.subjects.get(next.first.entry.subjectId)?.name ?? '?'}
          {next.first.entry.group ? ` (lab ${next.first.entry.group})` : ''} in {lk.rooms.get(next.first.entry.roomId)?.name ?? '?'}
        </p>
      )}
      <Button variant="secondary" className="mt-3" onClick={onWeek}>
        <CalendarDays className="h-4 w-4" /> See the full week
      </Button>
    </section>
  )
}

/** A student's day at a glance: today's classes in order, with the current or next class highlighted. */
export default function MyDay({ data, entries, sectionName, groupHint, onWeek }) {
  const now = useNow()
  const plan = planDay(data, entries, now)
  const lk = makeLookup(data)
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  // Show the break between the classes that come before and after it.
  const breakAt = plan.breakSlot && plan.classes.findIndex((c) => c.start >= plan.breakSlot.end)
  const showBreak = breakAt > 0

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{date}</h2>
        <span className="text-slate-500">{sectionName}</span>
      </div>
      {groupHint && <p className="text-sm text-slate-500">{groupHint}</p>}

      {plan.state === 'active' ? (
        <>
          {plan.onBreak && plan.highlight[0].status === 'next' && (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
              <Coffee className="h-4 w-4" /> Break until {plan.breakSlot.end}
            </p>
          )}
          <Highlight plan={plan} lk={lk} />
        </>
      ) : (
        <Empty plan={plan} lk={lk} sectionName={sectionName} onWeek={onWeek} />
      )}

      {plan.classes.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-slate-700">
            Today's classes <span className="font-normal text-slate-400">({plan.classes.length})</span>
          </h3>
          <ol className="space-y-2">
            {plan.classes.map((c, i) => (
              <ClassRowWithBreak
                key={`${c.entry.subjectId}-${c.entry.period}-${c.entry.group ?? ''}`}
                c={c}
                lk={lk}
                breakSlot={showBreak && i === breakAt ? plan.breakSlot : null}
                onBreak={plan.onBreak}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function ClassRowWithBreak({ c, lk, breakSlot, onBreak }) {
  return (
    <>
      {breakSlot && <BreakRow slot={breakSlot} on={onBreak} />}
      <ClassRow c={c} lk={lk} />
    </>
  )
}
