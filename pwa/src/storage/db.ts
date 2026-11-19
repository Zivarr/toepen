import Dexie, { type Table } from 'dexie'
import type { CachedGroup, OutboxItem, StoredGame } from '../types'

export interface KvRow {
  key: string
  value: unknown
}

class ToepenDb extends Dexie {
  groups!: Table<CachedGroup, string>
  games!: Table<StoredGame, string>
  outbox!: Table<OutboxItem, string>
  kv!: Table<KvRow, string>

  constructor() {
    super('toepen')
    this.version(1).stores({
      groups: 'key, kind',
      games: 'id, groupKey',
      outbox: 'id, status',
      kv: 'key',
    })
  }
}

export const db = new ToepenDb()
