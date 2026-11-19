import { getToken } from '../storage/repo'
import { checkSyncRequests } from './requests'
import { flushOutbox } from './outbox'
import { refresh } from './refresh'

let cycle: Promise<void> | null = null
let started = false

/** One full sync pass (single-flight). Never throws; skipped when logged out. */
export function runSyncCycle(): Promise<void> {
  if (!cycle) {
    cycle = (async () => {
      try {
        if (!(await getToken())) return
        await checkSyncRequests()
        await flushOutbox()
        await refresh()
      } catch (e) {
        console.warn('Sync mislukt', e)
      }
    })().finally(() => {
      cycle = null
    })
  }
  return cycle
}

/** Syncs on start, when the app becomes visible and when the network returns. */
export function startTriggers(): void {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runSyncCycle()
  })
  window.addEventListener('online', () => void runSyncCycle())
  void runSyncCycle()
}
