import { supabase } from './supabase.js'

/** With accounts, the server functions in api/ need the caller's session token (they check the role themselves). */
export async function authHeaders() {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}
