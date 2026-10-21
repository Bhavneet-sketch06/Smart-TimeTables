const ROLES = [
  { id: 'admin', title: 'Administrator', icon: '🛠️', text: 'Set up rooms, teachers, subjects and sections, then generate the timetable.' },
  { id: 'hod', title: 'HOD / Coordinator', icon: '📋', text: 'Review timetables by section, teacher or room for your department.' },
  { id: 'faculty', title: 'Faculty', icon: '👩‍🏫', text: 'See your personal weekly teaching schedule.' },
  { id: 'student', title: 'Student', icon: '🎓', text: 'Pick your department and section to view your timetable.' },
]

const FEATURES = ['Zero clashes, verified', 'Labs as consecutive blocks', 'Works offline in your browser', 'Mobile friendly']

export default function Landing({ onSelect, hasData, controls }) {
  return (
    <div className="min-h-screen">
      {/* Fixed hex colours: the hero keeps the same look in light and dark themes. */}
      <div className="bg-gradient-to-br from-[#4f46e5] via-[#4338ca] to-[#6d28d9] text-[#fff]">
        <div className="mx-auto max-w-5xl px-4 pb-24 pt-6">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-lg font-bold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[rgba(255,255,255,0.2)]">🗓️</span> Timetable
            </span>
            <div className="rounded-xl bg-white p-1 text-slate-900">{controls}</div>
          </div>
          <h1 className="mt-12 text-4xl font-extrabold leading-tight sm:text-5xl">College Timetable Generator</h1>
          <p className="mt-3 max-w-2xl text-lg text-[#e0e7ff]">
            Clash-free weekly timetables for any college, generated in seconds right in your browser.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {FEATURES.map((f) => (
              <span key={f} className="rounded-full bg-[rgba(255,255,255,0.15)] px-3 py-1 text-sm">
                ✓ {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-16 max-w-5xl px-4 pb-12">
        {!hasData && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            No college data yet. Start as <b>Administrator</b> and load the demo or GNDEC data to try it out.
          </p>
        )}
        <h2 className="sr-only">Choose your role</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-lg"
            >
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-indigo-50 text-3xl">{r.icon}</div>
              <h3 className="mt-4 text-xl font-semibold">{r.title}</h3>
              <p className="mt-1 text-slate-600">{r.text}</p>
              <span className="mt-4 inline-block font-medium text-indigo-600 group-hover:underline">Continue →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
