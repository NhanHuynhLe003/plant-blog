import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { db, saveSettings } from '../lib/db'
import { useObjectUrl, useSettings, useToday } from '../lib/hooks'
import { importFiles, takeSharedFiles, type ImportProgress } from '../lib/importer'
import { dayEndTs } from '../lib/time'
import type { Granularity, Note, NoteSource } from '../lib/types'

interface Counts {
  total: number
  due: number
  fresh: number
}

function NoteCard({ note, counts }: { note: Note; counts?: Counts }) {
  const url = useObjectUrl(note.thumb)
  return (
    <Link to={`/notes/${note.id}`} className="note-card" data-testid="note-card">
      <div className="thumb">{url && <img src={url} alt="" />}</div>
      <div className="body">
        <div className="title">{note.title}</div>
        <span className="muted small">
          {note.pageCount} trang · {counts?.total ?? 0} thẻ
        </span>
        <div className="row" style={{ gap: 6 }}>
          {!!counts?.due && <span className="chip warn">{counts.due} đến hạn</span>}
          {!!counts?.fresh && <span className="chip">{counts.fresh} mới</span>}
          {counts && counts.total > 0 && !counts.due && !counts.fresh && <span className="chip good">Đã thuộc</span>}
        </div>
      </div>
    </Link>
  )
}

export function Notes() {
  const settings = useSettings()
  const today = useToday()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [busy, setBusy] = useState(false)

  const notes = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const counts = useMemo(() => {
    const end = dayEndTs(today, settings.rolloverHour)
    const map = new Map<string, Counts>()
    for (const c of cards ?? []) {
      const n = map.get(c.noteId) ?? { total: 0, due: 0, fresh: 0 }
      n.total++
      if (c.state === 0) n.fresh++
      else if (c.due < end && !c.suspended) n.due++
      map.set(c.noteId, n)
    }
    return map
  }, [cards, today, settings.rolloverHour])

  const run = useCallback(
    async (files: File[], source?: NoteSource) => {
      if (files.length === 0 || busy) return
      setBusy(true)
      try {
        const results = await importFiles(files, { source, onProgress: setProgress })
        const pages = results.reduce((n, r) => n + r.pages, 0)
        const made = results.reduce((n, r) => n + r.cards, 0)
        toast(`Đã nhập ${pages} trang, tạo ${made} thẻ`)
        if (results.length === 1) navigate(`/notes/${results[0].note.id}`)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Nhập thất bại', 'error')
      } finally {
        setBusy(false)
        setProgress(null)
        if (input.current) input.current.value = ''
      }
    },
    [busy, navigate, toast],
  )

  // Tệp được chia sẻ thẳng từ Samsung Notes vào ứng dụng đã cài.
  const shared = params.get('shared')
  useEffect(() => {
    if (!shared) return
    setParams({}, { replace: true })
    void takeSharedFiles().then((files) => {
      if (files.length) void run(files, 'share')
      else toast('Không tìm thấy tệp được chia sẻ', 'error')
    })
  }, [shared, setParams, run, toast])

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Ghi chú</h1>
          <p>Nhập ghi chú viết tay xuất từ Samsung Notes dưới dạng PDF hoặc ảnh.</p>
        </div>
      </header>

      <section
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void run([...e.dataTransfer.files])
        }}
      >
        <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => void run([...(e.target.files ?? [])])} data-testid="file-input" />
        {busy ? (
          <div className="stack" style={{ alignItems: 'center', gap: 8 }} role="status">
            <b>Đang xử lý…</b>
            {progress && (
              <span className="muted small">
                {progress.file} — trang {progress.page}/{progress.pages}
              </span>
            )}
            <div className="progress" style={{ width: 'min(100%, 320px)' }}>
              <i style={{ width: `${progress ? (progress.page / progress.pages) * 100 : 5}%` }} />
            </div>
          </div>
        ) : (
          <div className="stack" style={{ alignItems: 'center', gap: 12 }}>
            <button className="btn primary big" onClick={() => input.current?.click()}>
              <Icon name="upload" /> Chọn PDF hoặc ảnh
            </button>
            <span className="muted small">hoặc kéo thả tệp vào đây · nhiều ảnh chọn cùng lúc sẽ gộp thành một ghi chú</span>
            <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" className="switch" checked={settings.autoCards} onChange={(e) => void saveSettings({ autoCards: e.target.checked })} />
                <span>Tự tạo thẻ</span>
              </label>
              {settings.autoCards && (
                <label className="row" style={{ gap: 8 }}>
                  <span className="muted small">theo</span>
                  <select className="input" style={{ width: 'auto' }} value={settings.granularity} onChange={(e) => void saveSettings({ granularity: e.target.value as Granularity })}>
                    <option value="line">Từng dòng</option>
                    <option value="paragraph">Từng đoạn</option>
                    <option value="block">Khối lớn</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
      </section>

      <details className="help card">
        <summary>Cách đưa ghi chú từ Samsung Notes vào đây</summary>
        <ol>
          <li>Mở ghi chú trong Samsung Notes → nhấn ⋮ → <b>Chia sẻ</b> (hoặc <b>Lưu dưới dạng tệp</b>).</li>
          <li>Chọn <b>Tệp PDF</b> hoặc <b>Tệp hình ảnh</b>. Nét bút S Pen được giữ nguyên.</li>
          <li>
            Nếu đã cài InkRecall lên màn hình chính, chọn <b>InkRecall</b> ngay trong bảng chia sẻ. Nếu chưa, lưu tệp rồi bấm “Chọn PDF hoặc ảnh” ở trên.
          </li>
          <li>Ghi chú một trang rất dài sẽ được tự cắt thành nhiều trang tại khoảng trắng giữa các dòng.</li>
        </ol>
      </details>

      {notes && notes.length === 0 ? (
        <section className="card empty">
          <div className="big-icon">
            <Icon name="notes" />
          </div>
          <h2>Chưa có ghi chú nào</h2>
          <p>Nhập một tệp để bắt đầu, hoặc tạo dữ liệu mẫu trong Cài đặt để xem thử.</p>
        </section>
      ) : (
        <div className="note-grid">{notes?.map((n) => <NoteCard key={n.id} note={n} counts={counts.get(n.id)} />)}</div>
      )}
    </div>
  )
}
