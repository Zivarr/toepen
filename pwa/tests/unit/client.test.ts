import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/storage/repo', () => ({ getToken: vi.fn() }))

import { getToken } from '../../src/storage/repo'
import { ApiError, NetworkError, request, setUnauthorizedHandler } from '../../src/api/client'
import { admin, createSyncRequest, deviceName, fetchGroups, login, uploadGame } from '../../src/api/endpoints'
import type { GameUpload } from '../../src/types'

const fetchMock = vi.fn()
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getToken).mockResolvedValue('tok123')
  setUnauthorizedHandler(() => {})
})

describe('request', () => {
  it('sends both auth headers', async () => {
    fetchMock.mockResolvedValue(json(200, { user: {} }))
    await request('GET', '/me')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/me')
    expect(init.headers['Authorization']).toBe('Bearer tok123')
    expect(init.headers['X-Auth-Token']).toBe('tok123')
  })

  it('sends no auth headers without token', async () => {
    vi.mocked(getToken).mockResolvedValue(null)
    fetchMock.mockResolvedValue(json(200, {}))
    await request('GET', '/me')
    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBeUndefined()
  })

  it('serialises body as JSON', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await request('POST', '/x', { a: 1 })
    const init = fetchMock.mock.calls[0][1]
    expect(init.body).toBe('{"a":1}')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('maps 422 body to ApiError code', async () => {
    fetchMock.mockResolvedValue(json(422, { error: 'validation_failed', message: 'bad', game_index: 2, game_id: 'g' }))
    const err = await request('POST', '/sync-requests', {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
    expect(err.code).toBe('validation_failed')
    expect(err.message).toBe('bad')
    expect(err.extra).toMatchObject({ game_index: 2, game_id: 'g' })
  })

  it('non-JSON error body gives http_<status>', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
    const err = await request('GET', '/me').catch((e) => e)
    expect(err.code).toBe('http_502')
  })

  it('fetch failure becomes NetworkError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(request('GET', '/me')).rejects.toBeInstanceOf(NetworkError)
  })

  it('401 invokes unauthorized handler', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockResolvedValue(json(401, { error: 'unauthorized', message: 'no' }))
    await expect(request('GET', '/me')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('401 on POST /login does not invoke handler', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockResolvedValue(json(401, { error: 'invalid_credentials', message: 'no' }))
    const err = await login('a', 'b', 'Browser').catch((e) => e)
    expect(err.code).toBe('invalid_credentials')
    expect(handler).not.toHaveBeenCalled()
  })

  it('304 returns notModified', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }))
    expect(await fetchGroups('"abc"')).toEqual({ notModified: true })
    expect(fetchMock.mock.calls[0][1].headers['If-None-Match']).toBe('"abc"')
  })

  it('204 gives null data', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    expect(await request('DELETE', '/games/x')).toEqual({ status: 204, data: null, etag: undefined })
  })
})

describe('endpoints', () => {
  it('fetchGroups 200 returns groups and etag', async () => {
    fetchMock.mockResolvedValue(json(200, { groups: [{ id: 1 }] }, { ETag: '"v1"' }))
    expect(await fetchGroups()).toEqual({ notModified: false, groups: [{ id: 1 }], etag: '"v1"' })
  })

  it('uploadGame reports duplicate', async () => {
    const g = { id: 'u', group_id: 1 } as GameUpload
    fetchMock.mockResolvedValueOnce(json(201, { game: { id: 'u' } }))
    expect((await uploadGame(g)).duplicate).toBe(false)
    fetchMock.mockResolvedValueOnce(json(200, { game: { id: 'u' }, duplicate: true }))
    expect((await uploadGame(g)).duplicate).toBe(true)
  })

  it('createSyncRequest strips group_id and sets source pwa', async () => {
    fetchMock.mockResolvedValue(json(201, { request: { id: 5 } }))
    const r = await createSyncRequest('Werk', [{ id: 'u', group_id: 3, winner: null } as unknown as GameUpload])
    expect(r).toEqual({ id: 5 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.source).toBe('pwa')
    expect(body.group_name).toBe('Werk')
    expect(body.games[0]).not.toHaveProperty('group_id')
  })

  it('admin.listUsers unwraps users', async () => {
    fetchMock.mockResolvedValue(json(200, { users: [{ id: 1 }] }))
    expect(await admin.listUsers()).toEqual([{ id: 1 }])
  })

  it('admin.approveLink posts mapping', async () => {
    fetchMock.mockResolvedValue(json(200, { request: { id: 2 } }))
    await admin.approveLink(2, 7, { Rav: 3 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/sync-requests/2/approve')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mode: 'link', group_id: 7, mapping: { Rav: 3 } })
  })

  it('deviceName shortens user agent', () => {
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17)')).toBe('iPhone')
    expect(deviceName('Mozilla/5.0 (Linux; Android 14)')).toBe('Android')
    expect(deviceName('Mozilla/5.0 (Windows NT 10)')).toBe('Browser')
  })
})
