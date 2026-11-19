import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/storage/repo', () => ({ getToken: vi.fn() }))

import { getToken } from '../../src/storage/repo'
import { setUnauthorizedHandler } from '../../src/api/client'
import { admin, changePassword, linkInfo, redeemLink } from '../../src/api/endpoints'

const fetchMock = vi.fn()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getToken).mockResolvedValue(null)
})

describe('password link endpoints', () => {
  it('redeemLink posts password and device name', async () => {
    fetchMock.mockResolvedValue(json(200, { token: 't', user: { id: 1, username: 'kees', is_admin: false } }))
    const r = await redeemLink('abc', 'geheim123')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/password-links/redeem')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: 'abc', password: 'geheim123', device_name: 'Browser' })
    expect(r.token).toBe('t')
  })

  it('linkInfo 404 throws link_invalid without calling the unauthorized handler', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockResolvedValue(json(404, { error: 'link_invalid', message: 'weg' }))
    await expect(linkInfo('dood')).rejects.toMatchObject({ status: 404, code: 'link_invalid' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('a stale token on a link call never triggers the unauthorized handler', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.mocked(getToken).mockResolvedValue('oud')
    fetchMock.mockResolvedValue(json(401, { error: 'unauthorized', message: 'x' }))
    await expect(linkInfo('abc')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('linkInfo sends the code in the body, never in the path', async () => {
    fetchMock.mockResolvedValue(json(200, { username: 'kees', purpose: 'invite', expires_at: 'x' }))
    await linkInfo('geheimecode')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/password-links/lookup')
    expect(url).not.toContain('geheimecode')
    expect(JSON.parse(init.body)).toEqual({ code: 'geheimecode' })
  })

  it('changePassword posts both passwords to /me/password', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await changePassword('oud12345', 'nieuw123')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/me/password')
    expect(JSON.parse(init.body)).toEqual({ current_password: 'oud12345', new_password: 'nieuw123' })
  })

  it('admin.createUser with empty password sends no password and returns the link', async () => {
    fetchMock.mockResolvedValue(json(201, { user: { id: 2, username: 'kees', is_admin: false }, link: { code: 'c', purpose: 'invite', expires_at: 'x' } }))
    const r = await admin.createUser('kees', '', false)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: 'kees', is_admin: false })
    expect(r.link?.code).toBe('c')
  })

  it('admin.passwordLink posts to the user', async () => {
    fetchMock.mockResolvedValue(json(201, { link: { code: 'c', purpose: 'reset', expires_at: 'x' } }))
    const link = await admin.passwordLink(7)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/users/7/password-link')
    expect(link.purpose).toBe('reset')
  })
})
