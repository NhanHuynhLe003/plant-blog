/**
 * "Ngày học" được xác định theo giờ địa phương và giờ chuyển ngày
 * (mặc định 4h sáng) để ôn khuya vẫn tính cho ngày hôm trước.
 */
export const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function formatKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dayKeyOf(ts: number, rolloverHour = 0): string {
  return formatKey(new Date(ts - rolloverHour * 3_600_000))
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + n)
  return formatKey(d)
}

/** Số ngày từ a đến b (b - a), không bị lệch bởi giờ mùa hè. */
export function diffDays(a: string, b: string): number {
  const da = parseDay(a)
  const dbb = parseDay(b)
  return Math.round((Date.UTC(dbb.getFullYear(), dbb.getMonth(), dbb.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / DAY_MS)
}

/** Thời điểm bắt đầu của một ngày học. */
export function dayStartTs(key: string, rolloverHour = 0): number {
  const d = parseDay(key)
  d.setHours(rolloverHour, 0, 0, 0)
  return d.getTime()
}

export function dayEndTs(key: string, rolloverHour = 0): number {
  return dayStartTs(addDays(key, 1), rolloverHour)
}

/** Thứ trong tuần với thứ Hai = 0 … Chủ nhật = 6. */
export function weekdayMon(key: string): number {
  return (parseDay(key).getDay() + 6) % 7
}

export function formatDayVi(key: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseDay(key)
  const wd = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'][weekdayMon(key)]
  const base = `${d.getDate()}/${d.getMonth() + 1}${opts.year === false ? '' : `/${d.getFullYear()}`}`
  return opts.weekday ? `${wd}, ${base}` : base
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} giây`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} phút`
  const h = Math.floor(m / 60)
  return `${h} giờ ${m % 60} phút`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(ts)}`
}
