import { describe, it, expect } from 'vitest'
import { leaderboard, timeStats, playerOrder } from '../../src/stats/stats'
import type { Game } from '../../src/types'

const MIN = 60000
let n = 0
function game(winner: string | null, players: [string, number, number][], dur: number, early = false): Game {
  return {
    id: `g${n++}`, group_id: 1, recorded_by: 'x', started_at: '2026-11-18T20:00:00+01:00',
    duration_ms: dur, max_penalty_points: 10, ended_early: early, winner,
    players: players.map(([name, s, b]) => ({ name, final_score: s, boer_count: b, fold_count: 0, is_anita: false })),
  }
}

const games = [
  game('Ravi', [['Ravi', 3, 1], ['Kees', 10, 0]], 10 * MIN),
  game('ravi', [['Ravi', 2, 0], ['Kees', 10, 2], ['Tim', 10, 0]], 20 * MIN),
  game('Kees', [['Ravi', 10, 0], ['Kees', 4, 1]], 30 * MIN),
  game(null, [['Ravi', 5, 0], ['Kees', 5, 0]], 1 * MIN, true),
]

describe('leaderboard name key', () => {
  it('counts names differing by internal double space as one player', () => {
    const lb = leaderboard([
      game('Jan Piet', [['Jan Piet', 1, 0], ['Kees', 2, 0]], MIN),
      game('Jan  Piet', [['Jan  Piet', 1, 0], ['Kees', 2, 0]], MIN),
    ])
    expect(lb.filter((p) => p.name.startsWith('Jan'))).toHaveLength(1)
    expect(lb.find((p) => p.name.startsWith('Jan'))).toMatchObject({ wins: 2, played: 2 })
  })
})

describe('leaderboard anita', () => {
  const withAnita = (g: Game, anita: string): Game => ({
    ...g, players: g.players.map((p) => ({ ...p, is_anita: p.name === anita })),
  })
  it('counts anitas per player', () => {
    const lb = leaderboard([
      withAnita(game('Ravi', [['Tim', 10, 0], ['Ravi', 3, 0], ['Kees', 5, 0]], MIN), 'Tim'),
      withAnita(game('Kees', [['Tim', 10, 0], ['Ravi', 8, 0], ['Kees', 5, 0]], MIN), 'Tim'),
      withAnita(game('Kees', [['Tim', 6, 0], ['Ravi', 10, 0], ['Kees', 5, 0]], MIN), 'Ravi'),
    ])
    expect(lb.find((p) => p.name === 'Tim')!.anita).toBe(2)
    expect(lb.find((p) => p.name === 'Ravi')!.anita).toBe(1)
    expect(lb.find((p) => p.name === 'Kees')!.anita).toBe(0)
  })
  it('missing is_anita counts as zero', () => {
    const old = game('Ravi', [['Ravi', 3, 0], ['Kees', 10, 0]], MIN)
    old.players = old.players.map(({ is_anita: _omit, ...rest }) => rest) as unknown as Game['players']
    const lb = leaderboard([old])
    expect(lb.map((p) => p.anita)).toEqual([0, 0])
  })
})

describe('leaderboard folds', () => {
  const withFolds = (g: Game, folds: Record<string, number>): Game => ({
    ...g, players: g.players.map((p) => ({ ...p, fold_count: folds[p.name] ?? 0 })),
  })
  it('counts folds per player', () => {
    const lb = leaderboard([
      withFolds(game('Ravi', [['Ravi', 3, 0], ['Kees', 10, 0]], MIN), { Ravi: 2, Kees: 1 }),
      withFolds(game('Kees', [['Ravi', 10, 0], ['Kees', 4, 0]], MIN), { Ravi: 3 }),
    ])
    expect(lb.find((p) => p.name === 'Ravi')!.folds).toBe(5)
    expect(lb.find((p) => p.name === 'Kees')!.folds).toBe(1)
  })
  it('missing fold_count counts as zero', () => {
    const old = game('Ravi', [['Ravi', 3, 0], ['Kees', 10, 0]], MIN)
    old.players = old.players.map(({ fold_count: _omit, ...rest }) => rest) as unknown as Game['players']
    expect(leaderboard([old]).map((p) => p.folds)).toEqual([0, 0])
  })
})

describe('leaderboard', () => {
  const lb = leaderboard(games)
  it('counts wins, played, boer, winRate (case-insensitive names)', () => {
    expect(lb.find((p) => p.name === 'Ravi')).toEqual({
      name: 'Ravi', wins: 2, played: 4, winRate: 0.5, boer: 1, anita: 0, folds: 0, avgDurationMs: 20 * MIN, totalDurationMs: 61 * MIN,
    })
    const kees = lb.find((p) => p.name === 'Kees')!
    expect(kees).toMatchObject({ wins: 1, played: 4, boer: 3, winRate: 0.25 })
    expect(kees.avgDurationMs).toBe(20 * MIN)
  })
  it('ended-early counts as played, no win, not in avg', () => {
    const tim = lb.find((p) => p.name === 'Tim')!
    expect(tim).toMatchObject({ wins: 0, played: 1, avgDurationMs: 20 * MIN })
    const early = leaderboard([game(null, [['A', 1, 0], ['B', 2, 0]], MIN, true)])
    expect(early[0]).toMatchObject({ wins: 0, played: 1, avgDurationMs: null, totalDurationMs: MIN })
  })
  it('sorts wins desc, winRate desc, then name', () => {
    expect(lb.map((p) => p.name)).toEqual(['Ravi', 'Kees', 'Tim'])
    const t = leaderboard([
      game('Zed', [['Zed', 1, 0], ['Anna', 2, 0]], MIN),
      game('Anna', [['Zed', 1, 0], ['Anna', 2, 0]], MIN),
      game('Bob', [['Bob', 1, 0], ['Cor', 2, 0]], MIN),
      game('Bob', [['Bob', 1, 0], ['Cor', 2, 0]], MIN),
      game('Dirk', [['Dirk', 1, 0], ['Cor', 2, 0]], MIN),
      game('Dirk', [['Dirk', 1, 0], ['Eva', 2, 0]], MIN),
    ])
    // Bob 2/2, Dirk 2/2 (name order), Anna 1/2 and Zed 1/2 (name order), Cor 0, Eva 0
    expect(t.map((p) => p.name)).toEqual(['Bob', 'Dirk', 'Anna', 'Zed', 'Cor', 'Eva'])
  })
  it('higher winRate beats lower at equal wins', () => {
    const t = leaderboard([
      game('A', [['A', 1, 0], ['B', 2, 0]], MIN),
      game('B', [['A', 1, 0], ['B', 2, 0]], MIN),
      game('B', [['B', 1, 0], ['C', 2, 0]], MIN),
      game('C', [['C', 1, 0], ['D', 2, 0]], MIN),
      game('A', [['A', 1, 0], ['D', 2, 0]], MIN),
    ])
    // A 2/3, B 2/3 -> equal; C 1/2; name order inside ties
    expect(t.slice(0, 3).map((p) => p.name)).toEqual(['A', 'B', 'C'])
  })
  it('winner null without ended_early: nobody wins', () => {
    const r = leaderboard([game(null, [['A', 1, 0], ['B', 2, 0]], MIN)])
    expect(r.every((p) => p.wins === 0 && p.played === 1)).toBe(true)
  })
})

describe('timeStats', () => {
  it('ignores ended-early for avg/shortest/longest/count, includes it in total', () => {
    const t = timeStats(games)
    expect(t.count).toBe(3)
    expect(t.avgMs).toBe(20 * MIN)
    expect(t.shortest?.duration_ms).toBe(10 * MIN)
    expect(t.longest?.duration_ms).toBe(30 * MIN)
    expect(t.totalMs).toBe(61 * MIN)
  })
  it('empty', () => {
    expect(timeStats([])).toEqual({ count: 0, avgMs: null, shortest: null, longest: null, totalMs: 0 })
  })
})

describe('playerOrder', () => {
  it('most played first, never-played alphabetical last', () => {
    expect(playerOrder(['Zoe', 'Tim', 'Anna', 'Kees', 'Ravi'], games)).toEqual(['Kees', 'Ravi', 'Tim', 'Anna', 'Zoe'])
  })
  it('3-game player above 1-game player', () => {
    const g = [
      game('A', [['A', 1, 0], ['B', 2, 0]], MIN), game('A', [['A', 1, 0], ['B', 2, 0]], MIN),
      game('A', [['A', 1, 0], ['B', 2, 0]], MIN), game('C', [['C', 1, 0], ['D', 2, 0]], MIN),
    ]
    expect(playerOrder(['C', 'A'], g)).toEqual(['A', 'C'])
  })
})
