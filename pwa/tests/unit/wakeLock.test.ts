import { describe, expect, it, vi } from 'vitest'
import { createWakeLock } from '../../src/util/wakeLock'

function fakeSentinel() {
  const s = { released: false, release: vi.fn(async () => { s.released = true }) }
  return s
}

function fakeEnv(supported = true) {
  const listeners: Record<string, () => void> = {}
  const sentinels: ReturnType<typeof fakeSentinel>[] = []
  const doc = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    addEventListener: vi.fn((t: string, fn: () => void) => { listeners[t] = fn }),
    removeEventListener: vi.fn((t: string) => { delete listeners[t] }),
  }
  const nav = supported
    ? { wakeLock: { request: vi.fn(async () => { const s = fakeSentinel(); sentinels.push(s); return s }) } }
    : {}
  return { doc, nav, sentinels, fire: (t: string) => listeners[t]?.() }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createWakeLock', () => {
  it('requests a screen wake lock when enabled', async () => {
    const env = fakeEnv()
    const wl = createWakeLock(env.nav, env.doc)
    wl.enable()
    await tick()
    expect(env.nav.wakeLock!.request).toHaveBeenCalledWith('screen')
    expect(env.sentinels).toHaveLength(1)
  })

  it('releases the lock and stops listening when disabled', async () => {
    const env = fakeEnv()
    const wl = createWakeLock(env.nav, env.doc)
    wl.enable()
    await tick()
    wl.disable()
    await tick()
    expect(env.sentinels[0].release).toHaveBeenCalled()
    expect(env.doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('re-acquires the lock when the app becomes visible again', async () => {
    const env = fakeEnv()
    const wl = createWakeLock(env.nav, env.doc)
    wl.enable()
    await tick()
    env.sentinels[0].released = true // the browser drops the lock when the app goes to the background
    env.doc.visibilityState = 'visible'
    env.fire('visibilitychange')
    await tick()
    expect(env.sentinels).toHaveLength(2)
  })

  it('does not request while hidden', async () => {
    const env = fakeEnv()
    env.doc.visibilityState = 'hidden'
    const wl = createWakeLock(env.nav, env.doc)
    wl.enable()
    await tick()
    expect(env.nav.wakeLock!.request).not.toHaveBeenCalled()
  })

  it('does nothing and never throws when the browser has no wake lock', async () => {
    const env = fakeEnv(false)
    const wl = createWakeLock(env.nav, env.doc)
    expect(() => { wl.enable(); wl.disable() }).not.toThrow()
  })

  it('swallows a rejected request (e.g. low battery mode)', async () => {
    const env = fakeEnv()
    env.nav.wakeLock!.request = vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError') })
    const wl = createWakeLock(env.nav, env.doc)
    wl.enable()
    await tick()
    expect(env.nav.wakeLock!.request).toHaveBeenCalled()
  })
})
