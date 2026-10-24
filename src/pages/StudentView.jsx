import { useState } from 'react'
import { CalendarDays, Sun } from 'lucide-react'
import { Card, Select } from '../components/ui.jsx'
import TimetableSheet from '../components/TimetableSheet.jsx'
import DepartmentEmpty, { departmentNeedsAttention } from '../components/DepartmentEmpty.jsx'
import { ALL, batchOf, batchesOf, deptById, sectionsOf } from '../data/departments.js'
import { DataNote } from './TimetableViews.jsx'
import { groupNamesOf, labGroupsOf } from '../scheduler.js'
import MyDay from './MyDay.jsx'

const PICK_KEY = 'ttgen:student'
const VIEW_KEY = 'ttgen:studentView'
const VIEWS = [
  { id: 'day', label: 'My Day', Icon: Sun },
  { id: 'week', label: 'Full week', Icon: CalendarDays },
]

function readPick() {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY)) || {}
  } catch {
    return {}
  }
}

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'day'
  } catch {
    return 'day'
  }
}

/** One-tap switch between today's classes and the weekly grid. */
function ViewSwitch({ value, onChange }) {
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:inline-grid print:hidden">
      {VIEWS.map(({ id, label, Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition ${
            value === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  )
}

/**
 * A student's read-only timetable: department (from the department bar) → semester → section → lab group.
 * "My Day" and "Full week" show the same choice, so switching keeps the department, semester, section and group.
 */
export default function StudentView({ data, deptId = ALL }) {
  const [pick, setPick] = useState(readPick)
  const [view, setView] = useState(readView)
  if (departmentNeedsAttention(data, deptId)) return <DepartmentEmpty data={data} deptId={deptId} />

  const changeView = (next) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // remembering the view is optional
    }
  }
  const save = (next) => {
    setPick(next)
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify(next))
    } catch {
      // remembering the choice is optional
    }
  }

  const batches = batchesOf(data, deptId)
  const batch = batches.includes(pick.batch) ? pick.batch : batches[0]
  const sections = sectionsOf(data, deptId).filter((s) => batchOf(s) === batch)
  const section = sections.find((s) => s.id === pick.section) ?? sections[0]
  const groupNames = section && labGroupsOf(section) > 1 ? groupNamesOf(section) : []
  const group = groupNames.includes(pick.group) ? pick.group : ''
  // A chosen lab group sees its own labs plus all whole-section classes.
  const entries = data.timetable.entries.filter(
    (e) => e.sectionId === section?.id && (!group || !e.group || e.group === group),
  )
  const dept = deptById(data, section?.deptId)

  return (
    <div className="space-y-4">
      <DataNote data={data} />
      <Card className={`grid gap-3 print:hidden ${groupNames.length ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {batches.length > 1 || batches[0] ? (
          <Select
            label="Semester / class"
            value={batch}
            options={batches.map((b) => ({ value: b, label: b || 'All sections' }))}
            onChange={(e) => save({ batch: e.target.value })}
            className="col-span-2 sm:col-span-1"
          />
        ) : null}
        <Select
          label="Section"
          value={section?.id ?? ''}
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(e) => save({ batch, section: e.target.value })}
        />
        {groupNames.length > 0 && (
          <Select
            label="Lab group"
            value={group}
            options={[{ value: '', label: 'All groups' }].concat(groupNames)}
            onChange={(e) => save({ batch, section: section.id, group: e.target.value })}
          />
        )}
      </Card>
      <ViewSwitch value={view} onChange={changeView} />
      {section && view === 'day' && (
        <MyDay
          data={data}
          entries={entries}
          sectionName={`${section.name}${group ? ` · Group ${group}` : ''}`}
          groupHint={groupNames.length && !group ? 'Showing the labs of every group. Pick your lab group above to see only yours.' : ''}
          onWeek={() => changeView('week')}
        />
      )}
      {section && view === 'week' && (
        <TimetableSheet
          data={data}
          entries={entries}
          mode="section"
          title={`${section.name}${group ? ` · Group ${group}` : ''}`}
          subtitle={[dept?.name, batchOf(section), 'weekly timetable'].filter(Boolean).join(' · ')}
        />
      )}
    </div>
  )
}
