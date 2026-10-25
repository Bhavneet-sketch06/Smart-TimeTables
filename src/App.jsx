import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, LogOut } from 'lucide-react'
import { useCollegeData } from './hooks/useCollegeData.js'
import { useRemoteCollege } from './hooks/useRemoteCollege.js'
import { usePrefs } from './hooks/usePrefs.js'
import { useAuth } from './auth/useAuth.js'
import { localDemoAllowed, supabaseConfigured } from './lib/supabase.js'
import PrefsControls from './components/PrefsControls.jsx'
import Landing from './pages/Landing.jsx'
import { Button, EmptyState } from './components/ui.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import DepartmentBar, { HodDepartmentPicker } from './components/DepartmentBar.jsx'
import { AdminPage, FacultyPage, HodPage, StudentPage } from './pages/RolePages.jsx'
import { LoadError, NotConfigured, SetPassword, SignIn, Splash } from './pages/auth/AuthScreens.jsx'
import AccessPending from './pages/auth/AccessPending.jsx'
import { ALL, deptById } from './data/departments.js'

const ROLE_KEY = 'ttgen:role'
const DEPT_KEY = 'ttgen:dept'
const HOD_KEY = 'ttgen:hodDept'
const ROLE_LABELS = { admin: 'Administrator', hod: 'HOD / Coordinator', faculty: 'Faculty', student: 'Student' }
const ROLE_SHORT = { admin: 'Admin', hod: 'HOD', faculty: 'Faculty', student: 'Student' }
const PAGES = { admin: AdminPage, hod: HodPage, faculty: FacultyPage, student: StudentPage }

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

/**
 * With Supabase configured, people sign in and their role comes from their profile in the database.
 * Without it, the browser-only demo runs during development (or when VITE_LOCAL_DEMO=true); otherwise nothing.
 */
export default function App() {
  const [prefs, setPrefs] = usePrefs()
  const controls = <PrefsControls prefs={prefs} setPrefs={setPrefs} />
  if (supabaseConfigured) return <AccountsApp controls={controls} />
  if (localDemoAllowed) return <LocalDemoApp controls={controls} />
  return <NotConfigured controls={controls} />
}

function Brand({ onClick, children }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className="flex min-w-0 items-center gap-2" aria-label="Smart TimeTables">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">
        <CalendarDays className="h-5 w-5" />
      </span>
      {/* On phones the icon stands for the name, leaving room for the role and the buttons. */}
      <span className="hidden whitespace-nowrap text-lg font-bold sm:inline">Smart TimeTables</span>
      {children}
    </Tag>
  )
}

function RoleBadge({ role, data, deptId }) {
  return (
    <span className="truncate rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 sm:text-sm">
      <span className="sm:hidden">{ROLE_SHORT[role]}</span>
      <span className="hidden sm:inline">{ROLE_LABELS[role]}</span>
      {deptId && deptId !== ALL && (data.departments ?? []).length > 0 && ` · ${deptById(data, deptId)?.short ?? '?'}`}
    </span>
  )
}

// ---------- signed-in app ----------

function AccountsApp({ controls }) {
  const auth = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  if (auth.loading) return <Splash text="Restoring your session…" />
  if (!auth.session) {
    return signingIn ? (
      <SignIn auth={auth} controls={controls} onBack={() => setSigningIn(false)} />
    ) : (
      <Landing accounts onSelect={() => setSigningIn(true)} controls={controls} />
    )
  }
  if (auth.needsPassword) return <SetPassword auth={auth} controls={controls} />
  if (auth.profile.status === 'loading') return <Splash text="Checking your access…" />
  const p = auth.profile.row
  if (auth.profile.status === 'error' || !p || !p.active || p.role === 'pending' || !PAGES[p.role]) {
    return <AccessPending auth={auth} controls={controls} />
  }
  // A new role or scope gets a fresh workspace (and a fresh data load) rather than reusing the old one.
  return <Workspace key={[p.user_id, p.role, p.dept_id, p.teacher_id, p.section_id].join('|')} auth={auth} profile={p} controls={controls} />
}

/** Saving status of an administrator's setup edits. */
function SaveStatus({ college }) {
  const { saving, error, savedAt } = college.saveState
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> <span className="hidden sm:inline">Saving…</span>
      </span>
    )
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-red-700" title={error}>
        <AlertTriangle className="h-4 w-4" /> <span className="hidden sm:inline">Not saved</span>
        <Button variant="ghost" className="px-2 py-1" onClick={college.retrySave}>
          Retry
        </Button>
      </span>
    )
  }
  if (!savedAt) return null
  return (
    <span className="hidden items-center gap-1.5 text-sm text-slate-500 sm:inline-flex">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Saved
    </span>
  )
}

function Workspace({ auth, profile, controls }) {
  const role = profile.role
  const college = useRemoteCollege(profile)
  const { data } = college
  const [dept, setDept] = useState(() => readKey(DEPT_KEY, ''))
  useEffect(() => {
    if (role === 'admin') writeKey(DEPT_KEY, dept)
  }, [role, dept])

  if (!data) {
    return college.status.error ? (
      <LoadError message={college.status.error} onRetry={college.reload} onSignOut={auth.signOut} controls={controls} />
    ) : (
      <Splash text="Loading your college…" />
    )
  }

  // Administrators pick any department or the whole college; everyone else is fixed to the account's department.
  const departments = data.departments ?? []
  const validDept = (id) => departments.some((d) => d.id === id)
  const deptId = role === 'admin' ? (dept === ALL || validDept(dept) ? dept : departments[0]?.id ?? ALL) : profile.dept_id
  const me = { userId: profile.user_id, email: profile.email, teacherId: profile.teacher_id, sectionId: profile.section_id }
  const Page = PAGES[role]
  const scopeMissing = role !== 'admin' && !validDept(deptId)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
          <Brand>
            <RoleBadge role={role} data={data} deptId={deptId} />
          </Brand>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {role === 'admin' && <SaveStatus college={college} />}
            {controls}
            <span className="hidden max-w-56 truncate text-sm text-slate-500 md:inline" title={profile.email}>
              {profile.display_name || profile.email}
            </span>
            <Button variant="secondary" onClick={auth.signOut} aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="w-full px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 print:p-0">
        {college.status.error && (
          <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 print:hidden">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {college.status.error}
            <Button variant="ghost" className="ml-auto px-2 py-1" onClick={college.reload}>
              Reload
            </Button>
          </p>
        )}
        {scopeMissing ? (
          <EmptyState>Your department is not in the college data yet. Ask your administrator.</EmptyState>
        ) : (
          <>
            <DepartmentBar
              data={data}
              value={deptId}
              onChange={setDept}
              allowAll={role === 'admin'}
              locked={role !== 'admin'}
              lockedLabel="Your department"
            />
            <Page college={college} deptId={deptId} me={me} />
          </>
        )}
      </main>
      <ChatWidget data={data} deptId={deptId} />
    </div>
  )
}

// ---------- browser-only demo (no accounts) ----------

function LocalDemoApp({ controls }) {
  const college = useCollegeData()
  const { data } = college
  // The landing page always opens first; the last role used is offered there as a shortcut.
  const [view, setView] = useState('landing')
  // One department context for the whole app, remembered across views and reloads.
  const [dept, setDept] = useState(() => readKey(DEPT_KEY, ''))
  const [hodDept, setHodDept] = useState(() => readKey(HOD_KEY, ''))

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
        controls={controls}
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
  const Page = PAGES[view]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
          <Brand onClick={() => setView('landing')}>
            <RoleBadge role={view} data={data} deptId={effective} />
            <span className="hidden whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800 lg:inline">
              Browser-only demo
            </span>
          </Brand>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {controls}
            <Button variant="secondary" className="whitespace-nowrap" onClick={() => setView('landing')}>
              <span className="sm:hidden">Switch</span>
              <span className="hidden sm:inline">Switch role</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="w-full px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 print:p-0">
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
            <Page college={college} deptId={effective} me={null} />
          </>
        )}
      </main>
      <ChatWidget data={data} deptId={effective} />
    </div>
  )
}
