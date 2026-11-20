import { useState } from 'preact/hooks'
import { login } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import { setToken, setUser } from '../storage/repo'
import { runSyncCycle, startTriggers } from '../sync/triggers'
import { navigate } from '../router'
import { Button } from '../components/Button'

export function errorMessage(e: unknown): string {
  if (e instanceof NetworkError) return 'Geen verbinding met de server'
  if (e instanceof ApiError) {
    if (e.code === 'invalid_credentials') return 'Gebruikersnaam of wachtwoord klopt niet'
    if (e.code === 'too_many_attempts') return 'Te vaak geprobeerd. Probeer het over 15 minuten opnieuw.'
  }
  return 'Inloggen is mislukt'
}

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await login(username.trim(), password)
      await setToken(r.token)
      await setUser(r.user)
      void navigator.storage?.persist?.()?.catch(() => {})
      startTriggers()
      void runSyncCycle()
      navigate('#/')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="screen login">
      <h1>Toepen</h1>
      <form onSubmit={submit} class="card">
        <label>
          Gebruikersnaam
          <input
            name="username"
            autocomplete="username"
            autocapitalize="none"
            value={username}
            onInput={(e) => setUsername(e.currentTarget.value)}
            required
          />
        </label>
        <label>
          Wachtwoord
          <input
            name="password"
            type="password"
            autocomplete="current-password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          Inloggen
        </Button>
      </form>
    </main>
  )
}
