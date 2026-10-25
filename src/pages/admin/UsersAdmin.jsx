import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Search, ShieldAlert, UserPlus } from 'lucide-react'
import { Button, Card, EmptyState, Field, Select } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'
import { friendlyDbError } from '../../hooks/useRemoteCollege.js'
import { batchOf, sectionsOf, teachersOf } from '../../data/departments.js'

const ROLES = [
  { value: 'pending', label: 'No access (pending)' },
  { value: 'admin', label: 'Administrator' },
  { value: 'hod', label: 'HOD / Coordinator' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'student', label: 'Student' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))
const FILTERS = [
  { value: 'waiting', label: 'Waiting for access' },
  { value: 'active', label: 'Active' },
  { value: 'off', label: 'Turned off' },
  { value: 'all', label: 'Everyone' },
]

const draftOf = (p) => ({
  display_name: p.display_name ?? '',
  role: p.role,
  dept_id: p.dept_id ?? '',
  teacher_id: p.teacher_id ?? '',
  section_id: p.section_id ?? '',
  semester: p.semester ?? '',
  active: p.active,
})

/** What a draft is missing before it can be saved (the database checks the same rules). */
function missing(d) {
  if (d.role === 'hod' && !d.dept_id) return 'Choose the department they coordinate.'
  if (d.role === 'faculty' && (!d.dept_id || !d.teacher_id)) return 'Choose their department and their faculty name.'
  if (d.role === 'student' && (!d.dept_id || !d.section_id || !d.semester.trim())) return 'Choose their department, section and semester.'
  return ''
}

/** Only the fields the role uses; the database drops the rest too. */
function patchOf(d) {
  const role = d.role
  return {
    display_name: d.display_name.trim() || null,
    role,
    active: role === 'pending' ? false : d.active,
    dept_id: ['hod', 'faculty', 'student'].includes(role) ? d.dept_id || null : null,
    teacher_id: role === 'faculty' ? d.teacher_id || null : null,
    section_id: role === 'student' ? d.section_id || null : null,
    semester: role === 'student' ? d.semester.trim() || null : null,
  }
}

function UserCard({ data, profile, me, onSaved }) {
  const [d, setD] = useState(() => draftOf(profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => setD(draftOf(profile)), [profile])
  const set = (changes) => {
    setSaved(false)
    setError('')
    setD((x) => ({ ...x, ...changes }))
  }
  const isMe = profile.user_id === me.userId
  const changed = JSON.stringify(patchOf(d)) !== JSON.stringify(patchOf(draftOf(profile)))
  const problem = d.role !== 'pending' && d.active ? missing(d) : ''

  const teachers = useMemo(
    () => [...(d.dept_id ? teachersOf(data, d.dept_id) : data.teachers)].sort((a, b) => a.name.localeCompare(b.name)),
    [data, d.dept_id],
  )
  const sections = d.dept_id ? sectionsOf(data, d.dept_id) : []

  const save = async () => {
    setBusy(true)
    setError('')
    const { error: e } = await supabase.from('profiles').update(patchOf(d)).eq('user_id', profile.user_id)
    setBusy(false)
    if (e) return setError(friendlyDbError(e))
    setSaved(true)
    onSaved()
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">
            {profile.display_name || profile.email}
            {isMe && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">You</span>}
          </p>
          <p className="truncate text-sm text-slate-500">
            {profile.email} · {profile.active ? ROLE_LABEL[profile.role] : profile.role === 'pending' ? 'Waiting for access' : `${ROLE_LABEL[profile.role]} (turned off)`}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={d.role !== 'pending' && d.active}
            disabled={d.role === 'pending' || isMe}
            onChange={(e) => set({ active: e.target.checked })}
          />
          Access on
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Display name (optional)" value={d.display_name} maxLength={120} onChange={(e) => set({ display_name: e.target.value })} />
        <Select
          label="Role"
          value={d.role}
          options={ROLES}
          disabled={isMe}
          onChange={(e) => set({ role: e.target.value, active: e.target.value === 'pending' ? false : d.active || profile.role === 'pending' })}
        />
        {['hod', 'faculty', 'student'].includes(d.role) && (
          <Select
            label="Department"
            value={d.dept_id}
            options={[{ value: '', label: 'Choose…' }].concat((data.departments ?? []).map((x) => ({ value: x.id, label: `${x.short} · ${x.name}` })))}
            onChange={(e) => set({ dept_id: e.target.value, teacher_id: '', section_id: '', semester: '' })}
          />
        )}
        {d.role === 'faculty' && (
          <Select
            label="Faculty name"
            value={d.teacher_id}
            options={[{ value: '', label: 'Choose…' }].concat(teachers.map((t) => ({ value: t.id, label: t.name })))}
            onChange={(e) => set({ teacher_id: e.target.value })}
          />
        )}
        {d.role === 'student' && (
          <>
            <Select
              label="Section"
              value={d.section_id}
              options={[{ value: '', label: d.dept_id ? 'Choose…' : 'Choose a department first' }].concat(
                sections.map((s) => ({ value: s.id, label: `${s.name}${batchOf(s) ? ` · ${batchOf(s)}` : ''}` })),
              )}
              onChange={(e) => {
                const s = sections.find((x) => x.id === e.target.value)
                set({ section_id: e.target.value, semester: s ? batchOf(s) || d.semester : d.semester })
              }}
            />
            <Field label="Semester" value={d.semester} maxLength={60} placeholder="e.g. 3rd Sem" onChange={(e) => set({ semester: e.target.value })} />
          </>
        )}
      </div>

      {(changed || error || saved) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          {changed && (
            <Button onClick={save} disabled={busy || !!problem}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save access
            </Button>
          )}
          {changed && <Button variant="ghost" onClick={() => setD(draftOf(profile))}>Undo</Button>}
          {problem && <span className="text-sm text-amber-700">{problem}</span>}
          {error && <span className="text-sm text-red-700">{error}</span>}
          {saved && !changed && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Administrator-only: give invited accounts a role and scope, and turn access off. The database allows these
 * updates only for active administrators and checks every scope (see supabase/migrations).
 */
export default function UsersAdmin({ data, me }) {
  const [profiles, setProfiles] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('waiting')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setError('')
    const { data: rows, error: e } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (e) setError(friendlyDbError(e))
    else setProfiles(rows)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const shown = (profiles ?? [])
    .filter((p) =>
      filter === 'waiting' ? p.role === 'pending' : filter === 'active' ? p.active : filter === 'off' ? !p.active && p.role !== 'pending' : true,
    )
    .filter((p) => !query.trim() || `${p.email} ${p.display_name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const waiting = (profiles ?? []).filter((p) => p.role === 'pending').length

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Users and access</h2>
        <p className="text-slate-500">Give each invited account one role and the department, faculty name or section it may see.</p>
      </div>
      <Card className="flex items-start gap-3 border-indigo-200 bg-indigo-50/60">
        <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <p className="text-sm text-slate-700">
          To add someone, invite them in the Supabase Dashboard (Authentication → Users → Invite user). They appear here as
          "Waiting for access" and see nothing until you give them a role and turn access on. Public sign-up stays off.
        </p>
      </Card>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Show" value={filter} options={FILTERS.map((f) => (f.value === 'waiting' ? { ...f, label: `${f.label} (${waiting})` } : f))} onChange={(e) => setFilter(e.target.value)} className="w-56" />
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">Search</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Email or name"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 focus:border-indigo-500 focus:outline-none"
            />
          </span>
        </label>
        <Button variant="secondary" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-2 text-red-700">
          <ShieldAlert className="h-4 w-4" /> {error}
        </p>
      )}
      {!profiles && !error ? (
        <p className="inline-flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </p>
      ) : shown.length === 0 ? (
        <EmptyState>{filter === 'waiting' ? 'Nobody is waiting for access.' : 'No accounts match.'}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {shown.map((p) => (
            <UserCard key={p.user_id} data={data} profile={p} me={me} onSaved={load} />
          ))}
        </ul>
      )}
    </div>
  )
}
