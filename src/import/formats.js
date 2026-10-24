// File formats for Import College Data, all read and written in the browser (nothing is uploaded anywhere).
// Pure JS: no React and no dependencies.
//
//   parseCsv(text)                 -> string[][]        (RFC 4180 quotes; comma, semicolon or tab separated)
//   (both readers return rows by position: rows[i] is row i + 1 of the file, blank rows included)
//   toCsv(rows)                    -> string
//   readXlsx(bytes)                -> Promise<[{ name, rows: string[][] }]>   one entry per worksheet
//   writeXlsx([{ name, rows }])    -> Uint8Array        a minimal .xlsx workbook (inline strings, no styles)
//
// .xlsx is a zip of XML files. Reading needs deflate support, which browsers (and Node 18+) provide through
// DecompressionStream; writing uses the uncompressed "stored" zip method, which needs nothing extra.

export class FileFormatError extends Error {}

// ---------- CSV ----------

/** Picks the separator used in the first line (outside quotes): comma, semicolon or tab. */
function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch in counts) counts[ch]++
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return n > 0 ? best : ','
}

/**
 * Parses CSV text into rows of cells. Throws FileFormatError for an unclosed quote. Blank lines are kept (as rows of
 * empty cells) so rows[i] is always record i + 1 of the file, which keeps row numbers in messages right.
 */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const sep = detectDelimiter(src)
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let line = 1
  let quoteLine = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else {
        if (ch === '\n') line++
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      quoted = true
      quoteLine = line
    } else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      line++
    } else cell += ch
  }
  if (quoted) throw new FileFormatError(`A quoted value starting on line ${quoteLine} is never closed (missing ").`)
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows to CSV text (CRLF line ends, so Excel opens it cleanly). */
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

// ---------- zip ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip archive with the files stored uncompressed. files: [{ name, data: Uint8Array }] */
function zipStored(files) {
  const enc = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, f.data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, f.data.length, true)
    entry.setUint32(24, f.data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new FileFormatError('This browser cannot read compressed Excel files. Save each sheet as CSV instead.')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Reads a zip archive's files into a Map of name -> text (only the XML parts an .xlsx needs). */
async function unzipText(bytes, wanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new FileFormatError('This is not a valid .xlsx file (it could not be opened as a workbook).')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const files = new Map()
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new FileFormatError('The workbook file is damaged.')
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const localAt = view.getUint32(at + 42, true)
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (!wanted(name)) continue
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true)
    const raw = bytes.subarray(dataAt, dataAt + size)
    if (method !== 0 && method !== 8) throw new FileFormatError('The workbook uses an unsupported compression method.')
    files.set(name, dec.decode(method === 8 ? await inflateRaw(raw) : raw))
  }
  return files
}

// ---------- xlsx ----------

const unescapeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()]
  })
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
// All text runs (<t>…</t>) inside a shared string or inline string, joined.
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('')

const colIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
const colName = (i) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function sheetRows(xml, shared) {
  const rows = []
  let rowNo = 0
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    rowNo = Number(attr(rm[1], 'r')) || rowNo + 1
    const row = []
    let col = -1
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r')
      col = ref ? colIndex(ref) : col + 1
      const type = attr(cm[1], 't')
      const body = cm[2] ?? ''
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = textOf(body)
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
      else if (v != null) value = unescapeXml(v)
      row[col] = value
    }
    rows[rowNo - 1] = Array.from(row, (c) => c ?? '')
  }
  // rows[i] is spreadsheet row i + 1 (missing rows become empty), so row numbers in messages match Excel.
  return Array.from(rows, (r) => r ?? [])
}

/** Reads every worksheet of an .xlsx workbook as rows of text cells, in workbook order. */
export async function readXlsx(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new FileFormatError('This is not an .xlsx workbook. Older .xls files are not supported: save it as .xlsx or CSV.')
  }
  const files = await unzipText(bytes, (n) => (n.startsWith('xl/') && n.endsWith('.xml')) || n.endsWith('.rels'))
  const workbook = files.get('xl/workbook.xml')
  if (!workbook) throw new FileFormatError('This zip file is not an Excel workbook.')
  const rels = new Map(
    [...(files.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [attr(m[1], 'Id'), attr(m[1], 'Target')]),
  )
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
  const sheets = []
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const target = rels.get(attr(m[1], 'r:id'))
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = files.get(path)
    if (xml) sheets.push({ name: unescapeXml(attr(m[1], 'name') ?? 'Sheet'), rows: sheetRows(xml, shared) })
  }
  return sheets
}

/** A minimal .xlsx workbook: one worksheet per entry, numbers stored as numbers, everything else as text. */
export function writeXlsx(sheets) {
  const enc = new TextEncoder()
  const ns = 'http://schemas.openxmlformats.org/'
  const sheetXml = (rows) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}spreadsheetml/2006/main"><sheetData>` +
    rows
      .map(
        (r, i) =>
          `<row r="${i + 1}">` +
          r
            .map((v, j) => {
              const ref = `${colName(j)}${i + 1}`
              if (v === '' || v == null) return ''
              return typeof v === 'number'
                ? `<c r="${ref}"><v>${v}</v></c>`
                : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
            })
            .join('') +
          '</row>',
      )
      .join('') +
    '</sheetData></worksheet>'
  const files = [
    {
      name: '[Content_Types].xml',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>` +
        sheets.map((s, i) => `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}package/2006/relationships">` +
        sheets
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join('') +
        '</Relationships>',
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows) })),
  ]
  return zipStored(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })))
}
