import { useState } from 'react'
import { CalendarDays, CalendarPlus, ClipboardList, Compass, LayoutGrid, Settings2, Ticket, UserRound, UsersRound, Wand2 } from 'lucide-react'
import { Button, EmptyState, Tabs } from '../components/ui.jsx'
import AdminWizard, { generateDepartment } from './admin/AdminWizard.jsx'
import UsersAdmin from './admin/UsersAdmin.jsx'
import BrowserDataImport from './admin/BrowserDataImport.jsx'
import ChangeAssistant from './admin/ChangeAssistant.jsx'
import TimetableViews from './TimetableViews.jsx'
import FacultyView, { currentFacultyId } from './FacultyView.jsx'
import StudentView from './StudentView.jsx'
import CampusGuide from './campus/CampusGuide.jsx'
import BookSpace from './booking/BookSpace.jsx'
import BookingsList from './booking/BookingsList.jsx'
import { upcomingBookings } from '../booking.js'
import { needsApproval } from '../campusGuide.js'
import { ALL, deptById } from '../data/departments.js'

// One page per role. `me` is the signed-in account's trusted identity ({ userId, teacherId?, sectionId? }) with
// shared data, or null in the browser-only demo (where people pick who they are).

const BOOK_TAB = { id: 'book', label: 'Book a space', Icon: CalendarPlus }
const GUIDE_TAB = { id: 'guide', label: 'Campus Guide', Icon: Compass }

/** Booking tabs shared by every role that can book rooms. */
function BookingTabs({ tab, setTab, college, deptId, organizer, createdBy, mine, listTitle, canCancel, locked, canBook, samples = true }) {
  const all = college.data.bookings ?? []
  const shown = mine ? all.filter(mine) : all
  if (tab === 'book') {
    return (
      <BookSpace
        college={college}
        deptId={deptId === ALL ? undefined : deptId}
        organizer={organizer}
        createdBy={createdBy}
        locked={locked}
        canBook={canBook}
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
        onAddSamples={samples && all.length === 0 && college.data.rooms.length ? college.addSampleBookings : undefined}
      />
    )
  }
  return null
}

/** Bookings made for a department (falls back to its short name for bookings made before departments). */
const bookingInDept = (data, deptId) => (b) =>
  deptId === ALL || b.deptId === deptId || (!b.deptId && b.department === deptById(data, deptId)?.short)

/** With accounts, staff book their own department's rooms directly; everything else is a request. */
const directBooking = (me, role, deptId) => (me ? (room) => !needsApproval(role, room, deptId) : undefined)

export function AdminPage({ college, deptId, me }) {
  const [tab, setTab] = useState(college.data.timetable ? 'timetable' : 'setup')
  const [failures, setFailures] = useState([])
  // With one department selected, only that department's bookings are listed and counted.
  const inDept = bookingInDept(college.data, deptId)
  const deptShort = deptId === ALL ? '' : deptById(college.data, deptId)?.short ?? ''
  const bookingsLabel = deptShort ? `${deptShort} bookings` : 'All bookings'
  const upcoming = upcomingBookings((college.data.bookings ?? []).filter(inDept)).length
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
          { id: 'reschedule', label: 'Reschedule', Icon: Wand2 },
          { ...GUIDE_TAB, badge: pendingRequests },
          BOOK_TAB,
          { id: 'bookings', label: bookingsLabel, Icon: Ticket, badge: upcoming },
          ...(me ? [{ id: 'users', label: 'Users', Icon: UsersRound }] : []),
        ]}
      />
      {tab === 'guide' && <CampusGuide role="admin" college={college} deptId={deptId} />}
      {tab === 'setup' && me && <BrowserDataImport college={college} />}
      {tab === 'setup' && (
        <AdminWizard college={college} deptId={deptId} initialFailures={failures} onGenerated={() => (setFailures([]), setTab('timetable'))} />
      )}
      {tab === 'reschedule' &&
        (college.data.timetable ? (
          <ChangeAssistant college={college} onViewTimetable={() => setTab('timetable')} />
        ) : (
          <EmptyState>
            Generate a timetable first; then describe any sudden change here.{' '}
            <Button variant="ghost" onClick={() => setTab('setup')}>
              Go to Setup
            </Button>
          </EmptyState>
        ))}
      {tab === 'timetable' && (
        <TimetableViews
          data={college.data}
          deptId={deptId}
          canManage
          onSetup={() => setTab('setup')}
          onGenerate={deptId === ALL ? () => setTab('setup') : generateHere}
        />
      )}
      {tab === 'users' && me && <UsersAdmin data={college.data} me={me} />}
      <BookingTabs
        tab={tab}
        setTab={setTab}
        college={college}
        deptId={deptId}
        key={deptId}
        createdBy={{ role: 'admin' }}
        mine={deptId === ALL ? undefined : inDept}
        listTitle={bookingsLabel}
        canCancel={() => true}
      />
    </div>
  )
}

export function HodPage({ college, deptId, me }) {
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
        locked={me ? { department: true } : undefined}
        samples={!me}
        canBook={directBooking(me, 'hod', deptId)}
      />
    </div>
  )
}

export function FacultyPage({ college, deptId, me }) {
  const [tab, setTab] = useState('timetable')
  // Signed in: the account's faculty identity. Demo: whoever was picked on the "My timetable" tab.
  const teacherId = me?.teacherId ?? currentFacultyId(college.data, deptId)
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
      {tab === 'timetable' && <FacultyView data={college.data} deptId={deptId} teacherId={me?.teacherId} />}
      {tab === 'department' && <TimetableViews data={college.data} deptId={deptId} showSummary={false} />}
      {tab === 'guide' && <CampusGuide role="faculty" college={college} deptId={deptId} teacherId={me?.teacherId} />}
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
        locked={me ? { organizer: true, department: true } : undefined}
        samples={!me}
        canBook={directBooking(me, 'faculty', deptId)}
      />
    </div>
  )
}

export function StudentPage({ college, deptId, me }) {
  const [tab, setTab] = useState('timetable')
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[{ id: 'timetable', label: 'My timetable', Icon: CalendarDays }, GUIDE_TAB]}
      />
      {tab === 'timetable' && <StudentView data={college.data} deptId={deptId} sectionId={me?.sectionId} />}
      {tab === 'guide' && <CampusGuide role="student" college={college} deptId={deptId} sectionId={me?.sectionId} clientId={me?.userId} />}
    </div>
  )
}
