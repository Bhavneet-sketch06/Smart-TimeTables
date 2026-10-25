import { useCallback, useEffect, useState } from 'react'
import { PASSWORD_LINKS, linkType, redirectUrl, supabase } from '../lib/supabase.js'

/**
 * Supabase session and the signed-in user's profile (their trusted role and scope, from public.profiles).
 * The profile is only ever read here; it can be changed by an administrator alone (enforced in the database).
 *
 * session: undefined while restoring, null when signed out.
 * profile: { status: 'loading' | 'ready' | 'error', row, error }
 * needsPassword: true after an invitation, password-reset or create-account link, until a password is saved.
 */
export function useAuth() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState({ status: 'loading', row: null, error: '' })
  const [needsPassword, setNeedsPassword] = useState(PASSWORD_LINKS.includes(linkType))

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (alive) setSession(error ? null : data.session ?? null)
    })
    // Only update state here: Supabase advises against calling its API inside this callback.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null)
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
      if (event === 'SIGNED_OUT') setNeedsPassword(false)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id
  const loadProfile = useCallback(async () => {
    if (!userId) return
    setProfile((p) => ({ ...p, status: p.row ? p.status : 'loading', error: '' }))
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
    setProfile(error ? { status: 'error', row: null, error: error.message } : { status: 'ready', row: data, error: '' })
  }, [userId])

  useEffect(() => {
    if (userId) loadProfile()
    else setProfile({ status: 'loading', row: null, error: '' })
  }, [userId, loadProfile])

  // An administrator may change someone's access while they are signed in: check again when they come back.
  useEffect(() => {
    if (!userId) return
    const onVisible = () => document.visibilityState === 'visible' && loadProfile()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, loadProfile])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? friendlyAuthError(error) : ''
  }
  const signOut = async () => {
    await supabase.auth.signOut()
    setNeedsPassword(false)
  }
  const sendReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() })
    return error ? friendlyAuthError(error) : ''
  }
  /**
   * Create account: emails a link (new accounts need public sign-ups allowed in Supabase). Opening it signs the
   * person in on that device, where they choose a password. The account starts pending, with no access, until an
   * administrator approves it.
   */
  const createAccount = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() },
    })
    return error ? friendlyAuthError(error) : ''
  }
  const setPassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return friendlyAuthError(error)
    setNeedsPassword(false)
    return ''
  }

  return {
    loading: session === undefined,
    session,
    user: session?.user ?? null,
    profile,
    reloadProfile: loadProfile,
    needsPassword,
    signIn,
    signOut,
    sendReset,
    createAccount,
    setPassword,
  }
}

function friendlyAuthError(error) {
  const msg = error?.message ?? ''
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match an account.'
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: open the link in the invitation email.'
  if (/signups? not allowed|sign ?ups? (are )?disabled/i.test(msg)) return 'Creating accounts is turned off. Ask your administrator for an invitation.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.'
  if (/password/i.test(msg) && /(short|weak|characters)/i.test(msg)) return msg
  if (/fetch|network/i.test(msg)) return 'Could not reach the sign-in service. Check your connection.'
  return msg || 'Something went wrong. Please try again.'
}
