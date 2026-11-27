import { useEffect, useState } from 'preact/hooks'
import { getGames, getGroup, getUser, deleteLocalGame } from '../storage/repo'
import { db } from '../storage/db'
import { deleteGame } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import { runSyncCycle } from '../sync/triggers'
import { notifySync } from '../sync/outbox'
import { formatDuration, scoreLabel } from '../util/format'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../components/Toast'
import type { CachedGroup, GroupKey, StoredGame, User } from '../types'

const OFFLINE_HINT = 'Verwijderen kan alleen met internet'

export function winnerLabel(g: { winner: string | null; ended_early: boolean }): string {
  if (g.ended_early) return 'Beëindigd'
  return g.winner ?? 'Niemand'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function highlightId(): string | null {
  const q = location.hash.split('?')[1]
  return q ? new URLSearchParams(q).get('game') : null
}

export function Results({ groupKey }: { groupKey: string }) {
  const key = groupKey as GroupKey
  const [group, setGroup] = useState<CachedGroup | null | undefined>(undefined)
  const [games, setGames] = useState<StoredGame[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [queued, setQueued] = useState<Map<string, 'pending' | 'failed'>>(new Map())
  const [toDelete, setToDelete] = useState<StoredGame | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [hl, setHl] = useState<string | null>(highlightId())

  useEffect(() => {
    const load = () =>
      void Promise.all([getGroup(key), getGames(key), getUser(), db.outbox.toArray()]).then(([g, gs, u, ob]) => {
        setGroup(g ?? null)
        setGames(gs)
        setUser(u)
        setQueued(new Map(ob.map((o) => [o.id, o.status])))
      })
    load()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const hash = () => setHl(highlightId())
    window.addEventListener('toepen:sync', load)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('hashchange', hash)
    return () => {
      window.removeEventListener('toepen:sync', load)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('hashchange', hash)
    }
  }, [key])

  useEffect(() => {
    if (hl) document.getElementById(`game-${hl}`)?.scrollIntoView({ block: 'center' })
  }, [hl, games])

  if (group === undefined) return <main class="screen" />
  if (group === null)
    return (
      <main class="screen">
        <p>Groep niet gevonden.</p>
        <a href="#/">Terug naar groepen</a>
      </main>
    )

  const isServer = group.kind === 'server'
  const canDelete = (g: StoredGame) => !!user && (user.is_admin || g.recorded_by === user.username)

  async function confirmDelete() {
    const g = toDelete
    setToDelete(null)
    if (!g) return
    try {
      if (!isServer) {
        await deleteLocalGame(g.id)
      } else if (queued.has(g.id)) {
        // never reached the server: remove locally only
        await db.transaction('rw', db.outbox, db.games, async () => {
          await db.outbox.delete(g.id)
          await db.games.delete(g.id)
        })
      } else {
        await deleteGame(g.id)
        await db.kv.delete('etag')
        await runSyncCycle()
      }
      notifySync()
      toast('Spel verwijderd')
    } catch (e) {
      if (e instanceof NetworkError) toast(OFFLINE_HINT)
      else if (e instanceof ApiError) toast('Verwijderen is mislukt')
      else throw e
    }
  }

  return (
    <main class="screen">
      <p>
        <a class="back" href={`#/g/${key}`}>
          ‹ {group.name}
        </a>
      </p>
      <h1>Spelresultaten</h1>
      {games.length === 0 && <p class="muted">Nog geen spellen gespeeld.</p>}
      <ul class="list">
        {games.map((g) => {
          const q = queued.get(g.id)
          const disabled = isServer && !q && !online
          return (
            <li key={g.id} id={`game-${g.id}`} class={`card result${hl === g.id ? ' highlight' : ''}`}>
              <div class="result-head">
                <span>{formatDate(g.started_at)}</span>
                {q && <span class="tag tag-warn">{q === 'failed' ? 'Kan niet uploaden' : 'nog niet geüpload'}</span>}
              </div>
              <p class="winner-line">Winnaar: {winnerLabel(g)}</p>
              <ul class="plain">
                {g.players.map((p) => (
                  <li key={p.name} class="score-line">
                    <span>
                      {p.name}
                      {p.is_anita && <span class="tag tag-anita">Anita</span>}
                    </span>
                    <span>{scoreLabel(p)}</span>
                  </li>
                ))}
              </ul>
              <p class="muted">Speelduur: {formatDuration(g.duration_ms)}</p>
              {canDelete(g) && (
                <>
                  <Button variant="danger" disabled={disabled} onClick={() => setToDelete(g)}>
                    Verwijderen
                  </Button>
                  {disabled && <p class="muted">{OFFLINE_HINT}</p>}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {toDelete && (
        <ConfirmDialog
          title="Spel verwijderen"
          message="Weet je zeker dat je dit spel wilt verwijderen?"
          confirmLabel="Verwijderen"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </main>
  )
}
