import { fetchGroups } from '../api/endpoints'
import { NetworkError } from '../api/client'
import { db } from '../storage/db'
import { getUser } from '../storage/repo'
import { normalise } from '../players/match'
import type { CachedGroup, GroupKey, StoredGame } from '../types'

/** Replaces server groups and games with server data, keeping unsent local work. */
export async function refresh(): Promise<'updated' | 'unchanged' | 'offline'> {
  let stored = (await db.kv.get('etag'))?.value as string | undefined
  // A cache written before seasons existed may hold the new ETag without season data; refetch fully.
  const cached = await db.groups.where('kind').equals('server').toArray()
  if (cached.some((g) => g.seasons === undefined)) stored = undefined
  let result
  try {
    result = await fetchGroups(stored)
  } catch (e) {
    if (e instanceof NetworkError) return 'offline'
    throw e
  }
  if (result.notModified) return 'unchanged'
  const { groups, etag } = result
  const username = (await getUser())?.username ?? ''

  await db.transaction('rw', db.groups, db.games, db.outbox, db.kv, async () => {
    const oldServer = await db.groups.where('kind').equals('server').toArray()
    const oldByKey = new Map(oldServer.map((g) => [g.key, g]))
    const keep = new Set<GroupKey>(groups.map((g) => `server:${g.id}` as GroupKey))

    // Drop groups the user can no longer see, with their cached games (outbox items stay).
    for (const g of oldServer) {
      if (!keep.has(g.key)) {
        await db.games.where('groupKey').equals(g.key).delete()
        await db.groups.delete(g.key)
      }
    }

    const outbox = await db.outbox.toArray()
    for (const sg of groups) {
      const key = `server:${sg.id}` as GroupKey
      const prev = oldByKey.get(key)
      const serverNames = sg.players.map((p) => p.name)
      const known = new Set(serverNames.map(normalise))
      const stillPending = (prev?.pendingPlayers ?? []).filter((n) => !known.has(normalise(n)))
      const group: CachedGroup = {
        key,
        kind: 'server',
        serverId: sg.id,
        name: sg.name,
        creator: sg.creator,
        maxPenaltyPoints: sg.max_penalty_points,
        playerNames: [...serverNames, ...stillPending],
        pendingPlayers: stillPending,
        seasons: sg.seasons,
        firstSeasonName: sg.first_season_name,
      }
      await db.groups.put(group)
      await db.games.where('groupKey').equals(key).delete()
      const rows: StoredGame[] = sg.games.map((g) => ({ ...g, groupKey: key }))
      const have = new Set(rows.map((g) => g.id))
      for (const item of outbox) {
        if (item.groupKey !== key || have.has(item.id)) continue
        rows.push({ ...item.upload, group_id: sg.id, recorded_by: username, groupKey: key })
      }
      await db.games.bulkPut(rows)
    }
    await db.kv.put({ key: 'etag', value: etag })
  })
  return 'updated'
}
