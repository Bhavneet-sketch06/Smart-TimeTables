import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  ClipboardList,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  Lock,
  Presentation,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

const ROLES = [
  {
    id: 'admin',
    title: 'Administrator',
    icon: Settings2,
    text: 'Set up time slots, rooms, faculty, subjects and sections, then generate the whole timetable.',
    points: ['Guided 5-step setup', 'One-click generation'],
  },
  {
    id: 'hod',
    title: 'HOD / Coordinator',
    icon: ClipboardList,
    text: 'Review the department timetable by section, faculty member or room.',
    points: ['Department filter', 'Clash and quality report'],
  },
  {
    id: 'faculty',
    title: 'Faculty',
    icon: Presentation,
    text: 'See your weekly teaching schedule and workload at a glance.',
    points: ['Personal timetable', 'Hours vs. maximum load'],
  },
  {
    id: 'student',
    title: 'Student',
    icon: GraduationCap,
    text: 'Find your section and lab group and view your week on any device.',
    points: ['Lab-group filter', 'Works on mobile'],
  },
]

const FEATURES = [
  { icon: ShieldCheck, title: 'Zero clashes, verified', text: 'Every timetable is checked independently for teacher, room and section double-bookings.' },
  { icon: FlaskConical, title: 'Lab-aware scheduling', text: 'Consecutive lab blocks, half-section groups running side by side, and separate lab instructors.' },
  { icon: Clock, title: 'Your real time slots', text: 'Set start time, period length and lunch break. Labs never run across the break.' },
  { icon: LayoutGrid, title: 'Views for every role', text: 'Section, faculty and room timetables with a quality score for each generated week.' },
  { icon: Sparkles, title: 'AI timetable assistant', text: 'Ask questions like "When is D3 CS A free on Wednesday?" and get instant answers.' },
  { icon: Lock, title: 'Private by default', text: 'College data stays in your browser. No accounts, no servers storing your data.' },
]

const STEPS = [
  { title: 'Describe your college', text: 'Enter time slots, rooms, faculty, subjects and sections, or load a ready-made dataset.' },
  { title: 'Generate', text: 'The scheduler places every lecture and lab, most-constrained first, in about a second.' },
  { title: 'Share and explore', text: 'Faculty and students open their own view; the assistant answers questions.' },
]

// A static, simplified timetable used as the product preview in the hero.
const PREVIEW = [
  ['bg-sky-100 border-sky-300', 'bg-emerald-100 border-emerald-300', 'bg-violet-100 border-violet-300', 'bg-amber-100 border-amber-300', 'bg-sky-100 border-sky-300'],
  ['bg-rose-100 border-rose-300', 'bg-emerald-100 border-emerald-300', null, 'bg-teal-100 border-teal-300', 'bg-violet-100 border-violet-300'],
  ['bg-amber-100 border-amber-300', null, 'bg-sky-100 border-sky-300', 'bg-rose-100 border-rose-300', null],
  ['bg-teal-100 border-teal-300', 'bg-violet-100 border-violet-300', 'bg-rose-100 border-rose-300', null, 'bg-emerald-100 border-emerald-300'],
]

function ProductPreview() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-indigo-900/10">
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-1 pb-3">
        <span className="h-3 w-3 rounded-full bg-rose-300" />
        <span className="h-3 w-3 rounded-full bg-amber-300" />
        <span className="h-3 w-3 rounded-full bg-emerald-300" />
        <span className="ml-3 text-sm font-medium text-slate-500">D3 CS A · Weekly timetable</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> 0 clashes
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] gap-1.5 text-xs">
        <span />
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
          <span key={d} className="rounded-md bg-indigo-600 py-1 text-center font-semibold text-white">
            {d}
          </span>
        ))}
        {PREVIEW.map((row, r) => (
          <div key={r} className="contents">
            <span className="pt-1 text-slate-400">{['08:30', '09:30', '10:30', '11:30'][r]}</span>
            {row.map((cls, c) =>
              cls ? (
                <span key={c} className={`h-11 rounded-md border ${cls} p-1.5`}>
                  <span className="block h-1.5 w-3/4 rounded bg-slate-900/20" />
                  <span className="mt-1 block h-1.5 w-1/2 rounded bg-slate-900/10" />
                </span>
              ) : (
                <span key={c} className="h-11 rounded-md bg-slate-50" />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landing({ onSelect, hasData, controls }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
              <CalendarDays className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">Smart TimeTables</span>
          </a>
          <nav className="hidden items-center gap-7 text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#roles" className="hover:text-slate-900">Roles</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">{controls}</div>
            <button
              onClick={() => onSelect('admin')}
              className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
            >
              Open app
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden">
          {/* Soft glow plus a faint dot grid behind the hero. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--color-indigo-100),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="pointer-events-none absolute -left-32 top-40 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                <Sparkles className="h-4 w-4" /> Now with an AI timetable assistant
              </span>
              <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
                Smart{' '}
                <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                  TimeTables
                </span>
              </h1>
              <p className="mt-4 text-2xl font-semibold text-slate-700">Clash-free college schedules, generated in seconds.</p>
              <p className="mt-3 max-w-xl text-lg text-slate-600">
                Plan lectures, labs and lab groups across every section, faculty member and room. Built for real colleges,
                running entirely in your browser.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => onSelect('admin')}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Create a timetable <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onSelect('student')}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View my timetable
                </button>
              </div>
              {!hasData && (
                <p className="mt-4 text-sm text-slate-500">
                  New here? Open the app as Administrator and load the GNDEC or demo dataset.
                </p>
              )}
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-slate-200 pt-6">
                {[
                  ['354', 'classes per week'],
                  ['0', 'clashes'],
                  ['< 1 s', 'to generate'],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="text-2xl font-bold text-slate-900">{value}</dt>
                    <dd className="text-sm text-slate-500">{label}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-slate-400">Measured on GNDEC Ludhiana CSE data (12 sections).</p>
            </div>
            <div className="relative">
              <ProductPreview />
              {/* Floating assistant bubble to hint at the AI feature. */}
              <div className="absolute -bottom-6 -left-4 hidden max-w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:block">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                  <Sparkles className="h-4 w-4" /> Timetable Assistant
                </div>
                <p className="mt-1 text-sm text-slate-600">D3 CS A is free on Wednesday from 13:30 to 15:30.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="roles" className="border-t border-slate-200 bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight">Choose your workspace</h2>
            <p className="mt-2 text-slate-600">One app, four views. Pick how you want to use it.</p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map(({ id, title, icon: Icon, text, points }) => (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-1 flex-1 text-slate-600">{text}</p>
                  <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                    {points.map((p) => (
                      <li key={p} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {p}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-5 inline-flex items-center gap-1 font-semibold text-indigo-600">
                    Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight">Everything a timetable needs</h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              Hard rules are never broken; soft preferences make the week pleasant for students and faculty.
            </p>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-slate-600">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-slate-200 bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-slate-600">{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl bg-indigo-600 p-8 text-white sm:flex-row sm:items-center">
              <div>
                <h3 className="text-2xl font-bold">Ready to build your timetable?</h3>
                <p className="mt-1 text-indigo-100">Start with sample data and generate your first week in under a minute.</p>
              </div>
              <button
                onClick={() => onSelect('admin')}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                Get started <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <span>Smart TimeTables · College timetable generator</span>
          <span>Your data stays in this browser.</span>
        </div>
      </footer>
    </div>
  )
}
