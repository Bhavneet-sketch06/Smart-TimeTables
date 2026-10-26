import { useState } from 'react'
import { Card, EmptyState, Select } from '../components/ui.jsx'
import TimetableSheet from '../components/TimetableSheet.jsx'
import DepartmentEmpty from '../components/DepartmentEmpty.jsx'
import { ALL, batchOf, batchesOf, deptById, teachersOf } from '../data/departments.js'
import { DataNote } from './TimetableViews.jsx'
import ChangeNotice from '../components/ChangeNotice.jsx'

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

const byName = (a, b) => a.name.localeCompare(b.name)

/** Id of the faculty member chosen in the Faculty view (limited to the department's teachers when given). */
export function currentFacultyId(data, deptId = ALL) {
  const teachers = [...teachersOf(data, deptId)].sort(byName)
  const id = readPick().teacherId
  return teachers.some((t) => t.id === id) ? id : teachers[0]?.id
}

const periodsOf = (entries) => entries.reduce((n, e) => n + e.length, 0)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * A faculty member's weekly schedule. The name list is the selected department's teachers; the schedule
 * itself spans every department they teach in, and the "Year / class" menu narrows it to one batch.
 * `teacherId` (signed-in faculty) fixes whose schedule it is: there is no name list then.
 */
export default function FacultyView({ data, deptId = ALL, teacherId }) {
  const [pick, setPick] = useState(readPick)
  const own = teacherId ? data.teachers.find((t) => t.id === teacherId) : null
  const teachers = teacherId ? (own ? [own] : []) : [...teachersOf(data, deptId)].sort(byName)
  if (teacherId && !own) return <EmptyState>Your faculty record is no longer in the college data. Ask your administrator.</EmptyState>
  if (!data.timetable || teachers.length === 0) {
    return teachers.length === 0 && deptId !== ALL ? (
      <DepartmentEmpty data={data} deptId={deptId} />
    ) : (
      <EmptyState>No timetable has been generated yet. Ask your administrator.</EmptyState>
    )
  }

  const save = (next) => {
    setPick(next)
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify(next))
    } catch {
      // remembering the choice is optional
    }
  }

  const sectionsById = new Map(data.sections.map((s) => [s.id, s]))
  const teacher = own ?? teachers.find((t) => t.id === pick.teacherId) ?? teachers[0]
  const allEntries = data.timetable.entries.filter((e) => e.teacherId === teacher?.id)

  // Year / class options: every batch of the selected department (key "dept::batch"), plus classes this
  // teacher has in other departments, so a shared teacher can still see their whole week.
  const keyOf = (e) => {
    const s = sectionsById.get(e.sectionId)
    return s ? `${s.deptId}::${batchOf(s)}` : ''
  }
  const deptIds = deptId === ALL ? (data.departments ?? []).map((d) => d.id) : [deptId]
  const yearOptions = deptIds.flatMap((id) =>
    batchesOf(data, id).map((b) => ({ key: `${id}::${b}`, label: `${deptById(data, id)?.short ?? id}${b ? ` · ${b}` : ''}` })),
  )
  const outside = deptId === ALL ? [] : allEntries.filter((e) => sectionsById.get(e.sectionId)?.deptId !== deptId)
  const year = pick.year === '__outside' && outside.length ? '__outside' : yearOptions.some((o) => o.key === pick.year) ? pick.year : ''
  const entries =
    year === '__outside' ? outside : year ? allEntries.filter((e) => keyOf(e) === year) : allEntries
  const yearLabel = year === '__outside' ? 'Other departments' : yearOptions.find((o) => o.key === year)?.label
  const sectionCount = new Set(entries.map((e) => e.sectionId)).size

  return (
    <div className="space-y-4">
      <DataNote data={data} />
      <ChangeNotice data={data} entries={allEntries} />
      <Card className={`grid gap-4 print:hidden ${own ? 'sm:grid-cols-2' : 'sm:grid-cols-[2fr_1fr]'}`}>
        {own ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Signed in as</span>
            <span className="py-1.5 text-base font-semibold text-slate-900">{own.name}</span>
          </div>
        ) : (
          <Select
            label="Your name"
            value={teacher?.id ?? ''}
            options={teachers.map((t) => ({ value: t.id, label: `${t.name} (${t.department || 'no department'})` }))}
            onChange={(e) => save({ teacherId: e.target.value })}
          />
        )}
        <Select
          label="Year / class"
          value={year}
          options={[{ value: '', label: `All my classes · ${plural(periodsOf(allEntries), 'period')}` }]
            .concat(
              yearOptions.map((o) => ({
                value: o.key,
                label: `${o.label} · ${plural(periodsOf(allEntries.filter((e) => keyOf(e) === o.key)), 'period')}`,
              })),
            )
            .concat(outside.length ? [{ value: '__outside', label: `Other departments · ${plural(periodsOf(outside), 'period')}` }] : [])}
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
              ? `No classes in ${yearLabel} this week`
              : `${yearLabel || 'All my classes'} · weekly teaching schedule`
          }
          stats={`${plural(periodsOf(entries), 'period')} · ${plural(sectionCount, 'section')} · total load ${periodsOf(allEntries)}${teacher.maxHours ? ` / ${teacher.maxHours}` : ''}`}
        />
      )}
    </div>
  )
}
