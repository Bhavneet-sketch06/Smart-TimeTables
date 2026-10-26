import { test, expect } from '@playwright/test'
import { loadGndecAndGenerate, switchRole, tab } from './helpers.js'

// AI-1 to AI-3: the change assistant end to end. Claude's answers are mocked here (page.route), so the run is
// repeatable and costs nothing; api/change.js itself is tested in tests/api-change.test.js.

/** Answers /api/change like Claude would: a leave for the teacher named in the request, or a clarifying question. */
async function mockAssistant(page, { question = '' } = {}) {
  const sent = []
  await page.route('**/api/change', async (route) => {
    const body = route.request().postDataJSON()
    sent.push(body)
    if (body.mode === 'announce') {
      return route.fulfill({ json: { text: 'Timetable update: Dr. Kapil Sharma is on leave on Wednesday. His classes have moved; see "Moved" on your timetable.' } })
    }
    const id = body.catalog.split('\n').find((l) => l.includes('| Dr. Kapil Sharma |'))?.split(' | ')[0]
    const wed = Array.from({ length: 8 }, (_, i) => ({ day: 'Wed', period: i + 1 }))
    return route.fulfill({
      json: question
        ? { kind: 'question', question, summary: '', changes: [] }
        : { kind: 'changes', question: '', summary: 'Dr. Kapil Sharma is on leave on Wednesday.', changes: [{ type: 'teacher_unavailable', teacherId: id, roomId: '', reason: 'Leave', slots: wed }] },
    })
  })
  return sent
}

test.describe.configure({ timeout: 180_000 })

test.describe('AI change assistant', () => {
  test('AI-1 Describe a change, check it, apply it: only the affected classes move', async ({ page }) => {
    const sent = await mockAssistant(page)
    await loadGndecAndGenerate(page)
    await tab(page, 'Reschedule')
    await page.getByLabel('Describe the change').fill('Dr. Kapil Sharma is on leave this Wednesday')
    await page.getByRole('button', { name: 'Understand the change' }).click()

    await expect(page.getByText('Dr. Kapil Sharma unavailable: Wed all day (Leave)')).toBeVisible()
    expect(sent[0].catalog).toContain('| Dr. Kapil Sharma |') // the app sent the college catalogue with ids
    expect(sent[0].today).toMatch(/\d{4}/)
    await page.getByRole('button', { name: 'Apply and update the timetable' }).click()

    const done = page.getByText(/Timetable updated: \d+ class(es)? moved, \d+ kept exactly where/)
    await expect(done).toBeVisible({ timeout: 60_000 })
    // Every moved class is listed with where it was and where it is now.
    const moved = Number((await done.innerText()).match(/(\d+) class/)[1])
    expect(moved).toBeGreaterThan(0)
    await expect(page.locator('ul.max-h-56 > li')).toHaveCount(moved)
    await page.getByRole('button', { name: 'View the updated timetable' }).click()
    await expect(page.getByText(/Updated after your change: \d+ class(es)? moved/)).toBeVisible()
    // The department's timetable shows the same change to everyone who looks at it.
    await expect(page.getByRole('region', { name: 'Timetable change' })).toContainText(`${moved} of your classes moved`)
  })

  test('AI-2 Draft and publish the announcement; the teacher sees it with their moved classes', async ({ page }) => {
    await mockAssistant(page)
    await loadGndecAndGenerate(page)
    await tab(page, 'Reschedule')
    await page.getByLabel('Describe the change').fill('Dr. Kapil Sharma is on leave this Wednesday')
    await page.getByRole('button', { name: 'Understand the change' }).click()
    await page.getByRole('button', { name: 'Apply and update the timetable' }).click()
    await expect(page.getByText(/Timetable updated: \d+ class(es)? moved/)).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: 'Draft an announcement' }).click()
    const draft = page.getByLabel('Announcement (edit before publishing)')
    await expect(draft).toHaveValue(/Dr. Kapil Sharma is on leave/)
    await draft.fill('Timetable update: Dr. Kapil Sharma is on leave on Wednesday. Check "Moved" on your timetable.')
    await page.getByRole('button', { name: 'Publish the notice' }).click()
    await expect(page.getByText(/Published: students and teachers see the notice/)).toBeVisible()

    await switchRole(page, 'Faculty')
    await page.getByLabel('Your name').selectOption({ label: 'Dr. Kapil Sharma (CSE)' })
    const notice = page.getByRole('region', { name: 'Timetable change' })
    await expect(notice).toContainText(/\d+ of your classes moved/)
    await notice.getByRole('button', { name: /Read the announcement/ }).click()
    await expect(notice).toContainText('Check "Moved" on your timetable.')
  })

  test('AI-3 An unclear request gets a question back, and nothing changes', async ({ page }) => {
    await mockAssistant(page, { question: 'Which Sharma do you mean: Dr. Kapil Sharma or Pf. Diksha Sharma?' })
    await loadGndecAndGenerate(page)
    await tab(page, 'Reschedule')
    await page.getByLabel('Describe the change').fill('Sharma is away tomorrow')
    await page.getByRole('button', { name: 'Understand the change' }).click()
    await expect(page.getByText('Which Sharma do you mean: Dr. Kapil Sharma or Pf. Diksha Sharma?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply and update the timetable' })).toHaveCount(0)
    await expect(page.getByText(/Updated after your change/)).toHaveCount(0)
  })
})
