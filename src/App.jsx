import { useEffect, useState } from 'react'
import { useCollegeData } from './hooks/useCollegeData.js'
import Landing from './pages/Landing.jsx'
import { Button } from './components/ui.jsx'
import AdminWizard from './pages/admin/AdminWizard.jsx'
import TimetableViews from './pages/TimetableViews.jsx'

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

  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY, view)
    } catch {
      // ignore: role memory is a convenience only
    }
  }, [view])

  if (view === 'landing') {
    return <Landing onSelect={setView} hasData={college.data.sections.length > 0} />
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-600">Timetable</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {ROLE_LABELS[view]}
            </span>
          </div>
          <Button variant="ghost" onClick={() => setView('landing')}>
            Switch role
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {view === 'admin' && <AdminPage college={college} />}
        {view === 'hod' && <TimetableViews data={college.data} withDepartmentFilter />}
        {(view === 'faculty' || view === 'student') && (
          <p className="text-slate-500">{ROLE_LABELS[view]} view coming soon.</p>
        )}
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
