import { expect, test } from 'vitest'
import { appMode } from './appMode.js'

test('the evaluator switch (VITE_LOCAL_DEMO=true) turns sign-in off even with Supabase configured', () => {
  expect(appMode({ supabaseConfigured: true, dev: false, localDemo: true })).toBe('demo')
  expect(appMode({ supabaseConfigured: true, dev: false, localDemo: false })).toBe('accounts')
  expect(appMode({ supabaseConfigured: true, dev: true, localDemo: false })).toBe('accounts')
  expect(appMode({ supabaseConfigured: false, dev: true, localDemo: false })).toBe('demo')
  expect(appMode({ supabaseConfigured: false, dev: false, localDemo: false })).toBe('not-configured')
})
