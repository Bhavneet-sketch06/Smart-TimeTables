// Change assistant endpoint (administrators only). Two modes:
//   understand  { text, catalog, today }  -> { kind, question, summary, changes }   a plain-language change, as data
//   announce    { facts }                 -> { text }                               an announcement written from facts
// Claude only proposes: the app checks every id against the college data (src/changeAssistant.js) and nothing
// changes until the administrator clicks Apply. Runs as a Vercel function and through the Vite dev middleware.
import Anthropic from '@anthropic-ai/sdk'
import { checkAccount, fail, friendlyError, readJson } from './_lib/http.js'

export const config = { maxDuration: 60 }

const MODEL = 'claude-opus-5-5'
const MAX_TEXT_CHARS = 1000
const MAX_CATALOG_CHARS = 200_000
const MAX_FACTS_CHARS = 20_000
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const UNDERSTAND = `You turn an administrator's description of a sudden change into structured edits for a college
timetable app. The college's working days, period times, teachers and rooms, each with its id, are given below in
<college> tags.

Supported changes:
- teacher_unavailable / teacher_available: a teacher cannot teach (leave, duty, training) or can again, in given slots
- block_slots / unblock_slots: periods with no classes for anyone (an event, an assembly, a holiday morning), or allowed again
- room_out_of_service / room_back_in_service: a room closed for maintenance or repairs, or reopened

Rules:
- Use only ids that appear in <college>. Never invent an id.
- The timetable repeats every week, so a date ("tomorrow", "28 October") means that weekday. Today's date is in the request.
- Periods are numbered from 1 as listed. "All day" or "on leave that day" means every period of that day; "the morning"
  means the periods before the first break; "first two periods" means P1 and P2.
- reason: two to four words from the request ("Leave", "Convocation", "AC repair"), or "" if none was given.
- Fill fields a change doesn't use with "" (teacherId, roomId) or [] (slots).
- If a name could mean more than one teacher or room, is not in <college>, or the day or time is unclear, return
  kind "question" with one short question and no changes. Do the same, explaining briefly, when the request is not one
  of the supported changes (for example swapping teachers or adding a section: those are made in Setup).
- summary: one short sentence restating what will change.`

const ANNOUNCE = `Write a short announcement for students and staff about a timetable update, using only the facts
given in <facts>. Do not add reasons, dates, names or advice that are not in the facts. Start with what changed, then
list the moved classes by section with "-" bullets (before → after); if there are many, group them by section. At most
150 words, plain text, no headings, no sign-off.`

const CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['changes', 'question'] },
    question: { type: 'string' },
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['teacher_unavailable', 'teacher_available', 'block_slots', 'unblock_slots', 'room_out_of_service', 'room_back_in_service'],
          },
          teacherId: { type: 'string' },
          roomId: { type: 'string' },
          reason: { type: 'string' },
          slots: {
            type: 'array',
            items: {
              type: 'object',
              properties: { day: { type: 'string', enum: DAYS }, period: { type: 'integer' } },
              required: ['day', 'period'],
              additionalProperties: false,
            },
          },
        },
        required: ['type', 'teacherId', 'roomId', 'reason', 'slots'],
        additionalProperties: false,
      },
    },
  },
  required: ['kind', 'question', 'summary', 'changes'],
  additionalProperties: false,
}

/** Returns an error message, or null when the request is acceptable. */
export function validate(body) {
  if (body?.mode === 'understand') {
    if (typeof body.text !== 'string' || !body.text.trim()) return 'Describe the change first.'
    if (body.text.length > MAX_TEXT_CHARS) return 'That description is too long.'
    if (typeof body.catalog !== 'string' || !body.catalog || body.catalog.length > MAX_CATALOG_CHARS) return 'The college data is missing or too large.'
    if (typeof body.today !== 'string' || body.today.length > 100) return 'Missing date.'
    return null
  }
  if (body?.mode === 'announce') {
    if (typeof body.facts !== 'string' || !body.facts.trim() || body.facts.length > MAX_FACTS_CHARS) return 'The facts are missing or too large.'
    return null
  }
  return 'Unknown mode.'
}

/** The request for Claude. The college catalogue sits in a cached system block; the per-request text follows it. */
export function requestFor(body) {
  const base = {
    model: MODEL,
    max_tokens: 16000,
    // Server-side fallback: if a request is declined by a safety classifier, the API retries it on a suitable
    // fallback model within the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }
  if (body.mode === 'understand') {
    return {
      ...base,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: CHANGE_SCHEMA } },
      system: [
        { type: 'text', text: UNDERSTAND },
        { type: 'text', text: `<college>\n${body.catalog}\n</college>`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: `Today is ${body.today}.\n\nChange: ${body.text.trim()}` }],
    }
  }
  return {
    ...base,
    output_config: { effort: 'low' },
    system: ANNOUNCE,
    messages: [{ role: 'user', content: `<facts>\n${body.facts}\n</facts>` }],
  }
}

const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()

/** The handler, with the Anthropic client injectable for tests. */
export function createHandler(makeClient = () => new Anthropic()) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')
    if (!process.env.ANTHROPIC_API_KEY) {
      return fail(res, 503, 'The change assistant is not set up yet: add ANTHROPIC_API_KEY to .env.local (or the Vercel project settings).')
    }
    const denied = await checkAccount(req, { adminOnly: true })
    if (denied) return fail(res, denied.status, denied.message)

    let body
    try {
      body = await readJson(req)
    } catch {
      return fail(res, 400, 'Invalid request body.')
    }
    const problem = validate(body)
    if (problem) return fail(res, 400, problem)

    let message
    try {
      message = await makeClient().beta.messages.create(requestFor(body))
    } catch (err) {
      console.error('[api/change]', err)
      return fail(res, 502, friendlyError(err))
    }
    if (message.stop_reason === 'refusal') return fail(res, 422, "The assistant couldn't help with that request.")
    if (message.stop_reason === 'max_tokens') return fail(res, 502, 'The answer was cut short. Try a shorter description.')

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (body.mode === 'announce') return res.end(JSON.stringify({ text: textOf(message) }))
    try {
      return res.end(JSON.stringify(JSON.parse(textOf(message))))
    } catch {
      return fail(res, 502, 'The assistant gave an answer the app could not read. Try again.')
    }
  }
}

export default createHandler()
