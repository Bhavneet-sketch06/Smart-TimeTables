import { useEffect, useState } from 'react'
import { useCollegeData } from './hooks/useCollegeData.js'
import Landing from './pages/Landing.jsx'
import { Button, Card } from './components/ui.jsx'
import AdminWizard from './pages/admin/AdminWizard.jsx'

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
        {view === 'admin' ? (
          <AdminPage college={college} />
        ) : (
          <p className="text-slate-500">{ROLE_LABELS[view]} view coming soon.</p>
        )}
      </main>
    </div>
  )
}

function AdminPage({ college }) {
  const tt = college.data.timetable
  return (
    <div className="space-y-4">
      {tt && (
        <Card className={tt.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}>
          <p className="font-semibold">{tt.ok ? 'Timetable generated' : 'Timetable incomplete'}</p>
          <p className="text-sm">
            Placed {tt.stats.placed}/{tt.stats.total} classes · {tt.stats.clashes} clashes · quality {tt.stats.quality}/100 ·{' '}
            {tt.stats.ms} ms
          </p>
          {tt.reason && <p className="mt-1 text-sm text-amber-800">{tt.reason}</p>}
        </Card>
      )}
      <AdminWizard college={college} onGenerated={() => {}} />
    </div>
  )
}
