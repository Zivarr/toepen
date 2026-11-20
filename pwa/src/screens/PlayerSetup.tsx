import { useEffect, useState } from 'preact/hooks'
import { addPendingPlayer, addPlayerName, getCurrentGame, getGames, getGroup, setCurrentGame } from '../storage/repo'
import { addPlayer } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import { newGame } from '../game/engine'
import { playerOrder } from '../stats/stats'
import { findMatch, titleCase } from '../players/match'
import { navigate } from '../router'
import type { CachedGroup, GroupKey } from '../types'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Dialog } from '../components/Dialog'
import { toast } from '../components/Toast'

const MAX_PLAYERS = 8

export function PlayerSetup({ groupKey }: { groupKey: string }) {
  const key = groupKey as GroupKey
  const [group, setGroup] = useState<CachedGroup | null | undefined>(undefined)
  const [order, setOrder] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [max, setMax] = useState('')
  const [name, setName] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [similar, setSimilar] = useState<{ typed: string; existing: string } | null>(null)

  useEffect(() => {
    void Promise.all([getGroup(key), getGames(key)]).then(([g, games]) => {
      setGroup(g ?? null)
      if (g) {
        setOrder(playerOrder(g.playerNames, games))
        setMax(String(g.maxPenaltyPoints))
      }
    })
  }, [key])

  if (group === undefined) return <main class="screen" />
  if (group === null)
    return (
      <main class="screen">
        <p>Groep niet gevonden.</p>
        <a href="#/">Terug naar groepen</a>
      </main>
    )

  const maxNum = Number.parseInt(max, 10)
  const canStart = selected.length >= 2 && selected.length <= MAX_PLAYERS && maxNum >= 1 && maxNum <= 100

  function toggle(p: string) {
    if (selected.includes(p)) setSelected(selected.filter((s) => s !== p))
    else if (selected.length >= MAX_PLAYERS) toast(`Maximaal ${MAX_PLAYERS} spelers`)
    else setSelected([...selected, p])
  }

  function select(p: string) {
    setSelected((cur) => (cur.includes(p) || cur.length >= MAX_PLAYERS ? cur : [...cur, p]))
  }

  async function addNew(typed: string) {
    const g = group as CachedGroup
    let finalName = typed
    try {
      if (g.kind === 'server') {
        try {
          const p = await addPlayer(g.serverId as number, typed)
          finalName = p.name
          await addPlayerName(key, p.name)
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && e.code === 'name_taken') {
            const existing = (e.extra as { player?: { name?: string } } | undefined)?.player?.name
            finalName = existing ?? typed
            await addPlayerName(key, finalName)
          } else if (e instanceof NetworkError) {
            await addPendingPlayer(key, typed)
            finalName = titleCase(typed)
          } else if (e instanceof ApiError) {
            toast(e.message || 'Speler toevoegen is mislukt')
            return
          } else throw e
        }
      } else {
        await addPlayerName(key, typed)
      }
    } catch (e) {
      toast('Speler toevoegen is mislukt')
      console.warn(e)
      return
    }
    const fresh = await getGroup(key)
    if (fresh) {
      setGroup(fresh)
      setOrder((o) => (o.includes(finalName) ? o : [...o, finalName]))
    }
    select(finalName)
    setName('')
  }

  async function onAdd(e: Event) {
    e.preventDefault()
    const typed = titleCase(name)
    if (!typed) return
    const g = group as CachedGroup
    const m = findMatch(typed, g.playerNames)
    if (m.match === 'exact') {
      toast('Bestaat al')
      if (m.existing) select(m.existing)
    } else if (m.match === 'similar') {
      setSimilar({ typed, existing: m.existing as string })
    } else {
      await addNew(typed)
    }
  }

  async function start() {
    if (!canStart) return
    if (await getCurrentGame()) {
      setConfirmReplace(true)
      return
    }
    await begin()
  }

  async function begin() {
    await setCurrentGame({ groupKey: key, state: newGame(selected, maxNum, Date.now()), id: crypto.randomUUID() })
    navigate('#/game')
  }

  return (
    <main class="screen">
      <p>
        <a class="back" href={`#/g/${key}`}>
          ‹ {group.name}
        </a>
      </p>
      <h1>Spelers kiezen</h1>
      <label>
        Maximum aantal strafpunten
        <input
          name="max"
          type="number"
          inputMode="numeric"
          min="1"
          max="100"
          value={max}
          onInput={(e) => setMax(e.currentTarget.value)}
        />
      </label>

      <h2>Spelers</h2>
      {order.length === 0 && <p class="muted">Nog geen spelers. Voeg hieronder een speler toe.</p>}
      <ul class="list">
        {order.map((p) => {
          const idx = selected.indexOf(p)
          return (
            <li key={p}>
              <button
                type="button"
                class={`player-pick ${idx >= 0 ? 'picked' : ''}`}
                aria-pressed={idx >= 0}
                onClick={() => toggle(p)}
              >
                <span>{p}</span>
                {idx >= 0 && <span class="seat">{idx + 1}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <form class="add-row" onSubmit={onAdd}>
        <input
          name="newPlayer"
          maxLength={40}
          placeholder="Naam"
          autocomplete="off"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <Button type="submit" variant="secondary">
          Speler toevoegen
        </Button>
      </form>

      <h2>
        Geselecteerd ({selected.length}/{MAX_PLAYERS})
      </h2>
      <ol class="list selected-list">
        {selected.map((p) => (
          <li key={p} class="selected-row">
            <span>{p}</span>
            <button type="button" class="remove-btn" aria-label={`Verwijder ${p}`} onClick={() => toggle(p)}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      {selected.length < 2 && <p class="muted">Kies minstens 2 spelers.</p>}
      <Button class="wide" disabled={!canStart} onClick={start}>
        Start spel
      </Button>

      {confirmReplace && (
        <ConfirmDialog
          title="Spel loopt nog"
          message="Er loopt nog een spel. Als je een nieuw spel start, gaat dat spel verloren."
          confirmLabel="Nieuw spel starten"
          danger
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => {
            setConfirmReplace(false)
            void begin()
          }}
        />
      )}

      {similar && (
        <Dialog title={`Bedoel je ${similar.existing}?`} onClose={() => setSimilar(null)}>
          <div class="dialog-actions">
            <Button
              variant="ghost"
              onClick={() => {
                const t = similar.typed
                setSimilar(null)
                void addNew(t)
              }}
            >
              Nee, nieuwe speler
            </Button>
            <Button
              onClick={() => {
                select(similar.existing)
                setSimilar(null)
                setName('')
              }}
            >
              Ja, die
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  )
}
