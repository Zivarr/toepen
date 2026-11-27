import { describe, it, expect } from 'vitest'
import { newGame, apply, isEliminated, toUpload, type GameState, type Action } from '../../src/game/engine'

const T0 = Date.UTC(2026, 10, 18, 20, 4, 5)
const mk = (players = ['Alice', 'Bob', 'Charlie'], max = 5) => newGame(players, max, T0)
function run(s: GameState, ...actions: Action[]) {
  const events: ReturnType<typeof apply>['events'] = []
  for (const a of actions) {
    const r = apply(s, a, T0 + 60000)
    s = r.state
    events.push(...r.events)
  }
  return { s, events }
}
const pen = (name: string): Action => ({ type: 'penalty', name })

describe('engine', () => {
  it('initial scores are all zero', () => {
    const s = mk()
    expect(s.scores).toEqual({ Alice: 0, Bob: 0, Charlie: 0 })
    expect(s.roundPoints).toBe(1)
  })
  it('penalty adds round points', () => {
    expect(run(mk(), pen('Alice')).s.scores.Alice).toBe(1)
  })
  it('klop raises round points', () => {
    const { s } = run(mk(), { type: 'klop' }, { type: 'klop' }, pen('Alice'))
    expect(s.roundPoints).toBe(3)
    expect(s.scores.Alice).toBe(3)
  })
  it('nextRound resets round points to 1 and clears undo', () => {
    const { s, events } = run(mk(), { type: 'klop' }, pen('Alice'), { type: 'nextRound' }, { type: 'undo' })
    expect(s.roundPoints).toBe(1)
    expect(s.history).toEqual([])
    expect(s.scores.Alice).toBe(2)
    expect(events).toEqual([{ type: 'undoEmpty' }])
  })
  it('ignores actions for names that are only inherited properties', () => {
    const s0 = mk()
    const r = apply(s0, { type: 'penalty', name: 'constructor' }, 5)
    expect(r.state).toBe(s0)
    expect(r.events).toEqual([])
  })
  it('fold adds round points minus one', () => {
    const { s } = run(mk(), { type: 'klop' }, { type: 'klop' }, { type: 'fold', name: 'Bob' })
    expect(s.scores.Bob).toBe(2)
  })
  it('fold in a 1-point round adds nothing', () => {
    expect(run(mk(), { type: 'fold', name: 'Bob' }).s.scores.Bob).toBe(0)
  })
  it('boer decreases score and counts boer', () => {
    const { s } = run(mk(), pen('Alice'), { type: 'boer', name: 'Alice' })
    expect(s.scores.Alice).toBe(0)
    expect(s.boer.Alice).toBe(1)
  })
  it('boer does not go below zero but still counts', () => {
    const { s } = run(mk(), { type: 'boer', name: 'Alice' })
    expect(s.scores.Alice).toBe(0)
    expect(s.boer.Alice).toBe(1)
  })
  it('undo restores scores and boer counts', () => {
    const { s } = run(mk(), pen('Alice'), { type: 'boer', name: 'Alice' }, { type: 'undo' })
    expect(s.scores.Alice).toBe(1)
    expect(s.boer.Alice).toBe(0)
    expect(run(s, { type: 'undo' }).s.scores.Alice).toBe(0)
  })
  it('undo with empty history emits undoEmpty', () => {
    expect(run(mk(), { type: 'undo' }).events).toEqual([{ type: 'undoEmpty' }])
  })
  it('penalty is capped at max and emits eliminated', () => {
    const { s, events } = run(mk(), { type: 'klop' }, { type: 'klop' }, { type: 'klop' }, { type: 'klop' }, { type: 'klop' }, pen('Alice'))
    expect(s.scores.Alice).toBe(5)
    expect(isEliminated(s, 'Alice')).toBe(true)
    expect(events).toEqual([{ type: 'eliminated', name: 'Alice', anita: true }])
    expect(s.isOver).toBe(false)
  })
  it('game over when one player remains, winner set, gameOver emitted once', () => {
    const acts: Action[] = [...Array(5)].map(() => pen('Alice')).concat([...Array(5)].map(() => pen('Bob')))
    const { s, events } = run(mk(), ...acts)
    expect(s.isOver).toBe(true)
    expect(s.winner).toBe('Charlie')
    expect(s.durationMs).toBe(60000)
    expect(events.filter((e) => e.type === 'gameOver')).toEqual([{ type: 'gameOver', winner: 'Charlie' }])
  })
  it('fold that eliminates the second-to-last player ends the game', () => {
    let s = mk(['A', 'B', 'C'], 3)
    s = run(s, pen('A'), pen('A'), pen('A')).s
    expect(s.isOver).toBe(false)
    s = run(s, { type: 'klop' }, { type: 'klop' }, { type: 'klop' }, { type: 'fold', name: 'B' }).s
    expect(s.scores.B).toBe(3)
    expect(s.isOver).toBe(true)
    expect(s.winner).toBe('C')
  })
  it('max 1 with two players: one penalty ends the game', () => {
    const { s } = run(mk(['A', 'B'], 1), pen('A'))
    expect(s.isOver).toBe(true)
    expect(s.winner).toBe('B')
  })
  it('actions after game over are ignored', () => {
    const { s } = run(mk(['A', 'B'], 1), pen('A'))
    const r = apply(s, pen('B'), T0 + 99999)
    expect(r.state).toBe(s)
    expect(r.events).toEqual([])
  })
  it('actions on eliminated player are ignored', () => {
    const { s } = run(mk(), ...[...Array(5)].map(() => pen('Alice')))
    const r = apply(s, { type: 'boer', name: 'Alice' }, T0)
    expect(r.state).toBe(s)
    expect(r.events).toEqual([])
  })
  it('endEarly ends with no winner and endedEarly true', () => {
    const { s, events } = run(mk(), { type: 'endEarly' })
    expect(s.isOver).toBe(true)
    expect(s.endedEarly).toBe(true)
    expect(s.winner).toBeNull()
    expect(events).toEqual([{ type: 'gameOver', winner: null }])
  })
  it('first knockout sets anita and flags the event', () => {
    const { s, events } = run(mk(['A', 'B', 'C'], 2), pen('A'), pen('A'))
    expect(s.anita).toBe('A')
    expect(events).toEqual([{ type: 'eliminated', name: 'A', anita: true }])
  })
  it('later knockouts do not change anita', () => {
    const { s, events } = run(mk(['A', 'B', 'C', 'D'], 2), pen('A'), pen('A'), pen('B'), pen('B'))
    expect(s.anita).toBe('A')
    expect(events[1]).toEqual({ type: 'eliminated', name: 'B', anita: false })
  })
  it('undo of the first knockout clears anita', () => {
    let { s } = run(mk(['A', 'B', 'C', 'D'], 2), pen('A'), pen('A'))
    s = run(s, { type: 'undo' }).s
    expect(s.anita).toBeNull()
    s = run(s, pen('B'), pen('B')).s
    expect(s.anita).toBe('B')
  })
  it('knockout on a pre-update state without anita still records the anita', () => {
    const old = mk(['A', 'B', 'C'], 2) as unknown as Record<string, unknown>
    delete old.anita
    const { s, events } = run(old as unknown as GameState, pen('A'), pen('A'))
    expect(s.anita).toBe('A')
    expect(events).toEqual([{ type: 'eliminated', name: 'A', anita: true }])
    expect(run(s, { type: 'undo' }).s.anita).toBeNull()
  })
  it('resumed pre-update state with one player already out makes that player the anita', () => {
    const old = mk(['A', 'B', 'C', 'D'], 2) as unknown as Record<string, unknown>
    delete old.anita
    ;(old.scores as Record<string, number>).A = 2
    const { s, events } = run(old as unknown as GameState, pen('B'), pen('B'))
    expect(s.anita).toBe('A')
    expect(events).toEqual([{ type: 'eliminated', name: 'B', anita: false }])
  })
  it('resumed pre-update state with two players already out records no anita', () => {
    const old = mk(['A', 'B', 'C', 'D', 'E'], 2) as unknown as Record<string, unknown>
    delete old.anita
    Object.assign(old.scores as Record<string, number>, { A: 2, B: 2 })
    const { s, events } = run(old as unknown as GameState, pen('C'), pen('C'))
    expect(events).toEqual([{ type: 'eliminated', name: 'C', anita: false }])
    expect(toUpload(s, 'x', 1).players.every((p) => p.is_anita === false)).toBe(true)
  })
  it('endEarly before any knockout leaves anita null', () => {
    expect(run(mk(), { type: 'endEarly' }).s.anita).toBeNull()
  })
  it('endEarly after a knockout keeps anita', () => {
    const { s } = run(mk(['A', 'B', 'C'], 2), pen('A'), pen('A'), { type: 'endEarly' })
    expect(s.anita).toBe('A')
  })
  it('two players: the only knockout is the anita', () => {
    const { s, events } = run(mk(['A', 'B'], 1), pen('A'))
    expect(s.isOver).toBe(true)
    expect(s.winner).toBe('B')
    expect(s.anita).toBe('A')
    expect(events[0]).toEqual({ type: 'eliminated', name: 'A', anita: true })
  })
  it('toUpload flags only the anita', () => {
    const { s } = run(mk(['A', 'B', 'C'], 2), pen('B'), pen('B'), { type: 'endEarly' })
    expect(toUpload(s, 'x', 1).players.map((p) => p.is_anita)).toEqual([false, true, false])
    const none = run(mk(), { type: 'endEarly' }).s
    expect(toUpload(none, 'x', 1).players.every((p) => p.is_anita === false)).toBe(true)
  })
  it('toUpload maps seats, scores, boer and ended_early', () => {
    const { s } = run(mk(), pen('Bob'), { type: 'boer', name: 'Charlie' }, { type: 'endEarly' })
    const u = toUpload(s, '123e4567-e89b-12d3-a456-426614174000', 7)
    expect(u.id).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(u.group_id).toBe(7)
    expect(u.players).toEqual([
      { name: 'Alice', final_score: 0, boer_count: 0, is_anita: false },
      { name: 'Bob', final_score: 1, boer_count: 0, is_anita: false },
      { name: 'Charlie', final_score: 0, boer_count: 1, is_anita: false },
    ])
    expect(u.ended_early).toBe(true)
    expect(u.winner).toBeNull()
    expect(u.duration_ms).toBe(60000)
    expect(u.max_penalty_points).toBe(5)
    expect(u.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
    const off = -new Date(T0).getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
    const mm = String(Math.abs(off) % 60).padStart(2, '0')
    expect(u.started_at.endsWith(`${sign}${hh}:${mm}`)).toBe(true)
    expect(new Date(u.started_at).getTime()).toBe(T0)
  })
})
