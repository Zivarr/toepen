import type { GameUpload } from '../types'

type Snapshot = { scores: Record<string, number>; boer: Record<string, number>; anita: string | null }

export interface GameState {
  players: string[]
  maxPenaltyPoints: number
  startedAt: number
  scores: Record<string, number>
  boer: Record<string, number>
  roundPoints: number
  history: Snapshot[]
  isOver: boolean
  endedEarly: boolean
  winner: string | null
  anita: string | null
  durationMs: number
}

export type Action =
  | { type: 'klop' }
  | { type: 'penalty' | 'fold' | 'boer'; name: string }
  | { type: 'undo' }
  | { type: 'nextRound' }
  | { type: 'endEarly' }

export type GameEvent =
  | { type: 'eliminated'; name: string; anita: boolean }
  | { type: 'gameOver'; winner: string | null }
  | { type: 'undoEmpty' }

export function newGame(players: string[], maxPenaltyPoints: number, now: number): GameState {
  const zero = () => Object.fromEntries(players.map((p) => [p, 0]))
  return {
    players: [...players],
    maxPenaltyPoints,
    startedAt: now,
    scores: zero(),
    boer: zero(),
    roundPoints: 1,
    history: [],
    isOver: false,
    endedEarly: false,
    winner: null,
    anita: null,
    durationMs: 0,
  }
}

export function isEliminated(s: GameState, name: string): boolean {
  return (s.scores[name] ?? 0) >= s.maxPenaltyPoints
}

// A game persisted before the Anita existed has no anita field. Derive it from
// who is already out: none -> null, one -> that player, more -> '' (unknown,
// never equals a name and is not null, so nobody becomes the Anita).
function currentAnita(s: GameState): string | null {
  if (s.anita !== undefined) return s.anita
  const out = s.players.filter((p) => isEliminated(s, p))
  return out.length === 0 ? null : out.length === 1 ? out[0] : ''
}

export function apply(s: GameState, a: Action, now: number): { state: GameState; events: GameEvent[] } {
  const ignore = { state: s, events: [] as GameEvent[] }
  if (s.isOver) return ignore

  switch (a.type) {
    case 'klop':
      return { state: { ...s, roundPoints: s.roundPoints + 1 }, events: [] }
    case 'nextRound':
      return { state: { ...s, roundPoints: 1, history: [] }, events: [] }
    case 'undo': {
      if (s.history.length === 0) return { state: s, events: [{ type: 'undoEmpty' }] }
      const prev = s.history[s.history.length - 1]
      return { state: { ...s, ...prev, history: s.history.slice(0, -1) }, events: [] }
    }
    case 'endEarly':
      return {
        state: { ...s, isOver: true, endedEarly: true, winner: null, durationMs: now - s.startedAt },
        events: [{ type: 'gameOver', winner: null }],
      }
    case 'penalty':
    case 'fold':
    case 'boer': {
      if (!Object.hasOwn(s.scores, a.name) || isEliminated(s, a.name)) return ignore
      const cur = s.scores[a.name]
      const max = s.maxPenaltyPoints
      let score = cur
      const boer = { ...s.boer }
      if (a.type === 'penalty') score = Math.min(max, cur + s.roundPoints)
      else if (a.type === 'fold') score = Math.min(max, cur + s.roundPoints - 1)
      else {
        score = Math.max(0, cur - 1)
        boer[a.name] = (boer[a.name] ?? 0) + 1
      }
      const knockedOut = score >= max
      const anita = currentAnita(s)
      const firstOut = knockedOut && anita === null
      const next: GameState = {
        ...s,
        scores: { ...s.scores, [a.name]: score },
        boer,
        anita: firstOut ? a.name : anita,
        history: [...s.history, { scores: s.scores, boer: s.boer, anita }],
      }
      const events: GameEvent[] = []
      if (knockedOut) events.push({ type: 'eliminated', name: a.name, anita: firstOut })
      const alive = next.players.filter((p) => !isEliminated(next, p))
      if (alive.length <= 1) {
        const winner = alive[0] ?? null
        events.push({ type: 'gameOver', winner })
        return { state: { ...next, isOver: true, winner, durationMs: now - s.startedAt }, events }
      }
      return { state: next, events }
    }
  }
}

function isoLocal(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  )
}

export function toUpload(s: GameState, id: string, groupId: number): GameUpload {
  return {
    id,
    group_id: groupId,
    started_at: isoLocal(s.startedAt),
    duration_ms: s.durationMs,
    max_penalty_points: s.maxPenaltyPoints,
    ended_early: s.endedEarly,
    winner: s.winner,
    players: s.players.map((name) => ({
      name,
      final_score: s.scores[name],
      boer_count: s.boer[name] ?? 0,
      is_anita: s.anita === name,
    })),
  }
}
