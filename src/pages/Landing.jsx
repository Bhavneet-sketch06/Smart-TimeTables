import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileUp,
  FlaskConical,
  GraduationCap,
  Lock,
  Presentation,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'

const FEATURES = [
  { icon: ShieldCheck, title: 'Zero clashes', text: 'No teacher, room or section is ever double-booked.' },
  { icon: FileUp, title: 'Import your data', text: 'CSV or Excel, checked row by row.' },
  { icon: Clock, title: 'Any week, any day', text: 'Breaks, half days and blocked slots.' },
  { icon: FlaskConical, title: 'Labs that fit', text: 'The right lab, group and length.' },
  { icon: CalendarCheck, title: 'Book a space', text: 'Reserve free rooms for events.' },
  { icon: Sparkles, title: 'Ask the assistant', text: '“When is CSE 3A free today?”' },
]

const STEPS = [
  { icon: FileUp, title: 'Import or set up', text: 'Excel, CSV or step by step' },
  { icon: Wand2, title: 'Generate', text: 'One click, about a second' },
  { icon: Share2, title: 'Share', text: 'Everyone sees their own week' },
]

const ROLES = [
  { id: 'admin', title: 'Administrator', icon: Settings2, text: 'Set up and generate' },
  { id: 'hod', title: 'HOD', icon: ClipboardList, text: 'Review your department' },
  { id: 'faculty', title: 'Faculty', icon: Presentation, text: 'Your teaching week' },
  { id: 'student', title: 'Student', icon: GraduationCap, text: 'Your classes today' },
]

// The hero preview: a week that fills itself in, cell by cell, like a generation run.
const COLORS = [
  'bg-sky-100 border-sky-300',
  'bg-emerald-100 border-emerald-300',
  'bg-violet-100 border-violet-300',
  'bg-amber-100 border-amber-300',
  'bg-rose-100 border-rose-300',
  'bg-teal-100 border-teal-300',
]
const PREVIEW = [
  [0, 1, 2, 3, 0],
  [4, 1, null, 5, 2],
  [3, null, 0, 4, null],
  [5, 2, 4, null, 1],
]
const TIMES = ['09:00', '10:00', '11:00', '12:00']

/** Fades its children up into place the first time they scroll into view. */
function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return setShown(true)
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition duration-700 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'motion-safe:translate-y-6 motion-safe:opacity-0'
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

function ProductPreview() {
  // "Generating..." while the cells pop in, then the verified result.
  const [done, setDone] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setDone(true), 1800)
    return () => clearTimeout(id)
  }, [])
  let n = 0
  return (
    <div className="group/preview relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-indigo-200 via-violet-200 to-fuchsia-200 opacity-60 blur-2xl transition duration-500 group-hover/preview:opacity-90" />
      <div className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-indigo-900/10 transition duration-500 group-hover/preview:-translate-y-1 sm:p-4">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-1 pb-3">
          <span className="h-3 w-3 rounded-full bg-rose-300" />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-emerald-300" />
          <span className="ml-3 truncate text-sm font-medium text-slate-500">CSE 3A · Week</span>
          <span
            className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-500 ${
              done ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            {done ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> 0 clashes
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5 motion-safe:animate-pulse" /> Generating…
              </>
            )}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[3rem_repeat(5,minmax(0,1fr))] gap-1.5 text-xs">
          <span />
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
            <span key={d} className="rounded-md bg-indigo-600 py-1 text-center font-semibold text-white">
              {d}
            </span>
          ))}
          {PREVIEW.map((row, r) => (
            <div key={r} className="contents">
              <span className="pt-1.5 text-slate-400">{TIMES[r]}</span>
              {row.map((color, c) =>
                color == null ? (
                  <span key={c} className="h-11 rounded-md bg-slate-50 sm:h-12" />
                ) : (
                  <span
                    key={c}
                    style={{ animationDelay: `${300 + n++ * 80}ms` }}
                    className={`h-11 rounded-md border p-1.5 transition duration-200 hover:z-10 hover:scale-105 hover:shadow-md motion-safe:animate-pop-in sm:h-12 ${COLORS[color]}`}
                  >
                    <span className="block h-1.5 w-3/4 rounded bg-slate-900/20" />
                    <span className="mt-1 block h-1.5 w-1/2 rounded bg-slate-900/10" />
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Staggered entrance for the hero: each element fades up a little after the one before.
const delay = (ms) => ({ animationDelay: `${ms}ms` })

/**
 * Public landing page. In the browser-only demo the role cards open each role; with accounts (`accounts`), every
 * call to action leads to sign-in, since the role comes from the account, not from a choice made here.
 */
export default function Landing({ onSelect, lastRole, controls, accounts = false }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#top" className="group flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 transition group-hover:rotate-6">
              <CalendarDays className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">Smart TimeTables</span>
          </a>
          <nav className="hidden items-center gap-8 text-slate-600 md:flex">
            {[
              ['#roles', 'Roles'],
              ['#features', 'Features'],
              ['#how', 'How it works'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="group relative py-1 transition hover:text-slate-900">
                {label}
                <span className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded bg-indigo-600 transition group-hover:scale-x-100" />
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {controls}
            {accounts && (
              <button
                onClick={() => onSelect()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-200/50 blur-3xl motion-safe:animate-drift" />
          <div className="pointer-events-none absolute -left-32 top-64 h-80 w-80 rounded-full bg-fuchsia-200/40 blur-3xl motion-safe:animate-drift [animation-delay:-9s]" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
            <div>
              <span
                style={delay(0)}
                className={`motion-safe:animate-fade-up inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-sm font-medium text-indigo-700`}
              >
                <Sparkles className="h-4 w-4" /> With an AI timetable assistant
              </span>
              <h1 style={delay(100)} className={`motion-safe:animate-fade-up mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl`}>
                Smart
                <br />
                <span className="bg-gradient-to-r from-indigo-600 via-fuchsia-500 to-indigo-600 bg-[length:200%_auto] bg-clip-text text-transparent motion-safe:animate-shimmer">
                  TimeTables
                </span>
              </h1>
              <p style={delay(200)} className={`motion-safe:animate-fade-up mt-5 max-w-md text-xl text-slate-600 sm:text-2xl`}>
                Clash-free college timetables, generated in seconds.
              </p>
              <div style={delay(300)} className={`motion-safe:animate-fade-up mt-9 flex flex-wrap gap-3`}>
                <button
                  onClick={() => onSelect('admin')}
                  className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-600/40"
                >
                  {accounts ? 'Sign in' : 'Create a timetable'} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </button>
                {!accounts && (
                  <button
                    onClick={() => onSelect('student')}
                    className="rounded-xl border border-slate-300 bg-white/80 px-6 py-3.5 font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
                  >
                    View my timetable
                  </button>
                )}
              </div>
              {lastRole && (
                <button
                  style={delay(400)}
                  onClick={() => onSelect(lastRole.id)}
                  className={`motion-safe:animate-fade-up group mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800`}
                >
                  Continue as {lastRole.label} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </button>
              )}
              <ul style={delay(450)} className={`motion-safe:animate-fade-up mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500`}>
                {[
                  [ShieldCheck, 'Zero clashes'],
                  [FlaskConical, 'Labs & groups'],
                  [Lock, accounts ? 'Role-based access, approved by your college' : 'Data stays in your browser'],
                ].map(([Icon, label]) => (
                  <li key={label} className="inline-flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-indigo-500" /> {label}
                  </li>
                ))}
              </ul>
            </div>
            <div style={delay(250)} className={`motion-safe:animate-fade-up mx-auto w-full max-w-xl`}>
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="scroll-mt-16 border-t border-slate-100 bg-slate-50/70 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One app, four views</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map(({ id, title, icon: Icon, text }, i) => (
                <Reveal key={id} delay={i * 70}>
                  <button
                    onClick={() => onSelect(id)}
                    className="group flex h-full w-full flex-col items-start rounded-2xl border border-slate-200 bg-white p-7 text-left transition duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-900/5"
                  >
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-600 transition duration-300 group-hover:scale-110 group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="mt-5 text-xl font-semibold text-slate-900">{title}</span>
                    <span className="mt-1 text-slate-500">{text}</span>
                    <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 opacity-70 transition group-hover:opacity-100">
                      {accounts ? 'Sign in' : 'Open'} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything a timetable needs</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 70}>
                  <div className="group h-full rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-900/5">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 transition duration-300 group-hover:scale-110 group-hover:bg-gradient-to-br group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-slate-500">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-y border-slate-100 bg-slate-50/70 py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Three steps</h2>
            </Reveal>
            <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
              <li aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-0.5 bg-gradient-to-r from-indigo-200 via-violet-300 to-fuchsia-200 md:block" />
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 120} as="li">
                  <div className="group relative flex flex-col items-center text-center">
                    <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-white text-indigo-600 shadow-md ring-1 ring-slate-200 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:ring-indigo-300">
                      <Icon className="h-6 w-6" />
                      <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                        {i + 1}
                      </span>
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-0.5 text-slate-500">{text}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Call to action */}
        <section className="px-4 py-20 sm:px-6">
          <Reveal>
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#4f46e5] via-[#6d28d9] to-[#a21caf] px-6 py-14 text-center shadow-2xl shadow-indigo-900/20 sm:px-12">
              <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#ffffff]/10 blur-2xl motion-safe:animate-drift" />
              <div className="pointer-events-none absolute -bottom-16 right-0 h-56 w-56 rounded-full bg-[#ffffff]/10 blur-2xl motion-safe:animate-drift [animation-delay:-6s]" />
              <h2 className="relative text-3xl font-bold tracking-tight text-[#ffffff] sm:text-4xl">Your first timetable in a minute.</h2>
              <button
                onClick={() => onSelect('admin')}
                className="group relative mt-8 inline-flex items-center gap-2 rounded-xl bg-[#ffffff] px-6 py-3.5 font-semibold text-[#4338ca] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                {accounts ? 'Sign in' : 'Get started'} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-600" /> Smart TimeTables
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> {accounts ? 'Each account sees only what its role allows.' : 'Your data stays in your browser.'}
          </span>
        </div>
      </footer>
    </div>
  )
}
