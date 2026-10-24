import { useEffect, useState } from 'react'
import { useCollegeData } from './hooks/useCollegeData.js'
import { usePrefs } from './hooks/usePrefs.js'
import PrefsControls from './components/PrefsControls.jsx'
import Landing from './pages/Landing.jsx'
import { CalendarDays, CalendarPlus, ClipboardList, Compass, LayoutGrid, Settings2, Ticket, UserRound } from 'lucide-react'
import { Button, Tabs } from './components/ui.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import DepartmentBar, { HodDepartmentPicker } from './components/DepartmentBar.jsx'
import AdminWizard, { generateDepartment } from './pages/admin/AdminWizard.jsx'
import TimetableViews from './pages/TimetableViews.jsx'
import FacultyView, { currentFacultyId } from './pages/FacultyView.jsx'
import StudentView from './pages/StudentView.jsx'
import CampusGuide from './pages/campus/CampusGuide.jsx'
import BookSpace from './pages/booking/BookSpace.jsx'
import BookingsList from './pages/booking/BookingsList.jsx'
import { upcomingBookings } from './booking.js'
import { ALL, deptById } from './data/departments.js'

const ROLE_KEY = 'ttgen:role'
const DEPT_KEY = 'ttgen:dept'
const HOD_KEY = 'ttgen:hodDept'
const ROLE_LABELS = { admin: 'Administrator', hod: 'HOD / Coordinator', faculty: 'Faculty', student: 'Student' }

const readKey = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const writeKey = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // per-viewer conveniences only
  }
}
const readRole = () => {
  const role = readKey(ROLE_KEY, 'landing')
  return ROLE_LABELS[role] ? role : 'landing'
}

export default function App() {
  const college = useCollegeData()
  const { data } = college
  // The landing page always opens first; the last role used is offered there as a shortcut.
  const [view, setView] = useState('landing')
  const [prefs, setPrefs] = usePrefs()
  // One department context for the whole app, remembered across views and reloads.
  const [dept, setDept] = useState(() => readKey(DEPT_KEY, ''))
  const [hodDept, setHodDept] = useState(() => readKey(HOD_KEY, ''))
  const prefsControls = <PrefsControls prefs={prefs} setPrefs={setPrefs} />

  useEffect(() => {
    if (view !== 'landing') writeKey(ROLE_KEY, view)
  }, [view])
  useEffect(() => writeKey(DEPT_KEY, dept), [dept])
  useEffect(() => writeKey(HOD_KEY, hodDept || null), [hodDept])

  if (view === 'landing') {
    const lastRole = readRole()
    return (
      <Landing
        onSelect={setView}
        lastRole={ROLE_LABELS[lastRole] ? { id: lastRole, label: ROLE_LABELS[lastRole] } : null}
        controls={prefsControls}
      />
    )
  }

  // Role-based department access: Admin may pick any department or the whole college; HODs are locked to
  // the department they coordinate (a demo assignment); Faculty and Students pick any single department.
  const departments = data.departments ?? []
  const firstDept = departments[0]?.id ?? ALL
  const validDept = (id) => departments.some((d) => d.id === id)
  const hodAssigned = validDept(hodDept) ? hodDept : ''
  const effective =
    view === 'admin'
      ? dept === ALL || validDept(dept) ? dept : firstDept
      : view === 'hod'
        ? hodAssigned
        : validDept(dept) ? dept : firstDept

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={() => setView('landing')} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
              <CalendarDays className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">Smart TimeTables</span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-medium text-indigo-700">
              {ROLE_LABELS[view]}
              {effective && effective !== ALL && departments.length > 0 && ` · ${deptById(data, effective)?.short}`}
            </span>
          </button>
          <div className="flex items-center gap-2">
            {prefsControls}
            <Button variant="secondary" onClick={() => setView('landing')}>
              Switch role
            </Button>
          </div>
        </div>
      </header>
      <main className="w-full px-4 pb-28 pt-6 sm:px-6 lg:px-8 print:p-0">
        {view === 'hod' && departments.length > 0 && !hodAssigned ? (
          <HodDepartmentPicker data={data} onPick={setHodDept} />
        ) : (
          <>
            <DepartmentBar
              data={data}
              value={effective}
              onChange={setDept}
              allowAll={view === 'admin'}
              locked={view === 'hod'}
              onUnlock={() => setHodDept('')}
            />
            
            {view === 'admin' && <AdminPage college={college} deptId={effective} />}
            {view === 'hod' && <HodPage college={college} deptId={effective} />}
            {view === 'faculty' && <FacultyPage college={college} deptId={effective} />}
            {view === 'student' && <StudentPage college={college} deptId={effective} />}
          </>
        )}
      </main>
      <ChatWidget data={data} deptId={effective} />
    </div>
  )
}

const BOOK_TAB = { id: 'book', label: 'Book a space', Icon: CalendarPlus }
const GUIDE_TAB = { id: 'guide', label: 'Campus Guide', Icon: Compass }

/** Booking tabs shared by every role that can book rooms. */
function BookingTabs({ tab, setTab, college, deptId, organizer, createdBy, mine, listTitle, canCancel }) {
  const all = college.data.bookings ?? []
  const shown = mine ? all.filter(mine) : all
  if (tab === 'book') {
    return (
      <BookSpace
        college={college}
        deptId={deptId === ALL ? undefined : deptId}
        organizer={organizer}
        createdBy={createdBy}
        onViewBookings={() => setTab('bookings')}
      />
    )
  }
  if (tab === 'bookings') {
    return (
      <BookingsList
        data={college.data}
        bookings={shown}
        title={listTitle}
        canCancel={canCancel}
        onCancel={college.cancelBooking}
        onAddSamples={all.length === 0 && college.data.rooms.length ? college.addSampleBookings : undefined}
      />
    )
  }
  return null
}

/** Bookings made for a department (falls back to its short name for bookings made before departments). */
const bookingInDept = (data, deptId) => (b) =>
  deptId === ALL || b.deptId === deptId || (!b.deptId && b.department === deptById(data, deptId)?.short)

function AdminPage({ college, deptId }) {
  const [tab, setTab] = useState(college.data.timetable ? 'timetable' : 'setup')
  const [failures, setFailures] = useState([])
  const upcoming = upcomingBookings(college.data.bookings ?? []).length
  const pendingRequests = (college.data.requests ?? []).filter((r) => r.status === 'pending').length
  const generateHere = () => {
    const r = generateDepartment(college.data, deptId)
    setFailures(r.failures)
    if (r.timetable) college.setTimetable(r.timetable)
    else {
      setTab('setup')
    }
  }
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: 'Setup', Icon: Settings2 },
          { id: 'timetable', label: 'Timetable', Icon: LayoutGrid },
          { ...GUIDE_TAB, badge: pendingRequests },
          BOOK_TAB,
          { id: 'bookings', label: 'All bookings', Icon: Ticket, badge: upcoming },
        ]}
      />
      {tab === 'guide' && <CampusGuide role="admin" college={college} deptId={deptId} />}
      {tab === 'setup' && (
        <AdminWizard college={college} deptId={deptId} initialFailures={failures} onGenerated={() => (setFailures([]), setTab('timetable'))} />
      )}
      {tab === 'timetable' && (
        <TimetableViews
          data={college.data}
          deptId={deptId}
          canManage
          onSetup={() => setTab('setup')}
          onGenerate={deptId === ALL ? () => setTab('setup') : generateHere}
        />
      )}
      <BookingTabs
        tab={tab}
        setTab={setTab}
        college={college}
        deptId={deptId}
        key={deptId}
        createdBy={{ role: 'admin' }}
        listTitle="All bookings"
        canCancel={() => true}
      />
    </div>
  )
}

function HodPage({ college, deptId }) {
  const [tab, setTab] = useState('timetables')
  const inDept = bookingInDept(college.data, deptId)
  const upcoming = upcomingBookings((college.data.bookings ?? []).filter(inDept)).length
  const short = deptById(college.data, deptId)?.short ?? ''
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'timetables', label: 'Timetables', Icon: ClipboardList },
          GUIDE_TAB,
          BOOK_TAB,
          { id: 'bookings', label: `${short} bookings`, Icon: Ticket, badge: upcoming },
        ]}
      />
      {tab === 'timetables' && <TimetableViews data={college.data} deptId={deptId} />}
      {tab === 'guide' && <CampusGuide role="hod" college={college} deptId={deptId} />}
      {/* Coordinators see and cancel their department's bookings. */}
      <BookingTabs
        tab={tab}
        setTab={setTab}
        college={college}
        deptId={deptId}
        key={deptId}
        createdBy={{ role: 'hod', deptId }}
        mine={inDept}
        listTitle={`${short} bookings`}
        canCancel={() => true}
      />
    </div>
  )
}

function FacultyPage({ college, deptId }) {
  const [tab, setTab] = useState('timetable')
  // The faculty member picked on the "My timetable" tab is "you" for booking.
  const teacherId = currentFacultyId(college.data, deptId)
  const teacher = college.data.teachers.find((t) => t.id === teacherId)
  const isMine = (b) => b.organizerId === teacherId || b.createdBy?.teacherId === teacherId
  const upcoming = upcomingBookings((college.data.bookings ?? []).filter(isMine)).length
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'timetable', label: 'My timetable', Icon: UserRound },
          { id: 'department', label: 'Department timetable', Icon: LayoutGrid },
          GUIDE_TAB,
          BOOK_TAB,
          { id: 'bookings', label: 'My bookings', Icon: Ticket, badge: upcoming },
        ]}
      />
      {tab === 'timetable' && <FacultyView data={college.data} deptId={deptId} />}
      {tab === 'department' && <TimetableViews data={college.data} deptId={deptId} showSummary={false} />}
      {tab === 'guide' && <CampusGuide role="faculty" college={college} deptId={deptId} />}
      <BookingTabs
        key={`${teacherId}:${deptId}`}
        tab={tab}
        setTab={setTab}
        college={college}
        deptId={deptId}
        organizer={teacher}
        createdBy={{ role: 'faculty', teacherId }}
        mine={isMine}
        listTitle={teacher ? `My bookings · ${teacher.name}` : 'My bookings'}
        canCancel={isMine}
      />
    </div>
  )
}

function StudentPage({ college, deptId }) {
  const [tab, setTab] = useState('timetable')
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ id: 'timetable', label: 'My timetable', Icon: CalendarDays }, GUIDE_TAB]}
      />
      {tab === 'timetable' && <StudentView data={college.data} deptId={deptId} />}
      {tab === 'guide' && <CampusGuide role="student" college={college} deptId={deptId} />}
    </div>
  )
}
