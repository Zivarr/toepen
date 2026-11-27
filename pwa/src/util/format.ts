/** HH:MM:SS, same as the Android DurationFormatter. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}`
}

/** Final score with the boer count when there is one, like the Android results: "5 (2× Boer)". */
export function scoreLabel(p: { final_score: number; boer_count: number }): string {
  return p.boer_count > 0 ? `${p.final_score} (${p.boer_count}× Boer)` : String(p.final_score)
}

/** Day and long month, e.g. "3 maart". */
export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })
}
