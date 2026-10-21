export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100',
    danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ className = '', ...props }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`} {...props} />
}

export function Field({ label, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      {label && <span className="font-medium text-slate-600">{label}</span>}
      <input
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus:border-indigo-500 focus:outline-none"
        {...props}
      />
    </label>
  )
}

export function Select({ label, options, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      {label && <span className="font-medium text-slate-600">{label}</span>}
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus:border-indigo-500 focus:outline-none"
        {...props}
      >
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export function EmptyState({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>
  )
}
