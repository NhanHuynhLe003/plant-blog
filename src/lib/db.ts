import Dexie, { type Table } from 'dexie'
import type { Card, DayStat, LogEntry, MetaRow, Note, Page, ReviewEntry, Settings, StreakMeta } from './types'

export class InkDB extends Dexie {
  notes!: Table<Note, string>
  pages!: Table<Page, string>
  cards!: Table<Card, string>
  reviews!: Table<ReviewEntry, number>
  days!: Table<DayStat, string>
  logs!: Table<LogEntry, number>
  meta!: Table<MetaRow, string>

  constructor(name = 'inkrecall') {
    super(name)
    this.version(1).stores({
      notes: 'id, createdAt',
      pages: 'id, noteId, [noteId+index]',
      cards: 'id, noteId, pageId, due, state',
      reviews: '++id, cardId, noteId, ts, day',
      days: 'day',
      logs: '++id, ts, level, category',
      meta: 'key',
    })
  }
}

export const db = new InkDB()

export const DEFAULT_SETTINGS: Settings = {
  dailyGoal: 20,
  newPerDay: 10,
  retention: 0.9,
  rolloverHour: 4,
  occlusion: 'one',
  theme: 'auto',
  autoFreeze: true,
  maxFreezes: 2,
  autoCards: true,
  granularity: 'paragraph',
  logLevel: 'info',
  maxLogs: 5000,
}

export const DEFAULT_STREAK_META: StreakMeta = { freezes: 1 }

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await db.meta.put({ key: 'settings', value: next })
  return next
}

export async function getStreakMeta(): Promise<StreakMeta> {
  const row = await db.meta.get('streak')
  return { ...DEFAULT_STREAK_META, ...((row?.value as Partial<StreakMeta>) ?? {}) }
}

export async function saveStreakMeta(value: StreakMeta): Promise<void> {
  await db.meta.put({ key: 'streak', value })
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
