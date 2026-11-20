import { describe, it, expect } from 'vitest'
import { normalise, titleCase, isSimilar, findMatch } from '../../src/players/match'

// Expected values for the non-ASCII rows were produced by running api/src/Names.php (PHP 8.4).
describe('isSimilar (Plan 1 table)', () => {
  it.each([
    ['Rav', 'Ravi', true], ['Ravi', 'Ravi B', true], ['Ravi', 'ravi', false],
    ['Tim', 'Tom', true], ['Tim', 'Kim', true], ['Jo', 'Joost', false],
    ['Sanne', 'Sanna', true], ['Mohammed', 'Mohamed', true], ['Mohammed', 'Mo', false],
    ['Kees', 'Klaas', false],
  ])('%s / %s -> %s', (a, b, r) => {
    expect(isSimilar(a, b)).toBe(r)
    expect(isSimilar(b, a)).toBe(r)
  })
})

describe('PHP parity (non-ASCII)', () => {
  it.each([
    ['Zoë', 'Zoe', true], ['Zoë', 'Zoé', true], ['😀x', '😁x', true], ['😀', '😁', true],
    ['Ab\u2003c', 'ab c', false], ['\u00a0Tim', 'Tim', true], ['a\u00a0b', 'a b', false],
    ['\u3000Tim', 'Tim', true], ['ÉVA', 'éva', false], ['İvo', 'ivo', true],
  ])('%j / %j -> %s', (a, b, r) => expect(isSimilar(a, b)).toBe(r))

  it('normalise: PHP trim only strips ASCII, \\s collapse is Unicode', () => {
    expect(normalise('\u00a0Tim')).toBe(' tim') // NBSP survives trim, collapses to one space
    expect(normalise('Tim\u0085')).toBe('tim ')
    expect(normalise('\fx')).toBe(' x') // trim ignores \f, \s matches it
    expect(normalise('\0x\0')).toBe('x')
    expect(normalise('\ufeffx')).toBe('\ufeffx') // JS \s would match, PCRE does not
    expect(normalise('a\u2028b')).toBe('a b')
    expect(normalise('ΑΣ')).toBe('\u03b1ς')
    expect(normalise('İvo')).toBe('i\u0307vo')
    expect(normalise('  Tim   W ')).toBe('tim w')
  })
  it('titleCase special cases', () => {
    expect(titleCase('\u00a0tim')).toBe(' tim')
    expect(titleCase('😀x')).toBe('😀x')
    expect(titleCase('ßa')).toBe('SSa')
    expect(titleCase('ŉa')).toBe('\u02bcNa')
    expect(titleCase('ǆx')).toBe('\u01c4x')
    expect(titleCase('ﬁx')).toBe('FIx')
  })
})

describe('titleCase', () => {
  it.each([['  ravi ', 'Ravi'], ['éva', 'Éva'], ['tim  w', 'Tim w'], ['   ', '']])('%j -> %j', (a, r) => {
    expect(titleCase(a)).toBe(r)
  })
})

describe('findMatch', () => {
  it('exact returns existing spelling', () => {
    expect(findMatch('ravi', ['Ravi'])).toEqual({ match: 'exact', existing: 'Ravi', suggestions: [] })
  })
  it('similar', () => {
    expect(findMatch('Rav', ['Ravi', 'Kees'])).toEqual({ match: 'similar', existing: 'Ravi', suggestions: ['Ravi'] })
  })
  it('similar lists all, first is existing', () => {
    expect(findMatch('Tim', ['Tom', 'Kim', 'Piet'])).toEqual({
      match: 'similar', existing: 'Tom', suggestions: ['Tom', 'Kim'],
    })
  })
  it('exact wins over earlier similar', () => {
    expect(findMatch('Tim', ['Tom', 'tim']).match).toBe('exact')
  })
  it('new', () => {
    expect(findMatch('Piet', ['Ravi'])).toEqual({ match: 'new', suggestions: [] })
  })
})
