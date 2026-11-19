import { createSyncRequest, mySyncRequests } from '../api/endpoints'
import { NetworkError } from '../api/client'
import { db } from '../storage/db'
import { flushOutbox } from './outbox'
import { refresh } from './refresh'
import type { GameUpload, GroupKey } from '../types'

/** Asks the admin to adopt a local group. Errors (offline etc.) propagate to the caller. */
export async function requestSync(key: GroupKey): Promise<void> {
  const group = await db.groups.get(key)
  if (!group || group.kind !== 'local') throw new Error(`Not a local group: ${key}`)
  const games = await db.games.where('groupKey').equals(key).toArray()
  const uploads: GameUpload[] = games.map(({ recorded_by: _r, groupKey: _k, ...u }) => u)
  const req = await createSyncRequest(group.name, uploads)
  await db.groups.update(key, { syncRequestId: req.id, syncStatus: 'pending', rejectReason: undefined })
}

/** Moves a local group's games to the server group and queues them for upload. */
export async function completeApproval(localKey: GroupKey, serverId: number): Promise<void> {
  const serverKey: GroupKey = `server:${serverId}`
  await db.transaction('rw', db.groups, db.games, db.outbox, async () => {
    const games = await db.games.where('groupKey').equals(localKey).toArray()
    for (const g of games) {
      const { recorded_by: _r, groupKey: _k, ...rest } = g
      const upload: GameUpload = { ...rest, group_id: serverId }
      await db.games.put({ ...g, group_id: serverId, groupKey: serverKey })
      await db.outbox.put({ id: g.id, groupKey: serverKey, upload, status: 'pending' })
    }
    await db.groups.delete(localKey)
  })
  await flushOutbox()
  await refresh()
}

export async function checkSyncRequests(): Promise<void> {
  let requests
  try {
    requests = await mySyncRequests()
  } catch (e) {
    if (e instanceof NetworkError) return
    throw e
  }
  const locals = await db.groups.where('kind').equals('local').toArray()
  for (const g of locals) {
    if (g.syncRequestId === undefined) continue
    const r = requests.find((x) => x.id === g.syncRequestId)
    if (!r) continue
    if (r.status === 'approved' && r.resolved_group_id !== null) {
      await completeApproval(g.key, r.resolved_group_id)
    } else if (r.status === 'rejected') {
      await db.groups.update(g.key, { syncStatus: 'rejected', rejectReason: r.reject_reason ?? undefined })
    }
  }
}
