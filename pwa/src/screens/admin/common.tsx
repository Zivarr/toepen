import { useCallback, useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { ApiError, NetworkError } from '../../api/client'
import { getUser } from '../../storage/repo'
import { navigate } from '../../router'
import { Button } from '../../components/Button'
import { toast } from '../../components/Toast'
import { admin } from '../../api/endpoints'

export const OFFLINE_MSG = 'Beheer werkt alleen met internet'

export function errorMessage(e: unknown): string {
  if (e instanceof NetworkError) return OFFLINE_MSG
  if (e instanceof ApiError) return e.message
  return 'Er ging iets mis'
}

/** Runs an action, toasting API errors. Returns true on success. */
export async function attempt(fn: () => Promise<unknown>, overrides: Record<string, string> = {}): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (e) {
    toast(e instanceof ApiError && overrides[e.code] ? overrides[e.code] : errorMessage(e))
    return false
  }
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'nooit'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Admin gate + loader. Non-admins are sent home; offline/network failures set `offline`. */
export function useAdminData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const u = await getUser()
    if (!u?.is_admin) {
      navigate('#/')
      return
    }
    if (navigator.onLine === false) {
      setOffline(true)
      return
    }
    try {
      setData(await loader())
      setOffline(false)
      setError(null)
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true)
      else setError(errorMessage(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void reload()
    const on = () => void reload()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [reload])

  return { data, offline, error, reload }
}

const LINKS: [string, string][] = [
  ['#/admin/users', 'Gebruikers'],
  ['#/admin/groups', 'Groepen'],
  ['#/admin/requests', 'Verzoeken'],
  ['#/admin/bin', 'Prullenbak'],
]

export function AdminShell(props: {
  title: string
  active?: string
  offline: boolean
  error: string | null
  loaded: boolean
  onRetry: () => void
  children: ComponentChildren
}) {
  return (
    <main class="screen">
      <nav class="admin-nav">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} class={href === props.active ? 'active' : ''}>
            {label}
          </a>
        ))}
      </nav>
      <h1>{props.title}</h1>
      {props.offline ? (
        <div class="card">
          <p>{OFFLINE_MSG}</p>
          <Button onClick={props.onRetry}>Opnieuw proberen</Button>
        </div>
      ) : props.error ? (
        <div class="card">
          <p class="error">{props.error}</p>
          <Button onClick={props.onRetry}>Opnieuw proberen</Button>
        </div>
      ) : props.loaded ? (
        props.children
      ) : (
        <p class="muted">Laden…</p>
      )}
    </main>
  )
}

export type SimplePlayer = { id: number; name: string }

/** Live players per group, from the admin export (there is no per-group player endpoint for non-members). */
export async function groupPlayers(): Promise<Map<number, SimplePlayer[]>> {
  const dump = (await admin.exportAll()) as {
    players?: { id: number; group_id: number; name: string; merged_into_player_id: number | null }[]
  }
  const map = new Map<number, SimplePlayer[]>()
  for (const p of dump.players ?? []) {
    if (p.merged_into_player_id != null) continue // alias rows
    const list = map.get(Number(p.group_id)) ?? []
    list.push({ id: Number(p.id), name: p.name })
    map.set(Number(p.group_id), list)
  }
  for (const l of map.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  return map
}
