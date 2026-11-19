import { useEffect, useState } from 'preact/hooks'
import { createLocalGroup, deleteLocalGroup, getGroups, renameLocalGroup } from '../storage/repo'
import { requestSync } from '../sync/requests'
import { NetworkError } from '../api/client'
import type { CachedGroup } from '../types'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { toast } from '../components/Toast'

export function groupLabel(g: CachedGroup): string {
  if (g.kind === 'server') return ''
  if (g.syncStatus === 'pending') return 'Wacht op goedkeuring'
  if (g.syncStatus === 'rejected') return `Afgewezen: ${g.rejectReason ?? ''}`.trim()
  return 'Lokaal'
}

export function displayName(g: CachedGroup, all: CachedGroup[]): string {
  const dup = all.some((o) => o.key !== g.key && o.name.toLowerCase() === g.name.toLowerCase())
  return dup && g.creator ? `${g.name} (${g.creator})` : g.name
}

type Modal =
  | { kind: 'new' }
  | { kind: 'rename'; group: CachedGroup }
  | { kind: 'delete'; group: CachedGroup }
  | { kind: 'sync'; group: CachedGroup }

export function Groups() {
  const [groups, setGroups] = useState<CachedGroup[]>([])
  const [modal, setModal] = useState<Modal | null>(null)
  const [name, setName] = useState('')
  const [max, setMax] = useState('10')

  const load = () => void getGroups().then((g) => setGroups(g.sort((a, b) => a.name.localeCompare(b.name))))
  useEffect(() => {
    load()
    window.addEventListener('toepen:sync', load)
    return () => window.removeEventListener('toepen:sync', load)
  }, [])

  function open(m: Modal) {
    setName(m.kind === 'rename' ? m.group.name : '')
    setMax('10')
    setModal(m)
  }

  async function submitNew(e: Event) {
    e.preventDefault()
    const n = name.trim()
    const m = Number.parseInt(max, 10)
    if (!n || !(m >= 1)) return
    await createLocalGroup(n, m)
    setModal(null)
    load()
  }

  async function submitRename(e: Event) {
    e.preventDefault()
    const n = name.trim()
    if (!n || modal?.kind !== 'rename') return
    await renameLocalGroup(modal.group.key, n)
    setModal(null)
    load()
  }

  async function confirmDelete() {
    if (modal?.kind !== 'delete') return
    await deleteLocalGroup(modal.group.key)
    setModal(null)
    load()
  }

  async function confirmSync() {
    if (modal?.kind !== 'sync') return
    const key = modal.group.key
    setModal(null)
    try {
      await requestSync(key)
    } catch (e) {
      toast(e instanceof NetworkError ? 'Geen verbinding met de server' : 'Synchronisatie aanvragen is mislukt')
    }
    load()
  }

  return (
    <main class="screen">
      <h1>Groepen</h1>
      {groups.length === 0 && <p class="muted">Nog geen groepen.</p>}
      <ul class="list">
        {groups.map((g) => {
          const label = groupLabel(g)
          return (
            <li key={g.key} class="card group-item">
              <a class="group-link" href={`#/g/${g.key}`}>
                <span class="group-name">{displayName(g, groups)}</span>
                {label && <span class={`tag ${g.syncStatus === 'rejected' ? 'tag-bad' : ''}`}>{label}</span>}
              </a>
              {g.kind === 'local' && (
                <div class="group-actions">
                  <label class="toggle">
                    <input
                      type="checkbox"
                      checked={g.syncStatus === 'pending'}
                      disabled={g.syncStatus === 'pending'}
                      onChange={() => open({ kind: 'sync', group: g })}
                    />
                    Synchroniseren met server
                  </label>
                  <Button variant="ghost" onClick={() => open({ kind: 'rename', group: g })}>
                    Hernoemen
                  </Button>
                  <Button variant="ghost" onClick={() => open({ kind: 'delete', group: g })}>
                    Verwijderen
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Button onClick={() => open({ kind: 'new' })}>Nieuwe groep</Button>

      {modal?.kind === 'new' && (
        <Dialog title="Nieuwe groep" onClose={() => setModal(null)}>
          <form onSubmit={submitNew}>
            <label>
              Naam
              <input name="name" value={name} onInput={(e) => setName(e.currentTarget.value)} required />
            </label>
            <label>
              Max strafpunten
              <input
                name="max"
                type="number"
                inputMode="numeric"
                min="1"
                value={max}
                onInput={(e) => setMax(e.currentTarget.value)}
                required
              />
            </label>
            <div class="dialog-actions">
              <Button variant="ghost" onClick={() => setModal(null)}>
                Annuleren
              </Button>
              <Button type="submit">Aanmaken</Button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'rename' && (
        <Dialog title="Groep hernoemen" onClose={() => setModal(null)}>
          <form onSubmit={submitRename}>
            <label>
              Naam
              <input name="name" value={name} onInput={(e) => setName(e.currentTarget.value)} required />
            </label>
            <div class="dialog-actions">
              <Button variant="ghost" onClick={() => setModal(null)}>
                Annuleren
              </Button>
              <Button type="submit">Opslaan</Button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === 'delete' && (
        <ConfirmDialog
          title="Groep verwijderen"
          message={`"${modal.group.name}" en alle spellen daarin verwijderen?`}
          confirmLabel="Verwijderen"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.kind === 'sync' && (
        <ConfirmDialog
          title="Synchroniseren met server"
          message="De beheerder moet dit goedkeuren. Daarna worden de spellen van deze groep met de server gedeeld."
          confirmLabel="Aanvragen"
          onConfirm={() => void confirmSync()}
          onCancel={() => setModal(null)}
        />
      )}
    </main>
  )
}
