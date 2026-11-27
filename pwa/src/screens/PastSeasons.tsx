import { useEffect, useState } from 'preact/hooks'
import { getGames, getGroup } from '../storage/repo'
import { gamesIn, pastSeasons, seasonsOf } from '../stats/seasons'
import { formatDay } from '../util/format'
import { SeasonTitles, seasonStartMs } from '../components/SeasonTitles'
import type { CachedGroup, GroupKey, StoredGame } from '../types'

export function PastSeasons({ groupKey }: { groupKey: string }) {
  const key = groupKey as GroupKey
  const [group, setGroup] = useState<CachedGroup | null | undefined>(undefined)
  const [games, setGames] = useState<StoredGame[]>([])

  useEffect(() => {
    const load = () =>
      void Promise.all([getGroup(key), getGames(key)]).then(([g, gs]) => {
        setGroup(g ?? null)
        setGames(gs)
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

  const past = pastSeasons(seasonsOf(group), games)
  return (
    <main class="screen">
      <p>
        <a class="back" href={`#/g/${key}`}>
          ‹ {group.name}
        </a>
      </p>
      <h1>Vorige seizoenen</h1>
      {past.map(({ season, titles }) => {
        const start = seasonStartMs(season, gamesIn(season, games))
        const dates =
          start !== null && season.end !== null ? `${formatDay(start)} – ${formatDay(season.end)}` : undefined
        return (
          <SeasonTitles key={season.number} season={season} titles={titles} state="ended" confetti={false} dates={dates} />
        )
      })}
    </main>
  )
}
