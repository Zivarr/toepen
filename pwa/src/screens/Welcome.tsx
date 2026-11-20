import { useEffect, useState } from 'preact/hooks'
import { linkInfo, redeemLink, type LinkInfo } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import { clearAuth, setToken, setUser } from '../storage/repo'
import { runSyncCycle, startTriggers } from '../sync/triggers'
import { navigate } from '../router'
import { Button } from '../components/Button'

const LINK_INVALID = 'Deze link is verlopen of al gebruikt. Vraag de beheerder om een nieuwe.'

function linkError(e: unknown): string {
  if (e instanceof NetworkError) return 'Geen verbinding met de server'
  if (e instanceof ApiError && e.code === 'link_invalid') return LINK_INVALID
  if (e instanceof ApiError) return e.message
  return 'Er ging iets mis'
}

/** Public page behind an invite or reset link: choose a password, then you're logged in. */
export function Welcome({ code }: { code: string }) {
  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setInfo(null)
    setLoadError('')
    linkInfo(code).then(setInfo, (e) => setLoadError(linkError(e)))
  }, [code])

  async function submit(e: Event) {
    e.preventDefault()
    if (password.length < 8) return setError('Minimaal 8 tekens')
    if (password !== repeat) return setError('Wachtwoorden komen niet overeen')
    setBusy(true)
    setError('')
    try {
      // The link is for its own account: log out whoever was logged in on this device first.
      await clearAuth()
      const r = await redeemLink(code, password)
      await setToken(r.token)
      await setUser(r.user)
      void navigator.storage?.persist?.()?.catch(() => {})
      startTriggers()
      void runSyncCycle()
      navigate('#/')
    } catch (err) {
      setError(linkError(err))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <main class="screen login">
        <h1>Toepen</h1>
        <div class="card">
          <p class="error" role="alert">
            {loadError}
          </p>
          <a href="#/login">Naar inloggen</a>
        </div>
      </main>
    )
  }
  if (!info) {
    return (
      <main class="screen login">
        <h1>Toepen</h1>
        <p>Laden…</p>
      </main>
    )
  }

  return (
    <main class="screen login">
      <h1>{info.purpose === 'invite' ? `Welkom ${info.username}` : `Nieuw wachtwoord voor ${info.username}`}</h1>
      <form onSubmit={submit} class="card">
        <input type="hidden" name="username" autocomplete="username" value={info.username} />
        <label>
          Wachtwoord
          <input
            type="password"
            autocomplete="new-password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>
        <label>
          Herhaal wachtwoord
          <input
            type="password"
            autocomplete="new-password"
            value={repeat}
            onInput={(e) => setRepeat(e.currentTarget.value)}
            required
          />
        </label>
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          Wachtwoord opslaan
        </Button>
      </form>
    </main>
  )
}
