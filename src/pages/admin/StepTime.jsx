import { ALL_DAYS } from '../../data/schema.js'
import { Field } from '../../components/ui.jsx'
import { toNumber } from './listUtils.js'

export default function StepTime({ data, update }) {
  const { time } = data
  const set = (changes) => update('time', { ...time, ...changes })

  const toggleDay = (day) => {
    const days = time.days.includes(day) ? time.days.filter((d) => d !== day) : [...time.days, day]
    set({ days: ALL_DAYS.filter((d) => days.includes(d)) })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Working days</h3>
        <div className="flex flex-wrap gap-2">
          {ALL_DAYS.map((day) => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
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
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-600">Preview of one day</h3>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: time.periodsPerDay }, (_, p) => (
            <span key={p} className="contents">
              <span className="rounded bg-slate-100 px-2 py-1 text-xs">P{p + 1}</span>
              {time.breakAfter === p + 1 && p + 1 < time.periodsPerDay && (
                <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Break</span>
              )}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {time.days.length} days × {time.periodsPerDay} periods = {time.days.length * time.periodsPerDay} periods per
          week. Labs never run across the break.
        </p>
      </div>
    </div>
  )
}
