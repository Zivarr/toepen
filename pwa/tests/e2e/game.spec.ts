import { expect, test } from '@playwright/test'
import { login, penalty, playToTheEnd, startGame } from './helpers'
import { seed } from './seed'

test.beforeEach(() => seed())

test('login, play a game to the end, see it on the leaderboard', async ({ page }) => {
  await login(page, 'tim', 'tim12345')
  await startGame(page, 'Work', ['Ravi', 'Kees', 'Sanne'], 3)
  await playToTheEnd(page, 3)

  await page.getByRole('link', { name: 'Naar groep' }).click()
  await page.getByRole('link', { name: 'Klassement' }).click()
  const row = page.getByRole('row', { name: /Kees/ })
  await expect(row.getByRole('cell').nth(1)).toHaveText('1')
  await expect(row.getByRole('cell').nth(2)).toHaveText('1')
})

test('resume after reload', async ({ page }) => {
  await login(page, 'tim', 'tim12345')
  await startGame(page, 'Work', ['Ravi', 'Kees', 'Sanne'], 5)
  await penalty(page, 'Ravi', 1)
  await penalty(page, 'Kees', 1)
  await expect(page.locator('[data-player="Ravi"] .score')).toHaveText('1')
  await expect(page.locator('[data-player="Kees"] .score')).toHaveText('1')

  await page.reload()
  await expect(page.locator('[data-player="Ravi"] .score')).toHaveText('1')
  await expect(page.locator('[data-player="Kees"] .score')).toHaveText('1')
  await expect(page.locator('[data-player="Sanne"] .score')).toHaveText('0')

  await page.getByRole('button', { name: 'Ongedaan maken' }).click()
  await expect(page.locator('[data-player="Kees"] .score')).toHaveText('0')
  await expect(page.locator('[data-player="Ravi"] .score')).toHaveText('1')
})
