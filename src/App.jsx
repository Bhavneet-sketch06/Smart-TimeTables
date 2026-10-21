import { useEffect, useState } from 'react'
import { useCollegeData } from './hooks/useCollegeData.js'
import { usePrefs } from './hooks/usePrefs.js'
import PrefsControls from './components/PrefsControls.jsx'
import Landing from './pages/Landing.jsx'
import { Button } from './components/ui.jsx'
import AdminWizard from './pages/admin/AdminWizard.jsx'
import TimetableViews from './pages/TimetableViews.jsx'
import FacultyView from './pages/FacultyView.jsx'
import StudentView from './pages/StudentView.jsx'

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
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button onClick={() => setView('landing')} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-lg text-white">🗓️</span>
            <span className="text-lg font-bold">Timetable</span>
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
      <main className="mx-auto max-w-7xl px-4 py-6">
        {view === 'admin' && <AdminPage college={college} />}
        {view === 'hod' && <TimetableViews data={college.data} withDepartmentFilter />}
        {view === 'faculty' && <FacultyView data={college.data} />}
        {view === 'student' && <StudentView data={college.data} />}
      </main>
    </div>
  )
}

function AdminPage({ college }) {
  const [tab, setTab] = useState(college.data.timetable ? 'timetable' : 'setup')
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200">
        {[
          ['setup', 'Setup'],
          ['timetable', 'Timetable'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <AdminWizard college={college} onGenerated={() => setTab('timetable')} />
      ) : (
        <TimetableViews data={college.data} />
      )}
    </div>
  )
}
