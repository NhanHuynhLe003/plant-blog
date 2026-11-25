import { describe, expect, it } from 'vitest'
import { buildGrid, levelOf, quantileThresholds } from './heatmap'
import { buildQueue, queueTotal } from './queue'
import { formatInterval, grade, newSched, preview, retrievability } from './scheduler'
import { addDays, DAY_MS, dayEndTs, dayKeyOf, dayStartTs, diffDays, weekdayMon } from './time'
import type { Card, CardState } from './types'

describe('time', () => {
  it('ôn trước giờ chuyển ngày vẫn tính cho hôm trước', () => {
    const t = new Date(2026, 2, 10, 2, 30).getTime()
    expect(dayKeyOf(t, 4)).toBe('2026-03-09')
    expect(dayKeyOf(t, 0)).toBe('2026-03-10')
    expect(dayKeyOf(new Date(2026, 2, 10, 4, 0).getTime(), 4)).toBe('2026-03-10')
  })
  it('cộng trừ ngày qua ranh giới tháng, năm nhuận', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(diffDays('2025-12-25', '2026-01-04')).toBe(10)
  })
  it('khoảng của một ngày học dài 24 giờ tính từ giờ chuyển ngày', () => {
    expect(dayEndTs('2026-03-10', 4) - dayStartTs('2026-03-10', 4)).toBe(DAY_MS)
    expect(new Date(dayStartTs('2026-03-10', 4)).getHours()).toBe(4)
  })
  it('thứ Hai là đầu tuần', () => {
    expect(weekdayMon('2026-11-23')).toBe(0)
    expect(weekdayMon('2026-11-29')).toBe(6)
  })
})

describe('scheduler (FSRS)', () => {
  const now = new Date(2026, 0, 1, 9).getTime()

  it('thẻ mới: khoảng hẹn tăng dần từ Quên đến Dễ', () => {
    const p = preview(newSched(now), now)
    expect(p[1].due).toBeLessThanOrEqual(p[2].due)
    expect(p[2].due).toBeLessThanOrEqual(p[3].due)
    expect(p[3].due).toBeLessThan(p[4].due)
    expect(p[4].state).toBe(2)
    expect(p[1].state).toBe(1)
  })

  it('nhớ tốt liên tục thì khoảng hẹn dài dần', () => {
    let s = newSched(now)
    let t = now
    const intervals: number[] = []
    for (let i = 0; i < 6; i++) {
      s = grade(s, t, 3)
      intervals.push(s.due - t)
      t = s.due
    }
    expect(s.state).toBe(2)
    expect(intervals[5]).toBeGreaterThan(intervals[2])
    expect(intervals[5]).toBeGreaterThan(20 * DAY_MS)
  })

  it('quên thẻ đang ôn → học lại, tăng số lần quên', () => {
    let s = grade(newSched(now), now, 4)
    const t = s.due
    s = grade(s, t, 1)
    expect(s.state).toBe(3)
    expect(s.lapses).toBe(1)
    expect(s.due - t).toBeLessThan(DAY_MS)
  })

  it('độ ghi nhớ giảm dần theo thời gian', () => {
    const s = grade(newSched(now), now, 4)
    expect(retrievability(newSched(now), now)).toBeNull()
    const r0 = retrievability(s, now + 1000)!
    const r1 = retrievability(s, now + 30 * DAY_MS)!
    expect(r0).toBeGreaterThan(0.95)
    expect(r1).toBeLessThan(r0)
  })

  it('mục tiêu ghi nhớ cao hơn thì hẹn lại sớm hơn', () => {
    const lo = grade(newSched(now), now, 4, 0.8)
    const hi = grade(newSched(now), now, 4, 0.95)
    expect(hi.scheduled_days).toBeLessThan(lo.scheduled_days)
  })

  it('định dạng khoảng thời gian', () => {
    expect(formatInterval(30_000)).toBe('<1 phút')
    expect(formatInterval(10 * 60_000)).toBe('10 phút')
    expect(formatInterval(3 * DAY_MS)).toBe('3 ngày')
    expect(formatInterval(45 * DAY_MS)).toBe('1.5 tháng')
    expect(formatInterval(730 * DAY_MS)).toBe('2 năm')
  })
})

describe('buildQueue', () => {
  const now = 1_000_000
  const dayEnd = now + 10 * 3_600_000
  let n = 0
  const card = (state: CardState, due: number, extra: Partial<Card> = {}): Card => ({
    id: `c${n++}`,
    noteId: 'n1',
    pageId: 'p1',
    pageIndex: 0,
    rect: { x: 0, y: n / 100, w: 0.5, h: 0.05 },
    prompt: '',
    origin: 'auto',
    createdAt: 0,
    suspended: 0,
    due,
    state,
    sched: {} as Card['sched'],
    ...extra,
  })

  it('ưu tiên đang học → ôn tập → thẻ mới, và giới hạn thẻ mới', () => {
    const cards = [card(0, 0), card(0, 0), card(0, 0), card(2, now - 5), card(2, dayEnd + 1), card(1, now - 1), card(3, now + 60_000)]
    const q = buildQueue(cards, now, dayEnd, 2)
    expect(q.ready.map((c) => c.state)).toEqual([1, 2, 0, 0])
    expect(q.counts).toEqual({ learning: 2, review: 1, fresh: 2 })
    expect(queueTotal(q)).toBe(5)
  })

  it('thẻ mới theo thứ tự trang rồi vị trí trên trang', () => {
    const a = card(0, 0, { pageIndex: 1, rect: { x: 0, y: 0.1, w: 1, h: 0.1 } })
    const b = card(0, 0, { pageIndex: 0, rect: { x: 0, y: 0.8, w: 1, h: 0.1 } })
    const c = card(0, 0, { pageIndex: 0, rect: { x: 0, y: 0.2, w: 1, h: 0.1 } })
    expect(buildQueue([a, b, c], now, dayEnd, 10).ready.map((x) => x.id)).toEqual([c.id, b.id, a.id])
  })

  it('bỏ qua thẻ tạm dừng', () => {
    expect(buildQueue([card(2, now - 1, { suspended: 1 })], now, dayEnd, 5).ready).toHaveLength(0)
  })

  it('học trước thẻ sắp đến hạn khi không còn gì khác; nếu còn xa thì chờ', () => {
    const soon = buildQueue([card(1, now + 5 * 60_000)], now, dayEnd, 0)
    expect(soon.ready).toHaveLength(1)
    const far = buildQueue([card(1, now + 2 * 3_600_000)], now, dayEnd, 0)
    expect(far.ready).toHaveLength(0)
    expect(far.waitingUntil).toBe(now + 2 * 3_600_000)
  })
})

describe('heatmap', () => {
  it('ngưỡng theo tứ phân vị luôn tăng nghiêm ngặt', () => {
    expect(quantileThresholds([])).toEqual([1, 2, 3])
    const t = quantileThresholds([1, 1, 1, 1, 200])
    expect(t[0]).toBeLessThan(t[1])
    expect(t[1]).toBeLessThan(t[2])
    expect(levelOf(0, t)).toBe(0)
    expect(levelOf(1, t)).toBe(1)
    expect(levelOf(200, t)).toBe(4)
  })

  it('dựng lưới theo tuần bắt đầu từ thứ Hai', () => {
    // 2026-11-25 là thứ Tư
    const values = new Map([
      ['2026-11-25', 12],
      ['2026-11-02', 3],
    ])
    const g = buildGrid('2026-11-01', '2026-11-30', values, '2026-11-25')
    expect(g.weeks.every((w) => w.length === 7)).toBe(true)
    expect(g.weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]) // 01/11 là Chủ nhật
    expect(g.weeks[0][6]?.day).toBe('2026-11-01')
    const flat = g.weeks.flat().filter(Boolean)
    expect(flat).toHaveLength(30)
    expect(flat.find((c) => c!.day === '2026-11-25')).toMatchObject({ value: 12, future: false })
    expect(flat.find((c) => c!.day === '2026-11-26')!.future).toBe(true)
    expect(g).toMatchObject({ total: 15, activeDays: 2, max: 12 })
    expect(g.months[0]).toEqual({ col: 1, label: 'Th11' })
  })
})
