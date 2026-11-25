import { db } from './db'
import type { LogCategory, LogEntry, LogLevel } from './types'

/**
 * Nhật ký có cấu trúc, lưu bền trong IndexedDB.
 * - Mỗi dòng có mức, nhóm, thông điệp, dữ liệu kèm theo và mã phiên chạy.
 * - Ghi theo lô (gom 400ms) để không chặn giao diện khi ôn nhanh.
 * - Tự cắt bớt dòng cũ khi vượt giới hạn.
 */
const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export const SESSION_ID = Math.random().toString(36).slice(2, 8)

let minLevel: LogLevel = 'info'
let maxLogs = 5000
let buffer: LogEntry[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> = Promise.resolve()

export function configureLogger(opts: { level?: LogLevel; maxLogs?: number }): void {
  if (opts.level) minLevel = opts.level
  if (opts.maxLogs) maxLogs = opts.maxLogs
}

/** Che mọi chuỗi trông giống khoá API để khoá không bao giờ lọt vào nhật ký. */
export function redact(text: string): string {
  return text.replace(/\b(sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,})/g, '[khoá đã ẩn]')
}

/** Đưa dữ liệu bất kỳ về dạng lưu được (Error, Blob, vòng lặp tham chiếu…). */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: redact(value.stack?.split('\n').slice(0, 6).join('\n') ?? '') }
  if (typeof Blob !== 'undefined' && value instanceof Blob) return { blob: value.type, size: value.size }
  if (typeof value === 'function') return '[function]'
  if (typeof value === 'string') return redact(value)
  if (typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value
  if (depth > 4) return '[…]'
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitize(v, depth + 1)
  return out
}

async function write(entries: LogEntry[]): Promise<void> {
  try {
    await db.logs.bulkAdd(entries)
    const count = await db.logs.count()
    if (count > maxLogs * 1.1) {
      const drop = await db.logs.orderBy('id').limit(count - maxLogs).primaryKeys()
      await db.logs.bulkDelete(drop)
    }
  } catch (err) {
    // Nhật ký không bao giờ được làm hỏng luồng chính.
    console.error('[log] không ghi được nhật ký', err)
  }
}

export function flushLogs(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (buffer.length === 0) return flushing
  const batch = buffer
  buffer = []
  flushing = flushing.then(() => write(batch))
  return flushing
}

function emit(level: LogLevel, category: LogCategory, message: string, data?: unknown): void {
  if (ORDER[level] < ORDER[minLevel]) return
  const entry: LogEntry = { ts: Date.now(), level, category, message: redact(message), session: SESSION_ID }
  if (data !== undefined) entry.data = sanitize(data)
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info
  fn(`[${category}] ${message}`, data ?? '')
  buffer.push(entry)
  if (level === 'error') void flushLogs()
  else timer ??= setTimeout(() => void flushLogs(), 400)
}

export const log = {
  debug: (category: LogCategory, message: string, data?: unknown) => emit('debug', category, message, data),
  info: (category: LogCategory, message: string, data?: unknown) => emit('info', category, message, data),
  warn: (category: LogCategory, message: string, data?: unknown) => emit('warn', category, message, data),
  error: (category: LogCategory, message: string, data?: unknown) => emit('error', category, message, data),
}

/** Bắt lỗi chưa xử lý và ghi lại trước khi tab bị đóng. */
export function installGlobalLogging(): void {
  window.addEventListener('error', (e) => log.error('system', `Lỗi chưa xử lý: ${e.message}`, { file: e.filename, line: e.lineno, error: e.error }))
  window.addEventListener('unhandledrejection', (e) => log.error('system', 'Promise bị từ chối chưa xử lý', { reason: e.reason }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushLogs()
  })
  window.addEventListener('pagehide', () => void flushLogs())
}

export const LEVEL_LABEL: Record<LogLevel, string> = { debug: 'Gỡ lỗi', info: 'Thông tin', warn: 'Cảnh báo', error: 'Lỗi' }
export const CATEGORY_LABEL: Record<LogCategory, string> = {
  system: 'Hệ thống',
  import: 'Nhập ghi chú',
  card: 'Thẻ',
  review: 'Ôn tập',
  streak: 'Chuỗi',
  backup: 'Sao lưu',
  settings: 'Cài đặt',
  ai: 'AI',
}

export function logsToCsv(rows: LogEntry[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = ['time,level,category,session,message,data']
  for (const r of rows) {
    lines.push([new Date(r.ts).toISOString(), r.level, r.category, r.session, esc(r.message), esc(r.data === undefined ? '' : JSON.stringify(r.data))].join(','))
  }
  return lines.join('\n')
}
