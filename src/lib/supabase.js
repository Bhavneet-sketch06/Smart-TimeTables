// The browser's Supabase client. Only the project URL and the PUBLISHABLE key are used here (both are meant to be
// public); every permission is enforced by Row Level Security in the database. Never put a secret/service key in a
// VITE_ variable: Vite copies those into the browser bundle.
import { createClient } from '@supabase/supabase-js'
import { appMode } from './appMode.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** VITE_LOCAL_DEMO=true: the evaluator demo (no sign-in, role picker) even when Supabase is configured. */
export const evaluatorDemo = import.meta.env.VITE_LOCAL_DEMO === 'true'

const mode = appMode({ supabaseConfigured: Boolean(url && key), dev: import.meta.env.DEV, localDemo: evaluatorDemo })

/** Sign-in and shared data are on (see appMode). */
export const supabaseConfigured = mode === 'accounts'

/** The browser-only demo runs: role picker, data in localStorage, no accounts and nothing shared. */
export const localDemoAllowed = mode === 'demo'

// Email links land here with "#...&type=invite" (invitation), "type=recovery" (password reset), or "type=signup" /
// "type=magiclink" (Create account). Read it before the client consumes (and clears) the URL hash, so the app can
// ask the user to choose a password.
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

/** Link types after which the user chooses a password (a new account has none yet). */
export const PASSWORD_LINKS = ['invite', 'recovery', 'signup', 'magiclink']

/** Where Supabase sends people back to from email links (must be listed under Auth → URL Configuration). */
export const redirectUrl = () => `${window.location.origin}/`
