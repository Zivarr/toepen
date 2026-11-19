import { useEffect, useState } from 'preact/hooks'
import { clearAuth, getSettings, getUser, setSettings } from '../storage/repo'
import { db } from '../storage/db'
import { logout } from '../api/endpoints'
import { notifySync, requeueFailed } from '../sync/outbox'
import { runSyncCycle } from '../sync/triggers'
import { navigate } from '../router'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { DeviceSettings, OutboxItem, User } from '../types'

export function Settings() {
  const [settings, setLocal] = useState<DeviceSettings | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [items, setItems] = useState<OutboxItem[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    const load = () =>
      void Promise.all([getSettings(), getUser(), db.outbox.toArray()]).then(([s, u, ob]) => {
        setLocal((cur) => cur ?? s)
        setUser(u)
        setItems(ob)
      })
    load()
    window.addEventListener('toepen:sync', load)
    return () => window.removeEventListener('toepen:sync', load)
  }, [])

  if (!settings) return <main class="screen" />

  const pending = items.filter((i) => i.status === 'pending')
  const failed = items.filter((i) => i.status === 'failed')

  async function toggle(k: keyof DeviceSettings, v: boolean) {
    const next = { ...(settings as DeviceSettings), [k]: v }
    setLocal(next)
    await setSettings(next)
  }

  async function retry() {
    setBusy(true)
    try {
      await requeueFailed()
      await runSyncCycle()
    } finally {
      setBusy(false)
      notifySync()
    }
  }

  async function flush() {
    setBusy(true)
    try {
      await runSyncCycle()
    } finally {
      setBusy(false)
    }
  }

  function exportFailed() {
    const blob = new Blob([JSON.stringify(failed, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'toepen-mislukte-uploads.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function doLogout() {
    setConfirmLogout(false)
    try {
      await logout()
    } catch {
      // ignore: we log out locally either way
    }
    await clearAuth()
    navigate('#/login')
  }

  return (
    <main class="screen">
      <p>
        <a class="back" href="#/">
          ‹ Terug
        </a>
      </p>
      <h1>Instellingen</h1>
      <div class="card">
        <label class="toggle">
          <input
            type="checkbox"
            name="confirmPenalty"
            checked={settings.confirmPenalty}
            onChange={(e) => void toggle('confirmPenalty', e.currentTarget.checked)}
          />
          Bevestig strafpunt
        </label>
        <label class="toggle">
          <input
            type="checkbox"
            name="showRematch"
            checked={settings.showRematch}
            onChange={(e) => void toggle('showRematch', e.currentTarget.checked)}
          />
          Toon revanche-knop
        </label>
      </div>

      <h2>Uploads</h2>
      <div class="card" data-testid="outbox">
        {items.length === 0 ? (
          <p>Alles is geüpload.</p>
        ) : (
          <>
            <p>
              {pending.length} wachten op upload, {failed.length} mislukt
            </p>
            {failed.length > 0 && (
              <ul class="plain">
                {failed.map((i) => (
                  <li key={i.id}>
                    {i.upload.players.map((p) => p.name).join(', ')}: {i.reason ?? 'onbekende fout'}
                  </li>
                ))}
              </ul>
            )}
            <div class="stack">
              {failed.length > 0 && (
                <Button disabled={busy} onClick={() => void retry()}>
                  Opnieuw proberen
                </Button>
              )}
              {pending.length > 0 && (
                <Button variant="secondary" disabled={busy} onClick={() => void flush()}>
                  Nu uploaden
                </Button>
              )}
              {failed.length > 0 && (
                <Button variant="secondary" onClick={exportFailed}>
                  Exporteren
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <h2>Account</h2>
      <div class="card">
        <p>Ingelogd als {user?.username ?? '-'}</p>
        <Button variant="danger" onClick={() => (items.length > 0 ? setConfirmLogout(true) : void doLogout())}>
          Uitloggen
        </Button>
      </div>
      <p class="muted">Versie {__APP_VERSION__}</p>

      {confirmLogout && (
        <ConfirmDialog
          title="Uitloggen"
          message={`${items.length} ${items.length === 1 ? 'spel is' : 'spellen zijn'} nog niet geüpload. Ze blijven op dit apparaat bewaard.`}
          confirmLabel="Uitloggen"
          danger
          onConfirm={() => void doLogout()}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </main>
  )
}
