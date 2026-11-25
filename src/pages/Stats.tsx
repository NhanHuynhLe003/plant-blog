import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heatmap, HeatLegend } from '../components/Heatmap'
import { Seg, useTooltip } from '../components/ui'
import { db } from '../lib/db'
import { buildGrid, levelOf, quantileThresholds } from '../lib/heatmap'
import { useNow, useSettings, useStreak } from '../lib/hooks'
import { RATING_LABEL, retrievability, STATE_LABEL } from '../lib/scheduler'
import { addDays, DAY_MS, dayKeyOf, formatDayVi, formatDuration, parseDay, weekdayMon } from '../lib/time'
import type { CardState, Rating } from '../lib/types'

const STATE_ORDER: CardState[] = [0, 1, 3, 2]
const WEEKDAY = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function Stats() {
  const settings = useSettings()
  const { days, today, info } = useStreak()
  const now = useNow(60_000)
  const tip = useTooltip()
  const [range, setRange] = useState('recent')
  const [selected, setSelected] = useState<string>()

  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const since = useMemo(() => Date.now() - 90 * DAY_MS, [])
  const recent = useLiveQuery(() => db.reviews.where('ts').above(since).toArray(), [since])

  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days])
  const frozen = useMemo(() => new Set(days.filter((d) => d.frozen).map((d) => d.day)), [days])
  const years = useMemo(() => {
    const first = days.reduce((m, d) => (d.day < m ? d.day : m), today)
    const out: string[] = []
    for (let y = parseDay(today).getFullYear(); y >= parseDay(first).getFullYear(); y--) out.push(String(y))
    return out
  }, [days, today])

  const grid = useMemo(() => {
    const values = new Map(days.map((d) => [d.day, d.reviews]))
    if (range === 'recent') {
      const to = addDays(today, 6 - weekdayMon(today))
      return buildGrid(addDays(to, -7 * 53 + 1), to, values, today)
    }
    return buildGrid(`${range}-01-01`, `${range}-12-31`, values, today)
  }, [days, today, range])

  const totals = useMemo(() => {
    const d30 = addDays(today, -29)
    const last30 = days.filter((d) => d.day >= d30)
    const reviews30 = last30.reduce((n, d) => n + d.reviews, 0)
    const again30 = last30.reduce((n, d) => n + d.again, 0)
    return {
      all: days.reduce((n, d) => n + d.reviews, 0),
      time: days.reduce((n, d) => n + d.timeMs, 0),
      activeDays: days.filter((d) => d.reviews > 0).length,
      reviews30,
      retention30: reviews30 > 0 ? 1 - again30 / reviews30 : null,
    }
  }, [days, today])

  const states = useMemo(() => {
    const counts: Record<CardState, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
    for (const c of cards ?? []) counts[c.state]++
    return counts
  }, [cards])
  const totalCards = cards?.length ?? 0

  const forecast = useMemo(() => {
    const out = Array.from({ length: 30 }, (_, i) => ({ day: addDays(today, i), n: 0 }))
    for (const c of cards ?? []) {
      if (c.state === 0 || c.suspended) continue
      const key = dayKeyOf(c.due, settings.rolloverHour)
      // Thẻ quá hạn dồn vào hôm nay.
      const i = key <= today ? 0 : out.findIndex((d) => d.day === key)
      if (i >= 0) out[i].n++
    }
    return out
  }, [cards, today, settings.rolloverHour])
  const forecastMax = Math.max(1, ...forecast.map((f) => f.n))

  const ratings = useMemo(() => {
    const counts: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const r of recent ?? []) counts[r.rating]++
    return counts
  }, [recent])
  const ratingTotal = (recent ?? []).length

  const hours = useMemo(() => {
    const m = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
    for (const r of recent ?? []) {
      const d = new Date(r.ts)
      m[(d.getDay() + 6) % 7][d.getHours()]++
    }
    return { m, t: quantileThresholds(m.flat()) }
  }, [recent])

  const perNote = useMemo(() => {
    return (notes ?? [])
      .map((n) => {
        const list = (cards ?? []).filter((c) => c.noteId === n.id)
        const rs = list.map((c) => retrievability(c.sched, now, settings.retention)).filter((r): r is number => r !== null)
        return {
          id: n.id,
          title: n.title,
          cards: list.length,
          fresh: list.filter((c) => c.state === 0).length,
          lapses: list.reduce((s, c) => s + c.sched.lapses, 0),
          recall: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
        }
      })
      .sort((a, b) => (a.recall ?? 2) - (b.recall ?? 2))
  }, [notes, cards, now, settings.retention])

  const sel = selected ? byDay.get(selected) : undefined

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Thống kê</h1>
          <p>Bạn đã ôn những gì, khi nào, và sắp tới cần ôn bao nhiêu.</p>
        </div>
      </header>

      <div className="tiles">
        <div className="tile">
          <div className="label">Tổng số thẻ</div>
          <div className="value tnum">{totalCards}</div>
          <div className="hint">{states[2]} thẻ đã vào giai đoạn ôn tập</div>
        </div>
        <div className="tile">
          <div className="label">Tổng lượt ôn</div>
          <div className="value tnum">{totals.all.toLocaleString('vi-VN')}</div>
          <div className="hint">trong {totals.activeDays} ngày có học</div>
        </div>
        <div className="tile">
          <div className="label">Tỉ lệ nhớ 30 ngày</div>
          <div className="value tnum">{totals.retention30 === null ? '—' : `${Math.round(totals.retention30 * 100)}%`}</div>
          <div className="hint">mục tiêu {Math.round(settings.retention * 100)}% · {totals.reviews30} lượt</div>
        </div>
        <div className="tile">
          <div className="label">Thời gian học</div>
          <div className="value" style={{ fontSize: '1.3rem', lineHeight: 1.55 }}>
            {formatDuration(totals.time)}
          </div>
          <div className="hint">chuỗi hiện tại {info.current} ngày</div>
        </div>
      </div>

      <section className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>Lịch nhiệt ôn tập</h2>
          <Seg label="Khoảng thời gian" value={range} onChange={setRange} options={[{ value: 'recent', label: '12 tháng qua' }, ...years.map((y) => ({ value: y, label: y }))]} />
        </div>
        <Heatmap grid={grid} today={today} unit="lượt ôn" frozen={frozen} selected={selected} onSelect={(d) => setSelected(d === selected ? undefined : d)} />
        <div className="row between" style={{ marginTop: 10 }}>
          <HeatLegend thresholds={grid.thresholds} unit="lượt ôn" showFrozen={frozen.size > 0} />
          <span className="muted small tnum">
            {grid.total.toLocaleString('vi-VN')} lượt · {grid.activeDays} ngày có học · nhiều nhất {grid.max}/ngày
          </span>
        </div>
        {selected && (
          <div className="day-detail" data-testid="day-detail">
            <b>{formatDayVi(selected, { weekday: true })}</b>
            {sel && sel.reviews > 0 ? (
              <>
                <span className="tnum">{sel.reviews} lượt ôn</span>
                <span className="tnum">
                  Quên {sel.again} · Khó {sel.hard} · Được {sel.good} · Dễ {sel.easy}
                </span>
                <span className="tnum">{sel.newCards} thẻ mới</span>
                <span>{formatDuration(sel.timeMs)}</span>
                {sel.qualified && <span className="chip good">{sel.reviews >= sel.goal ? `Đạt mục tiêu ${sel.goal} thẻ` : 'Ôn hết thẻ đến hạn'}</span>}
              </>
            ) : sel?.frozen ? (
              <span className="chip ice">Nghỉ — lá chắn đã giữ chuỗi</span>
            ) : (
              <span className="muted">Không ôn thẻ nào</span>
            )}
          </div>
        )}
        {!selected && <p className="muted small" style={{ marginTop: 8 }}>Chạm vào một ô để xem chi tiết ngày đó.</p>}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Thẻ đến hạn 30 ngày tới</h2>
          <p className="card-sub">Số thẻ sẽ cần ôn mỗi ngày nếu bạn giữ đúng lịch (thẻ quá hạn tính vào hôm nay).</p>
          <div className="bars" role="img" aria-label={`Dự báo: hôm nay ${forecast[0].n} thẻ, cao nhất ${forecastMax} thẻ một ngày`}>
            {forecast.map((f) => (
              <div
                key={f.day}
                className="bar-slot"
                onMouseMove={(e) =>
                  tip.show(
                    e,
                    <>
                      <b>{f.n} thẻ</b>
                      <br />
                      {formatDayVi(f.day, { weekday: true, year: false })}
                    </>,
                  )
                }
                onMouseLeave={tip.hide}
              >
                {f.n > 0 && <div className="bar" style={{ height: `${Math.max(3, (f.n / forecastMax) * 100)}%`, width: '100%' }} />}
              </div>
            ))}
          </div>
          <div className="bars-x">
            <span>Hôm nay ({forecast[0].n})</span>
            <span>{formatDayVi(forecast[14].day, { year: false })}</span>
            <span>{formatDayVi(forecast[29].day, { year: false })}</span>
          </div>
        </section>

        <section className="card">
          <h2>Trạng thái thẻ</h2>
          <p className="card-sub">Thẻ đi từ Mới → Đang học → Ôn tập; quên thì quay về Học lại.</p>
          {totalCards === 0 ? (
            <p className="muted">Chưa có thẻ nào.</p>
          ) : (
            <>
              <div className="stackbar" role="img" aria-label={STATE_ORDER.map((s) => `${STATE_LABEL[s]} ${states[s]}`).join(', ')}>
                {STATE_ORDER.map((s, i) => states[s] > 0 && <span key={s} style={{ flex: states[s], background: `var(--series-${i + 1})` }} title={`${STATE_LABEL[s]}: ${states[s]}`} />)}
              </div>
              <div className="legend" style={{ marginTop: 12, color: 'var(--text)' }}>
                {STATE_ORDER.map((s, i) => (
                  <span className="key" key={s}>
                    <span className="swatch" style={{ background: `var(--series-${i + 1})` }} />
                    {STATE_LABEL[s]} <b className="tnum">{states[s]}</b>
                    <span className="muted">({Math.round((states[s] / totalCards) * 100)}%)</span>
                  </span>
                ))}
              </div>
            </>
          )}
          <h2 style={{ margin: '22px 0 4px' }}>Cách bạn chấm (90 ngày)</h2>
          {ratingTotal === 0 ? (
            <p className="muted">Chưa có lượt ôn nào.</p>
          ) : (
            ([1, 2, 3, 4] as Rating[]).map((r) => (
              <div className="hbar" key={r}>
                <span>{RATING_LABEL[r]}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${(ratings[r] / ratingTotal) * 100}%` }} />
                </div>
                <span className="num tnum">
                  {ratings[r]} · {Math.round((ratings[r] / ratingTotal) * 100)}%
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="card">
        <h2>Giờ học trong tuần (90 ngày)</h2>
        <p className="card-sub">Mỗi ô là một khung giờ; ô càng đậm bạn càng ôn nhiều vào giờ đó.</p>
        <div className="heat-wrap">
          <svg width={30 + 24 * 19} height={14 + 7 * 19} role="img" aria-label="Lịch nhiệt số lượt ôn theo thứ và giờ">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
              <text key={h} className="heat-label" x={30 + h * 19} y={9}>
                {h}h
              </text>
            ))}
            {hours.m.map((row, y) => (
              <g key={y}>
                <text className="heat-label" x={0} y={14 + y * 19 + 12}>
                  {WEEKDAY[y]}
                </text>
                {row.map((v, x) => (
                  <rect
                    key={x}
                    className={`heat-cell l${levelOf(v, hours.t)}`}
                    x={30 + x * 19}
                    y={14 + y * 19}
                    width={16}
                    height={16}
                    rx={3}
                    style={{ cursor: 'default' }}
                    onMouseMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <b>{v} lượt ôn</b>
                          <br />
                          {WEEKDAY[y]}, {x}:00–{x + 1}:00
                        </>,
                      )
                    }
                    onMouseLeave={tip.hide}
                  >
                    <title>{`${WEEKDAY[y]} ${x}h: ${v} lượt ôn`}</title>
                  </rect>
                ))}
              </g>
            ))}
          </svg>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="legend">
            <span className="scale">
              Ít
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} className="swatch" style={{ background: `var(--heat-${l})` }} />
              ))}
              Nhiều
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Theo ghi chú</h2>
        <p className="card-sub">Xếp từ ghi chú đang dễ quên nhất. “Còn nhớ” là xác suất nhớ trung bình của các thẻ đã học.</p>
        {perNote.length === 0 ? (
          <p className="muted">Chưa có ghi chú nào.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ghi chú</th>
                  <th className="num">Thẻ</th>
                  <th className="num">Chưa học</th>
                  <th className="num">Lần quên</th>
                  <th className="num">Còn nhớ</th>
                </tr>
              </thead>
              <tbody>
                {perNote.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <Link to={`/notes/${n.id}`}>{n.title}</Link>
                    </td>
                    <td className="num">{n.cards}</td>
                    <td className="num">{n.fresh}</td>
                    <td className="num">{n.lapses}</td>
                    <td className="num">{n.recall === null ? '—' : `${Math.round(n.recall * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {tip.node}
    </div>
  )
}
