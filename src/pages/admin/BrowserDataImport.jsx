import { useState } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseZap, HardDrive, Loader2, Trash2 } from 'lucide-react'
import { Button, Card } from '../../components/ui.jsx'
import { readStored, removeStored } from '../../hooks/useCollegeData.js'
import { friendlyDbError } from '../../hooks/useRemoteCollege.js'
import { supabase } from '../../lib/supabase.js'
import { SETUP_KEYS, collegeCounts, savePayload, verifyCopy } from '../../remote/collegeRows.js'

const DONE_KEY = 'ttgen:browserCopyVerified'
const readDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) ?? ''
  } catch {
    return ''
  }
}
const LABELS = {
  departments: 'Departments',
  rooms: 'Rooms',
  subjects: 'Subjects',
  teachers: 'Teachers',
  sections: 'Sections',
  classes: 'Timetable classes',
  bookings: 'Bookings',
  requests: 'Space requests',
}

/**
 * Administrator: copy the college saved in this browser (from before accounts) into the shared database.
 * Preview → confirm → copy in one transaction → re-read and verify. The browser copy is only removed when the
 * administrator asks, and only after the copy was verified.
 */
export default function BrowserDataImport({ college }) {
  const [local, setLocal] = useState(() => readStored())
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [state, setState] = useState({ step: 'preview', error: '', problems: [] }) // preview | copying | verified | failed
  const [done, setDone] = useState(readDone)

  const empty = !local || (!local.sections?.length && !local.rooms?.length && !local.bookings?.length && !local.requests?.length)
  if (empty) return null

  const browser = collegeCounts(local)
  const database = collegeCounts(college.data)
  const dbHasSetup = database.departments + database.rooms + database.sections > 0

  const copy = async () => {
    setState({ step: 'copying', error: '', problems: [] })
    await college.refresh() // send any pending setup edits first
    const payload = {
      ...savePayload(local, [...SETUP_KEYS, 'timetable']),
      addBookings: local.bookings ?? [],
      addRequests: local.requests ?? [],
    }
    const { error } = await supabase.rpc('save_college', { p: payload })
    if (error) return setState({ step: 'failed', error: friendlyDbError(error), problems: [] })
    const fresh = await college.refresh()
    const problems = verifyCopy(local, fresh)
    if (problems.length) return setState({ step: 'failed', error: 'The copy could not be verified.', problems })
    const when = new Date().toLocaleString()
    try {
      localStorage.setItem(DONE_KEY, when)
    } catch {
      // only a reminder
    }
    setDone(when)
    setState({ step: 'verified', error: '', problems: [] })
  }

  const remove = () => {
    if (!window.confirm('Remove the college data saved in this browser? The shared database copy is kept.')) return
    if (removeStored()) setLocal(null)
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50/70">
        <p className="flex items-start gap-2 text-sm text-amber-900">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0" />
          {done
            ? `This browser still keeps its own copy of the college data (copied to the shared database and verified ${done}).`
            : `This browser has college data from before sign-in (${browser.sections} sections, ${browser.classes} timetable classes, ${browser.bookings} bookings). It is not shared yet.`}
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {done ? 'Review' : 'Copy to the shared database'}
        </Button>
      </Card>
    )
  }

  return (
    <Card className="space-y-4 border-amber-200">
      <div className="flex items-start gap-3">
        <DatabaseZap className="mt-0.5 h-6 w-6 shrink-0 text-indigo-600" />
        <div>
          <h3 className="text-lg font-semibold">Copy this browser's data to the shared database</h3>
          <p className="text-sm text-slate-500">
            Nothing is deleted from this browser. After the copy, the app re-reads the database and checks every record.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-80 text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 font-medium" />
              <th className="py-1 font-medium">This browser</th>
              <th className="py-1 font-medium">Shared database now</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(LABELS).map(([key, label]) => (
              <tr key={key} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-600">{label}</td>
                <td className="py-1.5 font-semibold">{browser[key]}</td>
                <td className="py-1.5">{database[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {local.meta?.name && <p className="text-sm text-slate-600">Browser data: {local.meta.name}</p>}

      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Copying <b>replaces</b> the shared time structure, departments, room types, rooms, subjects, teachers, sections and
          timetable with this browser's{dbHasSetup ? ' (the database already has setup data, which will be overwritten)' : ''}.
          Bookings and space requests are <b>added</b>; ones already in the database are kept. Accounts are not affected, but
          check the Users tab afterwards if department, faculty or section names changed.
        </span>
      </p>

      {state.step === 'verified' ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Copied and verified: the shared database has every record from this browser.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Remove the browser copy
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep it for now
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand this replaces the shared setup and timetable for everyone.
          </label>
          {state.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p>{state.error} The browser copy is untouched.</p>
              {state.problems.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {state.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} disabled={!confirmed || state.step === 'copying'}>
              {state.step === 'copying' && <Loader2 className="h-4 w-4 animate-spin" />}
              {state.step === 'copying' ? 'Copying…' : 'Copy and verify'}
            </Button>
            {done && (
              <Button variant="danger" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Remove the browser copy
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
