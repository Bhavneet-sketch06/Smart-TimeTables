import { test, expect } from '@playwright/test'
import { loadGndecAndGenerate, switchRole, tab } from './helpers.js'

test.describe('Role views', () => {
  test('R-04 Faculty: own weekly schedule and load', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await switchRole(page, 'Faculty')
    await expect(page.getByText(/weekly teaching schedule/)).toBeVisible()
    await expect(page.getByText(/total load \d+/)).toBeVisible()
    await tab(page, 'Department timetable')
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('R-06 Student: My Day, full week, and one lab group', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await switchRole(page, 'Student')
    await expect(page.getByRole('tab', { name: 'My Day' })).toBeVisible()
    await page.getByRole('tab', { name: 'Full week' }).click()
    await expect(page.locator('table').first()).toContainText('Lab A2')
    await page.getByLabel('Lab group').selectOption('A1')
    await expect(page.locator('table').first()).toContainText('Lab A1')
    await expect(page.locator('table').first()).not.toContainText('Lab A2')
  })

  test('R-03 HOD: joint free times with another department, free/busy only', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await page.getByRole('button', { name: /Switch/ }).click()
    await page.locator('#roles button', { hasText: 'HOD' }).click()
    await page.getByRole('button', { name: /CSE/ }).first().click()
    await tab(page, 'Campus Guide')
    await expect(page.getByText('Find a time for a joint session')).toBeVisible()
    await page.getByLabel('With').selectOption({ label: 'Electronics & Communication Engineering' })
    await expect(page.getByRole('button', { name: /onwards/ }).first()).toBeVisible()
  })
})
