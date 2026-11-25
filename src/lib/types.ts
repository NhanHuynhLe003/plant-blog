/** Vùng chữ nhật chuẩn hoá theo kích thước trang (0..1). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type NoteSource = 'pdf' | 'image' | 'share' | 'demo'

export interface Note {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  source: NoteSource
  pageCount: number
  thumb?: Blob
}

export interface Page {
  id: string
  noteId: string
  index: number
  blob: Blob
  width: number
  height: number
}

/** 0 = Mới, 1 = Đang học, 2 = Ôn tập, 3 = Học lại (theo FSRS). */
export type CardState = 0 | 1 | 2 | 3
export type Rating = 1 | 2 | 3 | 4

/** Trạng thái lịch FSRS, mọi mốc thời gian lưu dạng epoch ms. */
export interface SchedState {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: CardState
  last_review?: number
}

export interface Card {
  id: string
  noteId: string
  pageId: string
  pageIndex: number
  rect: Rect
  prompt: string
  origin: 'manual' | 'auto'
  createdAt: number
  suspended: 0 | 1
  /** Bản sao của sched.due / sched.state để đánh chỉ mục. */
  due: number
  state: CardState
  sched: SchedState
}

export interface ReviewEntry {
  id?: number
  cardId: string
  noteId: string
  ts: number
  day: string
  rating: Rating
  stateBefore: CardState
  stateAfter: CardState
  scheduledDays: number
  stability: number
  difficulty: number
  durationMs: number
  /** Lịch trước khi chấm, dùng để hoàn tác. */
  prev: SchedState
}

export interface DayStat {
  day: string
  reviews: number
  again: number
  hard: number
  good: number
  easy: number
  newCards: number
  timeMs: number
  goal: number
  qualified: boolean
  qualifiedAt?: number
  frozen: boolean
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCategory = 'system' | 'import' | 'card' | 'review' | 'streak' | 'backup' | 'settings'

export interface LogEntry {
  id?: number
  ts: number
  level: LogLevel
  category: LogCategory
  message: string
  data?: unknown
  session: string
}

export type Granularity = 'line' | 'paragraph' | 'block'

export interface Settings {
  dailyGoal: number
  newPerDay: number
  retention: number
  rolloverHour: number
  occlusion: 'one' | 'all'
  theme: 'auto' | 'light' | 'dark'
  autoFreeze: boolean
  maxFreezes: number
  autoCards: boolean
  granularity: Granularity
  logLevel: LogLevel
  maxLogs: number
}

export interface StreakMeta {
  freezes: number
  /** Ngày gần nhất đã thưởng lá chắn (tránh thưởng lặp khi hoàn tác). */
  lastAwardDay?: string
  /** Ngày hoạt động cuối của chuỗi đã ghi nhận là bị đứt. */
  lastBrokenAfter?: string
}

export interface MetaRow {
  key: string
  value: unknown
}
