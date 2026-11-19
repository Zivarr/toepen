import { expect, test } from '@playwright/test'
import { apiLogin, login, playToTheEnd, startGame } from './helpers'
import { seed } from './seed'

test.beforeEach(() => seed())

test('offline game is uploaded when back online', async ({ page, context, request }) => {
  await login(page, 'tim', 'tim12345')
  await expect(page.getByRole('link', { name: 'Work' })).toBeVisible()

  await context.setOffline(true)
  await startGame(page, 'Work', ['Ravi', 'Kees', 'Sanne'], 3)
  await playToTheEnd(page, 3)

  await page.getByRole('link', { name: 'Naar groep' }).click()
  await expect(page.getByText('1 wacht op upload')).toBeVisible()

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('1 wacht op upload')).toBeHidden({ timeout: 20_000 })

  const headers = await apiLogin(request, 'tim', 'tim12345')
  const res = await request.get('/api/groups', { headers })
  expect(res.ok()).toBeTruthy()
  const { groups } = await res.json()
  const work = groups.find((g: { name: string }) => g.name === 'Work')
  expect(work.games).toHaveLength(1)
})

test('local group sync request appears for admin and approval links it', async ({ page, browser }) => {
  await login(page, 'tim', 'tim12345')
  await page.getByRole('button', { name: 'Nieuwe groep' }).click()
  await page.getByRole('dialog', { name: 'Nieuwe groep' }).getByLabel('Naam').fill('Thuis')
  await page.getByRole('button', { name: 'Aanmaken' }).click()
  await expect(page.getByText('Lokaal')).toBeVisible()

  await page.getByRole('link', { name: /Thuis/ }).click()
  await page.getByRole('link', { name: 'Nieuw spel' }).click()
  for (const p of ['Ravi', 'Kees', 'Sanne']) {
    await page.getByPlaceholder('Naam').fill(p)
    await page.getByRole('button', { name: 'Speler toevoegen' }).click()
    await expect(page.getByRole('button', { name: `Verwijder ${p}` })).toBeVisible()
  }
  await page.getByLabel('Maximum aantal strafpunten').fill('3')
  await page.getByRole('button', { name: 'Start spel' }).click()
  await playToTheEnd(page, 3)

  await page.getByRole('link', { name: 'Terug naar start' }).click()
  await page.getByLabel('Synchroniseren met server').click()
  await page.getByRole('dialog', { name: 'Synchroniseren met server' }).getByRole('button', { name: 'Aanvragen' }).click()
  await expect(page.getByText('Wacht op goedkeuring')).toBeVisible()

  const adminCtx = await browser.newContext({ baseURL: 'http://localhost:4173' })
  const adminPage = await adminCtx.newPage()
  await login(adminPage, 'admin', 'admin1234')
  await adminPage.goto('/#/admin/requests')
  const row = adminPage.getByTestId('request-row').filter({ hasText: 'Thuis' })
  await expect(row).toBeVisible()
  await row.getByRole('link').click()
  await adminPage.getByRole('button', { name: 'Goedkeuren' }).click()
  await expect(adminPage.getByText('Verzoek goedgekeurd')).toBeVisible()
  await adminCtx.close()

  await page.reload()
  await expect(page.getByText('Wacht op goedkeuring')).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: /Thuis/ })).toBeVisible()
  await expect(page.getByText('Lokaal')).toBeHidden()
  await expect(page.getByRole('link', { name: /Thuis/ })).toHaveAttribute('href', /#\/g\/server:/)
  await page.getByRole('link', { name: /Thuis/ }).click()
  await page.getByRole('link', { name: 'Resultaten' }).click()
  await expect(page.getByText('Winnaar: Kees')).toBeVisible()
})
