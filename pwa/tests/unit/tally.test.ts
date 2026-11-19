import { describe, it, expect } from 'vitest'
import { tally } from '../../src/game/tally'

describe('tally', () => {
  it.each([[0, '0'], [3, '|||'], [5, '卌'], [7, '卌 ||'], [10, '卌 卌']])('%i -> %s', (n, out) => {
    expect(tally(n)).toBe(out)
  })
})
