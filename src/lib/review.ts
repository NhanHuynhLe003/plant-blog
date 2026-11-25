import { db, getSettings, getStreakMeta, saveStreakMeta } from './db'
import { log } from './logger'
import { buildQueue, queueTotal, type Queue } from './queue'
import { formatInterval, grade, RATING_LABEL } from './scheduler'
import { computeStreak, earnsFreeze, type DayFlags } from './streak'
import { dayEndTs, dayKeyOf, formatDayVi } from './time'
import type { Card, DayStat, Rating, ReviewEntry } from './types'

const RATING_KEY = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' } as const
/** Thời gian tối đa tính cho một thẻ, tránh phồng thống kê khi bỏ máy. */
const MAX_CARD_MS = 120_000

export function emptyDay(day: string, goal: number): DayStat {
  return { day, reviews: 0, again: 0, hard: 0, good: 0, easy: 0, newCards: 0, timeMs: 0, goal, qualified: false, frozen: false }
}

export interface LoadedQueue extends Queue {
  today: string
  stat: DayStat
}

export async function loadQueue(now = Date.now(), noteId?: string): Promise<LoadedQueue> {
  const s = await getSettings()
  const today = dayKeyOf(now, s.rolloverHour)
  const cards = noteId ? await db.cards.where('noteId').equals(noteId).toArray() : await db.cards.toArray()
  const stat = (await db.days.get(today)) ?? emptyDay(today, s.dailyGoal)
  const queue = buildQueue(cards, now, dayEndTs(today, s.rolloverHour), s.newPerDay - stat.newCards)
  return { ...queue, today, stat }
}

export interface AnswerResult {
  reviewId: number
  card: Card
  stat: DayStat
  remaining: number
  justQualified: boolean
  freezeEarned: boolean
  streak: number
}

export async function answerCard(cardId: string, rating: Rating, durationMs: number, now = Date.now()): Promise<AnswerResult> {
  const s = await getSettings()
  const today = dayKeyOf(now, s.rolloverHour)

  const result = await db.transaction('rw', db.cards, db.reviews, db.days, db.meta, async (): Promise<AnswerResult> => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`Không tìm thấy thẻ ${cardId}`)
    const prev = card.sched
    const next = grade(prev, now, rating, s.retention)
    const updated: Card = { ...card, sched: next, due: next.due, state: next.state }
    await db.cards.put(updated)

    const reviewId = await db.reviews.add({
      cardId,
      noteId: card.noteId,
      ts: now,
      day: today,
      rating,
      stateBefore: prev.state,
      stateAfter: next.state,
      scheduledDays: next.scheduled_days,
      stability: next.stability,
      difficulty: next.difficulty,
      durationMs,
      prev,
    })

    const stat = (await db.days.get(today)) ?? emptyDay(today, s.dailyGoal)
    stat.reviews++
    stat[RATING_KEY[rating]]++
    if (prev.state === 0) stat.newCards++
    stat.timeMs += Math.min(durationMs, MAX_CARD_MS)
    stat.goal = s.dailyGoal

    const all = await db.cards.toArray()
    const remaining = queueTotal(buildQueue(all, now, dayEndTs(today, s.rolloverHour), s.newPerDay - stat.newCards))

    let justQualified = false
    let freezeEarned = false
    let streak = 0
    // Một ngày được tính vào chuỗi khi đạt mục tiêu, hoặc ôn hết mọi thẻ đến hạn.
    if (!stat.qualified && (stat.reviews >= stat.goal || remaining === 0)) {
      stat.qualified = true
      stat.qualifiedAt = now
      justQualified = true
    }
    await db.days.put(stat)

    if (justQualified) {
      const flags: DayFlags = new Map((await db.days.toArray()).map((d) => [d.day, { qualified: d.qualified, frozen: d.frozen }]))
      streak = computeStreak(flags, today).current
      const meta = await getStreakMeta()
      if (earnsFreeze(streak) && meta.lastAwardDay !== today) {
        freezeEarned = meta.freezes < s.maxFreezes
        await saveStreakMeta({ ...meta, freezes: Math.min(s.maxFreezes, meta.freezes + 1), lastAwardDay: today })
      }
    }
    return { reviewId, card: updated, stat, remaining, justQualified, freezeEarned, streak }
  })

  const { card, stat } = result
  log.info('review', `Chấm “${RATING_LABEL[rating]}” · hẹn lại sau ${formatInterval(card.due - now)}`, {
    cardId,
    noteId: card.noteId,
    rating,
    durationMs,
    state: card.state,
    stability: +card.sched.stability.toFixed(2),
    difficulty: +card.sched.difficulty.toFixed(2),
    due: new Date(card.due).toISOString(),
    todayReviews: stat.reviews,
  })
  if (result.justQualified) log.info('streak', `Hoàn thành ngày ${formatDayVi(today)} · chuỗi ${result.streak} ngày`, { day: today, reviews: stat.reviews, goal: stat.goal, streak: result.streak })
  if (result.freezeEarned) log.info('streak', `Nhận 1 lá chắn chuỗi (mốc ${result.streak} ngày)`, { streak: result.streak })
  return result
}

/** Hoàn tác một lượt chấm: khôi phục lịch cũ của thẻ và trừ thống kê ngày. */
export async function undoReview(reviewId: number): Promise<ReviewEntry | null> {
  const entry = await db.transaction('rw', db.cards, db.reviews, db.days, async () => {
    const r = await db.reviews.get(reviewId)
    if (!r) return null
    const card = await db.cards.get(r.cardId)
    if (card) await db.cards.put({ ...card, sched: r.prev, due: r.prev.due, state: r.prev.state })
    await db.reviews.delete(reviewId)
    const stat = await db.days.get(r.day)
    if (stat) {
      stat.reviews = Math.max(0, stat.reviews - 1)
      stat[RATING_KEY[r.rating]] = Math.max(0, stat[RATING_KEY[r.rating]] - 1)
      if (r.stateBefore === 0) stat.newCards = Math.max(0, stat.newCards - 1)
      stat.timeMs = Math.max(0, stat.timeMs - Math.min(r.durationMs, MAX_CARD_MS))
      if (stat.qualified && stat.reviews < stat.goal) {
        stat.qualified = false
        delete stat.qualifiedAt
      }
      await db.days.put(stat)
    }
    return r
  })
  if (entry) log.info('review', `Hoàn tác lượt chấm “${RATING_LABEL[entry.rating]}”`, { reviewId, cardId: entry.cardId })
  return entry
}

/** Dựng lại bảng thống kê ngày từ nhật ký ôn tập (giữ nguyên cờ lá chắn). */
export async function rebuildDays(): Promise<number> {
  const s = await getSettings()
  const n = await db.transaction('rw', db.reviews, db.days, async () => {
    const old = new Map((await db.days.toArray()).map((d) => [d.day, d]))
    const next = new Map<string, DayStat>()
    await db.reviews.orderBy('ts').each((r) => {
      const stat = next.get(r.day) ?? emptyDay(r.day, old.get(r.day)?.goal ?? s.dailyGoal)
      stat.reviews++
      stat[RATING_KEY[r.rating]]++
      if (r.stateBefore === 0) stat.newCards++
      stat.timeMs += Math.min(r.durationMs, MAX_CARD_MS)
      next.set(r.day, stat)
    })
    for (const [day, o] of old) {
      const stat = next.get(day)
      if (stat) {
        stat.frozen = o.frozen
        stat.qualified = o.qualified || stat.reviews >= stat.goal
        stat.qualifiedAt = o.qualifiedAt
      } else if (o.frozen) next.set(day, { ...emptyDay(day, o.goal), frozen: true })
    }
    for (const stat of next.values()) if (!old.has(stat.day)) stat.qualified = stat.reviews >= stat.goal
    await db.days.clear()
    await db.days.bulkPut([...next.values()])
    return next.size
  })
  log.info('system', `Dựng lại thống kê cho ${n} ngày từ nhật ký ôn tập`)
  return n
}
