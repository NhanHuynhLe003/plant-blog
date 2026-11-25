import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeCard } from './cards'
import { db, getStreakMeta, saveSettings, saveStreakMeta } from './db'
import { flushLogs } from './logger'
import { answerCard, emptyDay, loadQueue, rebuildDays, undoReview } from './review'
import { computeStreak } from './streak'
import { applyFreezeManually, flagsOf, reconcileStreak } from './streakService'
import { addDays, DAY_MS, dayKeyOf } from './time'

const NOW = new Date(2026, 5, 15, 10, 0).getTime()
const TODAY = dayKeyOf(NOW, 4)
const page = { id: 'p1', noteId: 'n1', index: 0 }

async function seedCards(n: number) {
  const cards = Array.from({ length: n }, (_, i) => makeCard(page, { x: 0, y: i / n, w: 1, h: 0.05 }, 'auto', NOW - DAY_MS))
  await db.cards.bulkAdd(cards)
  return cards
}
async function seedStreak(lastDay: string, length: number) {
  for (let i = 0; i < length; i++) await db.days.put({ ...emptyDay(addDays(lastDay, -i), 5), reviews: 5, good: 5, qualified: true })
}

beforeEach(async () => {
  await flushLogs()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('answerCard', () => {
  it('cập nhật lịch thẻ, ghi lượt ôn và thống kê ngày', async () => {
    const [card] = await seedCards(3)
    const res = await answerCard(card.id, 3, 5000, NOW)
    expect(res.card.state).not.toBe(0)
    expect(res.card.due).toBeGreaterThan(NOW)
    expect(res.card.due).toBe(res.card.sched.due)
    const review = await db.reviews.get(res.reviewId)
    expect(review).toMatchObject({ cardId: card.id, rating: 3, day: TODAY, stateBefore: 0, durationMs: 5000 })
    expect(await db.days.get(TODAY)).toMatchObject({ reviews: 1, good: 1, newCards: 1, timeMs: 5000, qualified: false })
  })

  it('giới hạn thẻ mới mỗi ngày', async () => {
    await saveSettings({ newPerDay: 2, dailyGoal: 50 })
    const cards = await seedCards(5)
    expect((await loadQueue(NOW)).counts.fresh).toBe(2)
    await answerCard(cards[0].id, 4, 1000, NOW)
    expect((await loadQueue(NOW)).counts.fresh).toBe(1)
    await answerCard(cards[1].id, 4, 1000, NOW)
    const q = await loadQueue(NOW)
    expect(q.counts.fresh).toBe(0)
    expect(q.ready).toHaveLength(0)
  })

  it('đạt mục tiêu ngày → tính chuỗi; mốc 7 ngày được thưởng lá chắn đúng một lần', async () => {
    await saveSettings({ dailyGoal: 2, newPerDay: 10 })
    await saveStreakMeta({ freezes: 0 })
    await seedStreak(addDays(TODAY, -1), 6)
    const cards = await seedCards(4)
    expect((await answerCard(cards[0].id, 3, 1000, NOW)).justQualified).toBe(false)
    const second = await answerCard(cards[1].id, 3, 1000, NOW)
    expect(second).toMatchObject({ justQualified: true, streak: 7, freezeEarned: true })
    expect((await getStreakMeta()).freezes).toBe(1)

    // Hoàn tác rồi chấm lại không được thưởng thêm.
    await undoReview(second.reviewId)
    expect((await db.days.get(TODAY))!.qualified).toBe(false)
    const again = await answerCard(cards[1].id, 3, 1000, NOW)
    expect(again).toMatchObject({ justQualified: true, freezeEarned: false })
    expect((await getStreakMeta()).freezes).toBe(1)
  })

  it('ôn hết thẻ đến hạn cũng tính là hoàn thành dù chưa đủ mục tiêu', async () => {
    await saveSettings({ dailyGoal: 20, newPerDay: 1 })
    const [card] = await seedCards(1)
    const res = await answerCard(card.id, 4, 1000, NOW)
    expect(res).toMatchObject({ remaining: 0, justQualified: true, streak: 1 })
  })

  it('thẻ bị chấm Quên vẫn còn trong hàng đợi nên chưa tính hoàn thành', async () => {
    await saveSettings({ dailyGoal: 20, newPerDay: 1 })
    const [card] = await seedCards(1)
    const res = await answerCard(card.id, 1, 1000, NOW)
    expect(res.remaining).toBe(1)
    expect(res.justQualified).toBe(false)
  })
})

describe('undoReview', () => {
  it('khôi phục nguyên trạng thẻ và thống kê', async () => {
    const [card] = await seedCards(2)
    const before = await db.cards.get(card.id)
    const res = await answerCard(card.id, 1, 3000, NOW)
    await undoReview(res.reviewId)
    expect(await db.cards.get(card.id)).toEqual(before)
    expect(await db.reviews.count()).toBe(0)
    expect(await db.days.get(TODAY)).toMatchObject({ reviews: 0, again: 0, newCards: 0, timeMs: 0 })
    expect(await undoReview(res.reviewId)).toBeNull()
  })
})

describe('reconcileStreak', () => {
  it('tự dùng lá chắn cho ngày bị lỡ và giữ chuỗi', async () => {
    await saveStreakMeta({ freezes: 2 })
    await seedStreak(addDays(TODAY, -2), 4) // nghỉ hôm qua
    await reconcileStreak(NOW)
    expect((await db.days.get(addDays(TODAY, -1)))!.frozen).toBe(true)
    expect((await getStreakMeta()).freezes).toBe(1)
    expect(computeStreak(flagsOf(await db.days.toArray()), TODAY)).toMatchObject({ current: 4, status: 'pending' })
    // Gọi lại không tiêu thêm lá chắn.
    await reconcileStreak(NOW)
    expect((await getStreakMeta()).freezes).toBe(1)
  })

  it('không phí lá chắn khi nghỉ quá lâu; ghi nhận đứt chuỗi đúng một lần', async () => {
    await saveStreakMeta({ freezes: 2 })
    await seedStreak(addDays(TODAY, -5), 4)
    await reconcileStreak(NOW)
    await reconcileStreak(NOW)
    await flushLogs()
    expect((await getStreakMeta()).freezes).toBe(2)
    expect(computeStreak(flagsOf(await db.days.toArray()), TODAY).current).toBe(0)
    const broken = await db.logs.filter((l) => l.category === 'streak' && l.level === 'warn').toArray()
    expect(broken).toHaveLength(1)
    expect(broken[0].message).toContain('4 ngày')
  })

  it('tắt tự động thì giữ lá chắn, người dùng tự cứu chuỗi được', async () => {
    await saveSettings({ autoFreeze: false })
    await saveStreakMeta({ freezes: 1 })
    await seedStreak(addDays(TODAY, -2), 3)
    await reconcileStreak(NOW)
    expect((await getStreakMeta()).freezes).toBe(1)
    expect(await applyFreezeManually(NOW)).toBe(true)
    expect((await getStreakMeta()).freezes).toBe(0)
    expect(computeStreak(flagsOf(await db.days.toArray()), TODAY).current).toBe(3)
  })
})

describe('rebuildDays', () => {
  it('dựng lại đúng thống kê từ nhật ký lượt ôn, giữ ngày lá chắn', async () => {
    await saveSettings({ dailyGoal: 2 })
    const cards = await seedCards(3)
    await answerCard(cards[0].id, 3, 1000, NOW)
    await answerCard(cards[1].id, 1, 2000, NOW)
    const frozenDay = addDays(TODAY, -1)
    await db.days.put({ ...emptyDay(frozenDay, 2), frozen: true })
    const expected = await db.days.get(TODAY)
    await db.days.update(TODAY, { reviews: 99, good: 42 })
    await rebuildDays()
    expect(await db.days.get(TODAY)).toEqual(expected)
    expect((await db.days.get(frozenDay))!.frozen).toBe(true)
  })
})
