import { useState } from 'react'
import { Card, Select } from '../components/ui.jsx'
import TimetableSheet from '../components/TimetableSheet.jsx'
import { DataNote, NoTimetable } from './TimetableViews.jsx'
import { groupNamesOf, labGroupsOf } from '../scheduler.js'

const PICK_KEY = 'ttgen:student'

function readPick() {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY)) || {}
  } catch {
    return {}
  }
}

export default function StudentView({ data }) {
  const [pick, setPick] = useState(readPick)
  if (!data.timetable) return <NoTimetable />

  const save = (next) => {
    setPick(next)
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify(next))
    } catch {
      // remembering the choice is optional
    }
  }

  const departments = [...new Set(data.sections.map((s) => s.department))].sort()
  const dept = departments.includes(pick.dept) ? pick.dept : departments[0]
  const sections = data.sections.filter((s) => s.department === dept)
  const section = sections.find((s) => s.id === pick.section) ?? sections[0]
  const groupNames = section && labGroupsOf(section) > 1 ? groupNamesOf(section) : []
  const group = groupNames.includes(pick.group) ? pick.group : ''
  // A chosen lab group sees its own labs plus all whole-section classes.
  const entries = data.timetable.entries.filter(
    (e) => e.sectionId === section?.id && (!group || !e.group || e.group === group),
  )

  return (
    <div className="space-y-4">
      <DataNote data={data} />
      <Card className={`grid gap-3 print:hidden ${groupNames.length ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        <Select
          label="Department"
          value={dept}
          options={departments}
          onChange={(e) => save({ dept: e.target.value })}
          className="col-span-2 sm:col-span-1"
        />
        <Select
          label="Section"
          value={section?.id ?? ''}
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(e) => save({ dept, section: e.target.value })}
        />
        {groupNames.length > 0 && (
          <Select
            label="Lab group"
            value={group}
            options={[{ value: '', label: 'All groups' }].concat(groupNames)}
            onChange={(e) => save({ dept, section: section.id, group: e.target.value })}
          />
        )}
      </Card>
      {section && (
        <TimetableSheet
          data={data}
          entries={entries}
          mode="section"
          title={`${section.name}${group ? ` · Group ${group}` : ''}`}
          subtitle={`${section.department} · weekly timetable`}
        />
      )}
    </div>
  )
}
