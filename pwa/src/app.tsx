import { useEffect, useRef, useState } from 'preact/hooks'
import { useRegisterSW } from 'virtual:pwa-register/preact'
import { navigate, PUBLIC_ROUTES, useRoute } from './router'
import { clearAuth, getCurrentGame, getToken, getUser } from './storage/repo'
import { setUnauthorizedHandler } from './api/client'
import { outboxCounts } from './sync/outbox'
import { startTriggers } from './sync/triggers'
import type { User } from './types'
import { Login } from './screens/Login'
import { Welcome } from './screens/Welcome'
import { Groups } from './screens/Groups'
import { GroupHome } from './screens/GroupHome'
import { PlayerSetup } from './screens/PlayerSetup'
import { Game } from './screens/Game'
import { Results } from './screens/Results'
import { Leaderboard } from './screens/Leaderboard'
import { Settings } from './screens/Settings'
import { Users } from './screens/admin/Users'
import { AdminGroups } from './screens/admin/AdminGroups'
import { Requests } from './screens/admin/Requests'
import { RequestDetail } from './screens/admin/RequestDetail'
import { Bin } from './screens/admin/Bin'
import { ToastHost } from './components/Toast'

const TITLES: Record<string, string> = {
  setup: 'Spelers kiezen',
  game: 'Spel',
  results: 'Resultaten',
  leaderboard: 'Ranglijst',
  settings: 'Instellingen',
  adminUsers: 'Gebruikers',
  adminGroups: 'Groepen beheren',
  adminRequests: 'Synchronisatieverzoeken',
  adminRequest: 'Synchronisatieverzoek',
  adminBin: 'Prullenbak',
}

setUnauthorizedHandler(() => {
  void clearAuth().then(() => navigate('#/login'))
})

export function badgeText(n: number): string {
  return n === 1 ? '1 wacht op upload' : `${n} wachten op upload`
}

export function App() {
  const route = useRoute()
  // A new service worker must never reload the page during a game (e.g. another tab tapped "vernieuwen"):
  // postpone the reload until the user leaves the game screen.
  const routeRef = useRef(route.name)
  routeRef.current = route.name
  const reloadPending = useRef(false)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload() {
      if (routeRef.current === 'game') reloadPending.current = true
      else window.location.reload()
    },
  })
  useEffect(() => {
    if (reloadPending.current && route.name !== 'game') window.location.reload()
  }, [route.name])
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [user, setUserState] = useState<User | null>(null)
  const [pending, setPending] = useState(0)
  const [hasGame, setHasGame] = useState(false)

  // Re-check auth on every route change (login and logout both navigate).
  useEffect(() => {
    void Promise.all([getToken(), getUser()]).then(([t, u]) => {
      setAuthed(!!t)
      setUserState(u)
      if (!t && !PUBLIC_ROUTES.includes(route.name)) navigate('#/login')
      else if (t) startTriggers()
    })
  }, [route.name])

  useEffect(() => {
    const load = () => {
      void outboxCounts().then((c) => setPending(c.pending))
      void getCurrentGame().then((g) => setHasGame(g !== null))
    }
    load()
    window.addEventListener('toepen:sync', load)
    return () => window.removeEventListener('toepen:sync', load)
  }, [route.name, route.params.key])

  if (authed === null) return null
  if (route.name === 'login' || route.name === 'welkom') {
    return (
      <>
        {route.name === 'login' ? <Login /> : <Welcome code={route.params.code} />}
        <ToastHost />
      </>
    )
  }
  if (!authed) return null

  let screen
  if (route.name === 'groups') screen = <Groups />
  else if (route.name === 'group') screen = <GroupHome groupKey={route.params.key} />
  else if (route.name === 'setup') screen = <PlayerSetup groupKey={route.params.key} />
  else if (route.name === 'game') screen = <Game />
  else if (route.name === 'results') screen = <Results groupKey={route.params.key} />
  else if (route.name === 'leaderboard') screen = <Leaderboard groupKey={route.params.key} />
  else if (route.name === 'settings') screen = <Settings />
  else if (route.name === 'adminUsers') screen = <Users />
  else if (route.name === 'adminGroups') screen = <AdminGroups />
  else if (route.name === 'adminRequests') screen = <Requests />
  else if (route.name === 'adminRequest') screen = <RequestDetail id={route.params.id} />
  else if (route.name === 'adminBin') screen = <Bin />
  else
    screen = (
      <main class="screen" data-route={route.name}>
        <h1>{TITLES[route.name] ?? 'Toepen'}</h1>
      </main>
    )

  return (
    <>
      <header class="app-header">
        <a class="app-title" href="#/">
          Toepen
        </a>
        <span class="spacer" />
        {pending > 0 && <span class="badge">{badgeText(pending)}</span>}
        {user?.is_admin && (
          <a class="header-link" href="#/admin/requests">
            Beheer
          </a>
        )}
        <a class="header-link" href="#/settings">
          Instellingen
        </a>
      </header>
      {needRefresh && route.name !== 'game' && (
        <button type="button" class="update-banner" onClick={() => void updateServiceWorker(true)}>
          Nieuwe versie beschikbaar – vernieuwen
        </button>
      )}
      {hasGame && route.name !== 'game' && (
        <a class="resume-banner" href="#/game">
          Ga verder met spel
        </a>
      )}
      {screen}
      <ToastHost />
    </>
  )
}
