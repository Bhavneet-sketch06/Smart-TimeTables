// The change endpoint with a stand-in for Claude: request shape, validation, administrator-only access, refusals.
// No network and no API credits are used.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createHandler, requestFor } from '../api/change.js'
import { demoRateLimit } from '../api/_lib/http.js'

const proposal = {
  kind: 'changes',
  question: '',
  summary: 'Dr. Kapil Sharma is on leave on Wednesday.',
  changes: [{ type: 'teacher_unavailable', teacherId: 't1', roomId: '', reason: 'Leave', slots: [{ day: 'Wed', period: 1 }] }],
}

function fakeClient(reply) {
  const calls = []
  return {
    calls,
    make: () => ({ beta: { messages: { create: async (req) => (calls.push(req), reply) } } }),
  }
}
const textReply = (text, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] })

async function call(handler, body, { method = 'POST', token } = {}) {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    end(b) {
      this.body = b ?? ''
    },
  }
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res)
  return res
}

const understand = { mode: 'understand', text: 'Dr. Kapil Sharma is on leave this Wednesday', catalog: 't1 | Dr. Kapil Sharma | CSE', today: 'Monday 26 October 2026' }
const saved = {}

beforeEach(() => {
  for (const k of ['ANTHROPIC_API_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_LOCAL_DEMO']) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env.ANTHROPIC_API_KEY = 'test-key'
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.unstubAllGlobals()
})

describe('api/change', () => {
  test('understand: the catalogue is cached, the answer must follow the schema, and it comes back as data', async () => {
    const fake = fakeClient(textReply(JSON.stringify(proposal)))
    const res = await call(createHandler(fake.make), understand)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(proposal)

    const req = fake.calls[0]
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.output_config.format.type).toBe('json_schema')
    expect(req.output_config.format.schema.required).toEqual(['kind', 'question', 'summary', 'changes'])
    expect(req.system[1]).toMatchObject({ cache_control: { type: 'ephemeral' } })
    expect(req.system[1].text).toContain('t1 | Dr. Kapil Sharma')
    expect(req.messages[0].content).toContain('Today is Monday 26 October 2026.')
  })

  test('announce: plain text written only from the facts sent', async () => {
    const fake = fakeClient(textReply('Timetable update: ...'))
    const res = await call(createHandler(fake.make), { mode: 'announce', facts: 'CHANGES:\n- Dr. Kapil Sharma unavailable: Wed all day' })
    expect(JSON.parse(res.body)).toEqual({ text: 'Timetable update: ...' })
    expect(fake.calls[0].messages[0].content).toContain('<facts>')
    expect(fake.calls[0].output_config).toEqual({ effort: 'low' })
  })

  test('bad requests never reach Claude', async () => {
    const fake = fakeClient(textReply('{}'))
    const handler = createHandler(fake.make)
    expect((await call(handler, understand, { method: 'GET' })).statusCode).toBe(405)
    expect((await call(handler, { ...understand, text: '' })).statusCode).toBe(400)
    expect((await call(handler, { ...understand, text: 'x'.repeat(1001) })).statusCode).toBe(400)
    expect((await call(handler, { mode: 'delete' })).statusCode).toBe(400)
    delete process.env.ANTHROPIC_API_KEY
    expect((await call(handler, understand)).statusCode).toBe(503)
    expect(fake.calls).toHaveLength(0)
  })

  test('refusals, cut-off answers and unreadable answers are reported, not passed on', async () => {
    expect((await call(createHandler(fakeClient(textReply('', 'refusal')).make), understand)).statusCode).toBe(422)
    expect((await call(createHandler(fakeClient(textReply('{"kind":', 'max_tokens')).make), understand)).statusCode).toBe(502)
    expect((await call(createHandler(fakeClient(textReply('not json')).make), understand)).statusCode).toBe(502)
  })

  test('with accounts, only an active administrator may use it', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.test'
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    const token = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`
    const roles = { admin1: [{ role: 'admin', active: true }], fac1: [{ role: 'faculty', active: true }], old1: [{ role: 'admin', active: false }] }
    vi.stubGlobal('fetch', async (url) => {
      const sub = decodeURIComponent(String(url).split('user_id=eq.')[1])
      return { ok: true, json: async () => roles[sub] ?? [] }
    })
    const fake = fakeClient(textReply(JSON.stringify(proposal)))
    const handler = createHandler(fake.make)

    expect((await call(handler, understand)).statusCode).toBe(401)
    const faculty = await call(handler, understand, { token: token('fac1') })
    expect([faculty.statusCode, faculty.body]).toEqual([401, 'Only administrators can do this.'])
    expect((await call(handler, understand, { token: token('old1') })).statusCode).toBe(401)
    expect(fake.calls).toHaveLength(0)
    expect((await call(handler, understand, { token: token('admin1') })).statusCode).toBe(200)
  })

  test('in the evaluator demo (VITE_LOCAL_DEMO=true) no sign-in is needed, even with Supabase configured', async () => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.test'
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    process.env.VITE_LOCAL_DEMO = 'true'
    vi.stubGlobal('fetch', async () => {
      throw new Error('the demo never asks the database about accounts')
    })
    const fake = fakeClient(textReply(JSON.stringify(proposal)))
    const res = await call(createHandler(fake.make), understand)
    expect(res.statusCode).toBe(200)
  })

  test('without accounts, each visitor gets a limited number of AI requests', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } }
    const t0 = 1_000_000
    for (let i = 0; i < 30; i++) expect(demoRateLimit(req, t0 + i)).toBeNull()
    expect(demoRateLimit(req, t0 + 31)).toMatchObject({ status: 429 })
    expect(demoRateLimit({ headers: { 'x-forwarded-for': '198.51.100.2' } }, t0 + 31)).toBeNull() // someone else
    expect(demoRateLimit(req, t0 + 11 * 60_000)).toBeNull() // ten minutes later
  })

  test('the request schema allows only the six supported kinds of change', () => {
    const kinds = requestFor(understand).output_config.format.schema.properties.changes.items.properties.type.enum
    expect(kinds).toEqual(['teacher_unavailable', 'teacher_available', 'block_slots', 'unblock_slots', 'room_out_of_service', 'room_back_in_service'])
  })
})
