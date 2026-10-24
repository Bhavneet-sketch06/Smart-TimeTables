import { useState } from 'react'
import { ChevronDown, CircleAlert, FileSpreadsheet, Info, TriangleAlert } from 'lucide-react'
import { Select } from '../../components/ui.jsx'
import { autoMap } from '../../import/collegeImport.js'
import { TABLES, TABLE_KEYS } from '../../import/tables.js'

const PREVIEW_ROWS = 5
const ISSUES_SHOWN = 40

const LEVEL = {
  error: { Icon: CircleAlert, tone: 'text-red-700', label: 'Error' },
  warning: { Icon: TriangleAlert, tone: 'text-amber-700', label: 'Warning' },
  info: { Icon: Info, tone: 'text-slate-500', label: 'Note' },
}

/** One uploaded table: what it holds, which column feeds each field, and a preview of the first rows. */
export function SheetCard({ sheet, issues, onChange }) {
  const def = TABLES[sheet.table]
  const unmapped = def ? def.fields.filter((f) => f.required && !(sheet.mapping[f.key] >= 0)) : []
  const [open, setOpen] = useState(unmapped.length > 0)
  const body = sheet.rows
    .map((r, i) => ({ r, line: i + 1 }))
    .slice(sheet.headerIndex + 1)
    .filter(({ r }) => r.some((c) => String(c ?? '').trim()))
  const rowLevel = new Map()
  for (const i of issues) if (i.line) rowLevel.set(i.line, rowLevel.get(i.line) === 'error' ? 'error' : i.level)
  const errorsHere = issues.filter((i) => i.level === 'error').length
  const columns = def ? def.fields.filter((f) => sheet.mapping[f.key] >= 0) : []

  const setTable = (table) => onChange({ ...sheet, table, mapping: autoMap(table, sheet.headers) })
  const setColumn = (key, value) => onChange({ ...sheet, mapping: { ...sheet.mapping, [key]: Number(value) } })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-slate-900">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="break-all">{sheet.source}</span>
          </p>
          <p className="text-sm text-slate-500">
            {body.length} data row{body.length === 1 ? '' : 's'}
            {errorsHere > 0 && <span className="font-medium text-red-700"> · {errorsHere} error{errorsHere === 1 ? '' : 's'}</span>}
          </p>
        </div>
        <Select
          label="This file holds"
          value={sheet.table}
          options={[...TABLE_KEYS.map((k) => ({ value: k, label: TABLES[k].label })), { value: 'ignore', label: 'Not imported' }]}
          onChange={(e) => setTable(e.target.value)}
          className="w-full sm:w-56"
        />
      </div>

      {def && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
          >
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
            Columns {unmapped.length > 0 ? `(${unmapped.length} required not matched)` : '(all required matched)'}
          </button>
          {open && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {def.fields.map((f) => (
                <Select
                  key={f.key}
                  label={`${f.key}${f.required ? ' *' : ''}`}
                  value={sheet.mapping[f.key] ?? -1}
                  options={[{ value: -1, label: f.required ? '— choose a column —' : '— not in this file —' }].concat(
                    sheet.headers.map((h, i) => ({ value: i, label: h || `Column ${i + 1}` })),
                  )}
                  onChange={(e) => setColumn(f.key, e.target.value)}
                  className={f.required && !(sheet.mapping[f.key] >= 0) ? '[&_select]:border-red-400' : ''}
                />
              ))}
            </div>
          )}

          {columns.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Row</th>
                    {columns.map((f) => (
                      <th key={f.key} className="whitespace-nowrap px-2 py-1.5 font-medium">
                        {f.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.slice(0, PREVIEW_ROWS).map(({ r, line }) => (
                    <tr
                      key={line}
                      className={`border-t border-slate-100 ${
                        rowLevel.get(line) === 'error' ? 'bg-red-50' : rowLevel.get(line) === 'warning' ? 'bg-amber-50' : ''
                      }`}
                    >
                      <td className="px-2 py-1 text-slate-400">{line}</td>
                      {columns.map((f) => (
                        <td key={f.key} className="max-w-48 truncate whitespace-nowrap px-2 py-1">
                          {String(r[sheet.mapping[f.key]] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {body.length > PREVIEW_ROWS && (
                <p className="border-t border-slate-100 px-2 py-1 text-xs text-slate-400">
                  Showing {PREVIEW_ROWS} of {body.length} rows. Every row is checked.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {!def && <p className="mt-2 text-sm text-slate-500">This file won't be imported. Choose what it holds to include it.</p>}
    </div>
  )
}

/** Errors and warnings, most serious first, each naming the table, file, row and column. */
export function IssueList({ issues }) {
  const [all, setAll] = useState(false)
  if (!issues.length) return null
  const shown = all ? issues : issues.slice(0, ISSUES_SHOWN)
  return (
    <div className="space-y-1.5">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
        {shown.map((i, n) => {
          const { Icon, tone, label } = LEVEL[i.level]
          const where = [i.source ?? i.table, i.line && `row ${i.line}`, i.field && `column ${i.field}`].filter(Boolean).join(' · ')
          return (
            <li key={n} className="flex gap-2 px-3 py-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-label={label} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 break-words">
                  {i.source && i.table !== i.source ? `${i.table} · ` : ''}
                  {where}
                </p>
                <p className="text-slate-800">{i.message}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {issues.length > ISSUES_SHOWN && (
        <button className="text-sm font-medium text-indigo-700 hover:underline" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${issues.length}`}
        </button>
      )}
    </div>
  )
}
