import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarCog, CircleCheck, Download, FileUp, FlaskConical, ListChecks, ShieldCheck, Upload } from 'lucide-react'
import { Button, Card } from '../../components/ui.jsx'
import { LIMITS, buildImport, isSetupEmpty, readUpload, sheetFrom } from '../../import/collegeImport.js'
import { FileFormatError, toCsv, writeXlsx } from '../../import/formats.js'
import { SAMPLE_NAME, TABLES, TABLE_KEYS, templateRows, templateSheets } from '../../import/tables.js'
import { IssueList, SheetCard } from './ImportReview.jsx'

const COUNT_LABELS = [
  ['departments', 'department'],
  ['rooms', 'room'],
  ['subjects', 'subject'],
  ['teachers', 'teacher'],
  ['sections', 'section'],
  ['assignments', 'teaching assignment'],
]
const countText = (counts) =>
  COUNT_LABELS.filter(([k]) => counts[k])
    .map(([k, word]) => `${counts[k]} ${counts[k] === 1 ? word : `${word}s`}`)
    .join(', ')

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const downloadWorkbook = () =>
  download('college-data-template.xlsx', writeXlsx(templateSheets()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
const downloadCsv = (key) => download(`${TABLES[key].file}.csv`, `﻿${toCsv(templateRows(key))}`, 'text/csv;charset=utf-8')

/** Step 1: the file picker first, then templates; the table and column reference stays folded away until wanted. */
function ChooseFiles({ onFiles, onSample, reading, readErrors }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onFiles([...e.dataTransfer.files])
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'
        }`}
      >
        <FileUp className="h-8 w-8 text-indigo-500" />
        <span className="font-semibold text-slate-800">{reading ? 'Reading files…' : 'Choose files or drop them here'}</span>
        <span className="text-sm text-slate-500">.csv or .xlsx · several files at once · you review everything before it's saved</span>
        <input
          type="file"
          multiple
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            onFiles([...e.target.files])
            e.target.value = ''
          }}
        />
      </label>
      {readErrors.length > 0 && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-800">
          <p className="font-semibold">Some files couldn't be read:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {readErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          CSV (one file per table) or Excel .xlsx (one sheet per table), up to 2 MB each.{' '}
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Files stay in this browser.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadWorkbook}>
            <Download className="h-4 w-4" /> Excel template
          </Button>
          <Button variant="secondary" onClick={onSample}>
            <FlaskConical className="h-4 w-4" /> Try with the sample data
          </Button>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer font-medium text-indigo-700">What should my files contain?</summary>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>
            There are {TABLE_KEYS.length} tables. Records refer to each other by department code, subject code, section name and
            teacher name. Columns with * are required; put several values in one cell with ; between them. If your headers
            differ, you can match them after uploading.
          </p>
          <p>
            The template is filled with a small sample college ({SAMPLE_NAME}) that imports and generates a timetable as it is.
            Replace its rows with your own. Old .xls, .ods and PDF files aren't supported; up to {LIMITS.rows.toLocaleString()} rows
            per table.
          </p>
        </div>
        <div className="mt-2 divide-y divide-slate-100">
          {TABLE_KEYS.map((k) => {
            const t = TABLES[k]
            return (
              <details key={k} className="py-2">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium text-slate-800">{t.label}</span>{' '}
                    <span className="text-xs text-slate-400">{t.optional ? 'optional' : 'required for a new setup'}</span>
                    <span className="block text-sm text-slate-500">{t.about}</span>
                  </span>
                  <Button
                    variant="ghost"
                    className="py-1"
                    onClick={(e) => {
                      e.preventDefault()
                      downloadCsv(k)
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> {t.file}.csv
                  </Button>
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {t.fields.map((f) => (
                    <li key={f.key} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                      <b>
                        {f.key}
                        {f.required ? '*' : ''}
                      </b>
                      {f.hint ? ` · ${f.hint}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </div>
      </details>
    </div>
  )
}

/**
 * Import College Data: choose files → review (table, columns, preview, errors) → confirm → summary.
 * Nothing is saved until the administrator confirms; the current setup is kept unless they choose Replace.
 */
export default function ImportData({ college, onContinue, onManual }) {
  const { data, importCollege } = college
  const [sheets, setSheets] = useState([])
  const [readErrors, setReadErrors] = useState([])
  const [reading, setReading] = useState(false)
  const [mode, setMode] = useState('add')
  const [done, setDone] = useState(null)
  const empty = isSetupEmpty(data)

  const result = useMemo(() => (sheets.length ? buildImport(sheets, data, { mode }) : null), [sheets, data, mode])

  const addFiles = async (files) => {
    if (!files.length) return
    setReading(true)
    const errs = []
    const read = []
    if (files.length + sheets.length > LIMITS.files) errs.push(`Choose at most ${LIMITS.files} files at a time.`)
    for (const file of files.slice(0, LIMITS.files)) {
      try {
        read.push(...(await readUpload(file)))
      } catch (e) {
        errs.push(e instanceof FileFormatError ? e.message : `${file.name}: couldn't be read (${e.message}).`)
      }
    }
    // A re-uploaded file replaces the earlier copy with the same name.
    setSheets((prev) => [...prev.filter((s) => !read.some((r) => r.source === s.source)), ...read])
    setReadErrors(errs)
    setReading(false)
  }
  const loadSample = () => {
    setReadErrors([])
    setSheets(TABLE_KEYS.map((k) => sheetFrom(`Sample data › ${TABLES[k].label}`, templateRows(k).map((r) => r.map(String)), TABLES[k].label)))
  }
  const updateSheet = (next) => setSheets((list) => list.map((s) => (s.id === next.id ? next : s)))
  const startOver = () => {
    setSheets([])
    setReadErrors([])
  }

  const apply = () => {
    if (!result?.ok) return
    if (
      result.mode === 'replace' &&
      !empty &&
      !window.confirm(
        'Replace the current setup? Departments, rooms, subjects, teachers, sections and the time structure will be replaced by the imported data, and the generated timetable will be cleared. Room bookings are kept. This cannot be undone (you can reload a demo dataset any time).',
      )
    ) {
      return
    }
    importCollege(result.data)
    setDone({ counts: result.counts, mode: result.mode, warnings: result.issues.filter((i) => i.level === 'warning') })
    setSheets([])
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-2xl font-bold">Import college data</h2>
        <p className="text-slate-500">Departments, rooms, subjects, teachers, sections and who teaches what, from CSV or Excel.</p>
      </div>
      <Button variant="secondary" onClick={onManual}>
        <ArrowLeft className="h-4 w-4" /> Back to manual setup
      </Button>
    </div>
  )

  if (done) {
    const precheck = done.warnings.filter((w) => w.table === 'Timetable pre-check')
    return (
      <div className="space-y-4">
        {header}
        <Card className="space-y-3 border-emerald-200 bg-emerald-50">
          <p className="flex items-center gap-2 text-lg font-semibold text-emerald-800">
            <CircleCheck className="h-5 w-5" /> Import complete
          </p>
          <p className="text-slate-700">
            {done.mode === 'replace' ? 'The setup now holds' : 'Added to the setup'}: {countText(done.counts) || 'no new records'}
            {done.counts.time ? ', and the time structure from the file' : ''}.
          </p>
          {precheck.length > 0 ? (
            <p className="text-sm text-amber-800">
              The timetable pre-check found {precheck.length} problem{precheck.length === 1 ? '' : 's'} to fix before generating; Setup
              shows them with suggestions when you generate.
            </p>
          ) : (
            <p className="text-sm text-slate-600">The imported data passes the timetable pre-check.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={onContinue}>
              <CalendarCog className="h-4 w-4" /> Continue to timetable generation
            </Button>
            <Button variant="secondary" onClick={onManual}>
              <ListChecks className="h-4 w-4" /> Review the setup step by step
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!sheets.length) {
    return (
      <div className="space-y-4">
        {header}
        <ChooseFiles onFiles={addFiles} onSample={loadSample} reading={reading} readErrors={readErrors} />
      </div>
    )
  }

  const errors = result.issues.filter((i) => i.level === 'error')
  const warnings = result.issues.filter((i) => i.level === 'warning')
  return (
    <div className="space-y-4">
      {header}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">1. Check what each file holds</h3>
        {sheets.map((s) => (
          <SheetCard key={s.id} sheet={s} issues={result.issues.filter((i) => i.source === s.source)} onChange={updateSheet} />
        ))}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <Upload className="h-4 w-4" /> {reading ? 'Reading…' : 'Add or re-upload files'}
            <input
              type="file"
              multiple
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(e) => {
                addFiles([...e.target.files])
                e.target.value = ''
              }}
            />
          </label>
          <Button variant="ghost" onClick={startOver}>
            Start over
          </Button>
        </div>
        {readErrors.length > 0 && <IssueList issues={readErrors.map((message) => ({ level: 'error', table: 'Files', message }))} />}
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">2. Fix any problems</h3>
        {errors.length ? (
          <p className="text-sm text-red-700">
            {errors.length} error{errors.length === 1 ? '' : 's'} must be fixed before importing: correct the file and re-upload it (a file
            with the same name replaces the old one), or fix the column choices above.
            {warnings.length ? ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'} won't block the import.` : ''}
          </p>
        ) : (
          <p className="text-sm text-emerald-700">
            No errors. {warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'} to read; they won't block the import.` : ''}
          </p>
        )}
        <IssueList issues={result.issues} />
      </div>

      <Card className="space-y-3">
        <h3 className="text-lg font-semibold">3. Import</h3>
        {empty ? (
          <p className="text-sm text-slate-600">The setup is empty, so the imported data becomes the college setup.</p>
        ) : (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            {[
              ['add', 'Add to the current setup', 'Keeps everything already set up and adds the new records. A record that already exists is reported as an error, never overwritten. The time structure is not changed.'],
              ['replace', 'Replace the current setup', 'Removes the current departments, rooms, subjects, teachers and sections and uses the file instead (records with the same name keep their identity). Asks for confirmation.'],
            ].map(([value, title, text]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${
                  mode === value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'
                }`}
              >
                <input type="radio" name="import-mode" checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
                <span>
                  <b className="text-slate-900">
                    {title}
                    {value === 'add' ? ' (safest)' : ''}
                  </b>
                  <span className="block text-slate-600">{text}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-sm text-slate-700">
          {result.ok ? (
            <>
              Ready to import: <b>{countText(result.counts) || 'no new records'}</b>
              {result.counts.time ? ', and the time structure' : ''}. The generated timetable is cleared; you generate a new one next.
            </>
          ) : (
            'Fix the errors above to import.'
          )}
        </p>
        <Button onClick={apply} disabled={!result.ok}>
          <Upload className="h-4 w-4" /> {result.mode === 'replace' && !empty ? 'Replace setup with this data' : 'Import this data'}
        </Button>
      </Card>
    </div>
  )
}
