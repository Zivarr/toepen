import { useMemo } from 'preact/hooks'
import type { Season, SeasonTitles as Titles, Title } from '../stats/seasons'

const COLORS = ['#ffffff', '#ef5350', '#1b5e20', '#42a5f5', '#ff7043', '#7e57c2']
const PIECES = 25

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const names = (t: Title) => t.names.join(' & ')

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        duration: 1.6 + Math.random() * 0.8,
        delay: Math.random() * 0.9,
      })),
    [],
  )
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          class="cf"
          aria-hidden="true"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  )
}

interface Props {
  season: Season
  titles: Titles
  state: 'running' | 'ended'
  confetti: boolean
  /** Date part of the header line, e.g. `3 maart – 30 juni` or `loopt sinds 3 maart`. Omitted when unknown. */
  dates?: string
}

export function SeasonTitles({ season, titles, state, confetti, dates }: Props) {
  const k = titles.kampioen
  const rows: [string, Title | null][] = [
    ['💀 Anita', titles.anita],
    ['🃏 Boer', titles.boer],
    ['👑 Paskoning', titles.paskoning],
  ]
  return (
    <section class="season-titles">
      <div class="muted st-head">
        {season.label}
        {dates ? ` · ${dates}` : ''}
        <span class="st-pill">{state === 'running' ? 'LOOPT NOG' : 'AFGELOPEN'}</span>
      </div>
      <div class="st-banner">
        {confetti && k && !reducedMotion() && <Confetti />}
        <div class="st-inner">
          <div class="st-crown">🏆</div>
          {k ? (
            <>
              <div class="st-label">KAMPIOEN {season.label.toUpperCase()}</div>
              <div class="st-winner">{names(k)}</div>
              <div class="st-count">{k.count} keer gewonnen</div>
            </>
          ) : (
            <div class="st-winner">Nog geen kampioen</div>
          )}
        </div>
      </div>
      {rows.map(([label, t]) =>
        t ? (
          <div class="st-row" key={label}>
            <span>{label}</span>
            <span>
              <b>{names(t)}</b> · {t.count}×
            </span>
          </div>
        ) : null,
      )}
    </section>
  )
}
