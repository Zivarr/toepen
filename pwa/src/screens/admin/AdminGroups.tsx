import { useState } from 'preact/hooks'
import { admin, type AdminGroup } from '../../api/endpoints'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { toast } from '../../components/Toast'
import { refresh } from '../../sync/refresh'
import { AdminShell, attempt, groupPlayers, useAdminData, type SimplePlayer } from './common'

type Action =
  | { kind: 'merge'; group: AdminGroup }
  | { kind: 'players'; group: AdminGroup }
  | { kind: 'delete'; group: AdminGroup; shortOnly: boolean }

export function AdminGroups() {
  const { data, offline, error, reload } = useAdminData(async () => {
    const [groups, users] = await Promise.all([admin.listAdminGroups(), admin.listUsers()])
    return { groups, users }
  })
  const [action, setAction] = useState<Action | null>(null)

  async function done(msg?: string) {
    setAction(null)
    if (msg) toast(msg)
    void refresh().catch(() => {})
    await reload()
  }

  async function removeMember(g: AdminGroup, userId: number) {
    if (await attempt(() => admin.removeMember(g.id, userId))) {
      void refresh().catch(() => {})
      void reload()
    }
  }

  async function addMember(g: AdminGroup, userId: number) {
    if (await attempt(() => admin.addMember(g.id, userId))) {
      void refresh().catch(() => {})
      void reload()
    }
  }

  return (
    <AdminShell title="Groepen beheren" active="#/admin/groups" offline={offline} error={error} loaded={!!data} onRetry={() => void reload()}>
      <ul class="list">
        {data?.groups.map((g) => {
          const candidates = data.users.filter((u) => !g.members.some((m) => m.id === u.id) && !u.disabled)
          return (
            <li key={g.id} class="card" data-testid="admin-group">
              <div class="result-head">
                <span class="group-name">
                  {g.name} ({g.creator})
                </span>
                <span class="tag">
                  {g.game_count} {g.game_count === 1 ? 'spel' : 'spellen'}
                </span>
              </div>
              <h2>Leden</h2>
              <ul class="plain">
                {g.members.map((m) => (
                  <li key={m.id} class="selected-row">
                    <span>{m.username}</span>
                    <button type="button" class="remove-btn" aria-label={`${m.username} verwijderen uit ${g.name}`} onClick={() => void removeMember(g, m.id)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {candidates.length > 0 && (
                <label>
                  Lid toevoegen
                  <select
                    class="select"
                    value=""
                    onChange={(e) => {
                      const v = Number(e.currentTarget.value)
                      e.currentTarget.value = ''
                      if (v) void addMember(g, v)
                    }}
                  >
                    <option value="">Kies gebruiker…</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div class="group-actions">
                <Button variant="secondary" onClick={() => setAction({ kind: 'merge', group: g })}>
                  Samenvoegen met…
                </Button>
                <Button variant="secondary" onClick={() => setAction({ kind: 'players', group: g })}>
                  Spelers samenvoegen
                </Button>
                <Button variant="danger" onClick={() => setAction({ kind: 'delete', group: g, shortOnly: false })}>
                  Alle spellen verwijderen
                </Button>
                <Button variant="danger" onClick={() => setAction({ kind: 'delete', group: g, shortOnly: true })}>
                  Korte spellen verwijderen (&lt; 1 min)
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {action?.kind === 'merge' && data && (
        <MergeGroup source={action.group} others={data.groups.filter((g) => g.id !== action.group.id)} onClose={() => setAction(null)} onDone={() => void done('Groepen samengevoegd')} />
      )}
      {action?.kind === 'players' && <MergePlayers group={action.group} onClose={() => setAction(null)} onDone={() => void done('Spelers samengevoegd')} />}
      {action?.kind === 'delete' && (
        <ConfirmDialog
          title={action.shortOnly ? 'Korte spellen verwijderen' : 'Alle spellen verwijderen'}
          message={
            action.shortOnly
              ? `Alle spellen korter dan 1 minuut in ${action.group.name} worden naar de prullenbak verplaatst.`
              : `Alle ${action.group.game_count} spellen in ${action.group.name} worden naar de prullenbak verplaatst.`
          }
          confirmLabel="Verwijderen"
          danger
          onCancel={() => setAction(null)}
          onConfirm={() => {
            const a = action
            void attempt(async () => {
              const n = await admin.deleteGroupGames(a.group.id, a.shortOnly)
              await done(`${n} ${n === 1 ? 'spel' : 'spellen'} verwijderd`)
            })
          }}
        />
      )}
    </AdminShell>
  )
}

function MergeGroup({ source, others, onClose, onDone }: { source: AdminGroup; others: AdminGroup[]; onClose: () => void; onDone: () => void }) {
  const [targetId, setTargetId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const target = others.find((g) => g.id === targetId)

  if (confirm && target) {
    return (
      <ConfirmDialog
        title="Groepen samenvoegen"
        message={`${source.name} wordt samengevoegd met ${target.name}. Alle spellen en spelers van ${source.name} gaan naar ${target.name}.`}
        confirmLabel="Samenvoegen"
        danger
        onCancel={onClose}
        onConfirm={() => void attempt(() => admin.mergeGroups(source.id, target.id)).then((ok) => ok && onDone())}
      />
    )
  }
  return (
    <Dialog title={`${source.name} samenvoegen met…`} onClose={onClose}>
      <label>
        Doelgroep
        <select class="select" value={targetId ?? ''} onChange={(e) => setTargetId(Number(e.currentTarget.value) || null)}>
          <option value="">Kies groep…</option>
          {others.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.creator})
            </option>
          ))}
        </select>
      </label>
      <div class="dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          Annuleren
        </Button>
        <Button disabled={!target} onClick={() => setConfirm(true)}>
          Verder
        </Button>
      </div>
    </Dialog>
  )
}

function MergePlayers({ group, onClose, onDone }: { group: AdminGroup; onClose: () => void; onDone: () => void }) {
  const { data: players, offline, error } = useAdminData(async () => (await groupPlayers()).get(group.id) ?? [])
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const source = players?.find((p) => p.id === sourceId)
  const target = players?.find((p) => p.id === targetId)

  if (confirm && source && target) {
    return (
      <ConfirmDialog
        title="Spelers samenvoegen"
        message={`${source.name} wordt samengevoegd met ${target.name} in ${group.name}. De naam ${source.name} verdwijnt; alle spellen komen onder ${target.name}.`}
        confirmLabel="Samenvoegen"
        danger
        onCancel={onClose}
        onConfirm={() => void attempt(() => admin.mergePlayers(source.id, target.id)).then((ok) => ok && onDone())}
      />
    )
  }

  const picker = (label: string, value: number | null, set: (n: number | null) => void, list: SimplePlayer[]) => (
    <label>
      {label}
      <select class="select" value={value ?? ''} onChange={(e) => set(Number(e.currentTarget.value) || null)}>
        <option value="">Kies speler…</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <Dialog title={`Spelers samenvoegen in ${group.name}`} onClose={onClose}>
      {offline ? (
        <p>Beheer werkt alleen met internet</p>
      ) : error ? (
        <p class="error">{error}</p>
      ) : !players ? (
        <p class="muted">Laden…</p>
      ) : (
        <>
          {picker('Samenvoegen (verdwijnt)', sourceId, setSourceId, players)}
          {picker('Met (blijft bestaan)', targetId, setTargetId, players.filter((p) => p.id !== sourceId))}
        </>
      )}
      <div class="dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          Annuleren
        </Button>
        <Button disabled={!source || !target || source.id === target.id} onClick={() => setConfirm(true)}>
          Verder
        </Button>
      </div>
    </Dialog>
  )
}
