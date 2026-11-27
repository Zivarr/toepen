import { useEffect, useRef, useState } from 'preact/hooks'
import { apply, isEliminated, newGame, type Action, type GameState } from '../game/engine'
import { tally } from '../game/tally'
import { DEFAULT_SETTINGS, getCurrentGame, getSettings, getUser, saveFinishedGame, setCurrentGame } from '../storage/repo'
import { useWakeLock } from '../util/wakeLock'
import { runSyncCycle } from '../sync/triggers'
import { navigate } from '../router'
import type { DeviceSettings, GroupKey } from '../types'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../components/Toast'
import { GameSummary } from './GameSummary'
import { formatDuration } from '../util/format'

type Current = { groupKey: GroupKey; state: GameState; id?: string }

export function Game() {
  const [cur, setCur] = useState<Current | null | undefined>(undefined)
  const [finished, setFinished] = useState<Current | null>(null)
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_SETTINGS)
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

  // Keep the screen on while a game is being played (not on the summary).
  useWakeLock(settings.keepScreenOn && !!cur && !finished)

  if (finished) {
    return (
      <GameSummary
        state={finished.state}
        groupKey={finished.groupKey}
        showRematch={settings.showRematch}
        onRematch={() => {
          const s = finished.state
          const next = {
            groupKey: finished.groupKey,
            state: newGame(s.players, s.maxPenaltyPoints, Date.now()),
            id: crypto.randomUUID(),
          }
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
    const held = latest.current
    if (!held) return
    // The stored key can change mid-game (a local group approved by the admin gets re-keyed).
    const stored = await getCurrentGame()
    const base: Current = stored && stored.groupKey !== held.groupKey ? { ...held, groupKey: stored.groupKey } : held
    const r = apply(base.state, action, Date.now())
    for (const e of r.events) {
      if (e.type === 'eliminated') toast(e.anita ? `${e.name} heeft verloren en is de Anita!` : `${e.name} heeft verloren!`)
      else if (e.type === 'undoEmpty') toast('Niks om ongedaan te maken')
    }
    if (r.state === base.state) {
      latest.current = base
      return
    }
    if (r.state.isOver) {
      // latest stays untouched until the save succeeded, so a failed save can be retried by tapping again.
      const user = await getUser()
      if (!user) throw new Error('Niet ingelogd')
      await saveFinishedGame(base.groupKey, r.state, user, base.id) // also clears the current game
      latest.current = null
      void runSyncCycle()
      setFinished({ groupKey: base.groupKey, state: r.state })
      return
    }
    const next = { groupKey: base.groupKey, state: r.state, id: base.id }
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
                <Tally text={tally(score, state.maxPenaltyPoints)} score={score} />
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
          Eindig spel
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
          title="Eindig spel"
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

/**
 * Renders a tally string ("卌 |||P") with every mark drawn in CSS instead of font glyphs,
 * so strokes, groups of five and the P all share one height and one bottom line on every device.
 */
function Tally({ text, score }: { text: string; score: number }) {
  if (text === '0') return <span class="tally">0</span>
  return (
    <span class="tally" role="img" aria-label={`${score} strafpunten`}>
      {text.split(' ').map((group, g) => (
        <span key={g} class={`tally-group ${group === '卌' ? 'tally-five' : ''}`}>
          {[...(group === '卌' ? '||||' : group)].map((ch, i) => (
            <span key={i} class={ch === 'P' ? 'tally-mark tally-p' : 'tally-mark'} />
          ))}
        </span>
      ))}
    </span>
  )
}
