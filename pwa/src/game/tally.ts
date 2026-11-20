/** Tally marks: groups of five as 卌, remainder as |. 0 -> "0". */
export function tally(score: number): string {
  if (score <= 0) return '0'
  const parts: string[] = Array(Math.floor(score / 5)).fill('卌')
  const rest = score % 5
  if (rest > 0) parts.push('|'.repeat(rest))
  return parts.join(' ')
}
