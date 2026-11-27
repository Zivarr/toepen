import { describe, it, expect } from 'vitest'
import { formatDay, formatDuration, scoreLabel } from '../../src/util/format'

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
