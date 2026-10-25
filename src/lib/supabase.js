// The browser's Supabase client. Only the project URL and the PUBLISHABLE key are used here (both are meant to be
// public); every permission is enforced by Row Level Security in the database. Never put a secret/service key in a
// VITE_ variable: Vite copies those into the browser bundle.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && key)

/**
 * Without Supabase settings the old browser-only demo (role picker, data in localStorage) is available during
 * `npm run dev`, or in a build only when VITE_LOCAL_DEMO=true. It never shares data and has no accounts.
 */
export const localDemoAllowed = !supabaseConfigured && (import.meta.env.DEV || import.meta.env.VITE_LOCAL_DEMO === 'true')

// Invitation and password-reset links land here with "#...&type=invite" / "type=recovery". Read it before the
// client consumes (and clears) the URL hash, so the app can ask the user to choose a password.
export const linkType = (() => {
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get('type') ?? ''
  } catch {
    return ''
  }
})()

export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

/** Where Supabase sends people back to from email links (must be listed under Auth → URL Configuration). */
export const redirectUrl = () => `${window.location.origin}/`
