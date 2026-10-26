import { test, expect } from '@playwright/test'
import { loadGndecAndGenerate, switchRole, tab } from './helpers.js'

/** Book a space: event details → date & time → pick the first free room → review → confirm. Returns the room name. */
async function bookFirstFreeRoom(page, title) {
  await page.getByLabel('Event / session name').fill(title)
  await page.getByLabel('Organizer').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Start time').fill('17:45')
  await page.getByRole('button', { name: 'Next' }).click()
  const room = page.locator('main button[aria-pressed]').first()
  const name = (await room.locator('.font-semibold').first().innerText()).trim()
  await room.click()
  await page.getByRole('button', { name: 'Review booking' }).click()
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  return name
}

test.describe('Campus Guide and bookings', () => {
  test('C-06 Book a space: four steps end in a receipt with a booking ID', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await tab(page, 'Book a space')
    await bookFirstFreeRoom(page, 'Mentor demo workshop')
    await expect(page.getByText('Booking ID')).toBeVisible()
    await expect(page.getByText('Mentor demo workshop').first()).toBeVisible()
  })

  test('C-07 No double booking: a booked room is not offered again', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await tab(page, 'Book a space')
    const room = await bookFirstFreeRoom(page, 'First booking')
    await page.getByRole('button', { name: /Book another space/ }).click()
    await page.getByLabel('Event / session name').fill('Second booking, same time')
    await page.getByLabel('Organizer').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Start time').fill('17:45')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('main button[aria-pressed]').first()).toBeVisible()
    await expect(page.locator('main button[aria-pressed]', { hasText: room })).toHaveCount(0)
  })

  test('C-01 + C-02 Student requests a room, administrator confirms it', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await switchRole(page, 'Student')
    await tab(page, 'Campus Guide')
    await page.getByLabel("What's it for?").fill('Robotics club demo')
    await page.getByLabel('Your name').fill('Test Student')
    await page.getByLabel('Start').fill('17:45')
    await page.getByRole('button', { name: 'Request' }).first().click()
    await expect(page.getByText(/Request sent for/)).toBeVisible()
    const mine = page.locator('li', { hasText: 'Robotics club demo' })
    await expect(mine.getByText('Awaiting approval')).toBeVisible()

    await switchRole(page, 'Administrator')
    await tab(page, 'Campus Guide')
    const review = page.locator('li', { hasText: 'Robotics club demo' })
    await expect(review.getByText(/still free for the whole time/)).toBeVisible()
    await review.getByRole('button', { name: /^Confirm/ }).click()

    await switchRole(page, 'Student')
    await tab(page, 'Campus Guide')
    await expect(page.locator('li', { hasText: 'Robotics club demo' }).getByText('Confirmed')).toBeVisible()
  })

  test('C-05 Faculty book their own rooms; shared rooms need a request', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await switchRole(page, 'Faculty')
    await tab(page, 'Campus Guide')
    await page.getByLabel("What's it for?").fill('Extra class')
    await page.getByLabel('Start').fill('17:45')
    await expect(page.getByRole('button', { name: 'Book now' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request' }).first()).toBeVisible()
  })

  test('C-08 Busy rooms never reveal whose class it is (non-administrators)', async ({ page }) => {
    await loadGndecAndGenerate(page)
    await switchRole(page, 'Student')
    await tab(page, 'Campus Guide')
    await page.getByLabel('Start').fill('10:30')
    await expect(page.locator('main')).toContainText('A scheduled class uses it')
    await expect(page.locator('main')).not.toContainText(/lecture for D\d CS/)
  })
})
