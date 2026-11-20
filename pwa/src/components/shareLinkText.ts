/** Text that goes with an invite or reset link when it is shared (WhatsApp etc.). */
export function shareLinkText(username: string, purpose: 'invite' | 'reset', url: string): string {
  if (purpose === 'invite') {
    return `Je hebt een Toepen-account: ${username}\nKies je wachtwoord via deze link (48 uur geldig):\n${url}`
  }
  return `Nieuw wachtwoord voor je Toepen-account: ${username}\nKies een nieuw wachtwoord via deze link (48 uur geldig):\n${url}`
}

export function linkUrl(code: string): string {
  return `${location.origin}/#/welkom/${code}`
}
