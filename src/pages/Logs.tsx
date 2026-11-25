import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Seg, useConfirm, useToast } from '../components/ui'
import { db } from '../lib/db'
import { downloadBlob } from '../lib/image'
import { CATEGORY_LABEL, flushLogs, LEVEL_LABEL, log, logsToCsv, SESSION_ID } from '../lib/logger'
import { formatInterval, RATING_LABEL, STATE_LABEL } from '../lib/scheduler'
import { DAY_MS, formatDateTime, formatKey } from '../lib/time'
import type { LogCategory, LogEntry, LogLevel } from '../lib/types'

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const PAGE = 150

function EventRow({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false)
  const has = e.data !== undefined
  return (
    <div className="log-row" onClick={() => has && setOpen((v) => !v)} style={{ cursor: has ? 'pointer' : 'default' }} data-testid="log-row">
      <time title={`Phiên ${e.session}`}>{formatDateTime(e.ts)}</time>
      <span className={`lvl ${e.level}`}>{LEVEL_LABEL[e.level]}</span>
      <span className="msg">
        <span className="muted">{CATEGORY_LABEL[e.category]} · </span>
        {e.message}
        {has && !open && <span className="muted"> ›</span>}
      </span>
      {open && <pre>{JSON.stringify(e.data, null, 2)}</pre>}
    </div>
  )
}

function EventLog() {
  const toast = useToast()
  const confirm = useConfirm()
  const [minLevel, setMinLevel] = useState<LogLevel>('debug')
  const [category, setCategory] = useState<LogCategory | 'all'>('all')
  const [onlySession, setOnlySession] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const all = useLiveQuery(() => db.logs.orderBy('id').reverse().limit(5000).toArray(), [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (all ?? []).filter(
      (e) =>
        ORDER[e.level] >= ORDER[minLevel] &&
        (category === 'all' || e.category === category) &&
        (!onlySession || e.session === SESSION_ID) &&
        (!q || e.message.toLowerCase().includes(q) || (e.data !== undefined && JSON.stringify(e.data).toLowerCase().includes(q))),
    )
  }, [all, minLevel, category, onlySession, query])
  const counts = useMemo(() => {
    const c = { warn: 0, error: 0 }
    for (const e of all ?? []) if (e.level === 'warn' || e.level === 'error') c[e.level]++
    return c
  }, [all])

  const exportAs = async (kind: 'json' | 'csv') => {
    await flushLogs()
    const rows = [...filtered].reverse()
    const name = `inkrecall-nhat-ky-${formatKey(new Date())}.${kind}`
    downloadBlob(new Blob([kind === 'json' ? JSON.stringify(rows, null, 2) : `﻿${logsToCsv(rows)}`], { type: kind === 'json' ? 'application/json' : 'text/csv' }), name)
    log.info('system', `Xuất ${rows.length} dòng nhật ký (${kind.toUpperCase()})`)
  }
  const clear = async () => {
    const ok = await confirm({ title: 'Xoá toàn bộ nhật ký hệ thống?', body: 'Lịch sử ôn tập và thống kê không bị ảnh hưởng.', confirm: 'Xoá nhật ký', danger: true })
    if (!ok) return
    await flushLogs()
    const n = await db.logs.count()
    await db.logs.clear()
    log.warn('system', `Đã xoá ${n} dòng nhật ký`)
    toast('Đã xoá nhật ký')
  }

  return (
    <section className="card stack">
      <div className="row">
        <input className="input grow" style={{ minWidth: 160 }} placeholder="Tìm trong nhật ký…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm trong nhật ký" />
        <select className="input" style={{ width: 'auto' }} value={minLevel} onChange={(e) => setMinLevel(e.target.value as LogLevel)} aria-label="Mức tối thiểu">
          <option value="debug">Mọi mức</option>
          <option value="info">Từ Thông tin</option>
          <option value="warn">Từ Cảnh báo</option>
          <option value="error">Chỉ Lỗi</option>
        </select>
        <select className="input" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value as LogCategory | 'all')} aria-label="Nhóm">
          <option value="all">Mọi nhóm</option>
          {(Object.keys(CATEGORY_LABEL) as LogCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="row between">
        <div className="row" style={{ gap: 8 }}>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={onlySession} onChange={(e) => setOnlySession(e.target.checked)} /> Chỉ phiên này
          </label>
          <span className="muted small tnum">
            {filtered.length}/{all?.length ?? 0} dòng
          </span>
          {counts.error > 0 && <span className="chip bad">{counts.error} lỗi</span>}
          {counts.warn > 0 && <span className="chip warn">{counts.warn} cảnh báo</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => void exportAs('json')}>
            <Icon name="download" /> JSON
          </button>
          <button className="btn small" onClick={() => void exportAs('csv')}>
            <Icon name="download" /> CSV
          </button>
          <button className="btn small danger" onClick={() => void clear()}>
            <Icon name="trash" /> Xoá
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="muted">Không có dòng nào khớp bộ lọc.</p>
      ) : (
        <div className="log-list">
          {filtered.slice(0, limit).map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </div>
      )}
      {filtered.length > limit && (
        <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
          Xem thêm {Math.min(PAGE, filtered.length - limit)} dòng
        </button>
      )}
    </section>
  )
}

function ReviewLog() {
  const [limit, setLimit] = useState(PAGE)
  const total = useLiveQuery(() => db.reviews.count(), [])
  const rows = useLiveQuery(() => db.reviews.orderBy('id').reverse().limit(limit).toArray(), [limit])
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const titles = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n.title])), [notes])

  const exportCsv = async () => {
    const all = await db.reviews.orderBy('id').toArray()
    const lines = ['time,day,note,card,rating,state_before,state_after,scheduled_days,stability,difficulty,duration_ms']
    for (const r of all) {
      lines.push([new Date(r.ts).toISOString(), r.day, `"${(titles.get(r.noteId) ?? '').replace(/"/g, '""')}"`, r.cardId, r.rating, r.stateBefore, r.stateAfter, r.scheduledDays, r.stability.toFixed(3), r.difficulty.toFixed(3), r.durationMs].join(','))
    }
    downloadBlob(new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv' }), `inkrecall-luot-on-${formatKey(new Date())}.csv`)
    log.info('system', `Xuất ${all.length} lượt ôn (CSV)`)
  }

  return (
    <section className="card stack">
      <div className="row between">
        <span className="muted small tnum">{total ?? 0} lượt ôn đã ghi</span>
        <button className="btn small" onClick={() => void exportCsv()} disabled={!total}>
          <Icon name="download" /> Xuất CSV
        </button>
      </div>
      {!rows || rows.length === 0 ? (
        <p className="muted">Chưa có lượt ôn nào.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Ghi chú</th>
                <th>Chấm</th>
                <th>Trạng thái</th>
                <th className="num">Hẹn lại</th>
                <th className="num">Suy nghĩ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="tnum" style={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(r.ts)}
                  </td>
                  <td>{titles.get(r.noteId) ?? <span className="muted">(đã xoá)</span>}</td>
                  <td>
                    <span className={`chip ${r.rating === 1 ? 'bad' : r.rating === 2 ? 'warn' : r.rating === 3 ? 'good' : ''}`}>{RATING_LABEL[r.rating]}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {STATE_LABEL[r.stateBefore]} → {STATE_LABEL[r.stateAfter]}
                  </td>
                  <td className="num">{r.scheduledDays > 0 ? formatInterval(r.scheduledDays * DAY_MS) : 'trong ngày'}</td>
                  <td className="num">{(r.durationMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(total ?? 0) > limit && (
        <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
          Xem thêm
        </button>
      )}
    </section>
  )
}

export function Logs() {
  const [tab, setTab] = useState<'events' | 'reviews'>('events')
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Nhật ký</h1>
          <p>Mọi việc ứng dụng đã làm: nhập ghi chú, tạo thẻ, từng lượt chấm, thay đổi chuỗi và lỗi nếu có.</p>
        </div>
        <Seg
          label="Loại nhật ký"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'events', label: 'Hoạt động' },
            { value: 'reviews', label: 'Lượt ôn' },
          ]}
        />
      </header>
      {tab === 'events' ? <EventLog /> : <ReviewLog />}
    </div>
  )
}
