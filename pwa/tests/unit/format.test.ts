import { describe, it, expect } from 'vitest'
import { formatDay, formatDuration, isoToLocalInput, localInputToIso, scoreLabel } from '../../src/util/format'

describe('formatDuration', () => {
  it('formats as HH:MM:SS', () => {
    expect(formatDuration(3_723_000)).toBe('01:02:03')
  })
})

describe('scoreLabel', () => {
  it('shows only the score without boers', () => {
    expect(scoreLabel({ final_score: 5, boer_count: 0 })).toBe('5')
  })

  it('adds the boer count like the Android app', () => {
    expect(scoreLabel({ final_score: 5, boer_count: 2 })).toBe('5 (2× Boer)')
  })
})

describe('formatDay', () => {
  it('formats day and long month in Dutch', () => {
    expect(formatDay(Date.UTC(2027, 2, 3, 12))).toBe('3 maart')
  })
})

describe('localInputToIso / isoToLocalInput', () => {
  it('adds the phone offset and keeps the same moment', () => {
    const iso = localInputToIso('2027-03-03T20:00')
    expect(iso).toMatch(/^2027-03-03T20:00:00[+-]\d{2}:\d{2}$/)
    expect(Date.parse(iso)).toBe(new Date('2027-03-03T20:00').getTime())
  })

  it('round-trips through the local input format', () => {
    expect(isoToLocalInput(localInputToIso('2027-07-15T08:30'))).toBe('2027-07-15T08:30')
  })

  it('prefills from an ISO timestamp with another offset', () => {
    const iso = '2027-03-03T19:00:00+00:00'
    expect(new Date(isoToLocalInput(iso)).getTime()).toBe(Date.parse(iso))
  })
})
