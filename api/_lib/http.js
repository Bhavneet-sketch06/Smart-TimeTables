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

/**
 * With accounts (Supabase configured), only signed-in users with active access may call an endpoint; `adminOnly`
 * further requires an active administrator. Uses the public project URL and publishable key: the caller's own token
 * decides what the database returns. Returns an error message, or null when the caller may continue.
 */
export async function checkAccount(req, { adminOnly = false } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null // browser-only demo: no accounts exist
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return 'Sign in to use the assistant.'
  let sub = ''
  try {
    sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub ?? ''
  } catch {
    return 'Your session is not valid. Sign in again.'
  }
  // The database verifies the token; RLS returns only the caller's own profile row (or all, for administrators).
  const res = await fetch(`${url}/rest/v1/profiles?select=role,active&user_id=eq.${encodeURIComponent(sub)}`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  }).catch(() => null)
  if (!res) return 'Could not check your account. Try again.'
  if (!res.ok) return 'Your session has expired. Sign in again.'
  const rows = await res.json().catch(() => [])
  if (adminOnly) return rows.some((r) => r.active && r.role === 'admin') ? null : 'Only administrators can do this.'
  return rows.some((r) => r.active && r.role !== 'pending') ? null : 'Your account has no access yet. Ask your administrator.'
}

export function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check ANTHROPIC_API_KEY.'
  if (err instanceof Anthropic.RateLimitError) return 'The assistant is busy right now. Please try again in a moment.'
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? 'unknown'}).`
  return 'Could not reach the AI service.'
}
