import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AiSettings } from '../components/AiPanel'
import { Icon } from '../components/Icon'
import { useConfirm, useToast } from '../components/ui'
import { exportBackup, importBackup, wipeAll } from '../lib/backup'
import { db, saveSettings } from '../lib/db'
import { createDemo, removeDemo } from '../lib/demo'
import { useSettings } from '../lib/hooks'
import { downloadBlob } from '../lib/image'
import { log } from '../lib/logger'
import { rebuildDays } from '../lib/review'
import { reconcileStreak } from '../lib/streakService'
import { formatKey } from '../lib/time'
import type { Settings } from '../lib/types'

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div>
        <strong>{title}</strong>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function SettingsPage() {
  const s = useSettings()
  const toast = useToast()
  const confirm = useConfirm()
  const restore = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState('')
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null)
  const demoCount = useLiveQuery(() => db.notes.filter((n) => n.source === 'demo').count(), [])
  const noteCount = useLiveQuery(() => db.notes.count(), [])

  useEffect(() => {
    void (async () => {
      if (!navigator.storage?.estimate) return
      const e = await navigator.storage.estimate()
      setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false })
    })()
  }, [noteCount])

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    void saveSettings({ [key]: value } as Partial<Settings>)
    log.info('settings', `Đổi cài đặt ${key}`, { [key]: value, before: s[key] })
  }
  const num = (key: 'dailyGoal' | 'newPerDay' | 'maxLogs', min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.round(Number(e.target.value))
    if (Number.isFinite(v)) set(key, Math.min(max, Math.max(min, v)))
  }
  const task = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    try {
      await fn()
    } catch (error) {
      log.error('system', `Thao tác “${name}” thất bại`, { error })
      toast(error instanceof Error ? error.message : 'Có lỗi xảy ra', 'error')
    } finally {
      setBusy('')
    }
  }

  const mb = (n: number) => (n / 1_048_576).toFixed(n > 10_485_760 ? 0 : 1)

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Cài đặt</h1>
          <p>Dữ liệu chỉ nằm trên thiết bị này. Hãy sao lưu định kỳ.</p>
        </div>
      </header>

      <AiSettings />

      <section className="card">
        <h2>Ôn tập</h2>
        <Row title="Mục tiêu mỗi ngày" hint="Số thẻ cần ôn để giữ chuỗi.">
          <input className="input tnum" type="number" min={1} max={500} value={s.dailyGoal} onChange={num('dailyGoal', 1, 500)} aria-label="Mục tiêu mỗi ngày" />
        </Row>
        <Row title="Thẻ mới mỗi ngày" hint="Giới hạn số thẻ chưa học được đưa vào mỗi ngày.">
          <input className="input tnum" type="number" min={0} max={200} value={s.newPerDay} onChange={num('newPerDay', 0, 200)} aria-label="Thẻ mới mỗi ngày" />
        </Row>
        <Row title="Mức ghi nhớ mong muốn" hint="Cao hơn = nhớ chắc hơn nhưng phải ôn thường xuyên hơn.">
          <select className="input" value={s.retention} onChange={(e) => set('retention', Number(e.target.value))} aria-label="Mức ghi nhớ mong muốn">
            {[0.8, 0.85, 0.9, 0.93, 0.95].map((r) => (
              <option key={r} value={r}>
                {Math.round(r * 100)}%{r === 0.9 ? ' (khuyên dùng)' : ''}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Giờ sang ngày mới" hint="Ôn trước giờ này vẫn tính cho ngày hôm trước.">
          <select className="input" value={s.rolloverHour} onChange={(e) => set('rolloverHour', Number(e.target.value))} aria-label="Giờ sang ngày mới">
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </Row>
        <Row title="Cách che khi ôn" hint="Che một vùng: các đoạn khác làm gợi ý. Che tất cả: khó hơn.">
          <select className="input" value={s.occlusion} onChange={(e) => set('occlusion', e.target.value as Settings['occlusion'])} aria-label="Cách che khi ôn">
            <option value="one">Che một vùng</option>
            <option value="all">Che tất cả</option>
          </select>
        </Row>
      </section>

      <section className="card">
        <h2>Nhập ghi chú</h2>
        <Row title="Tự tạo thẻ khi nhập" hint="Tách từng đoạn chữ viết tay thành một thẻ.">
          <input type="checkbox" className="switch" checked={s.autoCards} onChange={(e) => set('autoCards', e.target.checked)} aria-label="Tự tạo thẻ khi nhập" />
        </Row>
        <Row title="Độ mịn khi tách" hint="Dòng: nhiều thẻ nhỏ. Khối lớn: ít thẻ, mỗi thẻ nhiều nội dung.">
          <select className="input" value={s.granularity} onChange={(e) => set('granularity', e.target.value as Settings['granularity'])} aria-label="Độ mịn khi tách">
            <option value="line">Từng dòng</option>
            <option value="paragraph">Từng đoạn</option>
            <option value="block">Khối lớn</option>
          </select>
        </Row>
      </section>

      <section className="card">
        <h2>Giao diện & nhật ký</h2>
        <Row title="Giao diện">
          <select className="input" value={s.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])} aria-label="Giao diện">
            <option value="auto">Theo hệ thống</option>
            <option value="light">Sáng</option>
            <option value="dark">Tối</option>
          </select>
        </Row>
        <Row title="Mức ghi nhật ký" hint="“Gỡ lỗi” ghi chi tiết nhất, dùng khi cần tìm nguyên nhân sự cố.">
          <select className="input" value={s.logLevel} onChange={(e) => set('logLevel', e.target.value as Settings['logLevel'])} aria-label="Mức ghi nhật ký">
            <option value="debug">Gỡ lỗi</option>
            <option value="info">Thông tin</option>
            <option value="warn">Cảnh báo</option>
            <option value="error">Chỉ lỗi</option>
          </select>
        </Row>
        <Row title="Số dòng nhật ký tối đa" hint="Dòng cũ hơn sẽ tự bị xoá.">
          <input className="input tnum" type="number" min={500} max={50000} step={500} value={s.maxLogs} onChange={num('maxLogs', 500, 50000)} aria-label="Số dòng nhật ký tối đa" />
        </Row>
      </section>

      <section className="card">
        <h2>Dữ liệu</h2>
        {storage && (
          <p className="card-sub">
            Đang dùng {mb(storage.usage)} MB / {mb(storage.quota)} MB · {storage.persisted ? 'trình duyệt cam kết không tự xoá' : 'trình duyệt có thể xoá khi máy đầy — nên cài ứng dụng lên màn hình chính và sao lưu'}
          </p>
        )}
        <Row title="Sao lưu" hint="Tải về một tệp .zip gồm ghi chú, thẻ, lịch sử ôn và cài đặt (không gồm khoá API).">
          <button
            className="btn"
            disabled={!!busy}
            onClick={() =>
              void task('sao lưu', async () => {
                downloadBlob(await exportBackup(), `inkrecall-${formatKey(new Date())}.zip`)
                toast('Đã tạo tệp sao lưu')
              })
            }
          >
            <Icon name="download" /> Xuất
          </button>
        </Row>
        <Row title="Khôi phục" hint="Thay toàn bộ dữ liệu hiện tại bằng một tệp sao lưu.">
          <>
            <input
              ref={restore}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                void task('khôi phục', async () => {
                  if (!(await confirm({ title: 'Khôi phục từ sao lưu?', body: 'Toàn bộ ghi chú, thẻ và lịch sử hiện có sẽ bị thay thế.', confirm: 'Khôi phục', danger: true }))) return
                  const r = await importBackup(file)
                  await reconcileStreak()
                  toast(`Đã khôi phục ${r.notes} ghi chú, ${r.cards} thẻ`)
                })
              }}
            />
            <button className="btn" disabled={!!busy} onClick={() => restore.current?.click()}>
              <Icon name="upload" /> Nhập
            </button>
          </>
        </Row>
        <Row title="Dữ liệu mẫu" hint="Ba ghi chú giả lập và ~4 tháng lịch sử ôn để xem thử heatmap, chuỗi, thống kê.">
          {demoCount ? (
            <button className="btn" disabled={!!busy} onClick={() => void task('gỡ dữ liệu mẫu', async () => (await removeDemo(), await rebuildDays(), toast('Đã gỡ dữ liệu mẫu')))}>
              Gỡ mẫu
            </button>
          ) : (
            <button
              className="btn"
              disabled={!!busy}
              data-testid="create-demo"
              onClick={() =>
                void task('tạo dữ liệu mẫu', async () => {
                  const r = await createDemo()
                  await reconcileStreak()
                  toast(`Đã tạo ${r.cards} thẻ mẫu và ${r.reviews} lượt ôn`)
                })
              }
            >
              {busy === 'tạo dữ liệu mẫu' ? 'Đang tạo…' : 'Tạo mẫu'}
            </button>
          )}
        </Row>
        <Row title="Dựng lại thống kê" hint="Tính lại số liệu từng ngày từ nhật ký lượt ôn nếu thấy sai lệch.">
          <button className="btn" disabled={!!busy} onClick={() => void task('dựng lại thống kê', async () => toast(`Đã tính lại ${await rebuildDays()} ngày`))}>
            Tính lại
          </button>
        </Row>
        <Row title="Xoá toàn bộ dữ liệu" hint="Xoá mọi ghi chú, thẻ, lịch sử và cài đặt trên thiết bị này.">
          <button
            className="btn danger"
            disabled={!!busy}
            onClick={() =>
              void task('xoá dữ liệu', async () => {
                if (!(await confirm({ title: 'Xoá toàn bộ dữ liệu?', body: 'Không thể hoàn tác. Hãy xuất sao lưu trước nếu bạn còn cần.', confirm: 'Xoá tất cả', danger: true }))) return
                await wipeAll()
                toast('Đã xoá toàn bộ dữ liệu')
              })
            }
          >
            <Icon name="trash" /> Xoá
          </button>
        </Row>
      </section>

      <section className="card">
        <h2>Cài lên Galaxy và chia sẻ từ Samsung Notes</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Mở trang này bằng Chrome hoặc Samsung Internet → menu → <b>Thêm vào màn hình chính / Cài đặt ứng dụng</b>.</li>
          <li>Trong Samsung Notes: mở ghi chú → ⋮ → <b>Chia sẻ</b> → <b>Tệp PDF</b> hoặc <b>Tệp hình ảnh</b>.</li>
          <li>Chọn <b>InkRecall</b> trong bảng chia sẻ — ghi chú được nhập và tách thẻ ngay.</li>
          <li>Sau lần mở đầu tiên, ứng dụng chạy được khi không có mạng.</li>
        </ol>
      </section>
    </div>
  )
}
