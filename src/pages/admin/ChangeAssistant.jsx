import { useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, LayoutGrid, Loader2, Megaphone, MoveRight, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { Button, Card } from '../../components/ui.jsx'
import { authHeaders } from '../../lib/authHeaders.js'
import { announcementFacts, buildCatalog, moveLines, resolveProposal, todayText, updateTimetable } from '../../changeAssistant.js'

const EXAMPLES = [
  'Dr. Kapil Sharma is on leave this Wednesday',
  'Convocation on Friday in the first two periods, no classes for anyone',
  'Software Lab-I is closed for AC repair',
]

/** POST to the change assistant (api/change.js); returns the JSON answer or throws with a readable message. */
async function askAssistant(body) {
  const res = await fetch('/api/change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!res) throw new Error('Could not reach the server. Check your connection.')
  if (!res.ok) throw new Error((await res.text()) || `The request failed (${res.status}).`)
  return res.json()
}

/**
 * Administrator: describe a sudden change in plain words. Claude proposes structured changes, the app checks them
 * against the college data and shows them for approval; Apply regenerates around every unaffected class, then
 * Claude drafts an announcement from the exact list of moved classes, which the administrator edits and publishes.
 */
export default function ChangeAssistant({ college, onViewTimetable }) {
  const { data } = college
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('idle') // idle | thinking | review | applying | done
  const [error, setError] = useState('')
  const [review, setReview] = useState(null) // { question, summary, items }
  const [chosen, setChosen] = useState([])
  const [outcome, setOutcome] = useState(null) // { moved, kept, lines, facts }
  const [draft, setDraft] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [published, setPublished] = useState(false)

  const reset = () => {
    setPhase('idle')
    setError('')
    setReview(null)
    setOutcome(null)
    setDraft('')
    setPublished(false)
  }

  const understand = async () => {
    if (!text.trim()) return setError('Describe the change first.')
    setError('')
    setPhase('thinking')
    try {
      const proposal = await askAssistant({ mode: 'understand', text: text.trim(), catalog: buildCatalog(data), today: todayText() })
      const r = resolveProposal(data, proposal)
      setReview(r)
      setChosen(r.items.map((i) => i.ok))
      setPhase('review')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  const apply = () => {
    const items = review.items.filter((i, k) => i.ok && chosen[k])
    if (!items.length) return setError('Tick at least one change to apply.')
    setError('')
    setPhase('applying')
    // Let the "Updating…" state paint before the synchronous search.
    setTimeout(() => {
      const run = updateTimetable(data, items)
      if (!run.ok) {
        const why = run.result.problems?.length ? run.result.problems.join(' ') : run.result.reason
        setError(`This change can't be fitted, so nothing was changed. ${why || ''}`.trim())
        setPhase('review')
        return
      }
      for (const [key, value] of Object.entries(run.patch)) college.update(key, value)
      college.setTimetable(run.timetable)
      const lines = moveLines(data, run.timetable.entries)
      setOutcome({ moved: run.moved, kept: run.timetable.entries.length - run.moved, lines, facts: announcementFacts(data, items, run.timetable.entries) })
      setPhase('done')
    }, 30)
  }

  const draftNotice = async () => {
    setDrafting(true)
    setError('')
    try {
      const { text: written } = await askAssistant({ mode: 'announce', facts: outcome.facts })
      setDraft(written)
    } catch (e) {
      setError(e.message)
    }
    setDrafting(false)
  }

  const publish = async () => {
    await college.publishNotice({ text: draft.trim(), at: new Date().toISOString(), moved: outcome.moved })
    setPublished(true)
  }

  const busy = phase === 'thinking' || phase === 'applying'
  return (
    <Card className="space-y-4 border-indigo-200 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Wand2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Something changed? Describe it</h2>
            <p className="text-sm text-slate-500">
              The AI turns your words into exact changes for you to check. Only the classes they affect move; everyone else keeps their week.
            </p>
          </div>
        </div>
        {data.meta?.notice && (
          <Button variant="ghost" onClick={() => college.publishNotice(null)} title={data.meta.notice.text}>
            Remove the current notice
          </Button>
        )}
      </div>

      {(phase === 'idle' || phase === 'thinking') && (
        <div className="space-y-2">
          <textarea
            rows={2}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && understand()}
            placeholder={`e.g. ${EXAMPLES[0]}`}
            aria-label="Describe the change"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={understand} disabled={busy}>
              {phase === 'thinking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {phase === 'thinking' ? 'Understanding…' : 'Understand the change'}
            </Button>
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-indigo-300">
                {x}
              </button>
            ))}
          </div>
        </div>
      )}

      {(phase === 'review' || phase === 'applying') && review && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            You wrote: <span className="text-slate-800">"{text.trim()}"</span>
          </p>
          {review.question ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              <HelpCircle className="mt-0.5 h-5 w-5 shrink-0" /> {review.question}
            </p>
          ) : (
            <>
              {review.summary && <p className="font-medium">{review.summary}</p>}
              <ul className="space-y-1.5">
                {review.items.map((item, k) => (
                  <li key={k}>
                    <label className={`flex items-start gap-2 ${item.ok ? '' : 'text-slate-400'}`}>
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-indigo-600"
                        disabled={!item.ok || busy}
                        checked={item.ok && !!chosen[k]}
                        onChange={(e) => setChosen(chosen.map((c, j) => (j === k ? e.target.checked : c)))}
                      />
                      <span>{item.label}</span>
                    </label>
                  </li>
                ))}
                {review.items.length === 0 && <li className="text-slate-500">No changes were found in that description.</li>}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!review.question && review.items.some((i) => i.ok) && (
              <Button onClick={apply} disabled={busy}>
                {phase === 'applying' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {phase === 'applying' ? 'Updating the timetable…' : 'Apply and update the timetable'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => (setPhase('idle'), setError(''))} disabled={busy}>
              {review.question ? 'Answer and try again' : 'Change the description'}
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && outcome && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> Timetable updated: {outcome.moved} {outcome.moved === 1 ? 'class' : 'classes'} moved, {outcome.kept} kept exactly where{' '}
            {outcome.kept === 1 ? 'it was' : 'they were'}. No clashes.
          </p>
          {outcome.lines.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm">
              {outcome.lines.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-1.5">
                  <b>{l.section}</b> · {l.what}: <span className="text-slate-500 line-through">{l.was}</span>
                  <MoveRight className="h-3.5 w-3.5" /> <span className="font-medium">{l.now}</span>
                </li>
              ))}
            </ul>
          )}
          {published ? (
            <p className="flex items-center gap-2 text-emerald-700">
              <Megaphone className="h-4 w-4" /> Published: students and teachers see the notice and their moved classes on their timetable.
            </p>
          ) : draft ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-600" htmlFor="change-notice">
                Announcement (edit before publishing)
              </label>
              <textarea
                id="change-notice"
                rows={6}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <Button onClick={publish} disabled={!draft.trim()}>
                <Megaphone className="h-4 w-4" /> Publish the notice
              </Button>
            </div>
          ) : (
            <Button onClick={draftNotice} disabled={drafting}>
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {drafting ? 'Writing…' : 'Draft an announcement'}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            {onViewTimetable && (
              <Button variant="secondary" onClick={onViewTimetable}>
                <LayoutGrid className="h-4 w-4" /> View the updated timetable
              </Button>
            )}
            <Button variant="ghost" onClick={() => (reset(), setText(''))}>
              <RotateCcw className="h-4 w-4" /> Another change
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </Card>
  )
}
