import { describe, expect, it } from 'vitest'
import { computeStreak, earnsFreeze, nextMilestone, planFreezes, streakRuns, type DayFlags } from './streak'
import { addDays } from './time'

const Q = { qualified: true, frozen: false }
const F = { qualified: false, frozen: true }
const flags = (entries: Record<string, typeof Q>): DayFlags => new Map(Object.entries(entries))
const span = (from: string, n: number): Record<string, typeof Q> => Object.fromEntries(Array.from({ length: n }, (_, i) => [addDays(from, i), Q]))

describe('computeStreak', () => {
  it('chưa có dữ liệu thì không có chuỗi', () => {
    expect(computeStreak(new Map(), '2026-03-10')).toMatchObject({ current: 0, longest: 0, status: 'none' })
  })

  it('đếm cả hôm nay khi đã đạt mục tiêu', () => {
    const s = computeStreak(flags(span('2026-03-06', 5)), '2026-03-10')
    expect(s).toMatchObject({ current: 5, status: 'done', startDay: '2026-03-06', lastQualifiedDay: '2026-03-10' })
  })

  it('chuỗi vẫn sống khi hôm nay chưa ôn nhưng hôm qua đã đạt', () => {
    const s = computeStreak(flags(span('2026-03-06', 4)), '2026-03-10')
    expect(s).toMatchObject({ current: 4, status: 'pending' })
  })

  it('đứt khi bỏ trống hôm qua', () => {
    const s = computeStreak(flags(span('2026-03-01', 5)), '2026-03-10')
    expect(s).toMatchObject({ current: 0, status: 'none', longest: 5 })
  })

  it('ngày dùng lá chắn nối chuỗi nhưng không được cộng', () => {
    const s = computeStreak(flags({ ...span('2026-03-01', 3), '2026-03-04': F, ...span('2026-03-05', 2) }), '2026-03-06')
    expect(s).toMatchObject({ current: 5, status: 'done', startDay: '2026-03-01' })
  })

  it('vượt qua ranh giới tháng và năm', () => {
    const s = computeStreak(flags(span('2025-12-28', 8)), '2026-01-04')
    expect(s.current).toBe(8)
  })
})

describe('streakRuns', () => {
  it('tách các chuỗi và bỏ lá chắn ở rìa', () => {
    const runs = streakRuns(flags({ ...span('2026-01-01', 3), '2026-01-04': F, ...span('2026-01-10', 2), '2026-01-12': F, ...span('2026-01-13', 1) }))
    expect(runs).toEqual([
      { start: '2026-01-01', end: '2026-01-03', length: 3, frozenDays: 0 },
      { start: '2026-01-10', end: '2026-01-13', length: 3, frozenDays: 1 },
    ])
  })
})

describe('planFreezes', () => {
  const base = flags(span('2026-03-01', 5)) // hoạt động đến 05/03

  it('không làm gì khi hôm qua đã đạt', () => {
    expect(planFreezes(base, '2026-03-06', 2)).toMatchObject({ freeze: [], broken: false })
  })

  it('dùng lá chắn khi che được toàn bộ khoảng trống', () => {
    expect(planFreezes(base, '2026-03-08', 2)).toMatchObject({ freeze: ['2026-03-06', '2026-03-07'], broken: false, streak: 5 })
  })

  it('không phí lá chắn khi khoảng trống quá dài', () => {
    expect(planFreezes(base, '2026-03-10', 2)).toMatchObject({ freeze: [], broken: true, streak: 5, lastOkDay: '2026-03-05' })
  })

  it('báo đứt khi tắt tự động dùng lá chắn', () => {
    expect(planFreezes(base, '2026-03-07', 2, false)).toMatchObject({ freeze: [], broken: true })
  })

  it('áp dụng lại sau khi đã đóng băng thì không đổi gì', () => {
    const plan = planFreezes(base, '2026-03-07', 1)
    const after = new Map(base)
    for (const d of plan.freeze) after.set(d, F)
    expect(planFreezes(after, '2026-03-07', 0)).toMatchObject({ freeze: [], broken: false })
    expect(computeStreak(after, '2026-03-07')).toMatchObject({ current: 5, status: 'pending' })
  })
})

describe('phần thưởng và cột mốc', () => {
  it('thưởng lá chắn mỗi 7 ngày', () => {
    expect([0, 6, 7, 8, 14].map(earnsFreeze)).toEqual([false, false, true, false, true])
  })
  it('tìm cột mốc kế tiếp', () => {
    expect(nextMilestone(0)).toBe(3)
    expect(nextMilestone(7)).toBe(14)
    expect(nextMilestone(400)).toBeUndefined()
  })
})
