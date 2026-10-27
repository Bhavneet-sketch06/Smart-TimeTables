// Timetable assistant endpoint.
// Runs as a Vercel serverless function in production, and through the Vite dev middleware locally
// (see vite.config.js). The API key is read from the ANTHROPIC_API_KEY environment variable and never
// reaches the browser.
import Anthropic from '@anthropic-ai/sdk'
import { checkAccount, fail, friendlyError, readJson } from './_lib/http.js'

export const config = { maxDuration: 60 }

const MODEL = 'claude-opus-5-5'
const MAX_TURNS = 20
const MAX_MESSAGE_CHARS = 2000
const MAX_CONTEXT_CHARS = 200_000

const INSTRUCTIONS = `You are the timetable assistant inside a college timetable app. Students, faculty, HODs and
administrators ask you about the timetable shown in the app.

The current college data and generated timetable are given below inside <timetable> tags. Answer only from that
data. If the answer isn't in it (for example the timetable hasn't been generated yet, or a name doesn't exist),
say so plainly and suggest what the user can do in the app.

Guidelines:
- Be concise and specific: name the day, time, subject, teacher and room.
- When listing several classes or free slots, use a short bulleted list in time order.
- Labs taken by a lab group (e.g. A1, A2) apply only to that group; lectures apply to the whole section.
- For "free" questions, a section, teacher or room is free in a period when it has no class then; the break is not a period.
- A room on a specific date is also taken by any ROOM BOOKINGS listed for that date and time. Rooms marked
  "events only" never hold regular classes. To reserve a room, users open the "Book a space" tab (Faculty, HOD or Admin).
- Use plain text with simple "-" bullets; no tables or headings.`

/** Returns an error message, or null if the conversation is acceptable. */
function validate(messages, context) {
  if (!Array.isArray(messages) || messages.length === 0) return 'No messages were sent.'
  if (messages.length > MAX_TURNS * 2) return 'This conversation is too long. Start a new chat.'
  for (const [i, m] of messages.entries()) {
    const expected = i % 2 === 0 ? 'user' : 'assistant'
    if (m?.role !== expected || typeof m.content !== 'string' || !m.content.trim()) return 'Malformed conversation.'
    if (m.role === 'user' && m.content.length > MAX_MESSAGE_CHARS) return 'That message is too long.'
  }
  if (messages.at(-1).role !== 'user') return 'The last message must be a question.'
  if (typeof context !== 'string' || context.length > MAX_CONTEXT_CHARS) return 'The timetable data is missing or too large.'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(res, 503, 'The assistant is not set up yet: add ANTHROPIC_API_KEY to .env.local (or the Vercel project settings).')
  }

  const denied = await checkAccount(req)
  if (denied) return fail(res, denied.status, denied.message)

  let body
  try {
    body = await readJson(req)
  } catch {
    return fail(res, 400, 'Invalid request body.')
  }
  const problem = validate(body.messages, body.context)
  if (problem) return fail(res, 400, problem)

  const client = new Anthropic()
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })

  let stream
  req.on('close', () => stream?.abort())
  try {
    stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // Server-side fallback: if a request is declined by a safety classifier, the API retries it on a
      // suitable fallback model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: INSTRUCTIONS },
        // The timetable is identical across a conversation's turns, so cache it.
        { type: 'text', text: `<timetable>\n${body.context}\n</timetable>`, cache_control: { type: 'ephemeral' } },
      ],
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    })
    stream.on('text', (text) => res.write(text))
    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') res.write("\n\nSorry, I can't help with that request.")
    else if (final.stop_reason === 'max_tokens') res.write('\n\n(The answer was cut short.)')
  } catch (err) {
    if (!stream?.aborted) {
      console.error('[api/chat]', err)
      res.write(`\n\n⚠️ ${friendlyError(err)}`)
    }
  }
  res.end()
}
