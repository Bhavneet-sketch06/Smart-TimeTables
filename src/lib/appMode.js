/**
 * Which app runs:
 *   'demo'            the browser-only demo: role picker, no sign-in, data in this browser. Always when
 *                     VITE_LOCAL_DEMO=true (the evaluator switch: it wins even when Supabase is configured, so
 *                     sign-in comes back by removing it), and during `npm run dev` without Supabase settings.
 *   'accounts'        sign-in, roles from the database, shared data (Supabase configured).
 *   'not-configured'  a production build with neither: nothing to show.
 */
export function appMode({ supabaseConfigured, dev, localDemo }) {
  if (localDemo) return 'demo'
  if (supabaseConfigured) return 'accounts'
  return dev ? 'demo' : 'not-configured'
}
