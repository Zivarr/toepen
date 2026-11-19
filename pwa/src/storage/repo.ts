import { db } from './db'
import { toUpload, type GameState } from '../game/engine'
import { normalise, titleCase } from '../players/match'
import type { CachedGroup, DeviceSettings, GroupKey, StoredGame, User } from '../types'

type CurrentGame = { groupKey: GroupKey; state: GameState }

async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}
async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value })
}

export const getGroups = (): Promise<CachedGroup[]> => db.groups.toArray()
export const getGroup = (key: GroupKey): Promise<CachedGroup | undefined> => db.groups.get(key)

export async function createLocalGroup(name: string, maxPenaltyPoints: number): Promise<CachedGroup> {
  const user = await getUser()
  const group: CachedGroup = {
    key: `local:${crypto.randomUUID()}`,
    kind: 'local',
    name,
    creator: user?.username ?? '',
    maxPenaltyPoints,
    playerNames: [],
    pendingPlayers: [],
  }
  await db.groups.add(group)
  return group
}

export async function renameLocalGroup(key: GroupKey, name: string): Promise<void> {
  await db.groups.update(key, { name })
}

export async function deleteLocalGroup(key: GroupKey): Promise<void> {
  await db.transaction('rw', db.groups, db.games, async () => {
    await db.games.where('groupKey').equals(key).delete()
    await db.groups.delete(key)
  })
}

export async function getGames(key: GroupKey): Promise<StoredGame[]> {
  const games = await db.games.where('groupKey').equals(key).toArray()
  return games.sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0))
}

export async function saveFinishedGame(key: GroupKey, state: GameState, user: User): Promise<StoredGame> {
  const group = await db.groups.get(key)
  if (!group) throw new Error(`Unknown group ${key}`)
  const id = crypto.randomUUID()
  const upload = toUpload(state, id, group.kind === 'server' ? (group.serverId as number) : 0)
  const game: StoredGame = { ...upload, group_id: upload.group_id as number, recorded_by: user.username, groupKey: key }
  await db.transaction('rw', db.games, db.outbox, async () => {
    await db.games.add(game)
    if (group.kind === 'server') await db.outbox.add({ id, groupKey: key, upload, status: 'pending' })
  })
  return game
}

export async function deleteLocalGame(id: string): Promise<void> {
  const game = await db.games.get(id)
  if (!game) return
  if (!game.groupKey.startsWith('local:')) throw new Error('Only games of local groups can be deleted')
  await db.games.delete(id)
}

export async function addPlayerName(key: GroupKey, name: string): Promise<'added' | 'exists'> {
  return db.transaction('rw', db.groups, async () => {
    const group = await db.groups.get(key)
    if (!group) throw new Error(`Unknown group ${key}`)
    const clean = titleCase(name)
    const n = normalise(clean)
    if (group.playerNames.some((p) => normalise(p) === n)) return 'exists'
    await db.groups.update(key, { playerNames: [...group.playerNames, clean] })
    return 'added'
  })
}

/** Adds a name to both playerNames and pendingPlayers (offline add on a server group). */
export async function addPendingPlayer(key: GroupKey, name: string): Promise<void> {
  await db.transaction('rw', db.groups, async () => {
    const group = await db.groups.get(key)
    if (!group) throw new Error(`Unknown group ${key}`)
    const clean = titleCase(name)
    const n = normalise(clean)
    const playerNames = group.playerNames.some((p) => normalise(p) === n) ? group.playerNames : [...group.playerNames, clean]
    const pendingPlayers = group.pendingPlayers.some((p) => normalise(p) === n)
      ? group.pendingPlayers
      : [...group.pendingPlayers, clean]
    await db.groups.update(key, { playerNames, pendingPlayers })
  })
}

export async function getCurrentGame(): Promise<CurrentGame | null> {
  return (await kvGet<CurrentGame>('currentGame')) ?? null
}
export async function setCurrentGame(v: CurrentGame | null): Promise<void> {
  if (v === null) await db.kv.delete('currentGame')
  else await kvSet('currentGame', v)
}

export async function getSettings(): Promise<DeviceSettings> {
  return (await kvGet<DeviceSettings>('settings')) ?? { confirmPenalty: false, showRematch: true }
}
export const setSettings = (s: DeviceSettings): Promise<void> => kvSet('settings', s)

export async function getToken(): Promise<string | null> {
  return (await kvGet<string>('token')) ?? null
}
export const setToken = (t: string): Promise<void> => kvSet('token', t)

export async function getUser(): Promise<User | null> {
  return (await kvGet<User>('user')) ?? null
}
export const setUser = (u: User): Promise<void> => kvSet('user', u)

/** Logs out: drops token, user and etag; keeps groups, games and outbox. */
export async function clearAuth(): Promise<void> {
  await db.kv.bulkDelete(['token', 'user', 'etag'])
}

export async function setLocalMaxPenalty(key: GroupKey, maxPenaltyPoints: number): Promise<void> {
  await db.groups.update(key, { maxPenaltyPoints })
}
