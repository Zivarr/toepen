import { addPlayer, uploadGame } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import { db } from '../storage/db'
import { normalise } from '../players/match'

export interface FlushResult {
  sent: number
  failed: number
  pending: number
}

let running: Promise<FlushResult> | null = null

export async function outboxCounts(): Promise<{ pending: number; failed: number }> {
  const [pending, failed] = await Promise.all([
    db.outbox.where('status').equals('pending').count(),
    db.outbox.where('status').equals('failed').count(),
  ])
  return { pending, failed }
}

/** True when the run must stop (offline, server trouble or logged out). */
function isTransient(e: unknown): boolean {
  return e instanceof NetworkError || (e instanceof ApiError && (e.status >= 500 || e.status === 401))
}

/** Posts player names that exist only locally. Returns false when the run must stop. */
async function flushPendingPlayers(): Promise<boolean> {
  const groups = await db.groups.where('kind').equals('server').toArray()
  for (const g of groups) {
    for (const name of [...g.pendingPlayers]) {
      try {
        await addPlayer(g.serverId as number, name)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.code === 'name_taken') {
          // already on the server: treat as confirmed
        } else if (isTransient(e)) {
          return false
        } else {
          continue // other errors: leave the name pending
        }
      }
      await db.transaction('rw', db.groups, async () => {
        const cur = await db.groups.get(g.key)
        if (!cur) return
        const n = normalise(name)
        await db.groups.update(g.key, { pendingPlayers: cur.pendingPlayers.filter((p) => normalise(p) !== n) })
      })
    }
  }
  return true
}

async function run(): Promise<FlushResult> {
  let sent = 0
  if (await flushPendingPlayers()) {
    const items = await db.outbox.where('status').equals('pending').toArray()
    for (const item of items) {
      try {
        await uploadGame(item.upload) // 201 and duplicate (200) both count as success
        await db.outbox.delete(item.id)
        sent++
      } catch (e) {
        if (isTransient(e)) break
        if (e instanceof ApiError && [403, 404, 422].includes(e.status)) {
          await db.outbox.update(item.id, { status: 'failed', reason: e.message })
          continue
        }
        break // unknown failure: keep pending, try again next time
      }
    }
  }
  const c = await outboxCounts()
  return { sent, failed: c.failed, pending: c.pending }
}

/** Uploads queued games. Single-flight: concurrent callers share one run. */
export function flushOutbox(): Promise<FlushResult> {
  if (!running) {
    running = run().finally(() => {
      running = null
    })
  }
  return running
}

/** Puts failed items back in the queue and flushes. */
export async function retryFailed(): Promise<void> {
  await db.outbox.where('status').equals('failed').modify({ status: 'pending', reason: undefined })
  await flushOutbox()
}
