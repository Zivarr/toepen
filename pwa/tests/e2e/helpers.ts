import { expect, type APIRequestContext, type Page } from '@playwright/test'

export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/#/login')
  await page.getByLabel('Gebruikersnaam').fill(username)
  await page.getByLabel('Wachtwoord').fill(password)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page.getByRole('heading', { name: 'Groepen' })).toBeVisible()
}

export async function startGame(page: Page, group: string, players: string[], max: number): Promise<void> {
  await page.getByRole('link', { name: group }).first().click()
  await page.getByRole('link', { name: 'Nieuw spel' }).click()
  await page.getByLabel('Maximum aantal strafpunten').fill(String(max))
  for (const p of players) await page.getByRole('button', { name: p, exact: true }).click()
  await page.getByRole('button', { name: 'Start spel' }).click()
  await expect(page.getByRole('button', { name: /^Klop!/ })).toBeVisible()
}

export async function penalty(page: Page, player: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.locator(`[data-player="${player}"]`).getByRole('button', { name: 'Strafpunt' }).click()
  }
}

/** Ravi and Sanne reach the max, so Kees wins. */
export async function playToTheEnd(page: Page, max: number): Promise<void> {
  await penalty(page, 'Ravi', max)
  await penalty(page, 'Sanne', max)
  await expect(page.getByRole('heading', { name: 'Speloverzicht' })).toBeVisible()
  await expect(page.getByText('Winnaar: Kees')).toBeVisible()
}

export async function apiLogin(request: APIRequestContext, username: string, password: string) {
  const res = await request.post('/api/login', { data: { username, password, device_name: 'e2e' } })
  expect(res.ok()).toBeTruthy()
  const { token } = await res.json()
  return { Authorization: `Bearer ${token}` }
}
