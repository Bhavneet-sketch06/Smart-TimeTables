import { expect } from '@playwright/test'

// Shared steps for the browser tests. Every test starts in a fresh browser (empty storage), on the browser-only
// demo, so tests never depend on each other or on the shared database.

/** From the landing page, open a role ("Administrator", "HOD", "Faculty", "Student"). */
export async function openRole(page, role) {
  await page.locator('#roles button', { hasText: role }).click()
}

/** Back to the landing page and into another role (the demo's role picker). */
export async function switchRole(page, role) {
  await page.getByRole('button', { name: /Switch/ }).click()
  await openRole(page, role)
}

/** Administrator: load the GNDEC demo and generate the whole college; ends on the Timetable tab. */
export async function loadGndecAndGenerate(page) {
  await page.goto('/')
  await openRole(page, 'Administrator')
  await page.getByRole('button', { name: /Load GNDEC demo/ }).click()
  await setupStep(page, 'Sections')
  await page.getByRole('button', { name: 'Generate whole college' }).click()
  await expect(page.getByText('Classes placed')).toBeVisible({ timeout: 30_000 })
}

/** Administrator → Setup → one of the five wizard steps. */
export async function setupStep(page, title) {
  await page.locator('ol button', { hasText: title }).click()
}

/** Click a tab in the role's tab bar. */
export async function tab(page, name) {
  // Tab labels may end in a count badge ("Campus Guide 1"), so match from the start of the name.
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
}

/** The number on a summary card ("Clashes", "Quality score", ...). */
export const statValue = (page, label) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]')
