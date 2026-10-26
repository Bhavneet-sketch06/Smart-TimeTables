import { useState } from 'react'
import { BellRing, MoveRight } from 'lucide-react'
import { EmptyState } from './ui.jsx'
import { moveLines } from '../changeAssistant.js'

const SEEN_KEY = 'ttgen:noticeSeen'
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Whether this browser has opened the current notice yet: [unseen, markSeen]. Per viewer only (localStorage); the
 * notice itself is shared (meta.notice).
 */
export function useNoticeSeen(notice) {
  const [seen, setSeen] = useState(readSeen)
  const unseen = !!notice?.text && notice.at !== seen
  const markSeen = () => {
    if (!unseen) return
    try {
      localStorage.setItem(SEEN_KEY, notice.at)
    } catch {
      // remembering is optional
    }
    setSeen(notice.at)
  }
  return [unseen, markSeen]
}

/**
 * The Notice tab: the administrator's latest published notice after a timetable change, and the classes that
 * moved for this viewer (`entries`: their section, their teaching, or their department; `whose` names them).
 */
export default function NoticeBoard({ data, entries = [], whose = 'Your classes' }) {
  const notice = data.meta?.notice
  const moved = moveLines(data, entries)
  if (!notice?.text && !moved.length) return <EmptyState>No notices right now. Timetable changes will appear here.</EmptyState>
  const when = notice?.at ? new Date(notice.at).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {notice?.text && (
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <header className="mb-2 flex flex-wrap items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-bold">Timetable update</h2>
            {when && <span className="text-sm text-amber-800">· {when}</span>}
          </header>
          <p className="whitespace-pre-line">{notice.text}</p>
        </article>
      )}
      <section aria-label={`${whose} that moved`} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">
          {whose} that moved{moved.length ? ` (${moved.length})` : ''}
        </h3>
        {moved.length === 0 ? (
          <p className="mt-1 text-slate-500">None: your week is unchanged.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {moved.map((m) => (
              <li key={`${m.entry.sectionId}-${m.entry.day}-${m.entry.period}-${m.entry.group ?? ''}`} className="py-2">
                <p className="font-medium">
                  {m.what} <span className="font-normal text-slate-500">· {m.section}</span>
                </p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
                  <span className="text-slate-500 line-through">{m.was}</span>
                  <MoveRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold text-emerald-700">{m.now}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-400">Moved classes are also marked "Moved" on the timetable.</p>
      </section>
    </div>
  )
}
