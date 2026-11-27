import { useEffect, useState } from 'preact/hooks'
import { getGames, getGroup, setLocalMaxPenalty } from '../storage/repo'
import { db } from '../storage/db'
import { patchGroup } from '../api/endpoints'
import { ApiError, NetworkError } from '../api/client'
import type { CachedGroup, GroupKey, StoredGame } from '../types'
import { gamesIn, groupPageView, pastSeasons, seasonsOf, seasonStartMs } from '../stats/seasons'
import { formatDay } from '../util/format'
import { SeasonTitles } from '../components/SeasonTitles'
import { Button } from '../components/Button'
import { toast } from '../components/Toast'

export function GroupHome({ groupKey }: { groupKey: string }) {
  const key = groupKey as GroupKey
  const [group, setGroup] = useState<CachedGroup | null | undefined>(undefined)
  const [games, setGames] = useState<StoredGame[]>([])
  const [max, setMax] = useState('')

  useEffect(() => {
    const load = () =>
      void Promise.all([getGroup(key), getGames(key)]).then(([g, gs]) => {
        setGames(gs)
        setGroup(g ?? null)
        if (g) setMax((m) => m || String(g.maxPenaltyPoints))
      })
    load()
    window.addEventListener('toepen:sync', load)
    return () => window.removeEventListener('toepen:sync', load)
  }, [key])

  if (group === undefined) return <main class="screen" />
  if (group === null)
    return (
      <main class="screen">
        <p>Groep niet gevonden.</p>
        <a href="#/">Terug naar groepen</a>
      </main>
    )

  async function save(e: Event) {
    e.preventDefault()
    const g = group as CachedGroup
    const m = Number.parseInt(max, 10)
    if (!(m >= 1 && m <= 100)) return
    try {
      if (g.kind === 'server') {
        await patchGroup(g.serverId!, m)
        await db.groups.update(g.key, { maxPenaltyPoints: m })
      } else {
        await setLocalMaxPenalty(g.key, m)
      }
      setGroup({ ...g, maxPenaltyPoints: m })
      toast('Opgeslagen')
    } catch (err) {
      if (err instanceof NetworkError) toast('Geen verbinding met de server')
      else if (err instanceof ApiError) toast('Opslaan is mislukt')
      else throw err
    }
  }

  const seasons = seasonsOf(group)
  const view = groupPageView(seasons, games)
  const hasPast = pastSeasons(seasons, games).length > 0
  const startOf = (s: (typeof seasons)[number]) => seasonStartMs(s, gamesIn(s, games))
  const sinceText = (s: (typeof seasons)[number]) => {
    const start = startOf(s)
    return start === null ? undefined : `loopt sinds ${formatDay(start)}`
  }
  const rangeText = (s: (typeof seasons)[number]) => {
    const start = startOf(s)
    return start === null || s.end === null ? undefined : `${formatDay(start)} – ${formatDay(s.end)}`
  }

  return (
    <main class="screen">
      <p>
        <a class="back" href="#/">
          ‹ Groepen
        </a>
      </p>
      <h1>{group.name}</h1>
      {view.kind === 'justEnded' ? (
        <>
          <SeasonTitles
            season={view.ended}
            titles={view.titles}
            state="ended"
            confetti
            dates={rangeText(view.ended)}
          />
          <p class="muted">{view.running.label} · loopt sinds {formatDay(view.running.start as number)}</p>
        </>
      ) : (
        <SeasonTitles season={view.running} titles={view.titles} state="running" confetti={false} dates={sinceText(view.running)} />
      )}
      {hasPast && (
        <p>
          <a href={`#/g/${key}/seasons`}>Vorige seizoenen ›</a>
        </p>
      )}
      <div class="stack">
        <a class="btn btn-primary" href={`#/g/${key}/setup`}>
          Nieuw spel
        </a>
        <a class="btn btn-secondary" href={`#/g/${key}/results`}>
          Resultaten
        </a>
        <a class="btn btn-secondary" href={`#/g/${key}/stats`}>
          Ranglijst
        </a>
      </div>
      <form class="card" onSubmit={save}>
        <label>
          Max strafpunten
          <input
            name="max"
            type="number"
            inputMode="numeric"
            min="1"
            max="100"
            value={max}
            onInput={(e) => setMax(e.currentTarget.value)}
          />
        </label>
        <Button type="submit">Opslaan</Button>
        {group.kind === 'server' && <p class="muted">Wijzigen werkt alleen met verbinding.</p>}
      </form>
    </main>
  )
}
