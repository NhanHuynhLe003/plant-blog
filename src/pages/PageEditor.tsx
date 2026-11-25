import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageFrame, rectStyle } from '../components/PageView'
import { useConfirm, useToast } from '../components/ui'
import { addCard, autoCreateCards, deleteCards } from '../lib/cards'
import { db, saveSettings } from '../lib/db'
import { useSettings } from '../lib/hooks'
import { log } from '../lib/logger'
import { formatInterval, STATE_LABEL } from '../lib/scheduler'
import type { Card, Granularity, Rect } from '../lib/types'

type Drag =
  | { kind: 'new'; ox: number; oy: number; rect: Rect }
  | { kind: 'move'; id: string; dx: number; dy: number; rect: Rect }
  | { kind: 'resize'; id: string; rect: Rect }

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const MIN_W = 0.03
const MIN_H = 0.012

export function PageEditor() {
  const { noteId = '', pageId = '' } = useParams()
  const settings = useSettings()
  const toast = useToast()
  const confirm = useConfirm()
  const frame = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [busy, setBusy] = useState(false)

  const page = useLiveQuery(() => db.pages.get(pageId), [pageId])
  const pages = useLiveQuery(() => db.pages.where('[noteId+index]').between([noteId, 0], [noteId, Infinity]).toArray(), [noteId])
  const cards = useLiveQuery(() => db.cards.where('pageId').equals(pageId).filter((c) => c.kind !== 'qa').toArray(), [pageId])
  const sel = cards?.find((c) => c.id === selected)

  useEffect(() => setSelected(null), [pageId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !(e.target instanceof HTMLInputElement)) {
        void deleteCards([selected])
        setSelected(null)
      }
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  if (!page || !pages || !cards) return null

  const point = (e: RPointerEvent) => {
    const b = frame.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) }
  }
  /** Chuột luôn vẽ được; ngón tay / bút chỉ vẽ khi bật chế độ vẽ (để vẫn cuộn trang được). */
  const canDraw = (e: RPointerEvent) => e.pointerType === 'mouse' || drawMode

  const startNew = (e: RPointerEvent) => {
    if (!canDraw(e) || e.button > 0) return
    const p = point(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(null)
    setDrag({ kind: 'new', ox: p.x, oy: p.y, rect: { x: p.x, y: p.y, w: 0, h: 0 } })
  }
  const startMove = (e: RPointerEvent, card: Card) => {
    e.stopPropagation()
    setSelected(card.id)
    if (!canDraw(e)) return
    const p = point(e)
    frame.current!.setPointerCapture(e.pointerId)
    setDrag({ kind: 'move', id: card.id, dx: p.x - card.rect.x, dy: p.y - card.rect.y, rect: card.rect })
  }
  const startResize = (e: RPointerEvent, card: Card) => {
    e.stopPropagation()
    frame.current!.setPointerCapture(e.pointerId)
    setDrag({ kind: 'resize', id: card.id, rect: card.rect })
  }
  const onMove = (e: RPointerEvent) => {
    if (!drag) return
    const p = point(e)
    if (drag.kind === 'new') {
      setDrag({ ...drag, rect: { x: Math.min(drag.ox, p.x), y: Math.min(drag.oy, p.y), w: Math.abs(p.x - drag.ox), h: Math.abs(p.y - drag.oy) } })
    } else if (drag.kind === 'move') {
      setDrag({ ...drag, rect: { ...drag.rect, x: clamp(p.x - drag.dx, 0, 1 - drag.rect.w), y: clamp(p.y - drag.dy, 0, 1 - drag.rect.h) } })
    } else {
      setDrag({ ...drag, rect: { ...drag.rect, w: Math.max(MIN_W, p.x - drag.rect.x), h: Math.max(MIN_H, p.y - drag.rect.y) } })
    }
  }
  const onUp = async () => {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (d.kind === 'new') {
      if (d.rect.w >= MIN_W && d.rect.h >= MIN_H) setSelected((await addCard(page, d.rect)).id)
    } else {
      const before = cards.find((c) => c.id === d.id)?.rect
      if (before && (before.x !== d.rect.x || before.y !== d.rect.y || before.w !== d.rect.w || before.h !== d.rect.h)) {
        await db.cards.update(d.id, { rect: d.rect })
        log.debug('card', d.kind === 'move' ? 'Di chuyển vùng thẻ' : 'Đổi kích thước vùng thẻ', { cardId: d.id, rect: d.rect })
      }
    }
  }

  const auto = async () => {
    setBusy(true)
    try {
      const made = await autoCreateCards(page, settings.granularity)
      toast(made.length ? `Đã tạo ${made.length} thẻ mới` : 'Không tìm thấy vùng chữ mới nào')
    } catch (error) {
      log.error('card', 'Tự động tách trang thất bại', { error, pageId })
      toast('Không tách được trang này', 'error')
    } finally {
      setBusy(false)
    }
  }
  const clearAll = async () => {
    if (cards.length === 0) return
    const ok = await confirm({ title: `Xoá ${cards.length} thẻ của trang này?`, body: 'Tiến độ ôn của các thẻ này sẽ mất.', confirm: 'Xoá hết', danger: true })
    if (!ok) return
    await deleteCards(cards.map((c) => c.id), 'xoá toàn bộ thẻ của trang')
    setSelected(null)
  }

  const idx = page.index
  const prev = pages[idx - 1]
  const next = pages[idx + 1]
  const liveRect = (c: Card) => (drag && drag.kind !== 'new' && drag.id === c.id ? drag.rect : c.rect)

  return (
    <div className="editor-page stack" style={{ gap: 8, paddingBottom: sel ? 200 : 0 }}>
      <div className="row between">
        <Link to={`/notes/${noteId}`} className="small row" style={{ gap: 4 }}>
          <Icon name="left" size={14} /> Về ghi chú
        </Link>
        <div className="row" style={{ gap: 4 }}>
          {prev ? (
            <Link className="btn small ghost" to={`/notes/${noteId}/page/${prev.id}`} aria-label="Trang trước">
              <Icon name="left" />
            </Link>
          ) : (
            <span className="btn small ghost" aria-disabled style={{ opacity: 0.3 }}>
              <Icon name="left" />
            </span>
          )}
          <b className="tnum">
            Trang {idx + 1}/{pages.length}
          </b>
          {next ? (
            <Link className="btn small ghost" to={`/notes/${noteId}/page/${next.id}`} aria-label="Trang sau">
              <Icon name="right" />
            </Link>
          ) : (
            <span className="btn small ghost" aria-disabled style={{ opacity: 0.3 }}>
              <Icon name="right" />
            </span>
          )}
        </div>
      </div>

      <div className="toolbar">
        <button className={`btn small ${drawMode ? 'on' : ''}`} onClick={() => setDrawMode((v) => !v)} aria-pressed={drawMode} title="Bật để dùng ngón tay / S Pen khoanh vùng; tắt để cuộn trang">
          <Icon name={drawMode ? 'pen' : 'hand'} /> {drawMode ? 'Đang vẽ vùng' : 'Vẽ bằng tay/bút'}
        </button>
        <select className="input" style={{ width: 'auto', minHeight: 34 }} value={settings.granularity} onChange={(e) => void saveSettings({ granularity: e.target.value as Granularity })} aria-label="Độ mịn khi tự tách">
          <option value="line">Từng dòng</option>
          <option value="paragraph">Từng đoạn</option>
          <option value="block">Khối lớn</option>
        </select>
        <button className="btn small" onClick={() => void auto()} disabled={busy} data-testid="auto-detect">
          <Icon name="wand" /> Tự động tách
        </button>
        <span className="grow" />
        <span className="muted small">{cards.length} thẻ</span>
        <button className="btn small danger" onClick={() => void clearAll()} disabled={cards.length === 0}>
          <Icon name="trash" /> Xoá hết
        </button>
      </div>

      <p className="muted small">Kéo chuột trên trang để khoanh vùng cần nhớ — mỗi vùng là một thẻ. Chọn một vùng để di chuyển, đổi cỡ, thêm gợi ý hoặc xoá.</p>

      <div ref={frame} onPointerDown={startNew} onPointerMove={onMove} onPointerUp={() => void onUp()} onPointerCancel={() => setDrag(null)} style={{ touchAction: drawMode ? 'none' : 'auto', cursor: 'crosshair' }} data-testid="editor-frame">
        <PageFrame page={page}>
          {cards.map((c) => (
            <div key={c.id} className={`region ${c.id === selected ? 'sel' : ''} ${c.suspended ? 'suspended' : ''}`} style={{ ...rectStyle(liveRect(c)), cursor: 'move' }} onPointerDown={(e) => startMove(e, c)} data-testid="region">
              {c.id === selected && <span className="handle" onPointerDown={(e) => startResize(e, c)} />}
            </div>
          ))}
          {drag?.kind === 'new' && <div className="region sel" style={rectStyle(drag.rect)} />}
        </PageFrame>
      </div>

      {sel && (
        <section className="card stack" style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + 12px + env(safe-area-inset-bottom))', zIndex: 6, gap: 10 }}>
          <div className="row between">
            <div className="row" style={{ gap: 6 }}>
              <span className="chip">{STATE_LABEL[sel.state]}</span>
              <span className="chip">{sel.origin === 'auto' ? 'Tự tách' : 'Tự khoanh'}</span>
              {sel.state !== 0 && (
                <span className="muted small">
                  {sel.due > Date.now() ? `đến hạn sau ${formatInterval(sel.due - Date.now())}` : 'đã đến hạn'} · ôn {sel.sched.reps} lần · quên {sel.sched.lapses} lần
                </span>
              )}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                className={`btn small ${sel.suspended ? 'on' : ''}`}
                onClick={() => {
                  void db.cards.update(sel.id, { suspended: sel.suspended ? 0 : 1 })
                  log.info('card', sel.suspended ? 'Tiếp tục ôn thẻ' : 'Tạm dừng thẻ', { cardId: sel.id })
                }}
              >
                <Icon name={sel.suspended ? 'play' : 'pause'} /> {sel.suspended ? 'Ôn lại' : 'Tạm dừng'}
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  void deleteCards([sel.id])
                  setSelected(null)
                }}
              >
                <Icon name="trash" /> Xoá thẻ
              </button>
            </div>
          </div>
          <label className="field">
            <span>Gợi ý hiện khi ôn (không bắt buộc)</span>
            <input className="input" value={sel.prompt} placeholder="Ví dụ: Phương trình quang hợp là gì?" onChange={(e) => void db.cards.update(sel.id, { prompt: e.target.value })} />
          </label>
          {sel.answer && (
            <p className="muted small">
              <b>AI đọc được:</b> {sel.answer}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
