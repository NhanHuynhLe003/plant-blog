import type { Granularity, Rect } from './types'

/**
 * Tự động tách một trang viết tay thành các khối nội dung.
 * Hoạt động thuần trên mảng độ sáng (0..255) nên chạy được cả trong test.
 *
 * 1. Ước lượng màu nền = độ sáng phổ biến nhất; "mực" = điểm lệch khỏi nền.
 * 2. Bỏ dòng kẻ / ô lưới của mẫu giấy (hàng hoặc cột gần như phủ kín mực).
 * 3. Chiếu ngang để tìm các dải có mực, gộp dải gần nhau theo độ mịn mong muốn.
 * 4. Tách dải theo khoảng trắng dọc lớn (ghi chú hai cột), rồi ôm sát vùng mực.
 */
export interface SegmentOptions {
  granularity?: Granularity
  /** Độ lệch sáng tối thiểu so với nền để coi là mực. */
  inkThreshold?: number
}

const GAP_FACTOR: Record<Granularity, number> = { line: 0.25, paragraph: 0.9, block: 2.4 }

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = rgba[p + 3] / 255
    // Trộn với nền trắng cho ảnh PNG trong suốt.
    const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    gray[i] = Math.round(lum * a + 255 * (1 - a))
  }
  return gray
}

export function inkMask(gray: Uint8Array, width: number, height: number, threshold = 48): Uint8Array {
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  let bg = 255
  let best = 0
  for (let v = 0; v < 256; v++) {
    // Làm mượt nhẹ để nhiễu nén JPEG không làm lệch mode.
    const n = hist[v] + (hist[v - 1] ?? 0) + (hist[v + 1] ?? 0)
    if (n > best) {
      best = n
      bg = v
    }
  }
  const mask = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) mask[i] = Math.abs(gray[i] - bg) > threshold ? 1 : 0

  // Dòng kẻ ngang / dọc của mẫu giấy: phủ hơn nửa chiều rộng / cao.
  for (let y = 0; y < height; y++) {
    let n = 0
    for (let x = 0; x < width; x++) n += mask[y * width + x]
    if (n > width * 0.55) mask.fill(0, y * width, (y + 1) * width)
  }
  for (let x = 0; x < width; x++) {
    let n = 0
    for (let y = 0; y < height; y++) n += mask[y * width + x]
    if (n > height * 0.55) for (let y = 0; y < height; y++) mask[y * width + x] = 0
  }
  return mask
}

interface Run {
  from: number
  to: number // inclusive
}

function runs(profile: ArrayLike<number>, min: number): Run[] {
  const out: Run[] = []
  let start = -1
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] >= min) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push({ from: start, to: i - 1 })
      start = -1
    }
  }
  if (start >= 0) out.push({ from: start, to: profile.length - 1 })
  return out
}

function mergeRuns(rs: Run[], maxGap: number): Run[] {
  const out: Run[] = []
  for (const r of rs) {
    const last = out[out.length - 1]
    if (last && r.from - last.to - 1 <= maxGap) last.to = r.to
    else out.push({ ...r })
  }
  return out
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function segmentGray(gray: Uint8Array, width: number, height: number, options: SegmentOptions = {}): Rect[] {
  const granularity = options.granularity ?? 'paragraph'
  const mask = inkMask(gray, width, height, options.inkThreshold)

  const rowInk = new Uint32Array(height)
  for (let y = 0; y < height; y++) {
    let n = 0
    for (let x = 0; x < width; x++) n += mask[y * width + x]
    rowInk[y] = n
  }
  const minRowInk = Math.max(1, Math.round(width * 0.002))
  // Gộp các khe 1–2px trước để nét chữ đứt quãng vẫn thành một dòng.
  const lines = mergeRuns(runs(rowInk, minRowInk), Math.max(1, Math.round(height * 0.002))).filter(
    (r) => r.to - r.from + 1 >= Math.max(2, Math.round(height * 0.004)),
  )
  if (lines.length === 0) return []

  const lineHeight = Math.max(4, median(lines.map((r) => r.to - r.from + 1)))
  const bands = mergeRuns(lines, Math.round(lineHeight * GAP_FACTOR[granularity]))

  const rects: Rect[] = []
  const padX = Math.round(width * 0.012)
  const padY = Math.round(height * 0.004)
  for (const band of bands) {
    const colInk = new Uint32Array(width)
    for (let y = band.from; y <= band.to; y++) for (let x = 0; x < width; x++) colInk[x] += mask[y * width + x]
    // Chỉ tách cột khi khoảng trắng dọc đủ rộng (≥ 12% chiều ngang).
    const cols = mergeRuns(runs(colInk, 1), Math.round(width * 0.12))
    for (const col of cols) {
      // Ôm sát theo chiều dọc trong từng cột.
      let top = band.to
      let bottom = band.from
      let ink = 0
      for (let y = band.from; y <= band.to; y++) {
        let n = 0
        for (let x = col.from; x <= col.to; x++) n += mask[y * width + x]
        if (n > 0) {
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
          ink += n
        }
      }
      const w = col.to - col.from + 1
      const h = bottom - top + 1
      // Loại đốm nhiễu: quá nhỏ hoặc quá ít mực.
      if (h < Math.max(3, height * 0.006) || w < width * 0.03 || ink < width * 0.01) continue
      const x0 = Math.max(0, col.from - padX)
      const y0 = Math.max(0, top - padY)
      const x1 = Math.min(width, col.to + 1 + padX)
      const y1 = Math.min(height, bottom + 1 + padY)
      rects.push({ x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height })
    }
  }
  return rects.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Tìm hàng trống tốt nhất để cắt một trang rất dài, trong khoảng [from, to).
 * Ưu tiên giữa dải trống dài nhất; nếu không có dải trống thì chọn hàng ít mực nhất.
 */
export function findCutRow(gray: Uint8Array, width: number, height: number, from: number, to: number): number {
  const mask = inkMask(gray, width, height)
  const a = Math.max(0, Math.floor(from))
  const b = Math.min(height, Math.ceil(to))
  let bestStart = -1
  let bestLen = 0
  let start = -1
  let minInk = Infinity
  let minRow = Math.floor((a + b) / 2)
  for (let y = a; y < b; y++) {
    let n = 0
    for (let x = 0; x < width; x++) n += mask[y * width + x]
    if (n < minInk) {
      minInk = n
      minRow = y
    }
    if (n === 0) {
      if (start < 0) start = y
      if (y - start + 1 > bestLen) {
        bestLen = y - start + 1
        bestStart = start
      }
    } else start = -1
  }
  return bestLen > 0 ? bestStart + Math.floor(bestLen / 2) : minRow
}

export function iou(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}
