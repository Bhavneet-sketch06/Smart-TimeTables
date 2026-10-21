import { useState } from 'react'
import { Card, Select } from '../components/ui.jsx'
import TimetableGrid from '../components/TimetableGrid.jsx'
import { NoTimetable } from './TimetableViews.jsx'

const PICK_KEY = 'ttgen:faculty'

function readPick() {
  try {
    return localStorage.getItem(PICK_KEY) || ''
  } catch {
    return ''
  }
}

export default function FacultyView({ data }) {
  const [teacherId, setTeacherId] = useState(readPick)
  if (!data.timetable) return <NoTimetable />

  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name))
  const teacher = teachers.find((t) => t.id === teacherId) ?? teachers[0]
  const entries = data.timetable.entries.filter((e) => e.teacherId === teacher?.id)
  const periods = entries.reduce((n, e) => n + e.length, 0)
  const sections = new Set(entries.map((e) => e.sectionId)).size

  const choose = (id) => {
    setTeacherId(id)
    try {
      localStorage.setItem(PICK_KEY, id)
    } catch {
      // remembering the choice is optional
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4">
        <Select
          label="Your name"
          value={teacher?.id ?? ''}
          options={teachers.map((t) => ({ value: t.id, label: `${t.name} (${t.department})` }))}
          onChange={(e) => choose(e.target.value)}
          className="min-w-64 flex-1"
        />
        {teacher && (
          <div className="flex gap-4 pb-1 text-sm text-slate-600">
            <span>
              <b className="text-slate-900">{periods}</b> / {teacher.maxHours} periods
            </span>
            <span>
              <b className="text-slate-900">{sections}</b> sections
            </span>
          </div>
        )}
      </Card>
      {teacher && <TimetableGrid data={data} entries={entries} mode="teacher" />}
    </div>
  )
}
