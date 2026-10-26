import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { loadGndecAndGenerate, openRole, setupStep, statValue, tab } from './helpers.js'

test.describe('Setup and timetable generation (administrator)', () => {
  test('G-01 Load GNDEC demo: five departments, with honest source labels', async ({ page }) => {
    await page.goto('/')
    await openRole(page, 'Administrator')
    await page.getByRole('button', { name: /Load GNDEC demo/ }).click()
    const bar = page.getByRole('tablist', { name: 'Choose department' })
    for (const d of ['CSE', 'ECE', 'ME', 'Civil', 'EE']) await expect(bar.getByRole('tab', { name: d, exact: true })).toBeVisible()
    await expect(page.getByText('From GNDEC documents').first()).toBeVisible()
    await bar.getByRole('tab', { name: 'ECE', exact: true }).click()
    await expect(page.getByText('Sample data').first()).toBeVisible()
  })

  test('G-02 Generate whole college: every class placed, 0 clashes', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await expect(page.getByText('354/354')).toBeVisible()
    await expect(statValue(page, 'Clashes')).toHaveText('0')
    await expect(page.getByText(/not an official GNDEC timetable/)).toBeVisible()
  })

  test('G-03 Generate one department keeps the others', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await page.getByRole('tablist', { name: 'Choose department' }).getByRole('tab', { name: 'ECE', exact: true }).click()
    await tab(page, 'Setup')
    await setupStep(page, 'Sections')
    await page.getByRole('button', { name: 'Generate ECE timetable' }).click()
    await expect(page.getByText('Classes placed')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/checked across all departments/)).toBeVisible()
    await page.getByRole('tablist', { name: 'Choose department' }).getByRole('tab', { name: 'CSE', exact: true }).click()
    await expect(page.getByText('354/354')).toBeVisible()
  })

  test('R-01 Timetable by section, teacher and room', async ({ page }) => {
    await loadGndecAndGenerate(page)
    for (const view of ['By teacher', 'By room', 'By section']) {
      await page.getByRole('button', { name: view }).click()
      await expect(page.locator('table').first()).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'D2 CS A' })).toBeVisible()
  })

  test('G-05 Impossible input gets failure guidance', async ({ page }) => {
    await page.goto('/')
    await openRole(page, 'Administrator')
    await page.getByRole('button', { name: /Load GNDEC demo/ }).click()
    await setupStep(page, 'Time structure')
    await page.getByLabel('Periods per day (longest day)').fill('2')
    await setupStep(page, 'Sections')
    await page.getByRole('button', { name: 'Generate whole college' }).click()
    await expect(page.getByText(/make a timetable impossible/).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Confirmed cause').first()).toBeVisible()
  })

  test('G-06 Import with mistakes is blocked, with every error listed', async ({ page }) => {
    await page.goto('/')
    await openRole(page, 'Administrator')
    await page.getByRole('button', { name: 'Import college data' }).click()
    const dir = path.resolve('sample-data/with-errors/csv')
    await page.locator('input[type=file]').first().setInputFiles(fs.readdirSync(dir).map((f) => path.join(dir, f)))
    await expect(page.getByText(/9 errors must be fixed before importing/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Import this data|Replace setup/ })).toBeDisabled()
  })

  test('G-07 Import a whole college from Excel, then generate it', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await page.goto('/')
    await openRole(page, 'Administrator')
    await page.getByRole('button', { name: 'Import college data' }).click()
    await page.locator('input[type=file]').first().setInputFiles(path.resolve('sample-data/northfield/northfield-college.xlsx'))
    await expect(page.getByText(/No errors\./)).toBeVisible()
    await page.getByRole('button', { name: /Import this data|Replace setup/ }).click()
    await page.getByRole('button', { name: /Generate|Continue|Go to/ }).first().click()
    await setupStep(page, 'Sections')
    await page.getByRole('button', { name: 'Generate whole college' }).click()
    await expect(page.getByText('Classes placed')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('tablist', { name: 'Choose department' }).getByRole('tab', { name: 'All departments' }).click()
    await expect(page.getByText('244/244')).toBeVisible()
    await expect(statValue(page, 'Clashes')).toHaveText('0')
  })
})
