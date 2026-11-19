import { useEffect, useState } from 'preact/hooks'
import { getGames, getGroup } from '../storage/repo'
import { leaderboard, timeStats } from '../stats/stats'
import { formatDuration } from '../util/format'
import type { CachedGroup, Game, GroupKey, StoredGame } from '../types'

function GameLink({ groupKey, game }: { groupKey: string; game: Game | null }) {
  if (!game) return <span>-</span>
  return (
    <a href={`#/g/${groupKey}/results?game=${encodeURIComponent(game.id)}`}>{formatDuration(game.duration_ms)}</a>
  )
}

export function Leaderboard({ groupKey }: { groupKey: string }) {
  const key = groupKey as GroupKey
  const [group, setGroup] = useState<CachedGroup | null | undefined>(undefined)
  const [games, setGames] = useState<StoredGame[]>([])

  useEffect(() => {
    const load = () =>
      void Promise.all([getGroup(key), getGames(key)]).then(([g, gs]) => {
        setGroup(g ?? null)
        setGames(gs)
      })
    load()
    window.addEventListener('toepen:sync', load)
    return () => window.removeEventListener('toepen:sync', load)
  }, [key])

  if (group === undefined) return <main class="screen" />
  if (group === null)
    return (
      <main class="screen">
        <p>Groep niet gevonden.</p>
        <a href="#/">Terug naar groepen</a>
      </main>
    )

  const rows = leaderboard(games)
  const t = timeStats(games)
  const dur = (ms: number | null) => (ms === null ? '-' : formatDuration(ms))

  return (
    <main class="screen">
      <p>
        <a class="back" href={`#/g/${key}`}>
          ‹ {group.name}
        </a>
      </p>
      <h1>Ranglijst</h1>
      {rows.length === 0 ? (
        <p class="muted">Nog geen spellen gespeeld.</p>
      ) : (
        <div class="table-wrap">
          <table class="lb">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Gewonnen</th>
                <th>Gespeeld</th>
                <th>%</th>
                <th>Boeren</th>
                <th>Gem. duur</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.wins}</td>
                  <td>{r.played}</td>
                  <td>{Math.round(r.winRate * 100)}%</td>
                  <td>{r.boer}</td>
                  <td>{dur(r.avgDurationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Speeltijd</h2>
      <div class="card time-stats">
        <div class="score-line">
          <span>Gemiddeld</span>
          <span data-testid="time-avg">{dur(t.avgMs)}</span>
        </div>
        <div class="score-line">
          <span>Kortste</span>
          <span data-testid="time-shortest">
            <GameLink groupKey={key} game={t.shortest} />
          </span>
        </div>
        <div class="score-line">
          <span>Langste</span>
          <span data-testid="time-longest">
            <GameLink groupKey={key} game={t.longest} />
          </span>
        </div>
        <div class="score-line">
          <span>Totaal</span>
          <span data-testid="time-total">{formatDuration(t.totalMs)}</span>
        </div>
      </div>
    </main>
  )
}
