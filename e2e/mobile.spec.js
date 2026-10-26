import { test, expect } from '@playwright/test'
import { loadGndecAndGenerate, tab } from './helpers.js'

// Runs on a phone-sized screen (Pixel 7) — see the "phone" project in playwright.config.js.

const fitsScreen = (page) =>
  page.evaluate(() => {
    const off = [...document.querySelectorAll('header button, header a')].filter((b) => b.offsetParent && b.getBoundingClientRect().right > innerWidth + 1)
    return { headerOk: off.length === 0, noSideScroll: document.documentElement.scrollWidth <= innerWidth + 1 }
  })

test.describe('Phone screens', () => {
  test('M-01 Every header button fits on a phone', async ({ page }) => {
    await page.goto('/')
    expect(await fitsScreen(page)).toEqual({ headerOk: true, noSideScroll: true })
    await loadGndecAndGenerate(page)
    expect(await fitsScreen(page)).toEqual({ headerOk: true, noSideScroll: true })
  })

  test('M-02 Timetable on a phone: swipe the week, or switch to day by day', async ({ page }) => {
    await loadGndecAndGenerate(page)
    const grid = page.locator('table').first()
    await grid.scrollIntoViewIfNeeded()
    const scroller = grid.locator('xpath=..')
    const sizes = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, view: el.clientWidth }))
    expect(sizes.scroll).toBeGreaterThan(sizes.view) // the week is wider than the phone: it scrolls sideways
    await scroller.evaluate((el) => el.scrollBy({ left: 400 }))
    await expect(grid.locator('tbody th').first()).toHaveCSS('position', 'sticky') // the time column stays put

    await page.getByRole('tab', { name: 'Day by day' }).click()
    await expect(page.getByRole('heading', { name: 'Monday' })).toBeVisible()
    await expect(grid).toBeHidden()
  })

  test('M-03 Dark and light themes', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Dark theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Light theme' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('A-01 Live site: Sign in and the theme switch are visible on a phone', async ({ page }) => {
    await page.goto('https://smart-time-tables.vercel.app/')
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Dark theme' })).toBeInViewport()
    expect(await fitsScreen(page)).toEqual({ headerOk: true, noSideScroll: true })
  })
})

test('M-02b Timetable layout choice is remembered', async ({ page }) => {
  await loadGndecAndGenerate(page)
  await page.getByRole('tab', { name: 'Day by day' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Continue as Administrator' }).click()
  await tab(page, 'Timetable')
  await expect(page.getByRole('tab', { name: 'Day by day' })).toHaveAttribute('aria-selected', 'true')
})
