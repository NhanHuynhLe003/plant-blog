import { makeCard } from '../cards'
import { db } from '../db'
import { ctx2d, makeCanvas } from '../image'
import { log } from '../logger'
import type { AiConfig, Card, Page, PageAi } from '../types'
import { getAiConfig, keyOf } from './config'
import { aiJobs, emitJobs as emit } from './jobs'
import { ADAPTERS, type ProviderAdapter } from './providers'
import { AiError, modelOf, PROVIDERS, type PageStudy, type StudyRequest, type StudyResult } from './schema'

export { aiJobs } from './jobs'

const isOcclusion = (c: Card) => (c.kind ?? 'occlusion') === 'occlusion'

/** Thứ tự đánh số vùng: từ trên xuống, trái sang phải — phải ổn định giữa lúc vẽ và lúc áp kết quả. */
export function orderRegions(cards: Card[]): Card[] {
  return cards.filter(isOcclusion).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
}

/* ---------- Ảnh gửi cho AI: trang + khung đánh số ---------- */

const MAX_EDGE = 1568

export async function annotatedImage(page: Page, regions: Card[]): Promise<string> {
  const bitmap = await createImageBitmap(page.blob)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = makeCanvas(w, h)
    const ctx = ctx2d(canvas)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    const size = Math.max(16, Math.round(w / 55))
    ctx.font = `bold ${size}px sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    regions.forEach((card, i) => {
      const r = card.rect
      const x = r.x * w
      const y = r.y * h
      ctx.strokeStyle = '#1d6fe0'
      ctx.lineWidth = Math.max(2, w / 600)
      ctx.strokeRect(x, y, r.w * w, r.h * h)
      // Nhãn số đặt ở lề trái ngoài khung để không che chữ; hết chỗ thì đặt phía trên.
      const label = String(i + 1)
      const bw = size * (label.length > 1 ? 1.9 : 1.4)
      const bh = size * 1.35
      const bx = x - bw - 3 >= 0 ? x - bw - 3 : x
      const by = x - bw - 3 >= 0 ? y : Math.max(0, y - bh - 2)
      ctx.fillStyle = '#1d6fe0'
      ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1)
    })
    const url = canvas.toDataURL('image/jpeg', 0.88)
    return url.slice(url.indexOf(',') + 1)
  } finally {
    bitmap.close()
  }
}

/* ---------- Áp kết quả AI vào thẻ ---------- */

export interface ApplyOutcome {
  questions: number
  skipped: number
  qaCards: number
}

/**
 * Ghi kết quả của một trang: câu hỏi + chữ đọc được cho từng vùng, thẻ hỏi–đáp
 * tổng hợp, tóm tắt trang. Không ghi đè câu hỏi người dùng đã tự sửa, và không
 * xoá thẻ hỏi–đáp đã bắt đầu học.
 */
export async function applyStudy(page: Page, regions: Card[], study: PageStudy, ai: PageAi): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { questions: 0, skipped: 0, qaCards: 0 }
  const byId = new Map(study.regions.map((r) => [r.id, r]))
  await db.transaction('rw', db.cards, db.pages, async () => {
    for (const [i, card] of regions.entries()) {
      const r = byId.get(i + 1)
      const current = await db.cards.get(card.id)
      if (!r || !current) continue
      const patch: Partial<Card> = {}
      if (r.text) patch.answer = r.text
      if (r.skip) outcome.skipped++
      else if (!current.prompt.trim() || current.prompt === current.aiPrompt) {
        patch.prompt = r.question
        patch.aiPrompt = r.question
        outcome.questions++
      }
      if (Object.keys(patch).length) await db.cards.update(card.id, patch)
    }

    // Thay các thẻ hỏi–đáp AI cũ của trang nếu chúng chưa được học lần nào.
    const old = await db.cards.where('pageId').equals(page.id).filter((c) => c.kind === 'qa' && c.origin === 'ai').toArray()
    await db.cards.bulkDelete(old.filter((c) => c.state === 0).map((c) => c.id))
    const kept = new Set(old.filter((c) => c.state !== 0).map((c) => c.prompt))
    const now = Date.now()
    const fresh = study.extra
      .filter((e) => !kept.has(e.question))
      .map((e, i): Card => ({ ...makeCard(page, { x: 0, y: 1 + i / 1000, w: 0, h: 0 }, 'ai', now), kind: 'qa', prompt: e.question, answer: e.answer }))
    if (fresh.length) await db.cards.bulkAdd(fresh)
    outcome.qaCards = fresh.length

    const text = regions
      .map((_, i) => byId.get(i + 1)?.text ?? '')
      .filter(Boolean)
      .join('\n\n')
    await db.pages.update(page.id, { text: text || undefined, summary: study.summary, ai })
  })
  return outcome
}

/* ---------- Xử lý một trang ---------- */

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new AiError('aborted', 'Đã dừng'))), { once: true })
  })

export interface StudyDeps {
  adapter?: ProviderAdapter
  /** Thay bước dựng ảnh trong test (môi trường không có canvas). */
  image?: (page: Page, regions: Card[]) => Promise<string>
  fetch?: typeof fetch
  backoffMs?: number
}

export async function studyPage(pageId: string, config: AiConfig, signal?: AbortSignal, deps: StudyDeps = {}): Promise<ApplyOutcome> {
  const page = await db.pages.get(pageId)
  if (!page) throw new AiError('request', 'Trang không còn tồn tại')
  const note = await db.notes.get(page.noteId)
  const provider = config.provider
  const label = PROVIDERS[provider].label
  const model = modelOf(config)
  const apiKey = keyOf(config)
  if (!apiKey) throw new AiError('auth', `Chưa nhập khoá API cho ${label}`)

  const regions = orderRegions(await db.cards.where('pageId').equals(pageId).toArray())
  const started = performance.now()
  await db.pages.update(pageId, { ai: { status: 'running', provider, model, at: Date.now() } })
  const request: StudyRequest = {
    imageBase64: await (deps.image ?? annotatedImage)(page, regions),
    regionCount: regions.length,
    extraCount: config.extraPerPage,
    language: config.language,
    noteTitle: note?.title ?? '',
  }

  const adapter = deps.adapter ?? ADAPTERS[provider]
  let result: StudyResult | undefined
  let lastError: AiError | undefined
  // Tối đa 3 lần: giới hạn tốc độ, lỗi mạng và JSON hỏng đều đáng thử lại.
  for (let attempt = 1; attempt <= 3 && !result; attempt++) {
    try {
      result = await adapter.study(request, { apiKey, model, signal, fetch: deps.fetch })
    } catch (error) {
      lastError = error instanceof AiError ? error : new AiError('network', error instanceof Error ? error.message : String(error), undefined, { cause: error })
      if (!lastError.retryable || attempt === 3) break
      log.warn('ai', `${label} lỗi tạm thời ở trang ${page.index + 1}, thử lại lần ${attempt + 1}`, { kind: lastError.kind, status: lastError.status, message: lastError.message })
      await wait((deps.backoffMs ?? 1500) * 2 ** (attempt - 1) * (lastError.kind === 'rate' ? 4 : 1), signal)
    }
  }

  if (!result) {
    const error = lastError ?? new AiError('network', 'Lỗi không xác định')
    // Bấm dừng thì trả trang về hàng chờ thay vì đánh dấu lỗi.
    await db.pages.update(pageId, { ai: error.kind === 'aborted' ? { status: 'pending', provider, model } : { status: 'error', provider, model, at: Date.now(), error: error.message } })
    if (error.kind !== 'aborted') log.error('ai', `${label} không xử lý được trang ${page.index + 1} của “${note?.title ?? ''}”`, { kind: error.kind, status: error.status, message: error.message, model, pageId })
    throw error
  }

  const outcome = await applyStudy(page, regions, result.study, { status: 'done', provider, model: result.model, at: Date.now() })
  log.info('ai', `${label} đã đọc trang ${page.index + 1} của “${note?.title ?? ''}”: ${outcome.questions} câu hỏi, ${outcome.qaCards} thẻ tổng hợp`, {
    provider,
    model: result.model,
    pageId,
    regions: regions.length,
    ...outcome,
    summary: result.study.summary.length,
    inputTokens: result.usage.input,
    outputTokens: result.usage.output,
    ms: Math.round(performance.now() - started),
  })
  return outcome
}

/* ---------- Hàng đợi chạy nền ---------- */

const queue: string[] = []
let controller: AbortController | null = null
const state = { get value() { return aiJobs.get() } }

/** Đưa các trang vào hàng đợi AI và chạy lần lượt (mỗi lúc một trang để tránh bị giới hạn tốc độ). */
export async function enqueuePages(pageIds: string[], deps: StudyDeps = {}): Promise<void> {
  const fresh = pageIds.filter((id) => !queue.includes(id))
  if (fresh.length === 0) return
  const config = await getAiConfig()
  await db.transaction('rw', db.pages, async () => {
    for (const id of fresh) await db.pages.update(id, { ai: { status: 'pending', provider: config.provider, model: modelOf(config) } })
  })
  queue.push(...fresh)
  if (state.value.running) return emit({ total: state.value.total + fresh.length })
  emit({ running: true, total: fresh.length, done: 0, failed: 0, lastError: undefined })
  void drain(deps)
}

async function drain(deps: StudyDeps): Promise<void> {
  controller = new AbortController()
  const { signal } = controller
  log.info('ai', `Bắt đầu xử lý ${state.value.total} trang bằng AI`)
  try {
    while (queue.length > 0) {
      const id = queue[0]
      emit({ current: id })
      try {
        // Đọc lại cấu hình cho từng trang để đổi khoá / model giữa chừng có hiệu lực ngay.
        await studyPage(id, await getAiConfig(), signal, deps)
        emit({ done: state.value.done + 1 })
      } catch (error) {
        const e = error as AiError
        if (e.kind === 'aborted') break
        emit({ failed: state.value.failed + 1, lastError: e.message })
        // Sai khoá hoặc hết hạn mức thì các trang sau cũng sẽ hỏng: dừng cả hàng đợi.
        if (e.kind === 'auth' || e.kind === 'rate') break
      }
      queue.shift()
    }
  } finally {
    const left = queue.splice(0)
    if (left.length) log.warn('ai', `Dừng hàng đợi AI, còn ${left.length} trang chưa xử lý`, { reason: signal.aborted ? 'người dùng dừng' : state.value.lastError })
    else log.info('ai', `Xong hàng đợi AI: ${state.value.done} trang thành công, ${state.value.failed} trang lỗi`)
    controller = null
    emit({ running: false, current: undefined })
  }
}

export function stopAiJobs(): void {
  controller?.abort()
}

/** Các trang còn chờ (bị dừng giữa chừng hoặc lần trước lỗi). */
export async function pendingPageIds(noteId?: string): Promise<string[]> {
  const pages = noteId ? await db.pages.where('noteId').equals(noteId).toArray() : await db.pages.toArray()
  return pages
    .filter((p) => p.ai?.status === 'pending' || p.ai?.status === 'running' || p.ai?.status === 'error')
    .sort((a, b) => a.index - b.index)
    .map((p) => p.id)
}

/** Gọi sau khi nhập ghi chú: nếu bật "tự chạy AI" và đã có khoá thì xếp hàng mọi trang mới. */
export async function autoStudyNotes(noteIds: string[]): Promise<number> {
  const config = await getAiConfig()
  if (!config.auto || !keyOf(config) || noteIds.length === 0) return 0
  const ids: string[] = []
  for (const noteId of noteIds) {
    const pages = await db.pages.where('[noteId+index]').between([noteId, 0], [noteId, Infinity]).toArray()
    ids.push(...pages.map((p) => p.id))
  }
  await enqueuePages(ids)
  return ids.length
}
