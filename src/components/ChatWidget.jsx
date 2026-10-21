import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, RotateCcw, SendHorizontal, Sparkles, X } from 'lucide-react'
import { buildTimetableContext } from '../chat/timetableContext.js'

function suggestionsFor(data) {
  const sec = data.sections[0]?.name
  const teacher = data.teachers[0]?.name
  const day = data.time.days[2] ?? data.time.days[0]
  return [
    sec && `When is ${sec} free on ${day}?`,
    teacher && `What does ${teacher} teach this week?`,
    `Which rooms are free on ${data.time.days[0]} in period 2?`,
    sec && `Summarise ${sec}'s lab schedule.`,
  ].filter(Boolean)
}

/** Floating "Ask AI" assistant that answers questions about the current timetable via /api/chat. */
export default function ChatWidget({ data }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)
  const abortRef = useRef(null)
  const context = useMemo(() => buildTimetableContext(data), [data])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, open])
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send(text) {
    const question = text.trim()
    if (!question || busy) return
    const history = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)
    const appendToAnswer = (chunk) =>
      setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: m.at(-1).content + chunk }])

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context }),
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) {
        appendToAnswer(`⚠️ ${(await res.text()) || `Request failed (${res.status}).`}`)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        appendToAnswer(decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      if (err.name !== 'AbortError') appendToAnswer('⚠️ Could not reach the assistant. Is the server running?')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    abortRef.current?.abort()
    setMessages([])
    setBusy(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-700"
      >
        <MessageCircle className="h-5 w-5" /> Ask AI
      </button>
    )
  }

  return (
    <section
      aria-label="Timetable assistant"
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100vh-2.5rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-slate-200"
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Timetable Assistant</h2>
            <p className="text-sm text-slate-500">Ask anything about this timetable</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button title="New chat" onClick={reset} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button title="Close" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-slate-600">
              Hi! I can answer questions about {data.meta?.name ?? 'your college'}'s timetable: free slots, who teaches
              what, room availability and more.
            </p>
            <div className="flex flex-col gap-2">
              {suggestionsFor(data).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 ${
                m.role === 'user'
                  ? 'rounded-br-md bg-indigo-600 text-white'
                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
              }`}
            >
              {m.content || <span className="inline-flex gap-1 text-slate-400">Thinking…</span>}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
      >
        <textarea
          rows={1}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Ask about classes, teachers, rooms…"
          className="max-h-32 flex-1 resize-none overflow-hidden rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          title="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white disabled:bg-indigo-300"
        >
          <SendHorizontal className="h-5 w-5" />
        </button>
      </form>
    </section>
  )
}
