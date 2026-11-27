import type { ApiSeason, Game } from '../types'
import { leaderboard } from './stats'
import type { PlayerStats } from './stats'

export interface Season {
  /** null for the implicit season 1. */
  id: number | null
  number: number
  label: string
  /** Epoch ms; null means unbounded. */
  start: number | null
  end: number | null
}

export interface Title { names: string[]; count: number }
export interface SeasonTitles {
  kampioen: Title | null
  anita: Title | null
  boer: Title | null
  paskoning: Title | null
}

export type GroupPageView =
  | { kind: 'justEnded'; ended: Season; running: Season; titles: SeasonTitles }
  | { kind: 'running'; running: Season; titles: SeasonTitles }

const byName = (a: string, b: string) => a.localeCompare(b, 'nl')

export function seasonsOf(g: { seasons?: ApiSeason[]; firstSeasonName?: string | null }): Season[] {
  const rows = g.seasons ?? []
  const starts = [null, ...rows.map((r) => Date.parse(r.starts_at))]
  return starts.map((start, i) => ({
    id: i === 0 ? null : rows[i - 1].id,
    number: i + 1,
    label: (i === 0 ? g.firstSeasonName : rows[i - 1].name) || `Seizoen ${i + 1}`,
    start,
    end: i + 1 < starts.length ? starts[i + 1] : null,
  }))
}

export function gamesIn(s: Season, games: Game[]): Game[] {
  return games.filter((g) => {
    const t = Date.parse(g.started_at)
    return (s.start === null || t >= s.start) && (s.end === null || t < s.end)
  })
}

function top(stats: PlayerStats[], value: (p: PlayerStats) => number): Title | null {
  const max = Math.max(0, ...stats.map(value))
  if (max === 0) return null
  const names = stats.filter((p) => value(p) === max).map((p) => p.name)
  return { names: names.sort(byName), count: max }
}

export function titles(games: Game[]): SeasonTitles {
  const stats = leaderboard(games)
  let kampioen: Title | null = null
  const winners = stats.filter((p) => p.wins > 0)
  if (winners.length) {
    const best = winners.reduce((a, p) => (p.wins > a.wins || (p.wins === a.wins && p.winRate > a.winRate) ? p : a))
    const names = winners.filter((p) => p.wins === best.wins && p.winRate === best.winRate).map((p) => p.name)
    kampioen = { names: names.sort(byName), count: best.wins }
  }
  return {
    kampioen,
    anita: top(stats, (p) => p.anita),
    boer: top(stats, (p) => p.boer),
    paskoning: top(stats, (p) => p.folds),
  }
}

export function groupPageView(seasons: Season[], games: Game[]): GroupPageView {
  const running = seasons[seasons.length - 1]
  const runningGames = gamesIn(running, games)
  if (seasons.length > 1 && runningGames.length === 0) {
    const ended = seasons[seasons.length - 2]
    const endedGames = gamesIn(ended, games)
    if (endedGames.length > 0) return { kind: 'justEnded', ended, running, titles: titles(endedGames) }
  }
  return { kind: 'running', running, titles: titles(runningGames) }
}

export function pastSeasons(seasons: Season[], games: Game[]): { season: Season; titles: SeasonTitles }[] {
  return seasons
    .slice(0, -1)
    .map((season) => ({ season, games: gamesIn(season, games) }))
    .filter((x) => x.games.length > 0)
    .map((x) => ({ season: x.season, titles: titles(x.games) }))
    .reverse()
}
