import type { Card } from './types'

export interface Queue {
  /** Thẻ sẵn sàng ôn ngay, theo thứ tự ưu tiên. */
  ready: Card[]
  counts: { learning: number; review: number; fresh: number }
  /** Hết thẻ sẵn sàng nhưng còn thẻ đang học sẽ đến hạn lúc này. */
  waitingUntil?: number
}

export const LEARN_AHEAD_MS = 20 * 60_000

const byPosition = (a: Card, b: Card) =>
  a.noteId === b.noteId
    ? a.pageIndex - b.pageIndex || a.rect.y - b.rect.y || a.rect.x - b.rect.x
    : a.createdAt - b.createdAt || (a.noteId < b.noteId ? -1 : 1)

/**
 * Xếp hàng ôn tập cho một phiên: thẻ đang học đến hạn → thẻ ôn tập đến hạn
 * trong hôm nay → thẻ mới (giới hạn theo hạn mức mỗi ngày, theo thứ tự trong ghi chú).
 */
export function buildQueue(cards: Card[], now: number, dayEnd: number, newLeft: number): Queue {
  const active = cards.filter((c) => !c.suspended)
  const learningAll = active.filter((c) => (c.state === 1 || c.state === 3) && c.due < dayEnd).sort((a, b) => a.due - b.due)
  const learningNow = learningAll.filter((c) => c.due <= now)
  const learningLater = learningAll.filter((c) => c.due > now)
  const review = active.filter((c) => c.state === 2 && c.due < dayEnd).sort((a, b) => a.due - b.due)
  const fresh = active
    .filter((c) => c.state === 0)
    .sort(byPosition)
    .slice(0, Math.max(0, newLeft))

  let ready = [...learningNow, ...review, ...fresh]
  let waitingUntil: number | undefined
  if (ready.length === 0 && learningLater.length > 0) {
    // Không còn gì khác: cho học trước thẻ sắp đến hạn thay vì bắt người dùng chờ.
    if (learningLater[0].due <= now + LEARN_AHEAD_MS) ready = [learningLater[0]]
    else waitingUntil = learningLater[0].due
  }
  return { ready, counts: { learning: learningAll.length, review: review.length, fresh: fresh.length }, waitingUntil }
}

export function queueTotal(q: Queue): number {
  return q.counts.learning + q.counts.review + q.counts.fresh
}
