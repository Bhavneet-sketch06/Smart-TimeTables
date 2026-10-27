import { test, expect } from '@playwright/test'
import { openRole, statValue, switchRole, tab } from './helpers.js'

// E-01 to E-04: the evaluator demo (VITE_LOCAL_DEMO=true) on a server that also has Supabase settings, like the
// live site with the switch on. No sign-in; the GNDEC college is ready on the first visit.

test.describe.configure({ timeout: 120_000 })

test.describe('Evaluator demo', () => {
  test('E-01 No sign-in: the landing page offers every role', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Create a timetable' })).toBeVisible()
    await expect(page.locator('header').getByRole('button', { name: 'Sign in' })).toHaveCount(0)
    for (const role of ['Administrator', 'HOD', 'Faculty', 'Student']) await expect(page.locator('#roles button', { hasText: role })).toBeVisible()
  })

  test('E-02 The first visit opens on the GNDEC college with its timetable generated', async ({ page }) => {
    await page.goto('/')
    await openRole(page, 'Administrator')
    await tab(page, 'Timetable')
    await expect(page.getByText('354/354')).toBeVisible({ timeout: 30_000 })
    await expect(statValue(page, 'Clashes')).toHaveText('0')
    await expect(page.getByRole('button', { name: /^Reschedule/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Users/ })).toHaveCount(0) // accounts only
  })

  test('E-03 Switch role freely: student, faculty and HOD all see the same college', async ({ page }) => {
    await page.goto('/')
    await openRole(page, 'Student')
    await expect(page.getByLabel('Section')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /^Notice/ })).toBeVisible()
    await switchRole(page, 'Faculty')
    await expect(page.getByLabel('Your name')).toBeVisible()
    await switchRole(page, 'HOD')
    await expect(page.getByText('Which department do you coordinate?')).toBeVisible()
  })

  test('E-04 The AI endpoints answer without sign-in (requests are checked, not refused)', async ({ request }) => {
    const res = await request.post('/api/change', { data: { mode: 'not-a-mode' } }) // stops before reaching Claude
    expect(res.status()).toBe(400)
    expect(await res.text()).toBe('Unknown mode.')
  })
})
