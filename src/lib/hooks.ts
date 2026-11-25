import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AI_META_KEY, mergeAiConfig } from './ai/config'
import { aiJobs, type AiJobState } from './ai/jobs'
import { db, DEFAULT_SETTINGS, DEFAULT_STREAK_META } from './db'
import { computeStreak, type StreakInfo } from './streak'
import { flagsOf, reconcileStreak } from './streakService'
import { dayKeyOf } from './time'
import type { AiConfig, DayStat, Settings, StreakMeta } from './types'

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.meta.get('settings'), [])
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }), [row])
}

export function useStreakMeta(): StreakMeta {
  const row = useLiveQuery(() => db.meta.get('streak'), [])
  return useMemo(() => ({ ...DEFAULT_STREAK_META, ...((row?.value as Partial<StreakMeta>) ?? {}) }), [row])
}

/** Thời điểm hiện tại, tự cập nhật theo chu kỳ (mặc định mỗi 30 giây). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs])
  return now
}

/** Khoá ngày học hiện tại; khi sang ngày mới sẽ đối soát lại chuỗi. */
export function useToday(): string {
  const { rolloverHour } = useSettings()
  const now = useNow()
  const today = dayKeyOf(now, rolloverHour)
  useEffect(() => {
    void reconcileStreak()
  }, [today])
  return today
}

export function useDays(): DayStat[] | undefined {
  return useLiveQuery(() => db.days.toArray(), [])
}

export function useStreak(): { info: StreakInfo; days: DayStat[]; today: string; ready: boolean } {
  const days = useDays()
  const today = useToday()
  const info = useMemo(() => computeStreak(flagsOf(days ?? []), today), [days, today])
  return { info, days: days ?? [], today, ready: days !== undefined }
}

/** URL tạm cho một Blob ảnh, tự thu hồi khi không còn dùng. */
export function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Số cột (tuần) vừa với chiều rộng của một phần tử — để lịch nhiệt lấp đầy thẻ chứa nó. */
export function useFitColumns(colWidth: number, reserved: number, min: number, max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(min)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCols(Math.min(max, Math.max(min, Math.floor((el.clientWidth - reserved) / colWidth))))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [colWidth, reserved, min, max])
  return { ref, cols }
}

export function useAiConfig(): AiConfig {
  const row = useLiveQuery(() => db.meta.get(AI_META_KEY), [])
  return useMemo(() => mergeAiConfig(row?.value), [row])
}

export function useAiJobs(): AiJobState {
  return useSyncExternalStore(aiJobs.subscribe, aiJobs.get)
}
