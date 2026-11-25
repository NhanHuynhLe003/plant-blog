import { addDays, diffDays } from './time'

/** Cờ của một ngày: đạt mục tiêu (qualified) hoặc được lá chắn bảo vệ (frozen). */
export interface DayFlag {
  qualified: boolean
  frozen: boolean
}

export type DayFlags = Map<string, DayFlag>

export interface StreakInfo {
  /** Số ngày đạt mục tiêu trong chuỗi hiện tại (ngày dùng lá chắn không được cộng). */
  current: number
  longest: number
  /** done: hôm nay đã đạt · pending: chuỗi còn sống nhưng hôm nay chưa đạt · none: chưa có chuỗi. */
  status: 'done' | 'pending' | 'none'
  startDay?: string
  lastQualifiedDay?: string
}

export interface StreakRun {
  start: string
  end: string
  /** Số ngày đạt mục tiêu. */
  length: number
  frozenDays: number
}

const ok = (f?: DayFlag) => !!f && (f.qualified || f.frozen)

/** Liệt kê mọi chuỗi trong lịch sử, theo thứ tự thời gian. */
export function streakRuns(days: DayFlags): StreakRun[] {
  const keys = [...days.keys()].filter((k) => ok(days.get(k))).sort()
  const runs: StreakRun[] = []
  let cur: { keys: string[] } | null = null
  const close = () => {
    if (!cur) return
    // Bỏ các ngày lá chắn ở hai đầu: chuỗi phải bắt đầu và kết thúc bằng ngày đạt mục tiêu.
    const ks = cur.keys
    let a = 0
    let b = ks.length - 1
    while (a <= b && !days.get(ks[a])!.qualified) a++
    while (b >= a && !days.get(ks[b])!.qualified) b--
    if (a <= b) {
      const inner = ks.slice(a, b + 1)
      const length = inner.filter((k) => days.get(k)!.qualified).length
      runs.push({ start: ks[a], end: ks[b], length, frozenDays: inner.length - length })
    }
    cur = null
  }
  for (const k of keys) {
    if (cur && diffDays(cur.keys[cur.keys.length - 1], k) === 1) cur.keys.push(k)
    else {
      close()
      cur = { keys: [k] }
    }
  }
  close()
  return runs
}

export function computeStreak(days: DayFlags, today: string): StreakInfo {
  const runs = streakRuns(days)
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0)
  const todayDone = !!days.get(today)?.qualified

  let cursor = todayDone ? today : addDays(today, -1)
  let current = 0
  let startDay: string | undefined
  let lastQualifiedDay: string | undefined
  while (ok(days.get(cursor))) {
    if (days.get(cursor)!.qualified) {
      current++
      startDay = cursor
      lastQualifiedDay ??= cursor
    }
    cursor = addDays(cursor, -1)
  }
  const status = current === 0 ? 'none' : todayDone ? 'done' : 'pending'
  return { current, longest: Math.max(longest, current), status, startDay, lastQualifiedDay }
}

export interface FreezePlan {
  /** Các ngày bị bỏ lỡ sẽ được lá chắn bảo vệ. */
  freeze: string[]
  /** Chuỗi đã đứt (khoảng trống dài hơn số lá chắn hiện có). */
  broken: boolean
  /** Độ dài chuỗi liên quan (được cứu hoặc bị mất). */
  streak: number
  /** Ngày hoạt động cuối cùng trước khoảng trống. */
  lastOkDay?: string
}

/**
 * Quyết định dùng lá chắn cho các ngày bị bỏ lỡ trước hôm nay.
 * Chỉ tiêu lá chắn khi đủ để che toàn bộ khoảng trống — nếu không,
 * chuỗi đằng nào cũng đứt nên giữ lại lá chắn.
 */
export function planFreezes(days: DayFlags, today: string, freezes: number, enabled = true): FreezePlan {
  const yesterday = addDays(today, -1)
  const keys = [...days.keys()].filter((k) => k < today && ok(days.get(k))).sort()
  const lastOkDay = keys[keys.length - 1]
  if (!lastOkDay) return { freeze: [], broken: false, streak: 0 }

  // Độ dài chuỗi tính đến ngày hoạt động cuối cùng.
  const streak = computeStreak(days, addDays(lastOkDay, 1)).current
  const gap = diffDays(lastOkDay, yesterday)
  if (gap <= 0 || streak === 0) return { freeze: [], broken: false, streak, lastOkDay }

  if (enabled && gap <= freezes) {
    const freeze = Array.from({ length: gap }, (_, i) => addDays(lastOkDay, i + 1))
    return { freeze, broken: false, streak, lastOkDay }
  }
  return { freeze: [], broken: true, streak, lastOkDay }
}

/** Cứ mỗi 7 ngày liên tiếp được thưởng một lá chắn. */
export const FREEZE_EVERY = 7

export function earnsFreeze(currentStreak: number): boolean {
  return currentStreak > 0 && currentStreak % FREEZE_EVERY === 0
}

export const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365]

export function nextMilestone(current: number): number | undefined {
  return MILESTONES.find((m) => m > current)
}
