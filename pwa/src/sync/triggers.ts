import { getToken } from '../storage/repo'
import { checkSyncRequests } from './requests'
import { flushOutbox } from './outbox'
import { refresh } from './refresh'

let cycle: Promise<void> | null = null
let rerun = false
let started = false

async function onePass(): Promise<void> {
  try {
    if (!(await getToken())) return
    await checkSyncRequests()
    await flushOutbox()
    await refresh()
  } catch (e) {
    console.warn('Sync mislukt', e)
  }
}

/** One full sync pass (single-flight; a call during a run adds one more pass). Never throws. */
export function runSyncCycle(): Promise<void> {
  if (cycle) {
    rerun = true
    return cycle
  }
  cycle = (async () => {
    do {
      rerun = false
      await onePass()
    } while (rerun)
  })().finally(() => {
    cycle = null
  })
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
