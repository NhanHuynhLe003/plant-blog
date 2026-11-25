import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate'
import { db } from './db'
import { log } from './logger'
import type { Card, DayStat, MetaRow, Note, Page, ReviewEntry } from './types'

/**
 * Sao lưu toàn bộ dữ liệu thành một tệp .zip:
 *   data.json            – ghi chú, thẻ, nhật ký ôn tập, thống kê ngày, cài đặt
 *   pages/<id>, thumbs/<id> – ảnh trang gốc (không nén lại)
 */
const FORMAT = 'inkrecall-backup'
/** Các hàng meta chỉ có nghĩa trên chính thiết bị này. */
export const LOCAL_ONLY_META = ['ai', 'watch']
const VERSION = 1

interface BackupData {
  format: typeof FORMAT
  version: number
  exportedAt: string
  notes: (Omit<Note, 'thumb'> & { thumbType?: string })[]
  pages: (Omit<Page, 'blob'> & { type: string })[]
  cards: Card[]
  reviews: ReviewEntry[]
  days: DayStat[]
  meta: MetaRow[]
}

const zipAsync = (data: Zippable) => new Promise<Uint8Array>((res, rej) => zip(data, (err, out) => (err ? rej(err) : res(out))))
const unzipAsync = (data: Uint8Array) => new Promise<Unzipped>((res, rej) => unzip(data, (err, out) => (err ? rej(err) : res(out))))

export async function exportBackup(): Promise<Blob> {
  const started = performance.now()
  const [notes, pages, cards, reviews, days, meta] = await Promise.all([
    db.notes.toArray(),
    db.pages.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.days.toArray(),
    db.meta.toArray(),
  ])
  const files: Zippable = {}
  const data: BackupData = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    notes: [],
    pages: [],
    cards,
    reviews,
    days,
    // Khoá API và quyền thư mục theo dõi ở lại trên thiết bị, không đi theo tệp sao lưu.
    meta: meta.filter((m) => !LOCAL_ONLY_META.includes(m.key)),
  }
  for (const { thumb, ...rest } of notes) {
    data.notes.push({ ...rest, thumbType: thumb?.type })
    if (thumb) files[`thumbs/${rest.id}`] = [new Uint8Array(await thumb.arrayBuffer()), { level: 0 }]
  }
  for (const { blob, ...rest } of pages) {
    data.pages.push({ ...rest, type: blob.type })
    files[`pages/${rest.id}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
  }
  files['data.json'] = [strToU8(JSON.stringify(data)), { level: 6 }]
  const out = new Blob([(await zipAsync(files)) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
  log.info('backup', `Xuất sao lưu: ${notes.length} ghi chú, ${cards.length} thẻ, ${reviews.length} lượt ôn`, {
    mb: +(out.size / 1_048_576).toFixed(2),
    ms: Math.round(performance.now() - started),
  })
  return out
}

/** Khôi phục từ tệp sao lưu — THAY THẾ toàn bộ dữ liệu hiện có (trừ nhật ký hệ thống). */
export async function importBackup(file: Blob): Promise<{ notes: number; cards: number; reviews: number }> {
  let data: BackupData
  let files: Unzipped
  try {
    files = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
    data = JSON.parse(strFromU8(files['data.json']))
  } catch (error) {
    log.error('backup', 'Tệp sao lưu không đọc được', { error })
    throw new Error('Tệp không phải bản sao lưu InkRecall hợp lệ.', { cause: error })
  }
  if (data.format !== FORMAT || data.version > VERSION) {
    log.error('backup', 'Định dạng sao lưu không được hỗ trợ', { format: data.format, version: data.version })
    throw new Error('Bản sao lưu này được tạo bởi phiên bản mới hơn hoặc không đúng định dạng.')
  }
  const blobOf = (path: string, type?: string) => (files[path] ? new Blob([files[path] as Uint8Array<ArrayBuffer>], { type: type ?? 'image/webp' }) : undefined)
  const notes: Note[] = data.notes.map(({ thumbType, ...n }) => ({ ...n, thumb: blobOf(`thumbs/${n.id}`, thumbType) }))
  const pages: Page[] = []
  for (const { type, ...p } of data.pages) {
    const blob = blobOf(`pages/${p.id}`, type)
    if (blob) pages.push({ ...p, blob })
  }
  await db.transaction('rw', [db.notes, db.pages, db.cards, db.reviews, db.days, db.meta], async () => {
    const local = await db.meta.where('key').anyOf(LOCAL_ONLY_META).toArray()
    await Promise.all([db.notes.clear(), db.pages.clear(), db.cards.clear(), db.reviews.clear(), db.days.clear(), db.meta.clear()])
    await db.meta.bulkAdd(local)
    await db.notes.bulkAdd(notes)
    await db.pages.bulkAdd(pages)
    await db.cards.bulkAdd(data.cards)
    await db.reviews.bulkAdd(data.reviews)
    await db.days.bulkAdd(data.days)
    await db.meta.bulkPut(data.meta.filter((m) => !LOCAL_ONLY_META.includes(m.key)))
  })
  log.warn('backup', `Khôi phục từ sao lưu ngày ${data.exportedAt.slice(0, 10)}`, { notes: notes.length, pages: pages.length, cards: data.cards.length, reviews: data.reviews.length })
  return { notes: notes.length, cards: data.cards.length, reviews: data.reviews.length }
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', [db.notes, db.pages, db.cards, db.reviews, db.days, db.meta], async () => {
    await Promise.all([db.notes.clear(), db.pages.clear(), db.cards.clear(), db.reviews.clear(), db.days.clear(), db.meta.clear()])
  })
  log.warn('system', 'Đã xoá toàn bộ ghi chú, thẻ và lịch sử ôn tập')
}
