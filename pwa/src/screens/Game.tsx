import { useEffect, useRef, useState } from 'preact/hooks'
import { apply, isEliminated, newGame, type Action, type GameState } from '../game/engine'
import { tally } from '../game/tally'
import { getCurrentGame, getSettings, getUser, saveFinishedGame, setCurrentGame } from '../storage/repo'
import { runSyncCycle } from '../sync/triggers'
import { navigate } from '../router'
import type { DeviceSettings, GroupKey } from '../types'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../components/Toast'
import { GameSummary, formatDuration } from './GameSummary'

type Current = { groupKey: GroupKey; state: GameState }

export function Game() {
  const [cur, setCur] = useState<Current | null | undefined>(undefined)
  const [finished, setFinished] = useState<Current | null>(null)
  const [settings, setSettings] = useState<DeviceSettings>({ confirmPenalty: false, showRematch: true })
  const [now, setNow] = useState(Date.now())
  const [confirmPlayer, setConfirmPlayer] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  // Latest state + a promise chain so rapid taps are applied in order, never dropped.
  const latest = useRef<Current | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    void Promise.all([getCurrentGame(), getSettings()]).then(([g, s]) => {
      setSettings(s)
      if (!g) navigate('#/')
      latest.current = g
      setCur(g)
    })
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (finished) {
    return (
      <GameSummary
        state={finished.state}
        groupKey={finished.groupKey}
        showRematch={settings.showRematch}
        onRematch={() => {
          const s = finished.state
          const next = { groupKey: finished.groupKey, state: newGame(s.players, s.maxPenaltyPoints, Date.now()) }
          void setCurrentGame(next).then(() => {
            latest.current = next
            setFinished(null)
            setCur(next)
          })
        }}
      />
    )
  }
  if (!cur) return <main class="screen" />
  const { state } = cur

  function dispatch(action: Action): void {
    queue.current = queue.current.then(() => run(action)).catch((e) => {
      console.warn('Actie mislukt', e)
      toast('Opslaan mislukt, probeer opnieuw')
    })
  }

  async function run(action: Action) {
    const base = latest.current
    if (!base) return
    const r = apply(base.state, action, Date.now())
    for (const e of r.events) {
      if (e.type === 'eliminated') toast(`${e.name} ligt eruit!`)
      else if (e.type === 'undoEmpty') toast('Niets om ongedaan te maken')
    }
    if (r.state === base.state) return
    if (r.state.isOver) {
      // latest stays untouched until the save succeeded, so a failed save can be retried by tapping again.
      const user = await getUser()
      if (!user) throw new Error('Niet ingelogd')
      await saveFinishedGame(base.groupKey, r.state, user)
      latest.current = null
      await setCurrentGame(null).catch((e) => console.warn('Huidig spel wissen mislukt', e))
      void runSyncCycle()
      setFinished({ groupKey: base.groupKey, state: r.state })
      return
    }
    const next = { groupKey: base.groupKey, state: r.state }
    latest.current = next
    setCur(next)
    await setCurrentGame(next)
  }

  function penalty(name: string) {
    if (settings.confirmPenalty) setConfirmPlayer(name)
    else dispatch({ type: 'penalty', name })
  }

  return (
    <main class="screen game" data-route="game">
      <div class="game-top">
        <Button variant="secondary" onClick={() => dispatch({ type: 'klop' })}>
          Klop! (Punten: {state.roundPoints})
        </Button>
        <span class="timer" aria-label="Speelduur">
          {formatDuration(now - state.startedAt)}
        </span>
      </div>
      <ul class="list">
        {state.players.map((name) => {
          const out = isEliminated(state, name)
          const score = state.scores[name]
          return (
            <li key={name} class={`card player-row ${out ? 'out' : ''}`} data-player={name}>
              <div class="player-info">
                <span class="player-name">{name}</span>
                <span class="tally">{tally(score)}</span>
                <span class="score">{score}</span>
              </div>
              <div class="player-actions">
                <Button variant="danger" disabled={out} onClick={() => penalty(name)}>
                  Strafpunt
                </Button>
                <Button variant="secondary" disabled={out} onClick={() => dispatch({ type: 'fold', name })}>
                  Pas ({state.roundPoints - 1} pt)
                </Button>
                <Button variant="secondary" disabled={out} onClick={() => dispatch({ type: 'boer', name })}>
                  Boer!
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <div class="stack">
        <Button variant="secondary" onClick={() => dispatch({ type: 'nextRound' })}>
          Volgende ronde
        </Button>
        <Button variant="secondary" onClick={() => dispatch({ type: 'undo' })}>
          Ongedaan maken
        </Button>
        <Button variant="danger" onClick={() => setConfirmEnd(true)}>
          Spel beëindigen
        </Button>
      </div>
      {confirmPlayer && (
        <ConfirmDialog
          title="Bevestigen"
          message={`Strafpunt toevoegen aan ${confirmPlayer}?`}
          confirmLabel="Ja"
          onCancel={() => setConfirmPlayer(null)}
          onConfirm={() => {
            const n = confirmPlayer
            setConfirmPlayer(null)
            dispatch({ type: 'penalty', name: n })
          }}
        />
      )}
      {confirmEnd && (
        <ConfirmDialog
          title="Spel beëindigen"
          message="Weet je zeker dat je het spel wilt beëindigen?"
          confirmLabel="Beëindigen"
          danger
          onCancel={() => setConfirmEnd(false)}
          onConfirm={() => {
            setConfirmEnd(false)
            dispatch({ type: 'endEarly' })
          }}
        />
      )}
    </main>
  )
}
