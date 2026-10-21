import { ALL_DAYS, DEFAULT_TIME, periodTimes } from '../../data/schema.js'
import { Field } from '../../components/ui.jsx'
import { toNumber } from './listUtils.js'

export default function StepTime({ data, update }) {
  const time = { ...DEFAULT_TIME, ...data.time }
  const set = (changes) => update('time', { ...time, ...changes })
  const { periods, breakSlot } = periodTimes(time)

  const toggleDay = (day) => {
    const days = time.days.includes(day) ? time.days.filter((d) => d !== day) : [...time.days, day]
    set({ days: ALL_DAYS.filter((d) => days.includes(d)) })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-medium text-slate-600">Working days</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map((day) => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`rounded-lg border px-4 py-2 font-medium ${
                time.days.includes(day)
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Day starts at" type="time" value={time.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        <Field
          label="Period length (minutes)"
          type="number"
          min={10}
          max={180}
          value={time.periodMinutes}
          onChange={(e) => set({ periodMinutes: Math.min(180, toNumber(e.target.value, 10)) })}
        />
        <Field
          label="Periods per day"
          type="number"
          min={1}
          max={12}
          value={time.periodsPerDay}
          onChange={(e) => {
            const periodsPerDay = Math.min(12, toNumber(e.target.value, 1))
            set({ periodsPerDay, breakAfter: Math.min(time.breakAfter, periodsPerDay - 1) })
          }}
        />
        <Field
          label="Break after period (0 = no break)"
          type="number"
          min={0}
          max={time.periodsPerDay - 1}
          value={time.breakAfter}
          onChange={(e) => set({ breakAfter: Math.min(time.periodsPerDay - 1, toNumber(e.target.value)) })}
        />
        <Field
          label="Break length (minutes)"
          type="number"
          min={0}
          max={180}
          value={time.breakMinutes}
          onChange={(e) => set({ breakMinutes: Math.min(180, toNumber(e.target.value)) })}
        />
      </div>
      <div>
        <h3 className="mb-2 font-medium text-slate-600">One day at a glance</h3>
        <div className="flex flex-wrap gap-2">
          {periods.map((slot, p) => (
            <span key={p} className="contents">
              {breakSlot && p === time.breakAfter && (
                <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-amber-800">
                  Break · {breakSlot.label}
                </span>
              )}
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
                <b>P{p + 1}</b> · {slot.label}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-slate-500">
          {time.days.length} days × {time.periodsPerDay} periods = {time.days.length * time.periodsPerDay} periods per
          week. Labs never run across the break.
        </p>
      </div>
    </div>
  )
}
