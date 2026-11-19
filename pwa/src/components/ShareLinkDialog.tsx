import type { PasswordLink } from '../api/endpoints'
import { formatDateTime } from '../screens/admin/common'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { toast } from './Toast'
import { linkUrl, shareLinkText } from './shareLinkText'

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast('Gekopieerd')
  } catch {
    toast('Kopiëren is niet mogelijk')
  }
}

async function share(text: string): Promise<void> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text })
      return
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
  }
  await copy(text)
}

/** Shows a fresh invite/reset link with Delen and Kopiëren. */
export function ShareLinkDialog({ username, link, onClose }: { username: string; link: PasswordLink; onClose: () => void }) {
  const url = linkUrl(link.code)
  const text = shareLinkText(username, link.purpose, url)
  return (
    <Dialog title={link.purpose === 'invite' ? `Uitnodiging voor ${username}` : `Nieuwe link voor ${username}`} onClose={onClose}>
      <p class="muted">Stuur deze link naar {username}. Hij werkt één keer.</p>
      <p class="link-box" style="word-break: break-all; user-select: all">
        {url}
      </p>
      <p class="muted">Geldig tot {formatDateTime(link.expires_at)}</p>
      <div class="dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          Sluiten
        </Button>
        <Button variant="secondary" onClick={() => void copy(text)}>
          Kopiëren
        </Button>
        <Button onClick={() => void share(text)}>Delen</Button>
      </div>
    </Dialog>
  )
}
