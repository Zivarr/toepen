import { addPlayer, uploadGame } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import { db } from '../storage/db'
import { normalise } from '../players/match'

export interface FlushResult {
  sent: number
  failed: number
  pending: number
}

/** Tells the UI that sync state changed (badge, group lists). No-op outside a browser. */
export function notifySync(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('toepen:sync'))
}

let running: Promise<FlushResult> | null = null
let rerun = false

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
        const res = await uploadGame(item.upload) // 201 and duplicate (200) both count as success
        await db.outbox.delete(item.id)
        if (res.duplicate) await db.kv.delete('etag') // force a full refresh so the cache is rebuilt
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

/** Runs passes until no call arrived during the last one (never two passes at once). */
async function runAll(): Promise<FlushResult> {
  let sent = 0
  let last: FlushResult
  do {
    rerun = false
    last = await run()
    sent += last.sent
  } while (rerun)
  return { ...last, sent }
}

/**
 * Uploads queued games. Single-flight: concurrent callers share one run; a call made
 * during a run makes it do one more pass, so items queued meanwhile are sent too.
 */
export function flushOutbox(): Promise<FlushResult> {
  if (running) {
    rerun = true
    return running
  }
  running = runAll().finally(() => {
    running = null
    notifySync()
  })
  return running
}

/** Puts failed items back in the queue and flushes. */
export async function retryFailed(): Promise<void> {
  await db.outbox.where('status').equals('failed').modify({ status: 'pending', reason: undefined })
  await flushOutbox()
}
