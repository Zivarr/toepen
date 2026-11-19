import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/endpoints', () => ({
  fetchGroups: vi.fn(),
  uploadGame: vi.fn(),
  addPlayer: vi.fn(),
  createSyncRequest: vi.fn(),
  mySyncRequests: vi.fn(),
}))

import * as api from '../../src/api/endpoints'
import { ApiError, NetworkError } from '../../src/api/client'
import { db } from '../../src/storage/db'
import { createLocalGroup, getGames, getGroup, getGroups, setToken, setUser } from '../../src/storage/repo'
import { flushOutbox, outboxCounts, retryFailed } from '../../src/sync/outbox'
import { refresh } from '../../src/sync/refresh'
import { checkSyncRequests, completeApproval, requestSync } from '../../src/sync/requests'
import { runSyncCycle, startTriggers } from '../../src/sync/triggers'
import type { CachedGroup, Game, GameUpload, Group, OutboxItem, StoredGame } from '../../src/types'

const m = vi.mocked(api)

function upload(id: string, groupId = 5): GameUpload {
  return {
    id, group_id: groupId, started_at: '2026-11-18T21:00:00+01:00', duration_ms: 120000,
    max_penalty_points: 10, ended_early: false, winner: 'Anna',
    players: [{ name: 'Anna', final_score: 3, boer_count: 0 }, { name: 'Bob', final_score: 10, boer_count: 1 }],
  }
}
const serverGroup: CachedGroup = {
  key: 'server:5', kind: 'server', serverId: 5, name: 'Werk', creator: 'tim',
  maxPenaltyPoints: 10, playerNames: ['Anna', 'Bob'], pendingPlayers: [],
}
async function seedServerGroup(g: Partial<CachedGroup> = {}) {
  await db.groups.put({ ...serverGroup, ...g })
}
async function queue(id: string, status: 'pending' | 'failed' = 'pending', groupKey: OutboxItem['groupKey'] = 'server:5') {
  const u = upload(id)
  await db.outbox.put({ id, groupKey, upload: u, status })
  await db.games.put({ ...u, group_id: 5, recorded_by: 'tim', groupKey })
}
const ok = (id: string, duplicate = false) => ({ game: { ...upload(id), recorded_by: 'tim' } as Game, duplicate })
function srvGroup(over: Partial<Group> = {}): Group {
  return {
    id: 5, name: 'Werk', creator: 'tim', max_penalty_points: 10,
    players: [{ id: 1, name: 'Anna', games_played: 1 }, { id: 2, name: 'Bob', games_played: 1 }],
    games: [{ ...upload('srv-1'), recorded_by: 'kees' }], ...over,
  }
}

beforeEach(async () => {
  vi.resetAllMocks()
  await Promise.all(db.tables.map((t) => t.clear()))
  await setUser({ id: 1, username: 'tim', is_admin: false })
})

describe('flushOutbox', () => {
  it('success removes item from outbox', async () => {
    await queue('g1')
    m.uploadGame.mockResolvedValue(ok('g1'))
    expect(await flushOutbox()).toEqual({ sent: 1, failed: 0, pending: 0 })
    expect(await db.outbox.count()).toBe(0)
  })

  it('duplicate counts as success', async () => {
    await queue('g1')
    m.uploadGame.mockResolvedValue(ok('g1', true))
    const r = await flushOutbox()
    expect(r.sent).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('network error keeps item pending', async () => {
    await queue('g1')
    await queue('g2')
    m.uploadGame.mockRejectedValue(new NetworkError())
    const r = await flushOutbox()
    expect(r).toEqual({ sent: 0, failed: 0, pending: 2 })
    expect(m.uploadGame).toHaveBeenCalledTimes(1) // stops the run
    expect((await db.outbox.get('g1'))?.status).toBe('pending')
  })

  it('500 keeps item pending', async () => {
    await queue('g1')
    m.uploadGame.mockRejectedValue(new ApiError(500, 'server_error', 'kapot'))
    const r = await flushOutbox()
    expect(r.pending).toBe(1)
    expect((await db.outbox.get('g1'))?.status).toBe('pending')
  })

  it('403 marks outbox item failed and stops retrying', async () => {
    await queue('g1')
    await queue('g2')
    m.uploadGame.mockImplementation(async (g) => {
      if (g.id === 'g1') throw new ApiError(403, 'not_member', 'Geen lid')
      return ok(g.id)
    })
    const r = await flushOutbox()
    expect(r).toEqual({ sent: 1, failed: 1, pending: 0 })
    expect(await db.outbox.get('g1')).toMatchObject({ status: 'failed', reason: 'Geen lid' })
    m.uploadGame.mockClear()
    await flushOutbox()
    expect(m.uploadGame).not.toHaveBeenCalled()
  })

  it('concurrent flush calls share one run', async () => {
    await queue('g1')
    await queue('g2')
    m.uploadGame.mockImplementation(async (g) => ok(g.id))
    const [a, b] = await Promise.all([flushOutbox(), flushOutbox()])
    expect(m.uploadGame).toHaveBeenCalledTimes(2)
    expect(a).toEqual(b)
  })

  it('401 keeps outbox and triggers login, later flush succeeds', async () => {
    await queue('g1')
    m.uploadGame.mockRejectedValueOnce(new ApiError(401, 'unauthenticated', 'Log in'))
    const r = await flushOutbox()
    expect(r).toEqual({ sent: 0, failed: 0, pending: 1 })
    expect((await db.outbox.get('g1'))?.status).toBe('pending')
    m.uploadGame.mockResolvedValue(ok('g1'))
    expect(await flushOutbox()).toEqual({ sent: 1, failed: 0, pending: 0 })
  })

  it('pending players are posted on flush and removed when confirmed', async () => {
    await seedServerGroup({ playerNames: ['Anna', 'Bob', 'Cor', 'Dirk', 'Els'], pendingPlayers: ['Cor', 'Dirk', 'Els'] })
    m.addPlayer.mockImplementation(async (_id, name) => {
      if (name === 'Dirk') throw new ApiError(409, 'name_taken', 'bestaat')
      if (name === 'Els') throw new ApiError(422, 'validation_failed', 'ongeldig')
      return { id: 9, name, games_played: 0 }
    })
    await flushOutbox()
    expect(m.addPlayer).toHaveBeenCalledWith(5, 'Cor')
    expect((await getGroup('server:5'))?.pendingPlayers).toEqual(['Els'])
  })

  it('network error while posting players stops the run before games', async () => {
    await seedServerGroup({ pendingPlayers: ['Cor'] })
    await queue('g1')
    m.addPlayer.mockRejectedValue(new NetworkError())
    const r = await flushOutbox()
    expect(m.uploadGame).not.toHaveBeenCalled()
    expect(r.pending).toBe(1)
    expect((await getGroup('server:5'))?.pendingPlayers).toEqual(['Cor'])
  })

  it('retryFailed resets failed items and flushes', async () => {
    await queue('g1', 'failed')
    m.uploadGame.mockResolvedValue(ok('g1'))
    await retryFailed()
    expect(await db.outbox.count()).toBe(0)
    expect(await outboxCounts()).toEqual({ pending: 0, failed: 0 })
  })
})

describe('flush edge cases', () => {
  it('item added while a flush is in progress is sent by the same returned promise', async () => {
    await queue('g1')
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    m.uploadGame.mockImplementation(async (g) => {
      if (g.id === 'g1') await gate
      return ok(g.id)
    })
    const first = flushOutbox()
    await vi.waitFor(() => expect(m.uploadGame).toHaveBeenCalledTimes(1))
    await queue('g2')
    const second = flushOutbox()
    release()
    expect(await second).toMatchObject({ sent: 2, pending: 0 })
    expect(await first).toMatchObject({ sent: 2, pending: 0 })
    expect(m.uploadGame).toHaveBeenCalledTimes(2)
    expect(await db.outbox.count()).toBe(0)
  })

  it('duplicate of a soft-deleted game is dropped from the cache after the next refresh', async () => {
    await seedServerGroup()
    await db.kv.put({ key: 'etag', value: '"e1"' })
    await queue('gone')
    m.uploadGame.mockResolvedValue(ok('gone', true))
    m.fetchGroups.mockImplementation(async (etag?: string) =>
      etag
        ? { notModified: true as const }
        : { notModified: false as const, groups: [srvGroup()], etag: '"e2"' })
    await flushOutbox()
    expect(await refresh()).toBe('updated')
    expect((await getGames('server:5')).map((g) => g.id)).toEqual(['srv-1'])
  })
})

describe('refresh', () => {
  it('refresh keeps outbox games in the cached group', async () => {
    await seedServerGroup()
    await queue('g1')
    await queue('g2', 'failed')
    await db.games.put({ ...upload('stale'), group_id: 5, recorded_by: 'x', groupKey: 'server:5' })
    m.fetchGroups.mockResolvedValue({ notModified: false, groups: [srvGroup()], etag: '"e1"' })
    expect(await refresh()).toBe('updated')
    const ids = (await getGames('server:5')).map((g) => g.id).sort()
    expect(ids).toEqual(['g1', 'g2', 'srv-1'])
    expect((await db.games.get('g1'))?.recorded_by).toBe('tim')
    expect((await db.kv.get('etag'))?.value).toBe('"e1"')
  })

  it('refresh maps server players and keeps unconfirmed pending players', async () => {
    await seedServerGroup({ playerNames: ['Anna', 'Bob', 'Cor', 'Zed'], pendingPlayers: ['Cor', 'bob'] })
    m.fetchGroups.mockResolvedValue({ notModified: false, groups: [srvGroup({ games: [] })], etag: 'e' })
    await refresh()
    const g = await getGroup('server:5')
    expect(g?.playerNames).toEqual(['Anna', 'Bob', 'Cor'])
    expect(g?.pendingPlayers).toEqual(['Cor'])
    expect(g?.maxPenaltyPoints).toBe(10)
  })

  it('refresh with 304 changes nothing', async () => {
    await seedServerGroup()
    await db.kv.put({ key: 'etag', value: '"e1"' })
    m.fetchGroups.mockResolvedValue({ notModified: true })
    expect(await refresh()).toBe('unchanged')
    expect(m.fetchGroups).toHaveBeenCalledWith('"e1"')
    expect(await getGroups()).toEqual([serverGroup])
  })

  it('refresh returns offline on network error', async () => {
    m.fetchGroups.mockRejectedValue(new NetworkError())
    expect(await refresh()).toBe('offline')
  })

  it('refresh drops groups the user is no longer member of', async () => {
    await seedServerGroup()
    await seedServerGroup({ key: 'server:6', serverId: 6, name: 'Weg' })
    await db.games.put({ ...upload('old', 6), group_id: 6, recorded_by: 'x', groupKey: 'server:6' })
    await queue('f1', 'failed', 'server:6')
    m.fetchGroups.mockResolvedValue({ notModified: false, groups: [srvGroup()], etag: 'e' })
    await refresh()
    expect(await getGroup('server:6')).toBeUndefined()
    expect(await db.games.get('old')).toBeUndefined()
    expect(await db.games.get('f1')).toBeUndefined()
    expect((await db.outbox.get('f1'))?.status).toBe('failed')
  })

  it('refresh leaves local groups alone', async () => {
    const l = await createLocalGroup('Thuis', 10)
    m.fetchGroups.mockResolvedValue({ notModified: false, groups: [], etag: 'e' })
    await refresh()
    expect(await getGroup(l.key)).toBeDefined()
  })
})

describe('sync requests', () => {
  async function localWithGames() {
    const l = await createLocalGroup('Thuis', 10)
    for (const id of ['l1', 'l2']) {
      await db.games.put({ ...upload(id, 0), group_id: 0, recorded_by: 'tim', groupKey: l.key } as StoredGame)
    }
    return l
  }
  const req = (status: 'pending' | 'approved' | 'rejected', extra = {}) => ({
    id: 7, group_name: 'Thuis', source: 'pwa' as const, status, resolved_group_id: null,
    reject_reason: null, created_at: '', ...extra,
  })

  it('requestSync sends all local games and marks pending', async () => {
    const l = await localWithGames()
    m.createSyncRequest.mockResolvedValue(req('pending'))
    await requestSync(l.key)
    const [name, games] = m.createSyncRequest.mock.calls[0]
    expect(name).toBe('Thuis')
    expect((games as GameUpload[]).map((g) => g.id).sort()).toEqual(['l1', 'l2'])
    expect(await getGroup(l.key)).toMatchObject({ syncRequestId: 7, syncStatus: 'pending' })
  })

  it('requestSync propagates errors and changes nothing', async () => {
    const l = await localWithGames()
    m.createSyncRequest.mockRejectedValue(new NetworkError())
    await expect(requestSync(l.key)).rejects.toBeInstanceOf(NetworkError)
    expect((await getGroup(l.key))?.syncStatus).toBeUndefined()
  })

  it('approved request moves games to server group and enqueues them', async () => {
    const l = await localWithGames()
    await db.groups.update(l.key, { syncRequestId: 7, syncStatus: 'pending' })
    m.mySyncRequests.mockResolvedValue([req('approved', { resolved_group_id: 9 })])
    m.uploadGame.mockRejectedValue(new NetworkError()) // keep items in outbox to inspect
    m.fetchGroups.mockRejectedValue(new NetworkError())
    await checkSyncRequests()
    expect(await getGroup(l.key)).toBeUndefined()
    const games = await getGames('server:9')
    expect(games.map((g) => g.id).sort()).toEqual(['l1', 'l2'])
    expect(games.every((g) => g.group_id === 9)).toBe(true)
    const items = await db.outbox.toArray()
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.status === 'pending' && i.groupKey === 'server:9' && i.upload.group_id === 9)).toBe(true)
  })

  it('completeApproval flushes then refreshes', async () => {
    const l = await localWithGames()
    m.uploadGame.mockImplementation(async (g) => ok(g.id, true))
    m.fetchGroups.mockResolvedValue({ notModified: false, groups: [srvGroup({ id: 9 })], etag: 'e' })
    await completeApproval(l.key, 9)
    expect(m.uploadGame).toHaveBeenCalledTimes(2)
    expect(m.fetchGroups).toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(0)
  })

  it('rejected request stores reason and keeps local group', async () => {
    const l = await localWithGames()
    await db.groups.update(l.key, { syncRequestId: 7, syncStatus: 'pending' })
    m.mySyncRequests.mockResolvedValue([req('rejected', { reject_reason: 'Dubbel' })])
    await checkSyncRequests()
    expect(await getGroup(l.key)).toMatchObject({ syncStatus: 'rejected', rejectReason: 'Dubbel' })
    expect(await getGames(l.key)).toHaveLength(2)
  })

  it('pending request changes nothing and network error is silent', async () => {
    const l = await localWithGames()
    await db.groups.update(l.key, { syncRequestId: 7, syncStatus: 'pending' })
    m.mySyncRequests.mockRejectedValue(new NetworkError())
    await expect(checkSyncRequests()).resolves.toBeUndefined()
    expect((await getGroup(l.key))?.syncStatus).toBe('pending')
  })
})

describe('triggers', () => {
  it('runSyncCycle runs check, flush, refresh in order', async () => {
    await setToken('t')
    const order: string[] = []
    m.mySyncRequests.mockImplementation(async () => { order.push('check'); return [] })
    m.fetchGroups.mockImplementation(async () => { order.push('refresh'); return { notModified: true } })
    await queue('g1')
    m.uploadGame.mockImplementation(async (g) => { order.push('flush'); return ok(g.id) })
    await runSyncCycle()
    expect(order).toEqual(['check', 'flush', 'refresh'])
  })

  it('runSyncCycle is skipped without a token', async () => {
    await runSyncCycle()
    expect(m.fetchGroups).not.toHaveBeenCalled()
  })

  it('startTriggers is idempotent', async () => {
    await setToken('t')
    m.fetchGroups.mockResolvedValue({ notModified: true })
    m.mySyncRequests.mockResolvedValue([])
    const win = new EventTarget()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('window', win)
    vi.stubGlobal('document', doc)
    const add = vi.spyOn(win, 'addEventListener')
    try {
      startTriggers()
      startTriggers()
      expect(add.mock.calls.filter((c) => c[0] === 'online')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
