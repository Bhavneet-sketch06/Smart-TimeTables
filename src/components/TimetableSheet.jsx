import { Printer } from 'lucide-react'
import TimetableGrid from './TimetableGrid.jsx'
import { Button } from './ui.jsx'

/**
 * A titled, printable timetable. Everything else on the page should carry `print:hidden`, so
 * printing produces just this sheet (A4 landscape, see index.css).
 */
export default function TimetableSheet({ data, entries, mode, title, subtitle, stats }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 print:mb-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {stats && <span className="text-slate-500">{stats}</span>}
          <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>
      <TimetableGrid data={data} entries={entries} mode={mode} />
      <p className="mt-3 hidden text-xs text-slate-400 print:block">
        {data.meta?.name ? `${data.meta.name} · ` : ''}Printed {new Date().toLocaleDateString()}
      </p>
    </section>
  )
}
