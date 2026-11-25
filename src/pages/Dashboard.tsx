import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Heatmap, HeatLegend } from '../components/Heatmap'
import { Icon } from '../components/Icon'
import { Ring } from '../components/ui'
import { db } from '../lib/db'
import { buildGrid } from '../lib/heatmap'
import { useFitColumns, useNow, useObjectUrl, useSettings, useStreak, useStreakMeta } from '../lib/hooks'
import { queueTotal } from '../lib/queue'
import { loadQueue } from '../lib/review'
import { addDays, formatDayVi, weekdayMon } from '../lib/time'
import type { Note } from '../lib/types'

export function StreakBadge() {
  const { info } = useStreak()
  const meta = useStreakMeta()
  const text =
    info.status === 'done'
      ? 'Hôm nay đã hoàn thành. Hẹn bạn ngày mai!'
      : info.status === 'pending'
        ? 'Ôn hôm nay để giữ chuỗi.'
        : info.longest > 0
          ? 'Bắt đầu một chuỗi mới ngay hôm nay.'
          : 'Hoàn thành mục tiêu ngày để bắt đầu chuỗi.'
  return (
    <div className="streak-card">
      <div className={`flame ${info.status === 'done' ? '' : 'off'}`}>
        <Icon name="flame" filled />
      </div>
      <div className="grow">
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <span className="streak-num tnum" data-testid="streak-current">
            {info.current}
          </span>
          <b>ngày liên tiếp</b>
        </div>
        <p className="muted small">{text}</p>
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          <span className="chip ice" title="Lá chắn tự bảo vệ chuỗi khi bạn lỡ một ngày">
            <Icon name="shield" /> {meta.freezes} lá chắn
          </span>
          <span className="chip">Kỷ lục {info.longest} ngày</span>
        </div>
      </div>
    </div>
  )
}

function RecentNote({ note }: { note: Note }) {
  const url = useObjectUrl(note.thumb)
  return (
    <Link to={`/notes/${note.id}`} className="note-card">
      <div className="thumb">{url && <img src={url} alt="" />}</div>
      <div className="body">
        <div className="title">{note.title}</div>
        <span className="muted small">{note.pageCount} trang</span>
      </div>
    </Link>
  )
}

export function Dashboard() {
  const settings = useSettings()
  const { days, today } = useStreak()
  const minute = Math.floor(useNow() / 60_000)
  const queue = useLiveQuery(() => loadQueue(Date.now()), [today, minute])
  const notes = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().limit(4).toArray(), [])
  const cardCount = useLiveQuery(() => db.cards.count(), [])

  const fit = useFitColumns(16, 28, 12, 53)
  const grid = useMemo(() => {
    const values = new Map(days.map((d) => [d.day, d.reviews]))
    const to = addDays(today, 6 - weekdayMon(today))
    return buildGrid(addDays(to, -7 * fit.cols + 1), to, values, today)
  }, [days, today, fit.cols])
  const frozen = useMemo(() => new Set(days.filter((d) => d.frozen).map((d) => d.day)), [days])

  const done = queue?.stat.reviews ?? 0
  const left = queue ? queueTotal(queue) : 0
  const goal = settings.dailyGoal
  const empty = cardCount === 0

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Hôm nay</h1>
          <p>{formatDayVi(today, { weekday: true })}</p>
        </div>
      </header>

      <div className="hero">
        <section className="card">
          <div className="today">
            <Ring value={done} max={goal}>
              <b className="tnum">{done}</b>
              <span className="muted small">/ {goal} thẻ</span>
            </Ring>
            <div className="grow">
              <h2>{empty ? 'Chưa có thẻ nào' : left > 0 ? `Còn ${left} thẻ cần ôn` : 'Đã ôn hết thẻ hôm nay'}</h2>
              <div className="counts">
                <div>
                  <b className="tnum">{queue?.counts.learning ?? 0}</b>
                  <span>Đang học</span>
                </div>
                <div>
                  <b className="tnum">{queue?.counts.review ?? 0}</b>
                  <span>Ôn tập</span>
                </div>
                <div>
                  <b className="tnum">{queue?.counts.fresh ?? 0}</b>
                  <span>Mới</span>
                </div>
              </div>
              {empty ? (
                <Link to="/notes" className="btn primary">
                  <Icon name="upload" /> Nhập ghi chú
                </Link>
              ) : (
                <Link to="/review" className="btn primary" data-testid="start-review">
                  <Icon name="play" filled /> {left > 0 ? 'Bắt đầu ôn' : 'Xem phiên ôn'}
                </Link>
              )}
            </div>
          </div>
        </section>
        <section className="card">
          <StreakBadge />
          <div className="row" style={{ marginTop: 12 }}>
            <Link to="/streak" className="btn small">
              Quản lý chuỗi
            </Link>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>Hoạt động {fit.cols} tuần gần đây</h2>
          <Link to="/stats" className="small">
            Xem thống kê đầy đủ
          </Link>
        </div>
        <div ref={fit.ref}>
          <Heatmap grid={grid} today={today} unit="lượt ôn" frozen={frozen} />
        </div>
        <div style={{ marginTop: 10 }}>
          <HeatLegend thresholds={grid.thresholds} unit="lượt ôn" showFrozen={frozen.size > 0} />
        </div>
      </section>

      {notes && notes.length > 0 && (
        <section className="stack">
          <div className="row between">
            <h2>Ghi chú gần đây</h2>
            <Link to="/notes" className="small">
              Tất cả ghi chú
            </Link>
          </div>
          <div className="note-grid">
            {notes.map((n) => (
              <RecentNote key={n.id} note={n} />
            ))}
          </div>
        </section>
      )}

      {empty && (
        <section className="card empty">
          <div className="big-icon">
            <Icon name="pen" />
          </div>
          <h2>Biến ghi chú viết tay thành thẻ ôn tập</h2>
          <p>
            Trong Samsung Notes, mở ghi chú → Chia sẻ → chọn <b>Tệp PDF</b> hoặc <b>Tệp hình ảnh</b>, rồi nhập vào đây. Ứng dụng tự tách từng đoạn chữ thành thẻ và nhắc bạn ôn đúng lúc sắp quên.
          </p>
          <div className="row">
            <Link to="/notes" className="btn primary">
              <Icon name="upload" /> Nhập ghi chú đầu tiên
            </Link>
            <Link to="/settings" className="btn">
              Xem thử với dữ liệu mẫu
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
