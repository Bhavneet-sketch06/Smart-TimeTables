import { useState } from 'react'
import { departmentsOf } from '../data/schema.js'
import { Card, EmptyState, Select } from '../components/ui.jsx'
import TimetableGrid from '../components/TimetableGrid.jsx'
import SummaryPanel from '../components/SummaryPanel.jsx'

const TABS = [
  { id: 'section', label: 'By section', list: 'sections', key: 'sectionId' },
  { id: 'teacher', label: 'By teacher', list: 'teachers', key: 'teacherId' },
  { id: 'room', label: 'By room', list: 'rooms', key: 'roomId' },
]

/** Shows where the loaded data came from (e.g. the GNDEC source note). */
export function DataNote({ data }) {
  if (!data.meta) return null
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900">
      <span className="font-semibold">{data.meta.name}</span>
      {data.meta.note && <span className="text-indigo-700"> · {data.meta.note}</span>}
    </div>
  )
}

export function NoTimetable() {
  return <EmptyState>No timetable has been generated yet. The administrator can generate one from the setup wizard.</EmptyState>
}

/** Section / teacher / room views with a summary. `withDepartmentFilter` is used for the HOD view. */
export default function TimetableViews({ data, withDepartmentFilter = false }) {
  const [tab, setTab] = useState('section')
  const [dept, setDept] = useState('')
  const [selected, setSelected] = useState({})
  if (!data.timetable) return <NoTimetable />

  const current = TABS.find((t) => t.id === tab)
  const inDept = (x) => !dept || current.list === 'rooms' || x.department === dept
  const options = data[current.list].filter(inDept)
  const id = options.some((o) => o.id === selected[tab]) ? selected[tab] : options[0]?.id
  const entries = data.timetable.entries.filter((e) => e[current.key] === id)
  // Count distinct busy slots so lab groups running side by side aren't counted twice.
  const busy = new Set(entries.flatMap((e) => Array.from({ length: e.length }, (_, k) => `${e.day}|${e.period + k}`)))
  const periods = busy.size

  return (
    <div className="space-y-4">
      <DataNote data={data} />
      <SummaryPanel data={data} />
      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {withDepartmentFilter && (
            <Select
              label="Department"
              value={dept}
              options={[{ value: '', label: 'All departments' }].concat(departmentsOf(data))}
              onChange={(e) => setDept(e.target.value)}
            />
          )}
          <Select
            label={current.label.replace('By ', '').replace(/^./, (c) => c.toUpperCase())}
            value={id ?? ''}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(e) => setSelected({ ...selected, [tab]: e.target.value })}
            className="min-w-48"
          />
          <span className="pb-2 text-sm text-slate-500">{periods} periods / week</span>
        </div>
        {id ? <TimetableGrid data={data} entries={entries} mode={tab} /> : <EmptyState>Nothing to show.</EmptyState>}
      </Card>
    </div>
  )
}
