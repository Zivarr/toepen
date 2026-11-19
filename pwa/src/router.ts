import { useEffect, useState } from 'preact/hooks'

export interface Route {
  name: string
  params: Record<string, string>
}

const GROUPS: Route = { name: 'groups', params: {} }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0].replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c] = parts
  const n = parts.length
  if (n === 0) return GROUPS
  if (n === 1) {
    if (a === 'login') return { name: 'login', params: {} }
    if (a === 'game') return { name: 'game', params: {} }
    if (a === 'settings') return { name: 'settings', params: {} }
  }
  if (a === 'g' && b) {
    if (n === 2) return { name: 'group', params: { key: b } }
    if (n === 3 && c === 'setup') return { name: 'setup', params: { key: b } }
    if (n === 3 && c === 'results') return { name: 'results', params: { key: b } }
    if (n === 3 && c === 'stats') return { name: 'leaderboard', params: { key: b } }
  }
  if (a === 'admin') {
    if (n === 2 && b === 'users') return { name: 'adminUsers', params: {} }
    if (n === 2 && b === 'groups') return { name: 'adminGroups', params: {} }
    if (n === 2 && b === 'requests') return { name: 'adminRequests', params: {} }
    if (n === 2 && b === 'bin') return { name: 'adminBin', params: {} }
    if (n === 3 && b === 'requests' && c) return { name: 'adminRequest', params: { id: c } }
  }
  return GROUPS
}

export function navigate(path: string): void {
  location.hash = path.startsWith('#') ? path : '#' + path
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
