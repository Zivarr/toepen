import { useState } from 'preact/hooks'
import { admin, type AdminUser, type PasswordLink } from '../../api/endpoints'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { toast } from '../../components/Toast'
import { ShareLinkDialog } from '../../components/ShareLinkDialog'
import { AdminShell, attempt, formatDateTime, useAdminData } from './common'

export function Users() {
  const { data, offline, error, reload } = useAdminData(() => admin.listUsers())
  const [creating, setCreating] = useState(false)
  const [resetFor, setResetFor] = useState<AdminUser | null>(null)
  const [revokeFor, setRevokeFor] = useState<AdminUser | null>(null)
  const [shared, setShared] = useState<{ username: string; link: PasswordLink } | null>(null)

  async function newLink(u: AdminUser) {
    let link: PasswordLink | null = null
    if (await attempt(async () => (link = await admin.passwordLink(u.id)))) {
      setShared({ username: u.username, link: link! })
      void reload()
    }
  }

  async function toggleDisabled(u: AdminUser) {
    if (await attempt(() => admin.updateUser(u.id, { disabled: !u.disabled }))) void reload()
  }

  return (
    <AdminShell title="Gebruikers" active="#/admin/users" offline={offline} error={error} loaded={!!data} onRetry={() => void reload()}>
      <div class="stack">
        <Button onClick={() => setCreating(true)}>Gebruiker toevoegen</Button>
      </div>
      <ul class="list">
        {data?.map((u) => (
          <li key={u.id} class="card" data-testid="user-row">
            <div class="result-head">
              <span class="group-name">{u.username}</span>
              <span>
                {u.is_admin && <span class="tag">Admin</span>} {u.disabled && <span class="tag tag-bad">Uitgeschakeld</span>}
              </span>
            </div>
            <p class="muted">
              {u.invite_pending ? 'Uitnodiging open' : `Laatst gebruikt: ${formatDateTime(u.last_used_at)}`}
            </p>
            <div class="group-actions">
              <Button variant="secondary" onClick={() => void newLink(u)}>
                Nieuwe link
              </Button>
              <Button variant="secondary" onClick={() => setResetFor(u)}>
                Wachtwoord resetten
              </Button>
              <Button variant="secondary" onClick={() => void toggleDisabled(u)}>
                {u.disabled ? 'Inschakelen' : 'Uitschakelen'}
              </Button>
              <Button variant="secondary" onClick={() => setRevokeFor(u)}>
                Uitloggen op alle apparaten
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {creating && (
        <CreateUser
          onClose={() => setCreating(false)}
          onDone={(created) => {
            setCreating(false)
            if (created) setShared(created)
            void reload()
          }}
        />
      )}
      {shared && <ShareLinkDialog username={shared.username} link={shared.link} onClose={() => setShared(null)} />}
      {resetFor && (
        <ResetPassword
          user={resetFor}
          onClose={() => setResetFor(null)}
          onDone={() => {
            setResetFor(null)
            toast('Wachtwoord gewijzigd')
          }}
        />
      )}
      {revokeFor && (
        <ConfirmDialog
          title="Uitloggen op alle apparaten"
          message={`${revokeFor.username} wordt op alle apparaten uitgelogd.`}
          confirmLabel="Uitloggen"
          danger
          onCancel={() => setRevokeFor(null)}
          onConfirm={() => {
            const u = revokeFor
            setRevokeFor(null)
            void attempt(() => admin.revokeTokens(u.id)).then((ok) => ok && toast(`${u.username} is uitgelogd`))
          }}
        />
      )}
    </AdminShell>
  )
}

function CreateUser({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (created: { username: string; link: PasswordLink } | null) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const valid = /^[A-Za-z0-9._-]{3,30}$/.test(username.trim()) && (password === '' || password.length >= 8)

  async function submit(e: Event) {
    e.preventDefault()
    setBusy(true)
    let link: PasswordLink | undefined
    const name = username.trim()
    const ok = await attempt(async () => ({ link } = await admin.createUser(name, password, isAdmin)), {
      username_taken: 'Gebruikersnaam bestaat al',
    })
    setBusy(false)
    if (ok) onDone(link ? { username: name, link } : null)
  }

  return (
    <Dialog title="Gebruiker toevoegen" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Gebruikersnaam
          <input name="username" autocomplete="off" value={username} onInput={(e) => setUsername(e.currentTarget.value)} />
        </label>
        <p class="muted">3-30 tekens: letters, cijfers, punt, streepje of underscore</p>
        <label>
          Wachtwoord
          <input name="password" type="password" autocomplete="new-password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
        </label>
        <p class="muted">Leeg laten om een uitnodigingslink te maken (anders minimaal 8 tekens)</p>
        <label class="toggle">
          <input type="checkbox" name="is_admin" checked={isAdmin} onChange={(e) => setIsAdmin(e.currentTarget.checked)} />
          Beheerder
        </label>
        <div class="dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={!valid || busy}>
            Toevoegen
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function ResetPassword({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    setBusy(true)
    const ok = await attempt(() => admin.updateUser(user.id, { password }))
    setBusy(false)
    if (ok) onDone()
  }

  return (
    <Dialog title={`Wachtwoord resetten: ${user.username}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Nieuw wachtwoord
          <input name="new_password" type="password" autocomplete="new-password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
        </label>
        <p class="muted">Minimaal 8 tekens. Bestaande sessies blijven actief.</p>
        <div class="dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={password.length < 8 || busy}>
            Opslaan
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
