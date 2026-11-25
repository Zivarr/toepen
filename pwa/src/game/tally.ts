/**
 * Tally marks: groups of five as 卌, remainder as |. 0 -> "0".
 * With a limit, a player one point below it gets a P as their last stroke ("卌 |||P").
 */
export function tally(score: number, limit?: number): string {
  if (score <= 0) return '0'
  if (limit !== undefined && score === limit - 1) {
    const before = score - 1
    if (before === 0) return 'P'
    return tally(before) + (before % 5 === 0 ? ' P' : 'P')
  }
  const parts: string[] = Array(Math.floor(score / 5)).fill('卌')
  const rest = score % 5
  if (rest > 0) parts.push('|'.repeat(rest))
  return parts.join(' ')
}
