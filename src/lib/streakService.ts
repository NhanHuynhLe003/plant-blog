import { db, getSettings, getStreakMeta, saveStreakMeta } from './db'
import { log } from './logger'
import { emptyDay } from './review'
import { planFreezes, type DayFlags } from './streak'
import { dayKeyOf } from './time'
import type { DayStat } from './types'

export function flagsOf(days: DayStat[]): DayFlags {
  return new Map(days.map((d) => [d.day, { qualified: d.qualified, frozen: d.frozen }]))
}

/**
 * Chạy khi mở ứng dụng / sang ngày mới: dùng lá chắn cho các ngày bị bỏ lỡ
 * hoặc ghi nhận chuỗi đã đứt. Gọi lặp lại bao nhiêu lần cũng cho cùng kết quả.
 */
export async function reconcileStreak(now = Date.now()): Promise<void> {
  const s = await getSettings()
  const today = dayKeyOf(now, s.rolloverHour)
  const outcome = await db.transaction('rw', db.days, db.meta, async () => {
    const meta = await getStreakMeta()
    const plan = planFreezes(flagsOf(await db.days.toArray()), today, meta.freezes, s.autoFreeze)
    if (plan.freeze.length > 0) {
      for (const day of plan.freeze) {
        const stat = (await db.days.get(day)) ?? emptyDay(day, s.dailyGoal)
        await db.days.put({ ...stat, frozen: true })
      }
      await saveStreakMeta({ ...meta, freezes: meta.freezes - plan.freeze.length })
      return { kind: 'frozen' as const, plan, left: meta.freezes - plan.freeze.length }
    }
    if (plan.broken && meta.lastBrokenAfter !== plan.lastOkDay) {
      await saveStreakMeta({ ...meta, lastBrokenAfter: plan.lastOkDay })
      return { kind: 'broken' as const, plan, left: meta.freezes }
    }
    return null
  })
  if (outcome?.kind === 'frozen') {
    log.info('streak', `Dùng ${outcome.plan.freeze.length} lá chắn giữ chuỗi ${outcome.plan.streak} ngày`, { days: outcome.plan.freeze, freezesLeft: outcome.left })
  } else if (outcome?.kind === 'broken') {
    log.warn('streak', `Chuỗi ${outcome.plan.streak} ngày đã đứt`, { lastActiveDay: outcome.plan.lastOkDay, freezes: outcome.left, autoFreeze: s.autoFreeze })
  }
}

/** Người dùng tự dùng lá chắn cho hôm qua (khi đã tắt tự động). */
export async function applyFreezeManually(now = Date.now()): Promise<boolean> {
  const s = await getSettings()
  const today = dayKeyOf(now, s.rolloverHour)
  const done = await db.transaction('rw', db.days, db.meta, async () => {
    const meta = await getStreakMeta()
    const plan = planFreezes(flagsOf(await db.days.toArray()), today, meta.freezes, true)
    if (plan.freeze.length === 0) return null
    for (const day of plan.freeze) {
      const stat = (await db.days.get(day)) ?? emptyDay(day, s.dailyGoal)
      await db.days.put({ ...stat, frozen: true })
    }
    await saveStreakMeta({ ...meta, freezes: meta.freezes - plan.freeze.length })
    return plan
  })
  if (done) log.info('streak', `Dùng thủ công ${done.freeze.length} lá chắn giữ chuỗi ${done.streak} ngày`, { days: done.freeze })
  return !!done
}
