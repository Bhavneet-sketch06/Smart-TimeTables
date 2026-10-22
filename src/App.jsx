import { useEffect, useState } from 'react'
import { useCollegeData } from './hooks/useCollegeData.js'
import { usePrefs } from './hooks/usePrefs.js'
import PrefsControls from './components/PrefsControls.jsx'
import Landing from './pages/Landing.jsx'
import { CalendarDays, CalendarPlus, ClipboardList, LayoutGrid, Settings2, Ticket } from 'lucide-react'
import { Button, Tabs } from './components/ui.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import AdminWizard from './pages/admin/AdminWizard.jsx'
import TimetableViews from './pages/TimetableViews.jsx'
import FacultyView, { currentFacultyId } from './pages/FacultyView.jsx'
import StudentView from './pages/StudentView.jsx'
import BookSpace from './pages/booking/BookSpace.jsx'
import BookingsList from './pages/booking/BookingsList.jsx'
import { upcomingBookings } from './booking.js'

const ROLE_KEY = 'ttgen:role'
const ROLE_LABELS = { admin: 'Administrator', hod: 'HOD / Coordinator', faculty: 'Faculty', student: 'Student' }

function readRole() {
  try {
    const role = localStorage.getItem(ROLE_KEY)
    return ROLE_LABELS[role] ? role : 'landing'
  } catch {
    return 'landing'
  }
}

export default function App() {
  const college = useCollegeData()
  const [view, setView] = useState(readRole)
  const [prefs, setPrefs] = usePrefs()
  const prefsControls = <PrefsControls prefs={prefs} setPrefs={setPrefs} />

  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY, view)
    } catch {
      // ignore: role memory is a convenience only
    }
  }, [view])

  if (view === 'landing') {
    return <Landing onSelect={setView} hasData={college.data.sections.length > 0} controls={prefsControls} />
  }

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
        {view === 'admin' && <AdminPage college={college} />}
        {view === 'hod' && <HodPage college={college} />}
        {view === 'faculty' && <FacultyPage college={college} />}
        {view === 'student' && <StudentView data={college.data} />}
      </main>
      <ChatWidget data={college.data} />
    </div>
  )
}

const BOOK_TAB = { id: 'book', label: 'Book a space', Icon: CalendarPlus }

/** Booking tabs shared by every role that can book rooms. */
function BookingTabs({ tab, setTab, college, organizer, createdBy, mine, listTitle, canCancel }) {
  const all = college.data.bookings ?? []
  const shown = mine ? all.filter(mine) : all
  if (tab === 'book') {
    return <BookSpace college={college} organizer={organizer} createdBy={createdBy} onViewBookings={() => setTab('bookings')} />
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

function AdminPage({ college }) {
  const [tab, setTab] = useState(college.data.timetable ? 'timetable' : 'setup')
  const upcoming = upcomingBookings(college.data.bookings ?? []).length
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: 'Setup', Icon: Settings2 },
          { id: 'timetable', label: 'Timetable', Icon: LayoutGrid },
          BOOK_TAB,
          { id: 'bookings', label: 'All bookings', Icon: Ticket, badge: upcoming },
        ]}
      />
      {tab === 'setup' && <AdminWizard college={college} onGenerated={() => setTab('timetable')} />}
      {tab === 'timetable' && <TimetableViews data={college.data} />}
      <BookingTabs
        tab={tab}
        setTab={setTab}
        college={college}
        createdBy={{ role: 'admin' }}
        listTitle="All bookings"
        canCancel={() => true}
      />
    </div>
  )
}

function HodPage({ college }) {
  const [tab, setTab] = useState('timetables')
  const upcoming = upcomingBookings(college.data.bookings ?? []).length
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'timetables', label: 'Timetables', Icon: ClipboardList },
          BOOK_TAB,
          { id: 'bookings', label: 'All bookings', Icon: Ticket, badge: upcoming },
        ]}
      />
      {tab === 'timetables' && <TimetableViews data={college.data} withDepartmentFilter />}
      {/* Coordinators can see and cancel every booking. */}
      <BookingTabs
        tab={tab}
        setTab={setTab}
        college={college}
        createdBy={{ role: 'hod' }}
        listTitle="All bookings"
        canCancel={() => true}
      />
    </div>
  )
}

function FacultyPage({ college }) {
  const [tab, setTab] = useState('timetable')
  // The faculty member picked on the "My timetable" tab is "you" for booking.
  const teacherId = currentFacultyId(college.data)
  const teacher = college.data.teachers.find((t) => t.id === teacherId)
  const isMine = (b) => b.organizerId === teacherId || b.createdBy?.teacherId === teacherId
  const upcoming = upcomingBookings((college.data.bookings ?? []).filter(isMine)).length
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'timetable', label: 'My timetable', Icon: LayoutGrid },
          BOOK_TAB,
          { id: 'bookings', label: 'My bookings', Icon: Ticket, badge: upcoming },
        ]}
      />
      {tab === 'timetable' && <FacultyView data={college.data} />}
      <BookingTabs
        key={teacherId}
        tab={tab}
        setTab={setTab}
        college={college}
        organizer={teacher}
        createdBy={{ role: 'faculty', teacherId }}
        mine={isMine}
        listTitle={teacher ? `My bookings · ${teacher.name}` : 'My bookings'}
        canCancel={isMine}
      />
    </div>
  )
}
