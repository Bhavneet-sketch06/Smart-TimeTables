import { test, expect } from '@playwright/test'

// Checks against the deployed site. They only read: no sign-in, nothing is changed, and no request reaches Claude.
// The live site runs either with sign-in or as the evaluator demo (VITE_LOCAL_DEMO=true); both are checked.
const LIVE = 'https://smart-time-tables.vercel.app'

/** True when the live site currently asks people to sign in (else it is the evaluator demo). */
async function signInMode(page) {
  await page.goto(LIVE)
  await expect(page.getByRole('button', { name: /Sign in|Create a timetable/ }).first()).toBeVisible()
  return (await page.locator('header').getByRole('button', { name: 'Sign in' }).count()) > 0
}

test.describe('Live site', () => {
  test('M-06 The AI assistant is protected: sign-in required, or (demo) every request is checked', async ({ page, request }) => {
    const accounts = await signInMode(page)
    // An empty conversation: refused before any model call in both modes.
    const res = await request.post(`${LIVE}/api/chat`, { data: { messages: [], context: 'x' } })
    if (accounts) {
      expect(res.status()).toBe(401)
      expect(await res.text()).toContain('Sign in to use the assistant.')
    } else {
      expect(res.status()).toBe(400)
      expect(await res.text()).toBe('No messages were sent.')
    }
  })

  test('A-03 The way in matches the mode: role cards lead to sign-in, or (demo) straight into the role', async ({ page }) => {
    const accounts = await signInMode(page)
    await page.locator('#roles button', { hasText: 'Student' }).click()
    if (accounts) await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    else await expect(page.getByRole('button', { name: /^My timetable/ })).toBeVisible()
  })
})
