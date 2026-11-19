import { describe, expect, it } from 'vitest'
import { parseRoute } from '../../src/router'

describe('parseRoute', () => {
  it('parses setup with a server key', () => {
    expect(parseRoute('#/g/server:12/setup')).toEqual({ name: 'setup', params: { key: 'server:12' } })
  })
  it('maps empty and root to groups', () => {
    expect(parseRoute('')).toEqual({ name: 'groups', params: {} })
    expect(parseRoute('#/')).toEqual({ name: 'groups', params: {} })
  })
  it('parses admin request id', () => {
    expect(parseRoute('#/admin/requests/7')).toEqual({ name: 'adminRequest', params: { id: '7' } })
  })
  it('falls back to groups for unknown routes', () => {
    expect(parseRoute('#/onzin')).toEqual({ name: 'groups', params: {} })
  })
  it('parses the remaining routes', () => {
    expect(parseRoute('#/login').name).toBe('login')
    expect(parseRoute('#/g/local:abc').name).toBe('group')
    expect(parseRoute('#/game').name).toBe('game')
    expect(parseRoute('#/g/local:abc/results').name).toBe('results')
    expect(parseRoute('#/g/local:abc/stats').name).toBe('leaderboard')
    expect(parseRoute('#/settings').name).toBe('settings')
    expect(parseRoute('#/admin/users').name).toBe('adminUsers')
    expect(parseRoute('#/admin/groups').name).toBe('adminGroups')
    expect(parseRoute('#/admin/requests').name).toBe('adminRequests')
    expect(parseRoute('#/admin/bin').name).toBe('adminBin')
  })

  it('falls back to groups on a malformed percent-encoding', () => {
    expect(parseRoute('#/g/%E0%A4%A')).toEqual({ name: 'groups', params: {} })
  })
})
