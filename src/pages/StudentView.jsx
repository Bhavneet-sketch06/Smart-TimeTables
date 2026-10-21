import { useState } from 'react'
import { Card, Select } from '../components/ui.jsx'
import TimetableGrid from '../components/TimetableGrid.jsx'
import { NoTimetable } from './TimetableViews.jsx'

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
  const entries = data.timetable.entries.filter((e) => e.sectionId === section?.id)

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-3">
        <Select label="Department" value={dept} options={departments} onChange={(e) => save({ dept: e.target.value })} />
        <Select
          label="Section"
          value={section?.id ?? ''}
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(e) => save({ dept, section: e.target.value })}
        />
      </Card>
      {section && (
        <>
          <h1 className="text-xl font-bold">
            {section.name} <span className="text-sm font-normal text-slate-500">weekly timetable</span>
          </h1>
          <TimetableGrid data={data} entries={entries} mode="section" />
        </>
      )}
    </div>
  )
}
