// Browser tests that click through the app like a person would (e2e/*.spec.js), named after the test-case IDs in
// the "Smart TimeTables – Test Cases" document. They run against the browser-only demo (no accounts, nothing
// shared), so they never touch the Supabase database. Uses the installed Google Chrome: no browser download.
//
//   npm run test:e2e        all tests, headless, then an HTML report with a screenshot per step
//   npm run test:demo       the same in a visible, slowed-down browser, one test at a time (for showing)
//   npm run test:report     open the last report
import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const watching = process.argv.includes('--headed')

export default defineConfig({
  testDir: 'e2e',
  // Generating the GNDEC college takes a few seconds of CPU; leave room when tests run side by side.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // One test at a time: several timetable generations at once can starve a laptop's CPU and time tests out.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    screenshot: 'on',
    trace: 'retain-on-failure',
    launchOptions: { slowMo: watching ? 350 : 0 },
  },
  projects: [
    { name: 'laptop', use: { viewport: { width: 1366, height: 800 } }, testIgnore: /mobile/ },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' }, testMatch: /mobile/ },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    // Empty Supabase settings switch the app to the browser-only demo for these tests.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  },
})
