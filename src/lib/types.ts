/** Vùng chữ nhật chuẩn hoá theo kích thước trang (0..1). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type NoteSource = 'pdf' | 'image' | 'share' | 'folder' | 'demo'

export interface Note {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  source: NoteSource
  pageCount: number
  thumb?: Blob
}

/** Trạng thái xử lý AI của một trang. */
export interface PageAi {
  status: 'pending' | 'running' | 'done' | 'error'
  provider?: AiProvider
  model?: string
  at?: number
  error?: string
}

export interface Page {
  id: string
  noteId: string
  index: number
  blob: Blob
  width: number
  height: number
  /** Chữ viết tay do AI đọc được (ghép từ các vùng). */
  text?: string
  /** Tóm tắt ôn tập của trang do AI viết. */
  summary?: string[]
  ai?: PageAi
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
  /** Câu hỏi / gợi ý hiện ở mặt trước. */
  prompt: string
  /** occlusion (mặc định): che một vùng trên trang · qa: thẻ hỏi–đáp bằng chữ. */
  kind?: 'occlusion' | 'qa'
  /** Đáp án dạng chữ: nội dung AI đọc được của vùng, hoặc câu trả lời của thẻ hỏi–đáp. */
  answer?: string
  /** Câu hỏi gần nhất do AI viết — để không ghi đè câu hỏi người dùng tự sửa. */
  aiPrompt?: string
  origin: 'manual' | 'auto' | 'ai'
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
export type LogCategory = 'system' | 'import' | 'card' | 'review' | 'streak' | 'backup' | 'settings' | 'ai'

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

export type AiProvider = 'claude' | 'openai' | 'gemini' | 'deepseek'

/** Cấu hình AI — lưu riêng trong meta['ai'], KHÔNG nằm trong tệp sao lưu. */
export interface AiConfig {
  provider: AiProvider
  keys: Partial<Record<AiProvider, string>>
  models: Partial<Record<AiProvider, string>>
  /** Tự chạy AI ngay sau khi nhập ghi chú. */
  auto: boolean
  /** Số câu hỏi tổng hợp thêm cho mỗi trang (0 = chỉ đặt câu hỏi cho từng vùng). */
  extraPerPage: number
  language: 'auto' | 'vi' | 'en'
}

export interface MetaRow {
  key: string
  value: unknown
}
