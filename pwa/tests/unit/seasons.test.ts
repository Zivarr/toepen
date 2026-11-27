import { describe, it, expect } from 'vitest'
import { seasonStartMs, seasonsOf, gamesIn, titles, groupPageView, pastSeasons } from '../../src/stats/seasons'
import type { Season } from '../../src/stats/seasons'
import type { Game } from '../../src/types'

let n = 0
type P = [string, { boer?: number; anita?: boolean; folds?: number }?]
function game(winner: string | null, players: P[], at = '2026-11-18T20:00:00+01:00'): Game {
  return {
    id: `g${n++}`, group_id: 1, recorded_by: 'x', started_at: at,
    duration_ms: 1000, max_penalty_points: 10, ended_early: winner === null, winner,
    players: players.map(([name, o]) => ({
      name, final_score: 0, boer_count: o?.boer ?? 0, fold_count: o?.folds ?? 0, is_anita: o?.anita ?? false,
    })),
  }
}
const ms = (s: string) => Date.parse(s)
const api = (id: number, starts_at: string, name: string | null = null) => ({ id, name, starts_at })

describe('seasonsOf', () => {
  it('no seasons gives one running Seizoen 1', () => {
    expect(seasonsOf({ seasons: [], firstSeasonName: null })).toEqual([
      { id: null, number: 1, label: 'Seizoen 1', start: null, end: null },
    ])
  })
  it('labels default to Seizoen n and use custom names', () => {
    const s = seasonsOf({
      firstSeasonName: 'Begin',
      seasons: [api(4, '2027-01-01T00:00:00+01:00'), api(9, '2027-06-01T00:00:00+02:00', 'Zomer')],
    })
    expect(s.map((x) => x.label)).toEqual(['Begin', 'Seizoen 2', 'Zomer'])
    expect(s.map((x) => x.number)).toEqual([1, 2, 3])
    expect(s.map((x) => x.id)).toEqual([null, 4, 9])
  })
  it('ends equal next start', () => {
    const s = seasonsOf({ seasons: [api(1, '2027-01-01T00:00:00+01:00'), api(2, '2027-06-01T00:00:00+02:00')] })
    expect(s[0].start).toBeNull()
    expect(s[0].end).toBe(s[1].start)
    expect(s[1].end).toBe(s[2].start)
    expect(s[2].end).toBeNull()
    expect(s[1].start).toBe(ms('2027-01-01T00:00:00+01:00'))
  })
  it('missing fields on an old cached group behave as empty', () => {
    expect(seasonsOf({})).toHaveLength(1)
    expect(seasonsOf({ seasons: undefined, firstSeasonName: undefined })[0].label).toBe('Seizoen 1')
  })
})

describe('gamesIn', () => {
  const s = seasonsOf({ seasons: [api(1, '2027-03-03T00:00:00+00:00')] })
  it('game at the boundary belongs to the later season', () => {
    const g = game('A', [['A'], ['B']], '2027-03-03T00:00:00+00:00')
    expect(gamesIn(s[0], [g])).toEqual([])
    expect(gamesIn(s[1], [g])).toEqual([g])
  })
  it('compares instants across offsets', () => {
    const g = game('A', [['A'], ['B']], '2027-03-03T00:30:00+01:00')
    expect(gamesIn(s[0], [g])).toEqual([g])
    expect(gamesIn(s[1], [g])).toEqual([])
  })
})

describe('titles', () => {
  it('kampioen is most wins', () => {
    const t = titles([game('A', [['A'], ['B']]), game('A', [['A'], ['B']]), game('B', [['A'], ['B']])])
    expect(t.kampioen).toEqual({ names: ['A'], count: 2 })
  })
  it('kampioen tie broken by win rate', () => {
    const t = titles([
      game('A', [['A'], ['B']]), game('B', [['A'], ['B']]), game('B', [['B'], ['C']]),
      game('A', [['A'], ['C']]), game(null, [['A'], ['C']]),
    ])
    // A: 2 wins / 4 played; B: 2 wins / 3 played
    expect(t.kampioen).toEqual({ names: ['B'], count: 2 })
  })
  it('kampioen shared when wins and rate tie', () => {
    const t = titles([game('Tim', [['Kees'], ['Tim']]), game('Kees', [['Kees'], ['Tim']])])
    expect(t.kampioen).toEqual({ names: ['Kees', 'Tim'], count: 1 })
  })
  it('no wins gives no kampioen', () => {
    expect(titles([game(null, [['A'], ['B']])]).kampioen).toBeNull()
    expect(titles([]).kampioen).toBeNull()
  })
  it('anita, boer, paskoning are most counts and shared on ties', () => {
    const t = titles([
      game('A', [['A', { anita: true, boer: 1, folds: 2 }], ['B', { boer: 3, folds: 2 }], ['C', { anita: true }]]),
    ])
    expect(t.anita).toEqual({ names: ['A', 'C'], count: 1 })
    expect(t.boer).toEqual({ names: ['B'], count: 3 })
    expect(t.paskoning).toEqual({ names: ['A', 'B'], count: 2 })
  })
  it('zero counts give an empty title', () => {
    const t = titles([game('A', [['A'], ['B']])])
    expect(t.anita).toBeNull()
    expect(t.boer).toBeNull()
    expect(t.paskoning).toBeNull()
  })
})

describe('groupPageView', () => {
  const two = seasonsOf({ seasons: [api(1, '2027-01-01T00:00:00+01:00')] })
  const old = game('A', [['A'], ['B']], '2026-12-01T20:00:00+01:00')
  const fresh = game('B', [['A'], ['B']], '2027-01-05T20:00:00+01:00')
  it('just-ended view while the running season has no games', () => {
    const v = groupPageView(two, [old])
    expect(v.kind).toBe('justEnded')
    if (v.kind === 'justEnded') {
      expect(v.ended).toBe(two[0])
      expect(v.running).toBe(two[1])
      expect(v.titles.kampioen?.names).toEqual(['A'])
    }
  })
  it('no just-ended view when the running season has games', () => {
    const v = groupPageView(two, [old, fresh])
    expect(v.kind).toBe('running')
    expect(v.titles.kampioen?.names).toEqual(['B'])
  })
  it('no just-ended view when the ended season had no games', () => {
    expect(groupPageView(two, []).kind).toBe('running')
    expect(groupPageView(two, [fresh]).kind).toBe('running')
  })
  it('single season is running', () => {
    const v = groupPageView(seasonsOf({}), [old])
    expect(v.kind).toBe('running')
    expect(v.running.number).toBe(1)
  })
})

describe('pastSeasons', () => {
  it('pastSeasons excludes the running season and empty seasons, newest first', () => {
    const s: Season[] = seasonsOf({
      seasons: [api(1, '2027-01-01T00:00:00+01:00'), api(2, '2027-02-01T00:00:00+01:00'), api(3, '2027-03-01T00:00:00+01:00')],
    })
    const games = [
      game('A', [['A'], ['B']], '2026-12-01T20:00:00+01:00'),
      game('B', [['A'], ['B']], '2027-02-10T20:00:00+01:00'),
      game('A', [['A'], ['B']], '2027-03-10T20:00:00+01:00'),
    ]
    const p = pastSeasons(s, games)
    expect(p.map((x) => x.season.number)).toEqual([3, 1])
    expect(p[0].titles.kampioen?.names).toEqual(['B'])
  })
})

describe('seasonStartMs', () => {
  const s = (o: Partial<Season>): Season => ({ id: null, number: 1, label: 'Seizoen 1', start: null, end: null, ...o })
  it('returns a stored start', () => {
    expect(seasonStartMs(s({ id: 2, number: 2, start: 5000 }), [game('A', [['A']])])).toBe(5000)
  })
  it('uses the oldest game for season 1', () => {
    const gs = [game('A', [['A']], '2026-11-20T20:00:00+01:00'), game('A', [['A']], '2026-11-18T20:00:00+01:00')]
    expect(seasonStartMs(s({}), gs)).toBe(Date.parse('2026-11-18T20:00:00+01:00'))
  })
  it('is null for season 1 without games', () => {
    expect(seasonStartMs(s({}), [])).toBeNull()
  })
})
