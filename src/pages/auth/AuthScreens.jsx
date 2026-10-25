import { useState } from 'react'
import { AlertTriangle, ArrowLeft, CalendarDays, KeyRound, Loader2, LogOut, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, Card, Field } from '../../components/ui.jsx'
import { linkType } from '../../lib/supabase.js'

/** Centred page with the app's name, for every screen shown before the app itself. */
export function AuthFrame({ controls, children, wide = false }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
            <CalendarDays className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold">Smart TimeTables</span>
        </a>
        {controls}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>{children}</div>
      </main>
    </div>
  )
}

function Problem({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {children}
    </p>
  )
}

export function Splash({ text = 'Loading…' }) {
  return (
    <div className="grid min-h-screen place-items-center text-slate-500">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" /> {text}
      </span>
    </div>
  )
}

const TEXT = {
  signin: { title: 'Sign in', intro: 'Use your email and password.', button: 'Sign in', busy: 'Signing in…' },
  create: {
    title: 'Create an account',
    intro: "Enter your email. We'll send you a link: open it (on your phone is fine) to choose your password.",
    button: 'Send link',
    busy: 'Sending…',
  },
  reset: {
    title: 'Reset your password',
    intro: "Enter your account's email and we'll send you a link to choose a new password.",
    button: 'Send reset link',
    busy: 'Sending…',
  },
}

/**
 * Email + password sign-in, "Create an account" (an email link, then a password) and "Forgot password?".
 * A new account starts with no access until an administrator approves it (enforced in the database).
 */
export function SignIn({ auth, controls, onBack }) {
  const [mode, setMode] = useState('signin') // signin | create | reset
  const [sent, setSent] = useState('') // the mode whose email was just sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = (next) => (setError(''), setSent(''), setMode(next))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) return setError('Enter your email address.')
    if (mode === 'signin' && !password) return setError('Enter your password.')
    setBusy(true)
    const problem =
      mode === 'signin' ? await auth.signIn(email, password) : mode === 'create' ? await auth.createAccount(email) : await auth.sendReset(email)
    setBusy(false)
    if (problem) setError(problem)
    else if (mode !== 'signin') setSent(mode)
  }

  const text = TEXT[mode]
  return (
    <AuthFrame controls={controls}>
      <Card className="space-y-5 p-6">
        {sent ? (
          <>
            <div className="space-y-2">
              <Mail className="h-8 w-8 text-indigo-600" />
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="text-slate-600">
                {sent === 'create' ? (
                  <>
                    We sent a link to <b>{email.trim()}</b>. Open it on any device, on your phone too, to choose your password. Then
                    tell us who you are, and an administrator approves your access.
                  </>
                ) : (
                  <>
                    If an account exists for <b>{email.trim()}</b>, a link to set a new password is on its way.
                  </>
                )}
              </p>
              <p className="text-sm text-slate-500">No email after a few minutes? Check spam, or try again later.</p>
            </div>
            <Button variant="secondary" onClick={() => go('signin')}>
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Button>
          </>
        ) : (
          <form className="space-y-4" onSubmit={submit} noValidate>
            <div>
              <h1 className="text-2xl font-bold">{text.title}</h1>
              <p className="text-slate-500">{text.intro}</p>
            </div>
            <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            {mode === 'signin' && (
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            <Problem>{error}</Problem>
            <Button type="submit" className="w-full py-2.5" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? text.busy : text.button}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {mode === 'signin' ? (
                <>
                  <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => go('create')}>
                    New here? Create an account
                  </button>
                  <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => go('reset')}>
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => go('signin')}>
                  Back to sign in
                </button>
              )}
            </div>
            {onBack && (
              <button type="button" className="text-sm text-slate-500 hover:underline" onClick={onBack}>
                About Smart TimeTables
              </button>
            )}
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-sm text-slate-500">
        New accounts see nothing until an administrator approves them and decides what each one can see.
      </p>
    </AuthFrame>
  )
}

/** After an invitation, a reset link or a new account's link: choose a password before going on. */
export function SetPassword({ auth, controls }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const invited = linkType === 'invite' || linkType === 'signup' || linkType === 'magiclink'

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== repeat) return setError('The two passwords are different.')
    setBusy(true)
    const problem = await auth.setPassword(password)
    setBusy(false)
    setError(problem)
  }

  return (
    <AuthFrame controls={controls}>
      <Card className="p-6">
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div>
            <KeyRound className="mb-2 h-8 w-8 text-indigo-600" />
            <h1 className="text-2xl font-bold">{invited ? 'Welcome! Choose a password' : 'Choose a new password'}</h1>
            <p className="text-slate-500">
              {auth.user?.email ? <>For {auth.user.email}. </> : null}You'll use it to sign in from now on.
            </p>
          </div>
          <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <Field label="Repeat the password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          <Problem>{error}</Problem>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save password
            </Button>
            <Button type="button" variant="ghost" onClick={auth.signOut}>
              Sign out
            </Button>
          </div>
        </form>
      </Card>
    </AuthFrame>
  )
}

/** A production build without Supabase settings: nothing to sign in to, and no open demo. */
export function NotConfigured({ controls }) {
  return (
    <AuthFrame controls={controls} wide>
      <Card className="space-y-4 p-6">
        <ShieldCheck className="h-8 w-8 text-indigo-600" />
        <h1 className="text-2xl font-bold">Sign-in isn't set up yet</h1>
        <p className="text-slate-600">
          This copy of Smart TimeTables has no Supabase project configured, so nobody can sign in and no college data is
          shown.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-slate-700">
          <li>
            Set <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> (locally in{' '}
            <code className="rounded bg-slate-100 px-1">.env.local</code>, on Vercel under Environment Variables).
          </li>
          <li>Rebuild and reload. The steps are in docs/SUPABASE_SETUP.md.</li>
        </ol>
      </Card>
    </AuthFrame>
  )
}

/** The shared data couldn't be loaded (network, or the migrations are not applied yet). */
export function LoadError({ message, onRetry, onSignOut, controls }) {
  return (
    <AuthFrame controls={controls}>
      <Card className="space-y-4 p-6">
        <AlertTriangle className="h-8 w-8 text-red-600" />
        <h1 className="text-2xl font-bold">Couldn't load the college data</h1>
        <Problem>{message}</Problem>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
          <Button variant="secondary" onClick={onSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </Card>
    </AuthFrame>
  )
}
