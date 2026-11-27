import { request } from './client'
import type { ApiSeason, Game, GameUpload, Group, Player, SyncRequest, User } from '../types'

export function deviceName(ua: string = navigator.userAgent): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  return 'Browser'
}

export type AdminUser = User & { disabled: boolean; last_used_at: string | null; invite_pending: boolean }
export interface LinkInfo { username: string; purpose: 'invite' | 'reset'; expires_at: string }
export interface PasswordLink { code: string; purpose: 'invite' | 'reset'; expires_at: string }
export type SeasonState = { first_season_name: string | null; seasons: ApiSeason[] }
export type AdminGroup = {
  id: number
  name: string
  creator: string
  members: User[]
  game_count: number
  first_season_name: string | null
  seasons: ApiSeason[]
}
export type AdminSyncRequest = SyncRequest & { requested_by: string; game_count: number; player_names: string[] }
export type MatchEntry = {
  name: string
  match: 'exact' | 'similar' | 'new'
  player_id: number | null
  suggestions: Player[]
}
export type DeletedGame = Game & { deleted_at: string; deleted_by: string }

export async function login(username: string, password: string, device: string = deviceName()) {
  const r = await request<{ token: string; user: User }>('POST', '/login', { username, password, device_name: device })
  return r.data!
}

export async function logout(): Promise<void> {
  await request('POST', '/logout')
}

export async function linkInfo(code: string): Promise<LinkInfo> {
  // The code goes in the body, never in the URL path, so it stays out of server access logs.
  return (await request<LinkInfo>('POST', '/password-links/lookup', { code })).data!
}

export async function redeemLink(code: string, password: string): Promise<{ token: string; user: User }> {
  const r = await request<{ token: string; user: User }>('POST', '/password-links/redeem', {
    code,
    password,
    device_name: deviceName(),
  })
  return r.data!
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request('POST', '/me/password', { current_password: currentPassword, new_password: newPassword })
}

export async function me(): Promise<User> {
  return (await request<{ user: User }>('GET', '/me')).data!.user
}

export async function fetchGroups(
  etag?: string,
): Promise<{ notModified: true } | { notModified: false; groups: Group[]; etag: string }> {
  const r = await request<{ groups: Group[] }>('GET', '/groups', undefined, { etag })
  if (r.status === 304) return { notModified: true }
  return { notModified: false, groups: r.data!.groups, etag: r.etag ?? '' }
}

export async function patchGroup(groupId: number, maxPenaltyPoints: number): Promise<Group> {
  const r = await request<{ group: Group }>('PATCH', `/groups/${groupId}`, { max_penalty_points: maxPenaltyPoints })
  return r.data!.group
}

export async function addPlayer(groupId: number, name: string): Promise<Player> {
  return (await request<{ player: Player }>('POST', '/players', { group_id: groupId, name })).data!.player
}

export async function uploadGame(g: GameUpload): Promise<{ game: Game; duplicate: boolean }> {
  const r = await request<{ game: Game; duplicate?: boolean }>('POST', '/games', g)
  return { game: r.data!.game, duplicate: r.status === 200 && r.data!.duplicate === true }
}

export async function deleteGame(id: string): Promise<void> {
  await request('DELETE', `/games/${id}`)
}

export async function createSyncRequest(groupName: string, games: GameUpload[]): Promise<SyncRequest> {
  const stripped = games.map(({ group_id: _groupId, ...rest }) => rest)
  const r = await request<{ request: SyncRequest }>('POST', '/sync-requests', {
    source: 'pwa',
    group_name: groupName,
    games: stripped,
  })
  return r.data!.request
}

export async function mySyncRequests(): Promise<SyncRequest[]> {
  return (await request<{ requests: SyncRequest[] }>('GET', '/sync-requests/mine')).data!.requests
}

type Req = { request: SyncRequest }

export const admin = {
  async listUsers(): Promise<AdminUser[]> {
    return (await request<{ users: AdminUser[] }>('GET', '/admin/users')).data!.users
  },
  /** Without a password (null or '') the server creates an invite link. */
  async createUser(
    username: string,
    password: string | null,
    isAdmin: boolean,
  ): Promise<{ user: AdminUser; link?: PasswordLink }> {
    const body: Record<string, unknown> = { username, is_admin: isAdmin }
    if (password) body.password = password
    return (await request<{ user: AdminUser; link?: PasswordLink }>('POST', '/admin/users', body)).data!
  },
  async passwordLink(userId: number): Promise<PasswordLink> {
    return (await request<{ link: PasswordLink }>('POST', `/admin/users/${userId}/password-link`)).data!.link
  },
  async updateUser(id: number, patch: { password?: string; disabled?: boolean; is_admin?: boolean }): Promise<User> {
    return (await request<{ user: User }>('PATCH', `/admin/users/${id}`, patch)).data!.user
  },
  async revokeTokens(id: number): Promise<void> {
    await request('POST', `/admin/users/${id}/revoke-tokens`)
  },
  async listAdminGroups(): Promise<AdminGroup[]> {
    return (await request<{ groups: AdminGroup[] }>('GET', '/admin/groups')).data!.groups
  },
  async addMember(groupId: number, userId: number): Promise<void> {
    await request('POST', `/admin/groups/${groupId}/members`, { user_id: userId })
  },
  async removeMember(groupId: number, userId: number): Promise<void> {
    await request('DELETE', `/admin/groups/${groupId}/members/${userId}`)
  },
  async mergeGroups(sourceGroupId: number, targetGroupId: number): Promise<Group> {
    const r = await request<{ group: Group }>('POST', '/admin/groups/merge', {
      source_group_id: sourceGroupId,
      target_group_id: targetGroupId,
    })
    return r.data!.group
  },
  /** Without starts_at the season starts now. */
  async startSeason(groupId: number, body: { name?: string | null; starts_at?: string }): Promise<SeasonState> {
    return (await request<SeasonState>('POST', `/admin/groups/${groupId}/seasons`, body)).data!
  },
  async updateSeason(id: number, body: { name?: string | null; starts_at?: string }): Promise<SeasonState> {
    return (await request<SeasonState>('PATCH', `/admin/seasons/${id}`, body)).data!
  },
  async deleteSeason(id: number): Promise<SeasonState> {
    return (await request<SeasonState>('DELETE', `/admin/seasons/${id}`)).data!
  },
  /** Season 1 has no row; an empty name resets it to the default. */
  async renameFirstSeason(groupId: number, name: string | null): Promise<SeasonState> {
    return (await request<SeasonState>('PATCH', `/admin/groups/${groupId}/first-season`, { name })).data!
  },
  async mergePlayers(sourcePlayerId: number, targetPlayerId: number): Promise<void> {
    await request('POST', '/admin/players/merge', {
      source_player_id: sourcePlayerId,
      target_player_id: targetPlayerId,
    })
  },
  async listRequests(): Promise<AdminSyncRequest[]> {
    return (await request<{ requests: AdminSyncRequest[] }>('GET', '/admin/sync-requests')).data!.requests
  },
  async matching(id: number, groupId: number): Promise<MatchEntry[]> {
    const r = await request<{ matches: MatchEntry[] }>('GET', `/admin/sync-requests/${id}/matching?group_id=${groupId}`)
    return r.data!.matches
  },
  async approveNew(id: number): Promise<SyncRequest> {
    return (await request<Req>('POST', `/admin/sync-requests/${id}/approve`, { mode: 'new' })).data!.request
  },
  async approveLink(id: number, groupId: number, mapping: Record<string, number | null>): Promise<SyncRequest> {
    const r = await request<Req>('POST', `/admin/sync-requests/${id}/approve`, {
      mode: 'link',
      group_id: groupId,
      mapping,
    })
    return r.data!.request
  },
  async reject(id: number, reason: string): Promise<SyncRequest> {
    return (await request<Req>('POST', `/admin/sync-requests/${id}/reject`, { reason })).data!.request
  },
  async deletedGames(): Promise<DeletedGame[]> {
    return (await request<{ games: DeletedGame[] }>('GET', '/admin/games/deleted')).data!.games
  },
  async restoreGame(id: string): Promise<void> {
    await request('POST', `/admin/games/${id}/restore`)
  },
  async deleteGroupGames(groupId: number, shortOnly: boolean): Promise<number> {
    const r = await request<{ deleted: number }>('POST', `/admin/groups/${groupId}/delete-games`, {
      short_only: shortOnly,
    })
    return r.data!.deleted
  },
  async exportAll(): Promise<unknown> {
    return (await request<unknown>('GET', '/admin/export')).data
  },
}
