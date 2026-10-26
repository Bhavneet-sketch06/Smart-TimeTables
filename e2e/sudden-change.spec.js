import { test, expect } from '@playwright/test'
import { loadGndecAndGenerate, setupStep, statValue, tab } from './helpers.js'

// A timetable is published, then something changes. The administrator records the change and regenerates:
// the change is respected, every class is still placed with no clashes, and only the affected classes move.

// Each test regenerates the GNDEC college twice, so they run one at a time with more time.
test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('Sudden changes', () => {
  test('S-01 Teacher on leave for a day: only their classes move', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await tab(page, 'Setup')
    await setupStep(page, 'Teachers')
    const card = page.locator('div.rounded-lg', { has: page.locator('input[value="Dr. Kapil Sharma"]') })
    await card.getByRole('button', { name: /unavailable slots/ }).click()
    for (const slot of await card.locator('tr', { hasText: 'Wed' }).getByRole('button').all()) await slot.click()
    await expect(card.getByRole('button', { name: /unavailable slots \(\d+\)/ })).toContainText(/\((7|8|9|10)\)/)

    await setupStep(page, 'Sections')
    await expect(page.getByText('Keep unaffected classes in place.')).toBeVisible()
    await page.getByRole('button', { name: 'Generate CSE timetable' }).click()
    await expect(page.getByText(/Updated after your change: \d+ class(es)? moved, \d+ kept/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('354/354')).toBeVisible()
    await expect(statValue(page, 'Clashes')).toHaveText('0')
  })

  test('S-03 College event: two Friday periods become class-free for everyone', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await tab(page, 'Setup')
    await setupStep(page, 'Time structure')
    await page.getByLabel('Reason for new blocked slots').fill('Convocation')
    const friday = page.locator('tr', { has: page.locator('th', { hasText: /^Fri$/ }) })
    await friday.getByRole('button', { name: 'P1', exact: true }).click()
    await friday.getByRole('button', { name: 'P2', exact: true }).click()

    await setupStep(page, 'Sections')
    await page.getByRole('button', { name: 'Generate whole college' }).click()
    await expect(page.getByText(/Updated after your change: \d+ class(es)? moved, \d+ kept/)).toBeVisible({ timeout: 30_000 })
    await expect(statValue(page, 'Clashes')).toHaveText('0')
    await page.getByRole('tablist', { name: 'Choose department' }).getByRole('tab', { name: 'All departments' }).click()
    await expect(page.getByText('618/618')).toBeVisible()
    await expect(page.locator('table').first().getByText('Convocation').first()).toBeVisible()
  })

  test("S-04 A change that cannot fit is explained: a teacher's hours are cut below their load", async ({ page }) => {
    await loadGndecAndGenerate(page)
    await tab(page, 'Setup')
    await setupStep(page, 'Teachers')
    const card = page.locator('div.rounded-lg', { has: page.locator('input[value="Dr. Kapil Sharma"]') })
    await card.getByLabel('Max hours / week').fill('2')
    await setupStep(page, 'Sections')
    await page.getByRole('button', { name: 'Generate CSE timetable' }).click()
    await expect(page.getByText(/make a timetable impossible/).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Confirmed cause').first()).toBeVisible()
    await expect(page.getByText(/Kapil Sharma/).filter({ visible: true }).first()).toBeVisible()
  })
})
