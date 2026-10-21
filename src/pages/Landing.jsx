import { Card } from '../components/ui.jsx'

const ROLES = [
  { id: 'admin', title: 'Administrator', icon: '🛠️', text: 'Set up rooms, teachers, subjects and sections, then generate the timetable.' },
  { id: 'hod', title: 'HOD / Coordinator', icon: '📋', text: 'Review timetables by section, teacher or room for your department.' },
  { id: 'faculty', title: 'Faculty', icon: '👩‍🏫', text: 'See your personal weekly teaching schedule.' },
  { id: 'student', title: 'Student', icon: '🎓', text: 'Pick your department and section to view your timetable.' },
]

export default function Landing({ onSelect, hasData }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">College Timetable Generator</h1>
      <p className="mt-2 text-slate-600">
        Clash-free timetables for any college, generated right in your browser. Choose your role to continue.
      </p>
      {!hasData && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No college data yet. Start as Administrator and use "Load demo college" to try it out.
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button key={r.id} onClick={() => onSelect(r.id)} className="text-left">
            <Card className="h-full transition hover:border-indigo-400 hover:shadow-md">
              <div className="text-3xl">{r.icon}</div>
              <h2 className="mt-2 text-lg font-semibold">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{r.text}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  )
}
