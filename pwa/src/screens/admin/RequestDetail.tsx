import { useState } from 'preact/hooks'
import { admin, type MatchEntry } from '../../api/endpoints'
import { ApiError } from '../../api/client'
import { navigate } from '../../router'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { toast } from '../../components/Toast'
import { refresh } from '../../sync/refresh'
import { AdminShell, errorMessage, formatDateTime, groupPlayers, useAdminData, type SimplePlayer } from './common'
import { STATUS } from './Requests'

const RESOLVED_MSG = 'Dit verzoek is al afgehandeld'
const MATCH_LABEL = { exact: 'Bestaande speler', similar: 'Lijkt op', new: 'Nieuwe speler' } as const

export function RequestDetail({ id }: { id: string }) {
  const reqId = Number(id)
  const { data, offline, error, reload } = useAdminData(async () => {
    const [requests, groups] = await Promise.all([admin.listRequests(), admin.listAdminGroups()])
    return { req: requests.find((r) => r.id === reqId) ?? null, groups }
  }, [reqId])
  const [mode, setMode] = useState<'new' | 'link'>('new')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [matches, setMatches] = useState<MatchEntry[] | null>(null)
  const [options, setOptions] = useState<SimplePlayer[]>([])
  const [mapping, setMapping] = useState<Record<string, number | null>>({})
  const [loadingMatch, setLoadingMatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  async function pickGroup(gid: number | null) {
    setGroupId(gid)
    setMatches(null)
    if (!gid) return
    setLoadingMatch(true)
    try {
      const [ms, byGroup] = await Promise.all([admin.matching(reqId, gid), groupPlayers().catch(() => new Map<number, SimplePlayer[]>())])
      const opts = new Map<number, SimplePlayer>((byGroup.get(gid) ?? []).map((p) => [p.id, p]))
      for (const m of ms) {
        for (const s of m.suggestions) opts.set(s.id, { id: s.id, name: s.name })
        if (m.match === 'exact' && m.player_id != null && !opts.has(m.player_id)) opts.set(m.player_id, { id: m.player_id, name: m.name })
      }
      setOptions([...opts.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl')))
      setMapping(
        Object.fromEntries(
          ms.map((m) => [m.name, m.match === 'exact' ? m.player_id : m.match === 'similar' ? (m.suggestions[0]?.id ?? null) : null]),
        ),
      )
      setMatches(ms)
    } catch (e) {
      toast(errorMessage(e))
      setGroupId(null)
    } finally {
      setLoadingMatch(false)
    }
  }

  async function finish(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setBusy(false)
      if (e instanceof ApiError && e.status === 409) {
        toast(RESOLVED_MSG)
        navigate('#/admin/requests')
        return
      }
      toast(errorMessage(e))
      return
    }
    setBusy(false)
    toast(okMsg)
    await refresh().catch(() => {})
    navigate('#/admin/requests')
  }

  const req = data?.req
  const canApprove = req?.status === 'pending' && (mode === 'new' || (groupId != null && matches != null))

  return (
    <AdminShell title="Synchronisatieverzoek" active="#/admin/requests" offline={offline} error={error} loaded={!!data} onRetry={() => void reload()}>
      <p>
        <a class="back" href="#/admin/requests">
          ‹ Terug
        </a>
      </p>
      {!req ? (
        <p>Verzoek niet gevonden.</p>
      ) : (
        <>
          <div class="card">
            <p>
              <strong>{req.group_name}</strong> <span class="tag">{STATUS[req.status] ?? req.status}</span>
            </p>
            <p>Aangevraagd door: {req.requested_by}</p>
            <p>Bron: {req.source === 'android' ? 'Android-app' : 'Web-app'}</p>
            <p>
              {req.game_count} {req.game_count === 1 ? 'spel' : 'spellen'} · {formatDateTime(req.created_at)}
            </p>
            <p>Spelers: {req.player_names.join(', ') || '-'}</p>
            {req.reject_reason && <p class="muted">Reden afwijzing: {req.reject_reason}</p>}
          </div>

          {req.status === 'pending' && (
            <>
              <div class="card">
                <label class="toggle">
                  <input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} />
                  Nieuwe groep
                </label>
                <label class="toggle">
                  <input type="radio" name="mode" checked={mode === 'link'} onChange={() => setMode('link')} />
                  Koppelen aan bestaande groep
                </label>
                {mode === 'link' && (
                  <label>
                    Groep
                    <select class="select" name="target_group" value={groupId ?? ''} onChange={(e) => void pickGroup(Number(e.currentTarget.value) || null)}>
                      <option value="">Kies groep…</option>
                      {data!.groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.creator})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {mode === 'link' && loadingMatch && <p class="muted">Laden…</p>}
              {mode === 'link' && matches && (
                <div class="card" data-testid="mapping">
                  <h2>Spelers koppelen</h2>
                  {matches.map((m) => (
                    <label key={m.name}>
                      <span>
                        {m.name} <span class={`tag ${m.match === 'similar' ? 'tag-warn' : ''}`}>{MATCH_LABEL[m.match]}</span>
                      </span>
                      <select
                        class="select"
                        data-name={m.name}
                        value={mapping[m.name] ?? ''}
                        onChange={(e) => {
                          const v = e.currentTarget.value
                          setMapping({ ...mapping, [m.name]: v === '' ? null : Number(v) })
                        }}
                      >
                        <option value="">Nieuwe speler</option>
                        {options.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              <div class="stack">
                <Button
                  disabled={!canApprove || busy}
                  onClick={() =>
                    void finish(
                      () => (mode === 'new' ? admin.approveNew(reqId) : admin.approveLink(reqId, groupId!, mapping)),
                      'Verzoek goedgekeurd',
                    )
                  }
                >
                  Goedkeuren
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
                  Afwijzen
                </Button>
              </div>
            </>
          )}

          {rejecting && (
            <RejectDialog
              onClose={() => setRejecting(false)}
              onReject={(reason) => {
                setRejecting(false)
                void finish(() => admin.reject(reqId, reason), 'Verzoek afgewezen')
              }}
            />
          )}
        </>
      )}
    </AdminShell>
  )
}

function RejectDialog({ onClose, onReject }: { onClose: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog title="Verzoek afwijzen" onClose={onClose}>
      <label>
        Reden
        <input name="reason" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
      </label>
      <div class="dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          Annuleren
        </Button>
        <Button variant="danger" disabled={reason.trim() === ''} onClick={() => onReject(reason.trim())}>
          Afwijzen
        </Button>
      </div>
    </Dialog>
  )
}
