import type { ReactNode } from 'react'
import { useObjectUrl } from '../lib/hooks'
import type { Card, Page, Rect } from '../lib/types'

export const pct = (v: number) => `${(v * 100).toFixed(3)}%`
export const rectStyle = (r: Rect) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) })

/** Ảnh trang kèm một lớp phủ định vị theo toạ độ chuẩn hoá. */
export function PageFrame({ page, children, className = '' }: { page: Page; children?: ReactNode; className?: string }) {
  const url = useObjectUrl(page.blob)
  return (
    <div className={`page-frame ${className}`} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      {url && <img src={url} alt={`Trang ${page.index + 1}`} draggable={false} />}
      <div className="overlay">{children}</div>
    </div>
  )
}

interface OccludedProps {
  page: Page
  target: Card
  /** Các thẻ khác trên cùng trang (che luôn khi ở chế độ "che tất cả"). */
  others: Card[]
  revealed: boolean
  hideAll: boolean
  /** Hiện cả trang thay vì chỉ vùng quanh thẻ. */
  fullPage: boolean
}

/**
 * Mặt thẻ khi ôn: trang ghi chú với vùng cần nhớ bị che.
 * Mặc định chỉ cắt lấy dải quanh vùng che để chữ đủ lớn trên điện thoại.
 */
export function OccludedPage({ page, target, others, revealed, hideAll, fullPage }: OccludedProps) {
  const url = useObjectUrl(page.blob)
  const r = target.rect
  const ch = fullPage ? 1 : Math.min(1, Math.max(r.h + 0.18, 0.34))
  const cy = fullPage ? 0 : Math.min(1 - ch, Math.max(0, r.y + r.h / 2 - ch / 2))
  const ratio = page.width / (page.height * ch)
  const place = (q: Rect) => ({ left: pct(q.x), width: pct(q.w), top: pct((q.y - cy) / ch), height: pct(q.h / ch) })

  return (
    <div className="occ" style={{ aspectRatio: String(ratio), width: `min(100%, calc(58dvh * ${ratio.toFixed(4)}))` }}>
      {url && <img src={url} alt="" style={{ top: pct(-cy / ch), height: pct(1 / ch) }} draggable={false} />}
      {hideAll && others.map((c) => <div key={c.id} className="mask" style={place(c.rect)} />)}
      <div className={`mask target ${revealed ? 'revealed' : ''}`} style={place(r)} data-testid="mask">
        {!revealed && '?'}
      </div>
    </div>
  )
}
