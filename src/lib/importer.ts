import { makeCard } from './cards'
import { db, getSettings, uid } from './db'
import { canvasToBlob, ctx2d, grayOf, makeCanvas, scaleCanvas } from './image'
import { log } from './logger'
import { findCutRow, segmentGray } from './segment'
import type { Card, Granularity, Note, NoteSource, Page } from './types'

/**
 * Nhập ghi chú viết tay xuất từ Samsung Notes (PDF hoặc ảnh).
 * Samsung Notes có thể xuất cả ghi chú thành MỘT trang rất dài, nên mọi nguồn
 * đều được đưa về dạng "dải" có thể vẽ từng khúc, rồi cắt thành các trang vừa
 * màn hình tại khoảng trắng giữa các dòng chữ.
 */
const TARGET_WIDTH = 1400
/** Trang cao hơn mức này (so với chiều rộng) sẽ bị cắt nhỏ. */
const MAX_ASPECT = 1.9
/** Tỉ lệ khổ A4 đứng. */
const NOMINAL_ASPECT = 1.414
const THUMB_WIDTH = 360

interface StripSource {
  width: number
  height: number
  /** Vẽ dải ngang [y0, y0 + h) của trang ở độ phân giải đích. */
  render(y0: number, h: number): Promise<HTMLCanvasElement>
  dispose(): void
}

export interface ImportProgress {
  file: string
  page: number
  pages: number
}

export interface ImportOptions {
  source?: NoteSource
  autoCards?: boolean
  granularity?: Granularity
  onProgress?: (p: ImportProgress) => void
}

export interface ImportResult {
  note: Note
  pages: number
  cards: number
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)

export function titleFromFile(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      // Samsung Notes đánh số trang ảnh kiểu "Tên_1", "Tên_2".
      .replace(/[_-]\d{1,3}$/, '')
      .replace(/[_]+/g, ' ')
      .trim() || 'Ghi chú không tên'
  )
}

async function imageSource(file: Blob): Promise<StripSource> {
  const bitmap = await createImageBitmap(file)
  const width = Math.min(TARGET_WIDTH, bitmap.width)
  const scale = width / bitmap.width
  return {
    width,
    height: Math.round(bitmap.height * scale),
    async render(y0, h) {
      const c = makeCanvas(width, h)
      const ctx = ctx2d(c)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, y0 / scale, bitmap.width, h / scale, 0, 0, width, h)
      return c
    },
    dispose: () => bitmap.close(),
  }
}

async function* pdfSources(file: File): AsyncGenerator<{ source: StripSource; total: number }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = TARGET_WIDTH / base.width
      const source: StripSource = {
        width: TARGET_WIDTH,
        height: Math.round(base.height * scale),
        async render(y0, h) {
          const canvas = makeCanvas(TARGET_WIDTH, h)
          const viewport = page.getViewport({ scale, offsetX: 0, offsetY: -y0 })
          await page.render({ canvas, viewport, background: '#ffffff' }).promise
          return canvas
        },
        dispose: () => void page.cleanup(),
      }
      yield { source, total: doc.numPages }
    }
  } finally {
    await task.destroy()
  }
}

/** Cắt một nguồn thành các trang; trang dài được cắt tại khoảng trắng. */
async function* slicePages(src: StripSource): AsyncGenerator<HTMLCanvasElement> {
  if (src.height <= src.width * MAX_ASPECT) {
    yield await src.render(0, src.height)
    return
  }
  const nominal = Math.round(src.width * NOMINAL_ASPECT)
  let y = 0
  while (y < src.height) {
    const left = src.height - y
    if (left <= nominal * 1.3) {
      yield await src.render(y, left)
      return
    }
    const windowH = Math.round(nominal * 1.15)
    const strip = await src.render(y, windowH)
    const g = grayOf(strip, strip.width, strip.height, 300)
    const k = g.height / windowH
    const cut = Math.round(findCutRow(g.gray, g.width, g.height, nominal * 0.8 * k, windowH * k) / k)
    const page = makeCanvas(src.width, cut)
    ctx2d(page).drawImage(strip, 0, 0)
    yield page
    y += cut
  }
}

interface Draft {
  note: Note
  pages: Page[]
  cards: Card[]
}

async function addPage(draft: Draft, canvas: HTMLCanvasElement, opts: Required<Pick<ImportOptions, 'autoCards' | 'granularity'>>): Promise<void> {
  const page: Page = { id: uid(), noteId: draft.note.id, index: draft.pages.length, blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height }
  draft.pages.push(page)
  if (!draft.note.thumb) draft.note.thumb = await canvasToBlob(scaleCanvas(canvas, THUMB_WIDTH), 0.8)
  if (opts.autoCards) {
    const g = grayOf(canvas, canvas.width, canvas.height)
    for (const rect of segmentGray(g.gray, g.width, g.height, { granularity: opts.granularity })) draft.cards.push(makeCard(page, rect, 'auto'))
  }
}

async function commit(draft: Draft, started: number): Promise<ImportResult> {
  draft.note.pageCount = draft.pages.length
  await db.transaction('rw', db.notes, db.pages, db.cards, async () => {
    await db.notes.add(draft.note)
    await db.pages.bulkAdd(draft.pages)
    if (draft.cards.length) await db.cards.bulkAdd(draft.cards)
  })
  const bytes = draft.pages.reduce((n, p) => n + p.blob.size, 0)
  log.info('import', `Đã nhập “${draft.note.title}”: ${draft.pages.length} trang, ${draft.cards.length} thẻ`, {
    noteId: draft.note.id,
    source: draft.note.source,
    pages: draft.pages.length,
    cards: draft.cards.length,
    kb: Math.round(bytes / 1024),
    ms: Math.round(performance.now() - started),
  })
  return { note: draft.note, pages: draft.pages.length, cards: draft.cards.length }
}

function newDraft(title: string, source: NoteSource): Draft {
  const now = Date.now()
  return { note: { id: uid(), title, createdAt: now, updatedAt: now, source, pageCount: 0 }, pages: [], cards: [] }
}

/**
 * Mỗi tệp PDF thành một ghi chú; các ảnh chọn cùng lúc được gộp thành một
 * ghi chú nhiều trang (theo thứ tự tên tệp).
 */
export async function importFiles(files: File[], options: ImportOptions = {}): Promise<ImportResult[]> {
  const s = await getSettings()
  const opts = { autoCards: options.autoCards ?? s.autoCards, granularity: options.granularity ?? s.granularity }
  const source = options.source
  const results: ImportResult[] = []
  const pdfs = files.filter(isPdf)
  const images = files.filter((f) => !isPdf(f) && isImage(f)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const skipped = files.filter((f) => !isPdf(f) && !isImage(f))
  if (skipped.length) log.warn('import', `Bỏ qua ${skipped.length} tệp không hỗ trợ`, { files: skipped.map((f) => `${f.name} (${f.type || '?'})`) })
  log.info('import', `Bắt đầu nhập ${pdfs.length} PDF, ${images.length} ảnh`, { autoCards: opts.autoCards, granularity: opts.granularity, source: source ?? 'tệp' })

  for (const file of pdfs) {
    const started = performance.now()
    try {
      const draft = newDraft(titleFromFile(file.name), source ?? 'pdf')
      let n = 0
      for await (const { source: src, total } of pdfSources(file)) {
        options.onProgress?.({ file: file.name, page: ++n, pages: total })
        try {
          for await (const canvas of slicePages(src)) await addPage(draft, canvas, opts)
        } finally {
          src.dispose()
        }
      }
      if (draft.pages.length === 0) throw new Error('PDF không có trang nào')
      results.push(await commit(draft, started))
    } catch (error) {
      log.error('import', `Không nhập được PDF “${file.name}”`, { error, size: file.size })
      throw new Error(`Không đọc được “${file.name}”. Hãy thử xuất lại từ Samsung Notes dưới dạng PDF hoặc ảnh.`, { cause: error })
    }
  }

  if (images.length > 0) {
    const started = performance.now()
    const draft = newDraft(titleFromFile(images[0].name), source ?? 'image')
    let n = 0
    for (const file of images) {
      options.onProgress?.({ file: file.name, page: ++n, pages: images.length })
      try {
        const src = await imageSource(file)
        try {
          for await (const canvas of slicePages(src)) await addPage(draft, canvas, opts)
        } finally {
          src.dispose()
        }
      } catch (error) {
        log.error('import', `Không đọc được ảnh “${file.name}”`, { error, type: file.type, size: file.size })
      }
    }
    if (draft.pages.length === 0) throw new Error('Không đọc được ảnh nào. Hãy dùng PNG, JPG hoặc WebP.')
    results.push(await commit(draft, started))
  }

  if (results.length === 0) throw new Error('Không có tệp PDF hoặc ảnh nào để nhập.')
  return results
}

/* ---------- Hộp thư chia sẻ (Web Share Target) ---------- */

export const SHARE_CACHE = 'inkrecall-share-inbox'

/** Lấy các tệp được chia sẻ từ Samsung Notes (service worker đã cất vào Cache). */
export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return []
  const cache = await caches.open(SHARE_CACHE)
  const files: File[] = []
  for (const req of await cache.keys()) {
    const res = await cache.match(req)
    if (res) {
      const blob = await res.blob()
      const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'Ghi chú chia sẻ')
      files.push(new File([blob], name, { type: res.headers.get('Content-Type') ?? blob.type }))
    }
    await cache.delete(req)
  }
  if (files.length) log.info('import', `Nhận ${files.length} tệp chia sẻ từ ứng dụng khác`, { files: files.map((f) => f.name) })
  return files
}
