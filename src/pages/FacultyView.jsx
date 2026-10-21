import { useState } from 'react'
import { Card, Select } from '../components/ui.jsx'
import TimetableSheet from '../components/TimetableSheet.jsx'
import { DataNote, NoTimetable } from './TimetableViews.jsx'

const PICK_KEY = 'ttgen:faculty'

function readPick() {
  try {
    const raw = localStorage.getItem(PICK_KEY)
    // Older versions stored just the teacher id.
    return raw?.startsWith('{') ? JSON.parse(raw) : { teacherId: raw || '' }
  } catch {
    return {}
  }
}

const periodsOf = (entries) => entries.reduce((n, e) => n + e.length, 0)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function FacultyView({ data }) {
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

  const sectionsById = new Map(data.sections.map((s) => [s.id, s]))
  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name))
  const teacher = teachers.find((t) => t.id === pick.teacherId) ?? teachers[0]
  const allEntries = data.timetable.entries.filter((e) => e.teacherId === teacher?.id)

  // Years / classes this teacher teaches, taken from the sections' department (e.g. "CSE - 3rd Sem (D2)").
  const years = [...new Set(allEntries.map((e) => sectionsById.get(e.sectionId)?.department).filter(Boolean))].sort()
  const year = years.includes(pick.year) ? pick.year : ''
  const entries = year ? allEntries.filter((e) => sectionsById.get(e.sectionId)?.department === year) : allEntries
  const sectionCount = new Set(entries.map((e) => e.sectionId)).size

  return (
    <div className="space-y-4">
      <DataNote data={data} />
      <Card className="grid gap-4 sm:grid-cols-[2fr_1fr] print:hidden">
        <Select
          label="Your name"
          value={teacher?.id ?? ''}
          options={teachers.map((t) => ({ value: t.id, label: `${t.name} (${t.department})` }))}
          onChange={(e) => save({ teacherId: e.target.value })}
        />
        <Select
          label="Year / class"
          value={year}
          options={[{ value: '', label: `All years (${years.length})` }].concat(years)}
          onChange={(e) => save({ teacherId: teacher?.id, year: e.target.value })}
          disabled={years.length < 2}
        />
      </Card>
      {teacher && (
        <TimetableSheet
          data={data}
          entries={entries}
          mode="teacher"
          title={teacher.name}
          subtitle={`${year || 'All years'} · weekly teaching schedule`}
          stats={`${plural(periodsOf(entries), 'period')} · ${plural(sectionCount, 'section')} · total load ${periodsOf(allEntries)} / ${teacher.maxHours}`}
        />
      )}
    </div>
  )
}
