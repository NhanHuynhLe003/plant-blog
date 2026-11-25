import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type FSRS, type Grade } from 'ts-fsrs'
import type { CardState, Rating, SchedState } from './types'

/**
 * Lớp bọc mỏng quanh ts-fsrs (thuật toán FSRS — thế hệ sau của SM-2):
 * lưu trạng thái dạng số thuần để ghi vào IndexedDB và hoàn tác dễ dàng.
 */
const cache = new Map<number, FSRS>()

export function scheduler(retention = 0.9): FSRS {
  const key = Math.round(retention * 100)
  let f = cache.get(key)
  if (!f) {
    f = fsrs(generatorParameters({ request_retention: key / 100, maximum_interval: 36500, enable_fuzz: true, enable_short_term: true }))
    cache.set(key, f)
  }
  return f
}

export function toFsrs(s: SchedState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as number,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as FsrsCard
}

export function fromFsrs(c: FsrsCard): SchedState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as CardState,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  }
}

export function newSched(now: number): SchedState {
  return fromFsrs(createEmptyCard(new Date(now)))
}

export function grade(s: SchedState, now: number, rating: Rating, retention = 0.9): SchedState {
  return fromFsrs(scheduler(retention).next(toFsrs(s), new Date(now), rating as unknown as Grade).card)
}

/** Lịch kế tiếp cho cả 4 mức chấm, để hiện trên các nút. */
export function preview(s: SchedState, now: number, retention = 0.9): Record<Rating, SchedState> {
  const p = scheduler(retention).repeat(toFsrs(s), new Date(now))
  return {
    1: fromFsrs(p[1 as Grade].card),
    2: fromFsrs(p[2 as Grade].card),
    3: fromFsrs(p[3 as Grade].card),
    4: fromFsrs(p[4 as Grade].card),
  }
}

/** Xác suất còn nhớ thẻ ở thời điểm now (0..1); thẻ mới trả về null. */
export function retrievability(s: SchedState, now: number, retention = 0.9): number | null {
  if (s.state === 0 || !s.last_review) return null
  return scheduler(retention).get_retrievability(toFsrs(s), new Date(now), false)
}

export function formatInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '<1 phút'
  if (min < 60) return `${Math.round(min)} phút`
  const hours = min / 60
  if (hours < 24) return `${Math.round(hours)} giờ`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)} ngày`
  if (days < 365) return `${(days / 30).toFixed(days < 300 ? 1 : 0).replace('.0', '')} tháng`
  return `${(days / 365).toFixed(1).replace('.0', '')} năm`
}

export const RATING_LABEL: Record<Rating, string> = { 1: 'Quên', 2: 'Khó', 3: 'Được', 4: 'Dễ' }
export const STATE_LABEL: Record<CardState, string> = { 0: 'Mới', 1: 'Đang học', 2: 'Ôn tập', 3: 'Học lại' }
