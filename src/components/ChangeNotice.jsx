import { useState } from 'react'
import { BellRing, ChevronDown, MoveRight } from 'lucide-react'
import { moveLines } from '../changeAssistant.js'

/**
 * The latest change notice (written by the administrator after a sudden change) plus the viewer's own classes that
 * moved. `entries` are the classes this viewer cares about (their section, their teaching); shows nothing when
 * there is no notice and none of them moved.
 */
export default function ChangeNotice({ data, entries = [] }) {
  const [open, setOpen] = useState(false)
  const notice = data.meta?.notice
  const mine = moveLines(data, entries)
  if (!notice?.text && !mine.length) return null
  const when = notice?.at ? new Date(notice.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <section aria-label="Timetable change" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 print:hidden">
      <div className="flex items-start gap-2">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">
            Timetable updated{when ? ` · ${when}` : ''}
            {mine.length > 0 && (
              <span className="font-normal">
                {' '}
                · {mine.length} of your classes moved
              </span>
            )}
          </p>
          {mine.length > 0 && (
            <ul className="space-y-1 text-sm">
              {mine.slice(0, 6).map((m) => (
                <li key={`${m.entry.sectionId}-${m.entry.day}-${m.entry.period}-${m.entry.group ?? ''}`} className="flex flex-wrap items-center gap-x-1.5">
                  <b>{m.what}</b>
                  <span className="text-amber-800">{m.section}:</span>
                  <span className="line-through opacity-70">{m.was}</span>
                  <MoveRight className="h-3.5 w-3.5" />
                  <span className="font-medium">{m.now}</span>
                </li>
              ))}
              {mine.length > 6 && <li className="text-amber-800">and {mine.length - 6} more (marked "Moved" in the timetable)</li>}
            </ul>
          )}
          {notice?.text && (
            <>
              <button className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline" onClick={() => setOpen(!open)}>
                <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /> {open ? 'Hide' : 'Read'} the announcement
              </button>
              {open && <p className="whitespace-pre-line text-sm">{notice.text}</p>}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
