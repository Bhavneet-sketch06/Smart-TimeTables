import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ALL_DAYS, DAY_NAMES, blockedOf, breaksOf, openPeriodsOf, periodTimes, periodsOn, slotKey, withDefaults } from '../../data/schema.js'
import { Button, Field, Select } from '../../components/ui.jsx'
import { toNumber } from './listUtils.js'

const MAX_PERIODS = 14
// The week in the college's order, e.g. Sun..Sat for a Sunday-to-Thursday week.
const weekFrom = (start) => {
  const i = Math.max(0, ALL_DAYS.indexOf(start))
  return [...ALL_DAYS.slice(i), ...ALL_DAYS.slice(0, i)]
}

function Section({ title, hint, children }) {
  return (
    <div>
      <h3 className="font-medium text-slate-700">{title}</h3>
      {hint && <p className="mb-2 text-sm text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}

/** Working days, the shape of a day (periods and breaks), shorter days and college-wide blocked slots. */
export default function StepTime({ data, update }) {
  const time = withDefaults(data.time)
  const breaks = breaksOf(time)
  const blocked = blockedOf(time)
  const set = (changes) => update('time', { ...time, breaks, ...changes })
  const { periods, breaks: breakTimes } = periodTimes(time)
  const week = weekFrom(time.weekStart ?? time.days[0] ?? 'Mon')
  const [reason, setReason] = useState('Assembly')

  const toggleDay = (day) => {
    const days = time.days.includes(day) ? time.days.filter((d) => d !== day) : [...time.days, day]
    set({ days: week.filter((d) => days.includes(d)) })
  }
  const setWeekStart = (weekStart) => set({ weekStart, days: weekFrom(weekStart).filter((d) => time.days.includes(d)) })
  const setPeriods = (n) => {
    const periodsPerDay = Math.min(MAX_PERIODS, toNumber(n, 1))
    const dayPeriods = Object.fromEntries(Object.entries(time.dayPeriods ?? {}).filter(([, v]) => v < periodsPerDay))
    set({ periodsPerDay, dayPeriods, breaks: breaks.filter((b) => b.after < periodsPerDay) })
  }
  const setBreak = (i, changes) => set({ breaks: breaks.map((b, j) => (j === i ? { ...b, ...changes } : b)) })
  const addBreak = () => {
    const free = Array.from({ length: time.periodsPerDay - 1 }, (_, i) => i + 1).find((p) => !breaks.some((b) => b.after === p))
    if (free) set({ breaks: [...breaks, { after: free, minutes: 15, label: 'Short break' }] })
  }
  const setDayPeriods = (day, n) => {
    const { [day]: _, ...rest } = time.dayPeriods ?? {}
    const v = Math.min(time.periodsPerDay, toNumber(n, 0))
    set({ dayPeriods: v < time.periodsPerDay ? { ...rest, [day]: v } : rest })
  }
  const toggleBlocked = (key) => {
    const { [key]: was, ...rest } = blocked
    set({ blocked: was !== undefined ? rest : { ...blocked, [key]: reason.trim() } })
  }

  const openPeriods = openPeriodsOf(time)
  const breakAfterOptions = Array.from({ length: time.periodsPerDay - 1 }, (_, i) => ({ value: i + 1, label: `After period ${i + 1}` }))

  return (
    <div className="space-y-7">
      <Section title="Working days" hint="Any days of the week, including weekends. Days with no classes are simply left off.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {week.map((day) => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`rounded-lg border px-4 py-2 font-medium ${
                  time.days.includes(day) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <Select
            label="Week starts on"
            value={week[0]}
            options={['Mon', 'Sun', 'Sat'].map((d) => ({ value: d, label: DAY_NAMES[d] }))}
            onChange={(e) => setWeekStart(e.target.value)}
          />
        </div>
      </Section>

      <Section title="The day">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Day starts at" type="time" value={time.startTime} onChange={(e) => set({ startTime: e.target.value })} />
          <Field
            label="Period length (minutes)"
            type="number"
            min={10}
            max={240}
            value={time.periodMinutes}
            onChange={(e) => set({ periodMinutes: Math.min(240, toNumber(e.target.value, 10)) })}
          />
          <Field label="Periods per day (longest day)" type="number" min={1} max={MAX_PERIODS} value={time.periodsPerDay} onChange={(e) => setPeriods(e.target.value)} />
        </div>
      </Section>

      <Section title="Breaks" hint="As many as the day has (tea, lunch, prayer...). Labs and double periods never run across a break.">
        <div className="space-y-2">
          {breaks.map((b, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <Select
                label="Position"
                value={b.after}
                options={breakAfterOptions.filter((o) => o.value === b.after || !breaks.some((x) => x.after === o.value))}
                onChange={(e) => setBreak(i, { after: Number(e.target.value) })}
              />
              <Field label="Minutes" type="number" min={0} max={240} value={b.minutes} onChange={(e) => setBreak(i, { minutes: Math.min(240, toNumber(e.target.value)) })} />
              <Field label="Name" value={b.label} onChange={(e) => setBreak(i, { label: e.target.value })} className="col-span-2 sm:col-span-1" />
              <Button variant="ghost" onClick={() => set({ breaks: breaks.filter((_, j) => j !== i) })} aria-label="Remove break">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {breaks.length === 0 && <p className="text-sm text-slate-500">No breaks: the day runs straight through.</p>}
          {breaks.length < time.periodsPerDay - 1 && (
            <Button variant="secondary" onClick={addBreak}>
              <Plus className="h-4 w-4" /> Add break
            </Button>
          )}
        </div>
      </Section>

      <Section title="Shorter days" hint="Periods taught on each day, e.g. 4 for a Saturday half day.">
        <div className="flex flex-wrap gap-2">
          {time.days.map((day) => (
            <Field
              key={day}
              label={day}
              type="number"
              min={0}
              max={time.periodsPerDay}
              value={periodsOn(time, day)}
              onChange={(e) => setDayPeriods(day, e.target.value)}
              className="w-20"
            />
          ))}
        </div>
      </Section>

      <Section
        title="No-class slots"
        hint="Periods kept free for everyone, such as an assembly, sports or a club hour. Type a reason, then click slots to block or free them."
      >
        <Field label="Reason for new blocked slots" value={reason} onChange={(e) => setReason(e.target.value)} className="mb-2 max-w-xs" />
        <div className="overflow-x-auto">
          <table className="text-xs">
            <tbody>
              {time.days.map((day) => (
                <tr key={day}>
                  <th className="pr-2 text-left font-medium text-slate-500">{day}</th>
                  {Array.from({ length: time.periodsPerDay }, (_, p) => {
                    const key = slotKey(day, p)
                    const off = p >= periodsOn(time, day)
                    const why = blocked[key]
                    return (
                      <td key={p} className="p-0.5">
                        <button
                          disabled={off}
                          onClick={() => toggleBlocked(key)}
                          title={off ? 'After this day ends' : why !== undefined ? `Blocked: ${why || 'no classes'}` : 'Classes allowed'}
                          className={`h-8 w-12 truncate rounded px-0.5 ${
                            off ? 'bg-slate-100 text-slate-300' : why !== undefined ? 'bg-amber-400 font-semibold text-amber-950' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {why !== undefined ? why || 'Free' : `P${p + 1}`}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="One day at a glance">
        <div className="flex flex-wrap gap-2">
          {periods.map((slot, p) => (
            <span key={p} className="contents">
              {breakTimes
                .filter((b) => b.after === p)
                .map((b) => (
                  <span key={`b${p}`} className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-amber-800">
                    {b.name} · {b.label}
                  </span>
                ))}
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
                <b>P{p + 1}</b> · {slot.label}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-slate-500">
          {openPeriods} teaching periods per week across {time.days.length} day{time.days.length === 1 ? '' : 's'}.
        </p>
      </Section>
    </div>
  )
}
