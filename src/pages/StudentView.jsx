import { useState } from 'react'
import { Card, Select } from '../components/ui.jsx'
import TimetableSheet from '../components/TimetableSheet.jsx'
import DepartmentEmpty, { departmentNeedsAttention } from '../components/DepartmentEmpty.jsx'
import { ALL, batchOf, batchesOf, deptById, sectionsOf } from '../data/departments.js'
import { DataNote } from './TimetableViews.jsx'
import { groupNamesOf, labGroupsOf } from '../scheduler.js'

const PICK_KEY = 'ttgen:student'

function readPick() {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY)) || {}
  } catch {
    return {}
  }
}

/** A student's read-only timetable: department (from the department bar) → semester → section → lab group. */
export default function StudentView({ data, deptId = ALL }) {
  const [pick, setPick] = useState(readPick)
  if (departmentNeedsAttention(data, deptId)) return <DepartmentEmpty data={data} deptId={deptId} />

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
      {section && (
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
