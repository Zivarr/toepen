import { admin } from '../../api/endpoints'
import { AdminShell, formatDateTime, useAdminData } from './common'

export const STATUS: Record<string, string> = { pending: 'In behandeling', approved: 'Goedgekeurd', rejected: 'Afgewezen' }

export function Requests() {
  const { data, offline, error, reload } = useAdminData(() => admin.listRequests())
  return (
    <AdminShell title="Synchronisatieverzoeken" active="#/admin/requests" offline={offline} error={error} loaded={!!data} onRetry={() => void reload()}>
      {data && data.length === 0 && <p class="muted">Geen verzoeken.</p>}
      <ul class="list">
        {data?.map((r) => (
          <li key={r.id} class="card" data-testid="request-row">
            <a class="group-link" href={`#/admin/requests/${r.id}`}>
              <span>
                <span class="group-name">{r.group_name}</span>
                <br />
                <span class="muted">
                  {r.requested_by} · {r.game_count} {r.game_count === 1 ? 'spel' : 'spellen'} · {formatDateTime(r.created_at)}
                </span>
              </span>
              <span class={`tag ${r.status === 'rejected' ? 'tag-bad' : r.status === 'pending' ? 'tag-warn' : ''}`}>
                {STATUS[r.status] ?? r.status}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </AdminShell>
  )
}
