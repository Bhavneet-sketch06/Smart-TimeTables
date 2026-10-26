import { test, expect } from '@playwright/test'

// Checks against the deployed site. They only read: no sign-in, nothing is changed.
const LIVE = 'https://smart-time-tables.vercel.app'

test.describe('Live site', () => {
  test('M-06 The AI assistant refuses requests without a signed-in account', async ({ request }) => {
    const res = await request.post(`${LIVE}/api/chat`, {
      data: { messages: [{ role: 'user', content: 'When is D3 CS A free?' }], context: 'x' },
    })
    expect(res.status()).toBe(401)
    expect(await res.text()).toContain('Sign in to use the assistant.')
  })

  test('A-03 The live site uses accounts: no role picker before sign-in', async ({ page }) => {
    await page.goto(LIVE)
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
    await expect(page.getByText('Browser-only demo')).toHaveCount(0)
    await page.locator('#roles button', { hasText: 'Student' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible() // a role card leads to sign-in, not into the role
  })
})
