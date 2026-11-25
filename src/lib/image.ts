import { toGray } from './segment'

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(width))
  c.height = Math.max(1, Math.round(height))
  return c
}

export function ctx2d(canvas: HTMLCanvasElement, readback = false): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: readback })
  if (!ctx) throw new Error('Trình duyệt không cấp được canvas 2D')
  return ctx
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') return resolve(webp)
        // Trình duyệt không hỗ trợ mã hoá WebP: dùng JPEG.
        canvas.toBlob((jpg) => (jpg ? resolve(jpg) : reject(new Error('Không mã hoá được ảnh trang'))), 'image/jpeg', quality)
      },
      'image/webp',
      quality,
    )
  })
}

/** Ảnh xám thu nhỏ của một canvas / bitmap, dùng cho thuật toán tách vùng. */
export function grayOf(source: CanvasImageSource, srcW: number, srcH: number, targetW = 420): { gray: Uint8Array; width: number; height: number } {
  const width = Math.min(targetW, Math.round(srcW))
  const height = Math.max(1, Math.round((srcH / srcW) * width))
  const c = makeCanvas(width, height)
  const ctx = ctx2d(c, true)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return { gray: toGray(ctx.getImageData(0, 0, width, height).data, width, height), width, height }
}

export function scaleCanvas(source: HTMLCanvasElement, targetW: number): HTMLCanvasElement {
  const w = Math.min(targetW, source.width)
  const out = makeCanvas(w, (source.height / source.width) * w)
  const ctx = ctx2d(out)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return out
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
