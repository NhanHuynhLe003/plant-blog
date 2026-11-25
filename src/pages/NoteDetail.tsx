import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageFrame, rectStyle } from '../components/PageView'
import { useConfirm, useToast } from '../components/ui'
import { deleteNote } from '../lib/cards'
import { db } from '../lib/db'
import { useNow, useSettings, useToday } from '../lib/hooks'
import { log } from '../lib/logger'
import { retrievability } from '../lib/scheduler'
import { dayEndTs } from '../lib/time'
import type { Card } from '../lib/types'

/** Mức ghi nhớ của một thẻ → nhãn + lớp màu trạng thái. */
export function mastery(card: Card, now: number, retention: number): { cls: string; label: string } {
  const r = retrievability(card.sched, now, retention)
  if (r === null) return { cls: 'm-new', label: 'Mới' }
  const p = `${Math.round(r * 100)}%`
  if (r >= 0.9) return { cls: 'm-good', label: `✓ ${p}` }
  if (r >= 0.75) return { cls: 'm-warn', label: `! ${p}` }
  return { cls: 'm-bad', label: `✕ ${p}` }
}

export function NoteDetail() {
  const { noteId = '' } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const settings = useSettings()
  const today = useToday()
  const now = useNow(60_000)
  const [showMastery, setShowMastery] = useState(true)

  const note = useLiveQuery(() => db.notes.get(noteId), [noteId])
  const pages = useLiveQuery(() => db.pages.where('[noteId+index]').between([noteId, 0], [noteId, Infinity]).toArray(), [noteId])
  const cards = useLiveQuery(() => db.cards.where('noteId').equals(noteId).toArray(), [noteId])

  const summary = useMemo(() => {
    const end = dayEndTs(today, settings.rolloverHour)
    const list = cards ?? []
    return {
      total: list.length,
      fresh: list.filter((c) => c.state === 0).length,
      due: list.filter((c) => c.state !== 0 && c.due < end && !c.suspended).length,
      lapses: list.reduce((n, c) => n + c.sched.lapses, 0),
    }
  }, [cards, today, settings.rolloverHour])

  if (note === undefined || !pages) return null
  if (note === null || !note) {
    return (
      <div className="card empty">
        <h2>Không tìm thấy ghi chú</h2>
        <Link to="/notes" className="btn">
          Về danh sách
        </Link>
      </div>
    )
  }

  const rename = async () => {
    const title = window.prompt('Tên ghi chú', note.title)?.trim()
    if (!title || title === note.title) return
    await db.notes.update(note.id, { title, updatedAt: Date.now() })
    log.info('card', `Đổi tên ghi chú thành “${title}”`, { noteId: note.id })
  }
  const remove = async () => {
    const ok = await confirm({
      title: `Xoá “${note.title}”?`,
      body: `Sẽ xoá ${note.pageCount} trang và ${summary.total} thẻ. Lịch sử ôn tập trong thống kê vẫn được giữ.`,
      confirm: 'Xoá ghi chú',
      danger: true,
    })
    if (!ok) return
    await deleteNote(note.id)
    toast('Đã xoá ghi chú')
    navigate('/notes')
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div className="grow">
          <Link to="/notes" className="small row" style={{ gap: 4 }}>
            <Icon name="left" size={14} /> Ghi chú
          </Link>
          <h1 style={{ overflowWrap: 'anywhere' }}>{note.title}</h1>
          <p>
            {note.pageCount} trang · {summary.total} thẻ · {summary.due} đến hạn · {summary.fresh} mới
          </p>
        </div>
        <div className="row">
          {summary.total > 0 && (
            <Link to={`/review?note=${note.id}`} className="btn primary">
              <Icon name="play" filled /> Ôn ghi chú này
            </Link>
          )}
          <button className="btn" onClick={() => void rename()}>
            <Icon name="pen" /> Đổi tên
          </button>
          <button className="btn danger" onClick={() => void remove()}>
            <Icon name="trash" /> Xoá
          </button>
        </div>
      </header>

      <section className="card">
        <div className="row between">
          <div>
            <h2>Bản đồ ghi nhớ</h2>
            <p className="muted small">Mỗi vùng tô màu theo xác suất bạn còn nhớ lúc này. Chạm vào trang để thêm, sửa thẻ.</p>
          </div>
          <input type="checkbox" className="switch" checked={showMastery} onChange={(e) => setShowMastery(e.target.checked)} aria-label="Hiện bản đồ ghi nhớ" />
        </div>
        {showMastery && (
          <div className="legend" style={{ marginTop: 10 }}>
            <span className="key">
              <span className="swatch" style={{ background: 'var(--good)' }} /> ✓ Nhớ chắc (≥90%)
            </span>
            <span className="key">
              <span className="swatch" style={{ background: 'var(--warning)' }} /> ! Sắp quên (75–90%)
            </span>
            <span className="key">
              <span className="swatch" style={{ background: 'var(--critical)' }} /> ✕ Dễ quên (&lt;75%)
            </span>
            <span className="key">
              <span className="swatch" style={{ background: '#8a8a8a' }} /> Mới (chưa học)
            </span>
          </div>
        )}
      </section>

      <div className="pages-grid">
        {pages.map((p) => (
          <Link key={p.id} to={`/notes/${note.id}/page/${p.id}`} aria-label={`Sửa thẻ trang ${p.index + 1}`} data-testid="page-link">
            <PageFrame page={p}>
              {(cards ?? [])
                .filter((c) => c.pageId === p.id)
                .map((c) => {
                  const m = showMastery ? mastery(c, now, settings.retention) : { cls: '', label: '' }
                  return (
                    <div key={c.id} className={`region ${m.cls} ${c.suspended ? 'suspended' : ''}`} style={rectStyle(c.rect)}>
                      {showMastery && c.state !== 0 && <span className="tag">{m.label}</span>}
                    </div>
                  )
                })}
            </PageFrame>
            <div className="muted small" style={{ marginTop: 6, textAlign: 'center' }}>
              Trang {p.index + 1} · {(cards ?? []).filter((c) => c.pageId === p.id).length} thẻ
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
