import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { StreakBadge } from './Dashboard'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { db, saveSettings } from '../lib/db'
import { useSettings, useStreak, useStreakMeta } from '../lib/hooks'
import { log } from '../lib/logger'
import { FREEZE_EVERY, MILESTONES, nextMilestone, planFreezes, streakRuns } from '../lib/streak'
import { flagsOf, applyFreezeManually } from '../lib/streakService'
import { addDays, formatDateTime, formatDayVi, parseDay, weekdayMon } from '../lib/time'

const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function StreakPage() {
  const settings = useSettings()
  const meta = useStreakMeta()
  const toast = useToast()
  const { info, days, today } = useStreak()
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days])
  const firstDay = useMemo(() => days.reduce((m, d) => (d.day < m ? d.day : m), today), [days, today])
  const runs = useMemo(() => streakRuns(flagsOf(days)).reverse(), [days])
  const events = useLiveQuery(() => db.logs.where('category').equals('streak').reverse().limit(12).toArray(), [])

  // 5 tuần gần nhất, kết thúc ở Chủ nhật tuần này.
  const calendar = useMemo(() => {
    const end = addDays(today, 6 - weekdayMon(today))
    return Array.from({ length: 35 }, (_, i) => addDays(end, i - 34))
  }, [today])

  const todayStat = byDay.get(today)
  const done = todayStat?.reviews ?? 0
  const target = nextMilestone(info.current)
  const toFreeze = FREEZE_EVERY - (info.current % FREEZE_EVERY)
  const manual = useMemo(() => planFreezes(flagsOf(days), today, meta.freezes, true), [days, today, meta.freezes])
  const canRescue = !settings.autoFreeze && manual.freeze.length > 0

  const setGoal = (v: number) => {
    const dailyGoal = Math.min(500, Math.max(1, Math.round(v) || 1))
    void saveSettings({ dailyGoal })
    log.info('settings', `Đổi mục tiêu ngày thành ${dailyGoal} thẻ`, { dailyGoal })
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Chuỗi ngày học</h1>
          <p>Một ngày được tính khi bạn đạt mục tiêu, hoặc ôn hết mọi thẻ đến hạn.</p>
        </div>
      </header>

      <div className="grid-2">
        <section className="card stack">
          <StreakBadge />
          <div>
            <div className="row between small">
              <span className="muted">Hôm nay</span>
              <b className="tnum">
                {done}/{settings.dailyGoal} thẻ {todayStat?.qualified ? '· đã đạt' : ''}
              </b>
            </div>
            <div className="progress" style={{ marginTop: 6 }}>
              <i style={{ width: `${Math.min(100, (done / settings.dailyGoal) * 100)}%`, background: todayStat?.qualified ? 'var(--good)' : undefined }} />
            </div>
          </div>
          {target && (
            <div>
              <div className="row between small">
                <span className="muted">Cột mốc kế tiếp</span>
                <b className="tnum">
                  {info.current}/{target} ngày
                </b>
              </div>
              <div className="progress" style={{ marginTop: 6 }}>
                <i style={{ width: `${(info.current / target) * 100}%`, background: 'var(--flame)' }} />
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Lá chắn chuỗi</h2>
          <div className="row" style={{ gap: 8, marginBottom: 10 }} aria-label={`${meta.freezes} trên ${settings.maxFreezes} lá chắn`}>
            {Array.from({ length: settings.maxFreezes }, (_, i) => (
              <span key={i} className="flame" style={{ width: 48, height: 48, borderRadius: 14, background: i < meta.freezes ? 'color-mix(in srgb, var(--ice) 18%, transparent)' : 'var(--surface-2)', color: i < meta.freezes ? 'var(--ice)' : 'var(--axis)' }}>
                <Icon name="shield" size={26} />
              </span>
            ))}
            <b className="tnum" data-testid="freezes">
              {meta.freezes}/{settings.maxFreezes}
            </b>
          </div>
          <p className="muted small">
            Lỡ một ngày, lá chắn sẽ giữ chuỗi cho bạn. Cứ {FREEZE_EVERY} ngày liên tiếp bạn nhận thêm một lá
            {info.current > 0 && meta.freezes < settings.maxFreezes ? ` — còn ${toFreeze} ngày nữa` : ''}. Lá chắn chỉ được dùng khi đủ để che hết số ngày nghỉ.
          </p>
          <div className="setting">
            <div>
              <strong>Tự động dùng lá chắn</strong>
              <span className="muted small">Tắt nếu bạn muốn tự quyết định khi nào dùng.</span>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={settings.autoFreeze}
              onChange={(e) => {
                void saveSettings({ autoFreeze: e.target.checked })
                log.info('settings', `${e.target.checked ? 'Bật' : 'Tắt'} tự động dùng lá chắn`)
              }}
              aria-label="Tự động dùng lá chắn"
            />
          </div>
          {canRescue && (
            <button
              className="btn primary"
              onClick={() =>
                void applyFreezeManually().then((ok) => ok && toast(`Đã dùng ${manual.freeze.length} lá chắn, chuỗi ${manual.streak} ngày được giữ`))
              }
            >
              <Icon name="shield" /> Dùng {manual.freeze.length} lá chắn cứu chuỗi {manual.streak} ngày
            </button>
          )}
          <div className="setting">
            <div>
              <strong>Mục tiêu mỗi ngày</strong>
              <span className="muted small">Số thẻ cần ôn để tính một ngày.</span>
            </div>
            <input className="input tnum" type="number" min={1} max={500} value={settings.dailyGoal} onChange={(e) => setGoal(Number(e.target.value))} aria-label="Mục tiêu mỗi ngày" />
          </div>
        </section>
      </div>

      <section className="card">
        <h2>5 tuần gần đây</h2>
        <div className="week" style={{ marginBottom: 6 }}>
          {WD.map((w) => (
            <span key={w} className="wd">
              {w}
            </span>
          ))}
        </div>
        <div className="week">
          {calendar.map((day) => {
            const d = byDay.get(day)
            const kind = day > today ? 'future' : d?.qualified ? 'done' : d?.frozen ? 'frozen' : day === today ? '' : day < firstDay ? 'future' : 'missed'
            const label = kind === 'done' ? `đạt mục tiêu (${d!.reviews} thẻ)` : kind === 'frozen' ? 'dùng lá chắn' : kind === 'missed' ? 'bỏ lỡ' : day === today ? `chưa đạt (${d?.reviews ?? 0} thẻ)` : ''
            return (
              <div key={day} className={`daydot ${kind} ${day === today ? 'today' : ''}`} title={`${formatDayVi(day, { weekday: true })}${label ? `: ${label}` : ''}`} data-kind={kind}>
                {kind === 'done' ? <Icon name="check" /> : kind === 'frozen' ? <Icon name="snow" /> : parseDay(day).getDate()}
              </div>
            )
          })}
        </div>
        <div className="legend" style={{ marginTop: 14 }}>
          <span className="key">
            <span className="swatch" style={{ background: 'var(--flame)', borderRadius: '50%' }} /> ✓ Đạt mục tiêu
          </span>
          <span className="key">
            <span className="swatch" style={{ background: 'color-mix(in srgb, var(--ice) 30%, transparent)', borderRadius: '50%' }} /> ❄ Dùng lá chắn
          </span>
          <span className="key">
            <span className="swatch" style={{ border: '1.5px dashed var(--axis)', borderRadius: '50%' }} /> Bỏ lỡ
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Cột mốc</h2>
        <div className="milestones">
          {MILESTONES.map((m) => (
            <div key={m} className={`milestone ${info.longest >= m ? 'hit' : ''}`} title={info.longest >= m ? 'Đã đạt' : `Còn ${m - info.current} ngày`}>
              <b className="tnum">{m}</b>
              <span className="small">{info.longest >= m ? '✓ đã đạt' : 'ngày'}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Lịch sử các chuỗi</h2>
          {runs.length === 0 ? (
            <p className="muted">Chưa có chuỗi nào. Hoàn thành mục tiêu hôm nay để bắt đầu.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Từ</th>
                    <th>Đến</th>
                    <th className="num">Số ngày</th>
                    <th className="num">Lá chắn</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 12).map((r) => (
                    <tr key={r.start}>
                      <td>{formatDayVi(r.start)}</td>
                      <td>{r.end >= addDays(today, -1) && info.current > 0 && r.start === info.startDay ? <span className="chip good">đang chạy</span> : formatDayVi(r.end)}</td>
                      <td className="num">
                        <b>{r.length}</b>
                      </td>
                      <td className="num">{r.frozenDays || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <h2>Sự kiện chuỗi gần đây</h2>
          {!events || events.length === 0 ? (
            <p className="muted">Chưa có sự kiện nào.</p>
          ) : (
            <div className="log-list">
              {events.map((e) => (
                <div className="log-row" key={e.id} style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <span className={`lvl ${e.level}`}>{e.level === 'warn' ? 'đứt' : 'chuỗi'}</span>
                  <span className="msg">
                    {e.message}
                    <br />
                    <time>{formatDateTime(e.ts)}</time>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
