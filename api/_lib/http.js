// Shared by the serverless functions in api/. Files under api/_lib are not deployed as endpoints of their own.
import Anthropic from '@anthropic-ai/sdk'

export async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export function fail(res, status, message) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

// Without accounts (the browser-only demo) anyone can reach the AI endpoints, so each visitor gets a limited number
// of requests. Kept in memory per server instance: a brake on runaway use, not a quota. Set a monthly spending
// limit in the Anthropic Console as well.
const DEMO_LIMIT = { requests: 30, windowMs: 10 * 60_000 }
const recent = new Map()

/** Returns { status: 429, message } once this caller has used up the demo allowance, else null (counts the request). */
export function demoRateLimit(req, now = Date.now()) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  const times = (recent.get(ip) ?? []).filter((t) => now - t < DEMO_LIMIT.windowMs)
  if (times.length >= DEMO_LIMIT.requests) {
    recent.set(ip, times)
    return { status: 429, message: 'The demo has a limit on AI requests. Please wait a few minutes and try again.' }
  }
  times.push(now)
  recent.set(ip, times)
  if (recent.size > 5000) recent.clear() // never grow without bound
  return null
}

/**
 * With accounts (Supabase configured), only signed-in users with active access may call an endpoint; `adminOnly`
 * further requires an active administrator. Uses the public project URL and publishable key: the caller's own token
 * decides what the database returns. In the browser-only demo (no Supabase, or VITE_LOCAL_DEMO=true) there are no
 * accounts: callers are only rate-limited. Returns { status, message } when refused, or null when the caller may continue.
 */
export async function checkAccount(req, { adminOnly = false } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key || process.env.VITE_LOCAL_DEMO === 'true') return demoRateLimit(req)
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { status: 401, message: 'Sign in to use the assistant.' }
  let sub = ''
  try {
    sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub ?? ''
  } catch {
    return { status: 401, message: 'Your session is not valid. Sign in again.' }
  }
  // The database verifies the token; RLS returns only the caller's own profile row (or all, for administrators).
  const res = await fetch(`${url}/rest/v1/profiles?select=role,active&user_id=eq.${encodeURIComponent(sub)}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  }).catch(() => null)
  if (!res) return { status: 401, message: 'Could not check your account. Try again.' }
  if (!res.ok) return { status: 401, message: 'Your session has expired. Sign in again.' }
  const rows = await res.json().catch(() => [])
  const refuse = (message) => ({ status: 401, message })
  if (adminOnly) return rows.some((r) => r.active && r.role === 'admin') ? null : refuse('Only administrators can do this.')
  return rows.some((r) => r.active && r.role !== 'pending') ? null : refuse('Your account has no access yet. Ask your administrator.')
}

export function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check ANTHROPIC_API_KEY.'
  if (err instanceof Anthropic.RateLimitError) return 'The assistant is busy right now. Please try again in a moment.'
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? 'unknown'}).`
  return 'Could not reach the AI service.'
}
