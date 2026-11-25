import { describe, it, expect } from 'vitest'
import { tally } from '../../src/game/tally'

describe('tally', () => {
  it.each([[0, '0'], [3, '|||'], [5, '卌'], [7, '卌 ||'], [10, '卌 卌']])('%i -> %s', (n, out) => {
    expect(tally(n)).toBe(out)
  })

  it.each([
    // [score, limit, expected]: one point below the limit, the last stroke is a P
    [9, 10, '卌 |||P'],
    [10, 11, '卌 ||||P'],
    [6, 7, '卌 P'],
    [1, 2, 'P'],
    [4, 5, '|||P'],
  ])('%i with limit %i -> %s', (n, limit, out) => {
    expect(tally(n, limit)).toBe(out)
  })

  it.each([
    [8, 10, '卌 |||'],
    [10, 10, '卌 卌'],
    [0, 1, '0'],
  ])('no P when not one below the limit: %i with limit %i -> %s', (n, limit, out) => {
    expect(tally(n, limit)).toBe(out)
  })
})
