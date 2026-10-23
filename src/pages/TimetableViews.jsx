import { useState } from 'react'
import { ROOM_TYPE_LABELS } from '../booking.js'
import { ALL, batchOf, deptById, sectionsOf, teachersOf } from '../data/departments.js'
import { Card, EmptyState, Select } from '../components/ui.jsx'
import TimetableSheet from '../components/TimetableSheet.jsx'
import SummaryPanel from '../components/SummaryPanel.jsx'
import DepartmentEmpty, { departmentNeedsAttention } from '../components/DepartmentEmpty.jsx'

const TABS = [
  { id: 'section', label: 'By section', key: 'sectionId' },
  { id: 'teacher', label: 'By teacher', key: 'teacherId' },
  { id: 'room', label: 'By room', key: 'roomId' },
]

/** Shows where the loaded data came from (e.g. the GNDEC source note). */
export function DataNote({ data }) {
  if (!data.meta) return null
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 print:hidden">
      <span className="font-semibold">{data.meta.name}</span>
      {data.meta.note && <span className="text-indigo-700"> · {data.meta.note}</span>}
    </div>
  )
}

export function NoTimetable() {
  return <EmptyState>No timetable has been generated yet. The administrator can generate one from the setup wizard.</EmptyState>
}

/**
 * Section / teacher / room views for the selected department. Sections and teachers are the department's;
 * rooms are college-wide (shared), so the room view shows every department's classes in that room.
 */
export default function TimetableViews({ data, deptId = ALL, canManage = false, onSetup, onGenerate, showSummary = true }) {
  const [tab, setTab] = useState('section')
  const [selected, setSelected] = useState({})
  if (departmentNeedsAttention(data, deptId)) {
    return <DepartmentEmpty data={data} deptId={deptId} canManage={canManage} onSetup={onSetup} onGenerate={onGenerate} />
  }

  const deptName = (id) => deptById(data, id)?.short
  const homeRank = (r) => (r.deptId === deptId ? 0 : r.deptId ? 2 : 1)
  const lists = {
    section: sectionsOf(data, deptId).map((s) => ({ ...s, label: `${s.name}${deptId === ALL ? ` · ${deptName(s.deptId)}` : ''}` })),
    teacher: [...teachersOf(data, deptId)]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ ...t, label: `${t.name} (${t.department || deptName(t.deptId) || 'no department'})` })),
    // Department's own rooms first, then shared rooms, then other departments' rooms.
    room: [...data.rooms]
      .sort((a, b) => homeRank(a) - homeRank(b) || a.name.localeCompare(b.name))
      .map((r) => ({ ...r, label: `${r.name} · ${r.deptId ? `${deptName(r.deptId)} room` : 'shared'}` })),
  }
  const current = TABS.find((t) => t.id === tab)
  const options = lists[tab]
  const id = options.some((o) => o.id === selected[`${deptId}:${tab}`]) ? selected[`${deptId}:${tab}`] : options[0]?.id
  const entries = data.timetable.entries.filter((e) => e[current.key] === id)
  // Count distinct busy slots so lab groups running side by side aren't counted twice.
  const busy = new Set(entries.flatMap((e) => Array.from({ length: e.length }, (_, k) => `${e.day}|${e.period + k}`)))
  const item = options.find((o) => o.id === id)
  const otherDepts =
    tab === 'teacher' && deptId !== ALL
      ? [...new Set(entries.map((e) => data.sections.find((s) => s.id === e.sectionId)?.deptId).filter((d) => d && d !== deptId))]
      : []
  const subtitle =
    tab === 'section'
      ? [deptName(item?.deptId), batchOf(item ?? {}), `${item?.students} students`].filter(Boolean).join(' · ')
      : tab === 'teacher'
        ? `${item?.department || 'Faculty'} · weekly teaching schedule${
            otherDepts.length ? ` (includes classes in ${otherDepts.map(deptName).join(', ')})` : ''
          }`
        : `${ROOM_TYPE_LABELS[item?.type] ?? ''} · ${item?.capacity ?? '?'} seats · ${
            item?.deptId ? `${deptName(item.deptId)} room` : 'shared room'
          } · classes from every department`

  return (
    <div className="space-y-4">
      <DataNote data={data} />
      {showSummary && (
        <div className="print:hidden">
          <SummaryPanel data={data} deptId={deptId} />
        </div>
      )}
      <Card className="space-y-4 print:hidden">
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
          <Select
            label={current.label.replace('By ', '').replace(/^./, (c) => c.toUpperCase())}
            value={id ?? ''}
            options={options.map((o) => ({ value: o.id, label: o.label }))}
            onChange={(e) => setSelected({ ...selected, [`${deptId}:${tab}`]: e.target.value })}
            className="min-w-56"
          />
        </div>
      </Card>
      {id ? (
        <TimetableSheet
          data={data}
          entries={entries}
          mode={tab}
          title={item?.name}
          subtitle={subtitle}
          stats={`${busy.size} periods / week`}
        />
      ) : (
        <EmptyState>Nothing to show for this department yet.</EmptyState>
      )}
    </div>
  )
}
