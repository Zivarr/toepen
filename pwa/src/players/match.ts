// Mirrors api/src/Names.php exactly (server and PWA must agree on what is similar).

// PHP trim() default set: " \t\n\r\0\x0B" (ASCII only; JS trim() would also strip NBSP etc.).
const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g
// PCRE \s with /u (UCP): \t-\r, Unicode Z* separators and U+0085. U+180E is included because
// the PHP runtime we target treats it as whitespace too. JS \s differs (has U+FEFF, lacks U+0085).
const PCRE_WS = /[\t-\r \u0085\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g

function collapse(s: string): string {
  return s.replace(PHP_TRIM, '').replace(PCRE_WS, ' ')
}

export function normalise(s: string): string {
  return collapse(s).toLowerCase()
}

export function titleCase(s: string): string {
  const c = collapse(s)
  if (c === '') return ''
  const [first, ...rest] = Array.from(c)
  return first.toUpperCase() + rest.join('')
}

// Levenshtein over code points, standard two-row DP (same as Names::editDistance).
function editDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[b.length]
}

export function isSimilar(a: string, b: string): boolean {
  const na = normalise(a)
  const nb = normalise(b)
  if (na === nb) return false
  const ca = Array.from(na)
  const cb = Array.from(nb)
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  if (short.length >= 3 && long.slice(0, short.length).join('') === short.join('')) return true
  const threshold = long.length <= 5 ? 1 : 2
  return editDistance(ca, cb) <= threshold
}

export function findMatch(
  name: string,
  existing: string[],
): { match: 'exact' | 'similar' | 'new'; existing?: string; suggestions: string[] } {
  const n = normalise(name)
  const similar: string[] = []
  for (const e of existing) {
    if (normalise(e) === n) return { match: 'exact', existing: e, suggestions: [] }
    if (isSimilar(name, e)) similar.push(e)
  }
  if (similar.length > 0) return { match: 'similar', existing: similar[0], suggestions: similar }
  return { match: 'new', suggestions: [] }
}
