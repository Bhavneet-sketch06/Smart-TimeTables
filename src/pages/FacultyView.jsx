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

/** Id of the faculty member chosen in the Faculty view (or the first teacher alphabetically). */
export function currentFacultyId(data) {
  const id = readPick().teacherId
  if (data.teachers.some((t) => t.id === id)) return id
  return [...data.teachers].sort((a, b) => a.name.localeCompare(b.name))[0]?.id
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

  // Every year / class in the college (sections' department, e.g. "CSE - 3rd Sem (D2)"), with this
  // teacher's periods in each, so the menu always works even for someone who teaches a single year.
  const yearOf = (e) => sectionsById.get(e.sectionId)?.department
  const years = [...new Set(data.sections.map((s) => s.department).filter(Boolean))].sort()
  const periodsIn = (y) => periodsOf(allEntries.filter((e) => yearOf(e) === y))
  const year = years.includes(pick.year) ? pick.year : ''
  const entries = year ? allEntries.filter((e) => yearOf(e) === year) : allEntries
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
          options={[{ value: '', label: `All years · ${plural(periodsOf(allEntries), 'period')}` }].concat(
            years.map((y) => ({ value: y, label: `${y} · ${plural(periodsIn(y), 'period')}` })),
          )}
          onChange={(e) => save({ teacherId: teacher?.id, year: e.target.value })}
        />
      </Card>
      {teacher && (
        <TimetableSheet
          data={data}
          entries={entries}
          mode="teacher"
          title={teacher.name}
          subtitle={
            year && entries.length === 0
              ? `No classes in ${year} this week`
              : `${year || 'All years'} · weekly teaching schedule`
          }
          stats={`${plural(periodsOf(entries), 'period')} · ${plural(sectionCount, 'section')} · total load ${periodsOf(allEntries)} / ${teacher.maxHours}`}
        />
      )}
    </div>
  )
}
