import { admin } from '../../api/endpoints'
import { Button } from '../../components/Button'
import { toast } from '../../components/Toast'
import { refresh } from '../../sync/refresh'
import { AdminShell, attempt, formatDateTime, useAdminData } from './common'

export function Bin() {
  const { data, offline, error, reload } = useAdminData(async () => {
    const [games, groups] = await Promise.all([admin.deletedGames(), admin.listAdminGroups()])
    return { games, names: new Map(groups.map((g) => [g.id, g.name])) }
  })

  async function restore(id: string) {
    if (await attempt(() => admin.restoreGame(id))) {
      toast('Spel hersteld')
      void refresh().catch(() => {})
      void reload()
    }
  }

  return (
    <AdminShell title="Prullenbak" active="#/admin/bin" offline={offline} error={error} loaded={!!data} onRetry={() => void reload()}>
      {data && data.games.length === 0 && <p class="muted">De prullenbak is leeg.</p>}
      <ul class="list">
        {data?.games.map((g) => (
          <li key={g.id} class="card" data-testid="bin-row">
            <div class="result-head">
              <span class="group-name">{data.names.get(g.group_id) ?? `Groep ${g.group_id}`}</span>
              <span class="muted">{formatDateTime(g.started_at)}</span>
            </div>
            <p>{g.players.map((p) => p.name).join(', ')}</p>
            <p class="muted">
              Verwijderd door {g.deleted_by} op {formatDateTime(g.deleted_at)}
            </p>
            <Button variant="secondary" onClick={() => void restore(g.id)}>
              Herstellen
            </Button>
          </li>
        ))}
      </ul>
    </AdminShell>
  )
}
