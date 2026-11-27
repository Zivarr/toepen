import { useEffect, useState } from 'preact/hooks'
import { getGames, getGroup } from '../storage/repo'
import { leaderboard, rankRows, timeStats } from '../stats/stats'
import type { RankStat } from '../stats/stats'
import { gamesIn, seasonsOf } from '../stats/seasons'
import { formatDuration } from '../util/format'
import type { CachedGroup, Game, GroupKey, StoredGame } from '../types'

function GameLink({ groupKey, game }: { groupKey: string; game: Game | null }) {
  if (!game) return <span>-</span>
  return (
    <a href={`#/g/${groupKey}/results?game=${encodeURIComponent(game.id)}`}>{formatDuration(game.duration_ms)}</a>
  )
}

const STATS: { stat: RankStat; label: string }[] = [
  { stat: 'wins', label: 'Gewonnen' },
  { stat: 'winRate', label: '%' },
  { stat: 'boer', label: 'Boeren' },
  { stat: 'anita', label: "Anita's" },
  { stat: 'folds', label: 'Gepast' },
  { stat: 'duration', label: 'Duur' },
]

const ALL = 'all'

export function Leaderboard({ groupKey }: { groupKey: string }) {
  const key = groupKey as GroupKey
  const [group, setGroup] = useState<CachedGroup | null | undefined>(undefined)
  const [games, setGames] = useState<StoredGame[]>([])
  const [seasonPick, setSeasonPick] = useState<string | null>(null) // null = running season
  const [stat, setStat] = useState<RankStat>('wins')
  const [open, setOpen] = useState<string | null>(null)

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

  const seasons = seasonsOf(group)
  const running = seasons[seasons.length - 1]
  const picked = seasonPick === ALL ? null : (seasons.find((x) => String(x.number) === seasonPick) ?? running)
  const shown = picked ? gamesIn(picked, games) : games
  const rows = rankRows(leaderboard(shown), stat)
  const t = timeStats(shown)
  const dur = (ms: number | null) => (ms === null ? '-' : formatDuration(ms))
  const pct = (r: { winRate: number }) => `${Math.round(r.winRate * 100)}%`
  const third = (r: (typeof rows)[number]): string => {
    switch (stat) {
      case 'wins':
      case 'winRate':
        return pct(r)
      case 'boer':
        return String(r.boer)
      case 'anita':
        return String(r.anita)
      case 'folds':
        return String(r.folds)
      case 'duration':
        return dur(r.avgDurationMs)
    }
  }
  const thirdLabel = stat === 'wins' ? '%' : STATS.find((x) => x.stat === stat)!.label

  return (
    <main class="screen">
      <p>
        <a class="back" href={`#/g/${key}`}>
          ‹ {group.name}
        </a>
      </p>
      <h1>Ranglijst</h1>
      <select
        class="select season-pick"
        aria-label="Seizoen"
        value={seasonPick === ALL ? ALL : String((picked ?? running).number)}
        onChange={(e) => setSeasonPick((e.currentTarget as HTMLSelectElement).value)}
      >
        {[...seasons].reverse().map((x) => (
          <option key={x.number} value={String(x.number)}>
            {x.label}
          </option>
        ))}
        <option value={ALL}>Alles</option>
      </select>
      <div class="chips" role="group" aria-label="Sorteren op">
        {STATS.map((x) => (
          <button
            key={x.stat}
            type="button"
            class={`chip${stat === x.stat ? ' on' : ''}`}
            aria-pressed={stat === x.stat}
            onClick={() => setStat(stat === x.stat ? 'wins' : x.stat)}
          >
            {x.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p class="muted">Nog geen spellen gespeeld.</p>
      ) : (
        <table class="lb">
          <thead>
            <tr>
              <th class="rk"></th>
              <th>Naam</th>
              <th>Gew.</th>
              <th>Gesp.</th>
              <th>{thirdLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isOpen = open === r.name
              return [
                <tr key={r.name} class="lb-row" onClick={() => setOpen(isOpen ? null : r.name)}>
                  <td class="rk">{i + 1}</td>
                  <td>
                    {r.name} {isOpen ? '▴' : '▾'}
                  </td>
                  <td>{r.wins}</td>
                  <td>{r.played}</td>
                  <td class="hl">{third(r)}</td>
                </tr>,
                isOpen && (
                  <tr key={`${r.name}-x`} class="lb-exp">
                    <td colSpan={5}>
                      <div class="lb-grid">
                        <span>Win %: {pct(r)}</span>
                        <span>Boeren: {r.boer}</span>
                        <span>Anita's: {r.anita}</span>
                        <span>Gepast: {r.folds}</span>
                        <span>Gem. duur: {dur(r.avgDurationMs)}</span>
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
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
