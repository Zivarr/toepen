import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/storage/db'
import {
  addPlayerName, clearAuth, createLocalGroup, deleteLocalGame, deleteLocalGroup, getCurrentGame, getGames,
  getGroup, getGroups, getSettings, getToken, getUser, saveFinishedGame, setCurrentGame, setToken, setUser,
} from '../../src/storage/repo'
import { apply, newGame } from '../../src/game/engine'
import type { CachedGroup, User } from '../../src/types'

const user: User = { id: 1, username: 'tim', is_admin: false }
const serverGroup: CachedGroup = {
  key: 'server:5', kind: 'server', serverId: 5, name: 'Werk', creator: 'tim',
  maxPenaltyPoints: 10, playerNames: ['Anna'], pendingPlayers: [],
}

function finished() {
  let s = newGame(['Anna', 'Bob'], 3, Date.now())
  for (let i = 0; i < 3; i++) s = apply(s, { type: 'penalty', name: 'Bob' }, Date.now()).state
  return s
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('repo', () => {
  it('create local group and list it', async () => {
    await setUser(user)
    const g = await createLocalGroup('Kantine', 10)
    expect(g.key).toMatch(/^local:/)
    expect(g.creator).toBe('tim')
    expect((await getGroups()).map((x) => x.name)).toEqual(['Kantine'])
    expect(await getGroup(g.key)).toEqual(g)
  })

  it('saveFinishedGame on server group adds outbox item', async () => {
    await db.groups.add(serverGroup)
    const game = await saveFinishedGame('server:5', finished(), user)
    expect(game.group_id).toBe(5)
    expect(game.recorded_by).toBe('tim')
    const out = await db.outbox.toArray()
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: game.id, groupKey: 'server:5', status: 'pending' })
    expect(out[0].upload.group_id).toBe(5)
    expect(await getGames('server:5')).toHaveLength(1)
  })

  it('saveFinishedGame on local group adds no outbox item', async () => {
    const g = await createLocalGroup('Kantine', 10)
    const game = await saveFinishedGame(g.key, finished(), user)
    expect(game.group_id).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(await getGames(g.key)).toHaveLength(1)
  })

  it('getGames returns newest first and deleteLocalGame refuses server games', async () => {
    const g = await createLocalGroup('K', 10)
    const a = await saveFinishedGame(g.key, newGame(['A', 'B'], 3, Date.parse('2026-01-01T10:00:00Z')), user)
    const b = await saveFinishedGame(g.key, newGame(['A', 'B'], 3, Date.parse('2026-02-01T10:00:00Z')), user)
    expect((await getGames(g.key)).map((x) => x.id)).toEqual([b.id, a.id])
    await deleteLocalGame(a.id)
    expect(await getGames(g.key)).toHaveLength(1)
    await db.groups.add(serverGroup)
    const s = await saveFinishedGame('server:5', finished(), user)
    await expect(deleteLocalGame(s.id)).rejects.toThrow()
  })

  it('addPlayerName rejects case-insensitive duplicate', async () => {
    const g = await createLocalGroup('K', 10)
    expect(await addPlayerName(g.key, '  jan  ')).toBe('added')
    expect(await addPlayerName(g.key, 'JAN')).toBe('exists')
    expect((await getGroup(g.key))!.playerNames).toEqual(['Jan'])
  })

  it('current game round-trips through storage with history', async () => {
    let s = newGame(['A', 'B'], 5, 1000)
    s = apply(s, { type: 'penalty', name: 'A' }, 2000).state
    expect(s.history.length).toBeGreaterThan(0)
    expect(await getCurrentGame()).toBeNull()
    await setCurrentGame({ groupKey: 'local:x', state: s })
    expect(await getCurrentGame()).toEqual({ groupKey: 'local:x', state: s })
    await setCurrentGame(null)
    expect(await getCurrentGame()).toBeNull()
  })

  it('getSettings returns defaults', async () => {
    expect(await getSettings()).toEqual({ confirmPenalty: false, showRematch: true })
  })

  it('clearAuth keeps outbox', async () => {
    await db.groups.add(serverGroup)
    await setToken('t')
    await setUser(user)
    await saveFinishedGame('server:5', finished(), user)
    await clearAuth()
    expect(await getToken()).toBeNull()
    expect(await getUser()).toBeNull()
    expect(await db.outbox.count()).toBe(1)
    expect(await db.games.count()).toBe(1)
    expect(await getGroups()).toHaveLength(1)
  })

  it('deleteLocalGroup removes its games', async () => {
    const g = await createLocalGroup('K', 10)
    const other = await createLocalGroup('L', 10)
    await saveFinishedGame(g.key, finished(), user)
    await saveFinishedGame(other.key, finished(), user)
    await deleteLocalGroup(g.key)
    expect(await getGroup(g.key)).toBeUndefined()
    expect(await getGames(g.key)).toHaveLength(0)
    expect(await getGames(other.key)).toHaveLength(1)
  })
})
