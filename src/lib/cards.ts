import { db, uid } from './db'
import { grayOf } from './image'
import { log } from './logger'
import { newSched } from './scheduler'
import { iou, segmentGray } from './segment'
import type { Card, Granularity, Page, Rect } from './types'

export function makeCard(page: Pick<Page, 'id' | 'noteId' | 'index'>, rect: Rect, origin: Card['origin'], now = Date.now()): Card {
  const sched = newSched(now)
  return {
    id: uid(),
    noteId: page.noteId,
    pageId: page.id,
    pageIndex: page.index,
    rect,
    prompt: '',
    origin,
    createdAt: now,
    suspended: 0,
    due: sched.due,
    state: sched.state,
    sched,
  }
}

export async function addCard(page: Page, rect: Rect): Promise<Card> {
  const card = makeCard(page, rect, 'manual')
  await db.cards.add(card)
  log.info('card', 'Tạo thẻ thủ công', { cardId: card.id, noteId: page.noteId, page: page.index + 1 })
  return card
}

export async function deleteCards(ids: string[], reason = 'người dùng xoá'): Promise<void> {
  if (ids.length === 0) return
  await db.cards.bulkDelete(ids)
  log.info('card', `Xoá ${ids.length} thẻ`, { reason, ids: ids.slice(0, 20) })
}

/** Tìm các khối nội dung trên trang bằng thuật toán tách vùng. */
export async function detectRects(page: Page, granularity: Granularity): Promise<Rect[]> {
  const bitmap = await createImageBitmap(page.blob)
  try {
    const { gray, width, height } = grayOf(bitmap, bitmap.width, bitmap.height)
    return segmentGray(gray, width, height, { granularity })
  } finally {
    bitmap.close()
  }
}

/** Tự tạo thẻ cho trang, bỏ qua vùng trùng với thẻ đã có. */
export async function autoCreateCards(page: Page, granularity: Granularity, rects?: Rect[]): Promise<Card[]> {
  const found = rects ?? (await detectRects(page, granularity))
  const existing = await db.cards.where('pageId').equals(page.id).toArray()
  const fresh = found.filter((r) => !existing.some((c) => iou(c.rect, r) > 0.4))
  const now = Date.now()
  const cards = fresh.map((r) => makeCard(page, r, 'auto', now))
  if (cards.length > 0) await db.cards.bulkAdd(cards)
  log.info('card', `Tự động tách trang ${page.index + 1}: ${cards.length} thẻ mới`, {
    noteId: page.noteId,
    pageId: page.id,
    granularity,
    detected: found.length,
    skipped: found.length - fresh.length,
  })
  return cards
}

export async function deleteNote(noteId: string): Promise<void> {
  const note = await db.notes.get(noteId)
  await db.transaction('rw', db.notes, db.pages, db.cards, async () => {
    await db.cards.where('noteId').equals(noteId).delete()
    await db.pages.where('noteId').equals(noteId).delete()
    await db.notes.delete(noteId)
  })
  log.warn('card', `Xoá ghi chú “${note?.title ?? noteId}”`, { noteId })
}
