import { useEffect } from 'preact/hooks'

interface Sentinel {
  released: boolean
  release(): Promise<void>
}
interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> }
}
interface VisibilityDocument {
  visibilityState: string
  addEventListener(type: 'visibilitychange', fn: () => void): void
  removeEventListener(type: 'visibilitychange', fn: () => void): void
}

/**
 * Keeps the screen on while enabled (Screen Wake Lock API). The browser drops the lock whenever the app goes to
 * the background, so it is requested again when the app becomes visible. Unsupported browsers: no-op.
 */
export function createWakeLock(nav: WakeLockNavigator, doc: VisibilityDocument) {
  let enabled = false
  let sentinel: Sentinel | null = null

  async function acquire(): Promise<void> {
    if (!enabled || !nav.wakeLock || doc.visibilityState !== 'visible') return
    if (sentinel && !sentinel.released) return
    try {
      const s = await nav.wakeLock.request('screen')
      if (enabled) sentinel = s
      else void s.release().catch(() => {}) // disabled while the request was pending
    } catch {
      // Refused (battery saver, no user activation, …): the screen just times out as usual.
    }
  }

  const onVisibility = () => void acquire()

  return {
    enable(): void {
      if (enabled) return
      enabled = true
      doc.addEventListener('visibilitychange', onVisibility)
      void acquire()
    },
    disable(): void {
      if (!enabled) return
      enabled = false
      doc.removeEventListener('visibilitychange', onVisibility)
      const s = sentinel
      sentinel = null
      void s?.release().catch(() => {})
    },
  }
}

/** Keeps the screen on while `active` is true. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const wl = createWakeLock(navigator as WakeLockNavigator, document)
    wl.enable()
    return () => wl.disable()
  }, [active])
}
