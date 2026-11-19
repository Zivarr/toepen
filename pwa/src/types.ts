// API shapes (snake_case as in JSON), per the Plan 1 API contract.
export interface User {
  id: number
  username: string
  is_admin: boolean
}
export interface Player {
  id: number
  name: string
  games_played: number
}
export interface GamePlayer {
  name: string
  final_score: number
  boer_count: number
}
export interface Game {
  id: string
  group_id: number
  recorded_by: string
  started_at: string
  duration_ms: number
  max_penalty_points: number
  ended_early: boolean
  winner: string | null
  players: GamePlayer[]
}
export interface Group {
  id: number
  name: string
  creator: string
  max_penalty_points: number
  players: Player[]
  games: Game[]
}
/** Game without recorded_by; group_id omitted inside sync requests. */
export type GameUpload = Omit<Game, 'recorded_by' | 'group_id'> & { group_id?: number }
export interface SyncRequest {
  id: number
  group_name: string
  source: 'pwa' | 'android'
  status: 'pending' | 'approved' | 'rejected'
  resolved_group_id: number | null
  reject_reason: string | null
  created_at: string
}

// Local types
export type GroupKey = `local:${string}` | `server:${number}`
export interface CachedGroup {
  key: GroupKey
  kind: 'local' | 'server'
  serverId?: number
  name: string
  creator: string
  maxPenaltyPoints: number
  playerNames: string[]
  pendingPlayers: string[]
  syncRequestId?: number
  syncStatus?: 'pending' | 'rejected'
  rejectReason?: string
}
export interface StoredGame extends Game {
  groupKey: GroupKey
}
export interface OutboxItem {
  id: string
  groupKey: GroupKey
  upload: GameUpload
  status: 'pending' | 'failed'
  reason?: string
}
export interface DeviceSettings {
  confirmPenalty: boolean
  showRematch: boolean
}
