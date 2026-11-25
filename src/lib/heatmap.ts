import { addDays, parseDay, weekdayMon } from './time'

export interface HeatCell {
  day: string
  value: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

export interface HeatGrid {
  /** Mỗi cột là một tuần (thứ Hai → Chủ nhật); ô ngoài khoảng là null. */
  weeks: (HeatCell | null)[][]
  months: { col: number; label: string }[]
  thresholds: [number, number, number]
  max: number
  total: number
  activeDays: number
}

/** Ngưỡng theo tứ phân vị của các ngày có hoạt động, để một ngày đột biến không làm nhạt cả lịch. */
export function quantileThresholds(values: number[]): [number, number, number] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (nz.length === 0) return [1, 2, 3]
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))]
  const t1 = Math.max(1, q(0.25))
  const t2 = Math.max(t1 + 1, q(0.5))
  const t3 = Math.max(t2 + 1, q(0.75))
  return [t1, t2, t3]
}

export function levelOf(value: number, t: [number, number, number]): HeatCell['level'] {
  if (value <= 0) return 0
  if (value <= t[0]) return 1
  if (value <= t[1]) return 2
  if (value <= t[2]) return 3
  return 4
}

/** Dựng lưới lịch từ `from` đến `to` (bao gồm cả hai đầu). */
export function buildGrid(from: string, to: string, values: Map<string, number>, today: string): HeatGrid {
  const start = addDays(from, -weekdayMon(from))
  const end = addDays(to, 6 - weekdayMon(to))
  const inRange: number[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) inRange.push(values.get(d) ?? 0)
  const thresholds = quantileThresholds(inRange)

  const weeks: (HeatCell | null)[][] = []
  const months: { col: number; label: string }[] = []
  let lastMonth = -1
  for (let ws = start; ws <= end; ws = addDays(ws, 7)) {
    const col: (HeatCell | null)[] = []
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i)
      if (day < from || day > to) {
        col.push(null)
        continue
      }
      const value = values.get(day) ?? 0
      col.push({ day, value, level: levelOf(value, thresholds), future: day > today })
      const date = parseDay(day)
      if (date.getDate() <= 7 && date.getMonth() !== lastMonth && i === 0) {
        months.push({ col: weeks.length, label: `Th${date.getMonth() + 1}` })
        lastMonth = date.getMonth()
      }
    }
    weeks.push(col)
  }
  return {
    weeks,
    months,
    thresholds,
    max: Math.max(0, ...inRange),
    total: inRange.reduce((a, b) => a + b, 0),
    activeDays: inRange.filter((v) => v > 0).length,
  }
}
