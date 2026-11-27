import type { Game } from '../types'
import { normalise } from '../players/match'

export interface PlayerStats {
  name: string
  wins: number
  played: number
  winRate: number // wins / played, 0..1
  boer: number
  anita: number
  folds: number
  avgDurationMs: number | null
  totalDurationMs: number
}

export interface TimeStats {
  count: number
  avgMs: number | null
  shortest: Game | null
  longest: Game | null
  totalMs: number
}

const key = normalise
const byName = (a: string, b: string) => a.localeCompare(b, 'nl')

export function leaderboard(games: Game[]): PlayerStats[] {
  interface Acc { name: string; wins: number; played: number; boer: number; anita: number; folds: number; total: number; sum: number; n: number }
  const map = new Map<string, Acc>()
  for (const g of games) {
    const winner = g.winner === null ? null : key(g.winner)
    for (const p of g.players) {
      const k = key(p.name)
      let a = map.get(k)
      if (!a) {
        a = { name: p.name, wins: 0, played: 0, boer: 0, anita: 0, folds: 0, total: 0, sum: 0, n: 0 }
        map.set(k, a)
      }
      a.played++
      a.boer += p.boer_count
      a.anita += p.is_anita ? 1 : 0 // absent on games cached before the Anita
      a.folds += p.fold_count ?? 0 // absent on games cached before fold counting
      a.total += g.duration_ms
      if (winner === k) a.wins++
      if (!g.ended_early) {
        a.sum += g.duration_ms
        a.n++
      }
    }
  }
  return [...map.values()]
    .map((a) => ({
      name: a.name,
      wins: a.wins,
      played: a.played,
      winRate: a.played ? a.wins / a.played : 0,
      boer: a.boer,
      anita: a.anita,
      folds: a.folds,
      avgDurationMs: a.n ? Math.round(a.sum / a.n) : null,
      totalDurationMs: a.total,
    }))
    .sort((x, y) => y.wins - x.wins || y.winRate - x.winRate || byName(x.name, y.name))
}

export function timeStats(games: Game[]): TimeStats {
  const full = games.filter((g) => !g.ended_early)
  let shortest: Game | null = null
  let longest: Game | null = null
  let sum = 0
  for (const g of full) {
    sum += g.duration_ms
    if (!shortest || g.duration_ms < shortest.duration_ms) shortest = g
    if (!longest || g.duration_ms > longest.duration_ms) longest = g
  }
  return {
    count: full.length,
    avgMs: full.length ? Math.round(sum / full.length) : null,
    shortest,
    longest,
    totalMs: games.reduce((s, g) => s + g.duration_ms, 0),
  }
}

export function playerOrder(names: string[], games: Game[]): string[] {
  const played = new Map<string, number>()
  for (const g of games) for (const p of g.players) played.set(key(p.name), (played.get(key(p.name)) ?? 0) + 1)
  const n = (s: string) => played.get(key(s)) ?? 0
  return [...names].sort((a, b) => n(b) - n(a) || byName(a, b))
}

export type RankStat = 'wins' | 'winRate' | 'boer' | 'anita' | 'folds' | 'duration'

const statValue = (p: PlayerStats, stat: RankStat): number | null =>
  stat === 'duration' ? p.avgDurationMs : stat === 'winRate' ? p.winRate : p[stat]

export function rankRows(rows: PlayerStats[], stat: RankStat): PlayerStats[] {
  return [...rows].sort((x, y) => {
    const a = statValue(x, stat)
    const b = statValue(y, stat)
    if (a !== b) {
      if (a === null) return 1
      if (b === null) return -1
      return b - a
    }
    return y.wins - x.wins || byName(x.name, y.name)
  })
}
