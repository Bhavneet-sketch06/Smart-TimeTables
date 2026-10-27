// Renders every non-admin role page with the limited data that role receives from the database (own section only,
// no timetable summary for students, free/busy for the rest), so a missing field can never blank the screen.
import { test, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('./lib/supabase.js', () => ({ supabase: null, supabaseConfigured: false, localDemoAllowed: true, evaluatorDemo: false, linkType: '', redirectUrl: () => '' }))

const { gndecCollege } = await import('./data/gndecCollege.js')
const { normalizeCollege } = await import('./data/departments.js')
const { generateCollege } = await import('./scheduler.js')
const { rowsToCollege } = await import('./remote/collegeRows.js')
const { StudentPage, FacultyPage, HodPage } = await import('./pages/RolePages.jsx')
const { default: ChatWidget } = await import('./components/ChatWidget.jsx')
const { default: CampusGuide } = await import('./pages/campus/CampusGuide.jsx')

const full = normalizeCollege(gndecCollege())
const tt = generateCollege(full, { seed: 3 })
const list = (xs) => xs.map((x, i) => ({ data: x, sort: i }))
const base = {
  settings: { time: full.time, meta: full.meta }, departments: list(full.departments), roomTypes: list(full.roomTypes),
  rooms: list(full.rooms), subjects: list(full.subjects), teachers: list(full.teachers.map(({ maxHours, maxPerDay, unavailable, ...t }) => t)),
  sections: list(full.sections), roomBusy: tt.entries.map((e) => ({ room_id: e.roomId, day: e.day, period: e.period, length: e.length })),
}
const sec = full.sections[0]
const college = (data) => ({ data, shared: true, bookSpace() {}, requestSpace() {}, withdrawRequest() {}, cancelBooking() {} })

test('student pages render with a limited view', () => {
  const data = rowsToCollege({ ...base, entries: tt.entries.filter((e) => e.sectionId === sec.id).map((e) => ({ data: e })), generatedAt: '2026-10-25T10:00:00Z' })
  const me = { userId: 'u1', sectionId: sec.id }
  expect(renderToString(<StudentPage college={college(data)} deptId={sec.deptId} me={me} />)).toContain(sec.name)
  renderToString(<CampusGuide role="student" college={college(data)} deptId={sec.deptId} sectionId={sec.id} clientId="u1" />)
  renderToString(<ChatWidget data={data} deptId={sec.deptId} />)
  const empty = rowsToCollege({ ...base, roomBusy: [] })
  renderToString(<StudentPage college={college(empty)} deptId={sec.deptId} me={me} />)
})

test('faculty and HOD pages render with a limited view', () => {
  const t = full.teachers.find((x) => x.deptId === sec.deptId)
  const data = rowsToCollege({ ...base, meta: { data: (({ entries, ...r }) => r)({ ...tt, generatedAt: 'x' }) }, entries: tt.entries.filter((e) => full.sections.find((s) => s.id === e.sectionId)?.deptId === sec.deptId).map((e) => ({ data: e })), bookings: [], requests: [] })
  renderToString(<FacultyPage college={college(data)} deptId={sec.deptId} me={{ userId: 'u2', teacherId: t.id }} />)
  renderToString(<CampusGuide role="faculty" college={college(data)} deptId={sec.deptId} teacherId={t.id} />)
  renderToString(<HodPage college={college(data)} deptId={sec.deptId} me={{ userId: 'u3' }} />)
  renderToString(<CampusGuide role="hod" college={college(data)} deptId={sec.deptId} />)
  renderToString(<ChatWidget data={data} deptId={sec.deptId} />)
})
