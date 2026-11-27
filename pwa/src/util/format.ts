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

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `datetime-local` value (phone-local time) to ISO with the phone's UTC offset, e.g. "2027-03-03T20:00:00+01:00". */
export function localInputToIso(value: string): string {
  const d = new Date(value)
  const off = -d.getTimezoneOffset()
  const abs = Math.abs(off)
  const sign = off < 0 ? '-' : '+'
  return `${value.slice(0, 16)}:00${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

/** ISO timestamp to a `datetime-local` value in the phone's local time, e.g. "2027-03-03T20:00". */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
