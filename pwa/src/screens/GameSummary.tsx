import { useEffect } from 'preact/hooks'
import confetti from 'canvas-confetti'
import type { GameState } from '../game/engine'
import { Button } from '../components/Button'
import { toast } from '../components/Toast'

/** HH:MM:SS, same as the Android DurationFormatter. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}`
}

export function shareText(state: GameState): string {
  const lines = [
    '🎴 Toepen Resultaat!',
    `🏆 Winnaar: ${state.winner ?? 'Niemand'}`,
    `⏱️ Speelduur: ${formatDuration(state.durationMs)}`,
    '',
    'Eindstand:',
    ...state.players.map((n) => `• ${n}: ${state.scores[n] ?? 0} strafpunten`),
  ]
  return lines.join('\n') + '\n'
}

async function share(state: GameState): Promise<void> {
  const text = shareText(state)
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'Resultaat van Toepen', text })
      return
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
  }
  try {
    await navigator.clipboard.writeText(text)
    toast('Gekopieerd')
  } catch {
    toast('Delen is niet mogelijk')
  }
}

export function GameSummary(props: {
  state: GameState
  showRematch: boolean
  groupKey: string
  onRematch: () => void
}) {
  const { state } = props
  useEffect(() => {
    if (state.winner) void confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
  }, [state.winner])

  return (
    <main class="screen summary" data-route="summary">
      <h1>Speloverzicht</h1>
      <p class="winner">Winnaar: {state.winner ?? 'Niemand'}</p>
      <p>Speelduur: {formatDuration(state.durationMs)}</p>
      <h2>Eindstand</h2>
      <ul class="list">
        {state.players.map((n) => (
          <li key={n} class="card score-line">
            <span>{n}</span>
            <span>{state.scores[n] ?? 0} strafpunten</span>
          </li>
        ))}
      </ul>
      <div class="stack">
        <Button onClick={() => void share(state)}>Deel resultaten</Button>
        {props.showRematch && (
          <Button variant="secondary" onClick={props.onRematch}>
            Revanche
          </Button>
        )}
        <a class="btn btn-secondary" href={`#/g/${props.groupKey}`}>
          Naar groep
        </a>
        <a class="btn btn-ghost" href="#/">
          Terug naar start
        </a>
      </div>
    </main>
  )
}
