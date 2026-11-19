import { describe, expect, it } from 'vitest'
import { shareLinkText } from '../../src/components/shareLinkText'

const url = 'https://toepen.t-wezeman.nl/#/welkom/abc'

describe('shareLinkText', () => {
  it('invite text', () => {
    expect(shareLinkText('kees', 'invite', url)).toBe(
      `Je hebt een Toepen-account: kees\nKies je wachtwoord via deze link (48 uur geldig):\n${url}`,
    )
  })
  it('reset text', () => {
    expect(shareLinkText('kees', 'reset', url)).toBe(
      `Nieuw wachtwoord voor je Toepen-account: kees\nKies een nieuw wachtwoord via deze link (48 uur geldig):\n${url}`,
    )
  })
})
