const THEMES = [
  { id: 'light', icon: '☀️', label: 'Light theme' },
  { id: 'dark', icon: '🌙', label: 'Dark theme' },
  { id: 'system', icon: '💻', label: 'Match system theme' },
]

const SIZES = [
  { id: 'normal', className: 'text-xs', label: 'Normal text' },
  { id: 'large', className: 'text-sm', label: 'Large text' },
  { id: 'xl', className: 'text-base', label: 'Extra large text' },
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
          className={`grid h-8 min-w-8 place-items-center rounded-md px-1.5 ${
            value === it.id ? 'bg-white shadow-sm' : 'opacity-60 hover:opacity-100'
          }`}
        >
          {render(it)}
        </button>
      ))}
    </div>
  )
}

/** Theme and text-size switches shown in every header. */
export default function PrefsControls({ prefs, setPrefs }) {
  return (
    <div className="flex items-center gap-2">
      <Segmented items={THEMES} value={prefs.theme} onChange={(theme) => setPrefs({ theme })} render={(t) => t.icon} />
      <Segmented
        items={SIZES}
        value={prefs.textSize}
        onChange={(textSize) => setPrefs({ textSize })}
        render={(s) => <span className={`font-bold text-slate-700 ${s.className}`}>A</span>}
      />
    </div>
  )
}
