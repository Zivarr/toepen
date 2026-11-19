import { useRoute } from './router'

const TITLES: Record<string, string> = {
  login: 'Inloggen',
  groups: 'Groepen',
  group: 'Groep',
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

export function App() {
  const route = useRoute()
  return (
    <main class="screen" data-route={route.name}>
      <h1>{TITLES[route.name] ?? 'Toepen'}</h1>
    </main>
  )
}
