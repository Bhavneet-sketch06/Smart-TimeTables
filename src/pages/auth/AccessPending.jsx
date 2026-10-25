import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock, Loader2, LogOut, RefreshCw, Send, UserRoundX } from 'lucide-react'
import { Button, Card, Field, Select } from '../../components/ui.jsx'
import { supabase } from '../../lib/supabase.js'
import { friendlyDbError } from '../../hooks/useRemoteCollege.js'
import { AuthFrame } from './AuthScreens.jsx'

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'hod', label: 'HOD / Coordinator' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))

/** "Faculty · CSE · Dr. Amit Jain" for a profile's open request. */
function requestText(row, options) {
  const dept = options?.departments.find((d) => d.id === row.requested_dept_id)
  const who =
    row.requested_role === 'faculty'
      ? options?.teachers.find((t) => t.id === row.requested_teacher_id)?.name
      : row.requested_role === 'student'
        ? [options?.sections.find((s) => s.id === row.requested_section_id)?.name, row.requested_semester].filter(Boolean).join(', ')
        : ''
  return [ROLE_LABEL[row.requested_role], dept?.short ?? row.requested_dept_id, who].filter(Boolean).join(' · ')
}

/** A pending user says who they are. This only records a request: an administrator still has to approve it. */
function RequestForm({ options, row, onSent, onCancel }) {
  const [f, setF] = useState(() => ({
    role: row.requested_role ?? 'student',
    deptId: row.requested_dept_id ?? '',
    teacherId: row.requested_teacher_id ?? '',
    sectionId: row.requested_section_id ?? '',
    semester: row.requested_semester ?? '',
    note: row.requested_note ?? '',
  }))
  const [everyone, setEveryone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (changes) => (setError(''), setF((x) => ({ ...x, ...changes })))

  const teachers = options.teachers.filter((t) => everyone || t.deptId === f.deptId)
  const sections = options.sections.filter((s) => s.deptId === f.deptId)
  const missing =
    !f.deptId
      ? 'Choose your department.'
      : f.role === 'faculty' && !f.teacherId
        ? 'Choose your name.'
        : f.role === 'student' && (!f.sectionId || !f.semester.trim())
          ? 'Choose your section and semester.'
          : ''

  const send = async (e) => {
    e.preventDefault()
    if (missing) return setError(missing)
    setBusy(true)
    const { error: err } = await supabase.rpc('request_access', {
      p_role: f.role,
      p_dept_id: f.deptId,
      p_teacher_id: f.role === 'faculty' ? f.teacherId : null,
      p_section_id: f.role === 'student' ? f.sectionId : null,
      p_semester: f.role === 'student' ? f.semester.trim() : null,
      p_note: f.note.trim() || null,
    })
    setBusy(false)
    if (err) return setError(friendlyDbError(err))
    onSent()
  }

  if (!options.departments.length) {
    return <p className="text-slate-600">The college hasn't been set up yet, so there's nothing to choose. Try again later.</p>
  }

  return (
    <form className="space-y-3" onSubmit={send} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="I am a" value={f.role} options={ROLES} onChange={(e) => set({ role: e.target.value })} />
        <Select
          label="Department"
          value={f.deptId}
          options={[{ value: '', label: 'Choose…' }].concat(options.departments.map((d) => ({ value: d.id, label: `${d.short} · ${d.name}` })))}
          onChange={(e) => set({ deptId: e.target.value, teacherId: '', sectionId: '', semester: '' })}
        />
        {f.role === 'faculty' && (
          <div className="sm:col-span-2">
            <Select
              label="Your name"
              value={f.teacherId}
              options={[{ value: '', label: f.deptId || everyone ? 'Choose…' : 'Choose a department first' }].concat(
                teachers.map((t) => ({ value: t.id, label: t.name })),
              )}
              onChange={(e) => set({ teacherId: e.target.value })}
            />
            <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              My name isn't listed: show faculty of every department
            </label>
          </div>
        )}
        {f.role === 'student' && (
          <>
            <Select
              label="Section"
              value={f.sectionId}
              options={[{ value: '', label: f.deptId ? 'Choose…' : 'Choose a department first' }].concat(
                sections.map((s) => ({ value: s.id, label: `${s.name}${s.batch ? ` · ${s.batch}` : ''}` })),
              )}
              onChange={(e) => {
                const s = sections.find((x) => x.id === e.target.value)
                set({ sectionId: e.target.value, semester: s?.batch || f.semester })
              }}
            />
            <Field label="Semester" value={f.semester} maxLength={60} placeholder="e.g. 3rd Sem" onChange={(e) => set({ semester: e.target.value })} />
          </>
        )}
      </div>
      <Field
        label="Note for the administrator (optional)"
        value={f.note}
        maxLength={300}
        placeholder={f.role === 'student' ? 'e.g. University roll number' : 'e.g. Employee ID'}
        onChange={(e) => set({ note: e.target.value })}
      />
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * Signed in, but no active role: no college data is loaded. A new (pending) user can send an access request;
 * an account whose access was turned off just sees that.
 */
export default function AccessPending({ auth, controls }) {
  const row = auth.profile.row
  const pending = !row || row.role === 'pending'
  const [options, setOptions] = useState(null)
  const [optionsError, setOptionsError] = useState('')
  const [editing, setEditing] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!row || !pending) return
    supabase.rpc('access_options').then(({ data, error }) => {
      if (error) setOptionsError(friendlyDbError(error))
      else setOptions(data)
    })
  }, [row, pending])

  const requested = pending && row?.requested_role
  const summary = useMemo(() => (requested ? requestText(row, options) : ''), [requested, row, options])
  const check = async () => {
    setChecking(true)
    await auth.reloadProfile()
    setChecking(false)
  }

  return (
    <AuthFrame controls={controls} wide>
      <Card className="space-y-4 p-6">
        {requested && !editing ? <Clock className="h-8 w-8 text-indigo-600" /> : <UserRoundX className="h-8 w-8 text-amber-600" />}
        <div>
          <h1 className="text-2xl font-bold">
            {!pending ? 'Your access is turned off' : requested && !editing ? 'Request sent' : 'Ask your administrator for access'}
          </h1>
          <p className="mt-1 text-slate-600">
            {!pending
              ? 'Ask your administrator if you think this is a mistake. Nothing from the college is shown until access is turned back on.'
              : requested && !editing
                ? 'An administrator checks your request and turns your access on. Nothing from the college is shown until then.'
                : 'Tell the administrator who you are. They check it and turn your access on; nothing from the college is shown until then.'}
          </p>
        </div>

        {pending && row?.request_declined_at && !requested && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Your last request wasn't approved. Check the details and send it again, or
            contact your administrator.
          </p>
        )}

        {pending &&
          (optionsError ? (
            <p className="text-sm text-red-700">{optionsError}</p>
          ) : !options ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : requested && !editing ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
              <p className="text-sm text-slate-500">You asked for</p>
              <p className="font-semibold text-slate-900">{summary}</p>
              {row.requested_note && <p className="text-sm text-slate-600">Note: {row.requested_note}</p>}
              <Button variant="ghost" className="mt-1 px-0" onClick={() => setEditing(true)}>
                Change request
              </Button>
            </div>
          ) : (
            <RequestForm
              options={options}
              row={row}
              onSent={async () => {
                setEditing(false)
                await auth.reloadProfile()
              }}
              onCancel={requested ? () => setEditing(false) : undefined}
            />
          ))}

        {auth.profile.status === 'error' && <p className="text-sm text-red-700">Couldn't read your account: {auth.profile.error}</p>}
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Signed in as {auth.user?.email}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={check} disabled={checking}>
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} /> Check again
          </Button>
          <Button variant="secondary" onClick={auth.signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </Card>
    </AuthFrame>
  )
}
