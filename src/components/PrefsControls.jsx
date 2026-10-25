import { Monitor, Moon, Sun } from 'lucide-react'

const THEMES = [
  { id: 'light', Icon: Sun, label: 'Light theme' },
  { id: 'dark', Icon: Moon, label: 'Dark theme' },
  { id: 'system', Icon: Monitor, label: 'Match system theme' },
]

function Segmented({ items, value, onChange, render }) {
  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          title={it.label}
          aria-label={it.label}
          aria-pressed={value === it.id}
          onClick={() => onChange(it.id)}
          className={`grid h-7 min-w-7 place-items-center rounded-md px-1 sm:h-8 sm:min-w-8 sm:px-1.5 ${
            value === it.id ? 'bg-white shadow-sm' : 'opacity-60 hover:opacity-100'
          }`}
        >
          {render(it)}
        </button>
      ))}
    </div>
  )
}

/** Light / dark / system theme switch shown in every header. */
export default function PrefsControls({ prefs, setPrefs }) {
  return (
    <Segmented
      items={THEMES}
      value={prefs.theme}
      onChange={(theme) => setPrefs({ theme })}
      render={({ Icon }) => <Icon className="h-4 w-4 text-slate-700" />}
    />
  )
}
