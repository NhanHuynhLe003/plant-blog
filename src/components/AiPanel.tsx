import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PROVIDER_IDS, PROVIDERS, modelOf } from '../lib/ai/catalog'
import { keyOf, maskKey, saveAiConfig } from '../lib/ai/config'
import { autoStudy, listModels, stopAi } from '../lib/ai/lazy'
import { useAiConfig, useAiJobs } from '../lib/hooks'
import { log } from '../lib/logger'
import type { AiConfig, AiProvider } from '../lib/types'
import { canPickFolder, forgetWatchFolder, getWatch, importNewFiles, pickWatchFolder, resetSeen, scanWatchFolder, setWatchAuto, watchPermission, type ScanResult, type WatchPermission, type WatchState } from '../lib/watch'
import { Icon } from './Icon'
import { Seg, useToast } from './ui'

/* ---------- Thanh tiến độ AI (hiện ở mọi màn hình khi đang chạy) ---------- */

export function AiBanner() {
  const jobs = useAiJobs()
  if (!jobs.running) return null
  const n = jobs.done + jobs.failed
  return (
    <div className="ai-banner" role="status" data-testid="ai-banner">
      <div className="grow">
        <b>AI đang đọc ghi chú</b>{' '}
        <span className="tnum">
          trang {Math.min(n + 1, jobs.total)}/{jobs.total}
        </span>
        <div className="progress" style={{ marginTop: 6 }}>
          <i style={{ width: `${(n / Math.max(1, jobs.total)) * 100}%` }} />
        </div>
      </div>
      <button className="btn small" onClick={() => void stopAi()}>
        Dừng
      </button>
    </div>
  )
}

/* ---------- Cài đặt AI ---------- */

export function AiSettings() {
  const config = useAiConfig()
  const provider = config.provider
  const info = PROVIDERS[provider]
  const [models, setModels] = useState<Partial<Record<AiProvider, string[]>>>({})
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [draftKey, setDraftKey] = useState<string | null>(null)
  const key = keyOf(config)

  useEffect(() => {
    setStatus(null)
    setDraftKey(null)
  }, [provider])

  const save = (patch: Partial<AiConfig>, what: string) => {
    void saveAiConfig(patch)
    log.info('settings', what)
  }
  const saveKey = () => {
    if (draftKey === null) return
    const value = draftKey.trim()
    setDraftKey(null)
    if (value === key) return
    // Chỉ ghi nhận việc đổi khoá, không bao giờ ghi giá trị khoá vào nhật ký.
    save({ keys: { ...config.keys, [provider]: value } }, value ? `Lưu khoá API ${info.label}` : `Xoá khoá API ${info.label}`)
    setStatus(null)
  }
  const check = async () => {
    setChecking(true)
    setStatus(null)
    try {
      const list = await listModels(provider, key)
      setModels((m) => ({ ...m, [provider]: list }))
      const current = modelOf(config)
      const known = list.includes(current)
      setStatus({ ok: true, text: `Kết nối được · ${list.length} model${known ? '' : ` · không thấy “${current}” trong danh sách, hãy chọn model khác`}` })
      log.info('ai', `Kiểm tra kết nối ${info.label} thành công`, { models: list.length, currentModelListed: known })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không kết nối được'
      setStatus({ ok: false, text: message })
      log.warn('ai', `Kiểm tra kết nối ${info.label} thất bại`, { message })
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="card" data-testid="ai-settings">
      <h2>Trợ lý AI</h2>
      <p className="card-sub">AI đọc chữ viết tay trên từng trang, đặt câu hỏi cho mỗi vùng, viết thêm câu hỏi tổng hợp và tóm tắt ôn tập.</p>

      <Seg label="Nhà cung cấp AI" value={provider} onChange={(p) => save({ provider: p }, `Chọn nhà cung cấp AI: ${PROVIDERS[p].label}`)} options={PROVIDER_IDS.map((p) => ({ value: p, label: `${PROVIDERS[p].label}${config.keys[p] ? ' ✓' : ''}` }))} />

      <div className="setting" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <strong>Khoá API {info.label}</strong>
          <span className="muted small">
            Tạo khoá tại{' '}
            <a href={info.keyUrl} target="_blank" rel="noreferrer">
              {info.keyUrl.replace('https://', '')}
            </a>
            . {key ? `Đang lưu: ${maskKey(key)}` : 'Chưa có khoá.'}
          </span>
        </div>
        <div className="row" style={{ gap: 6, flex: '1 1 260px', justifyContent: 'flex-end' }}>
          <input
            className="input"
            style={{ width: 'auto', flex: '1 1 180px' }}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={key ? 'Dán khoá mới để thay' : info.keyHint}
            value={draftKey ?? ''}
            onChange={(e) => setDraftKey(e.target.value)}
            onBlur={saveKey}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            aria-label={`Khoá API ${info.label}`}
            data-testid="ai-key"
          />
          {key && (
            <button className="btn small danger" onClick={() => save({ keys: { ...config.keys, [provider]: '' } }, `Xoá khoá API ${info.label}`)}>
              Xoá khoá
            </button>
          )}
        </div>
      </div>

      <div className="setting" style={{ flexWrap: 'wrap' }}>
        <div>
          <strong>Model</strong>
          <span className="muted small">Mặc định: {info.defaultModel}. Bấm “Kiểm tra” để tải danh sách model tài khoản bạn dùng được.</span>
        </div>
        <div className="row" style={{ gap: 6, flex: '1 1 260px', justifyContent: 'flex-end' }}>
          <input
            className="input"
            style={{ width: 'auto', flex: '1 1 180px' }}
            list="ai-models"
            placeholder={info.defaultModel}
            value={config.models[provider] ?? ''}
            onChange={(e) => void saveAiConfig({ models: { ...config.models, [provider]: e.target.value } })}
            aria-label="Model"
            data-testid="ai-model"
          />
          <datalist id="ai-models">{(models[provider] ?? [info.defaultModel]).map((m) => <option key={m} value={m} />)}</datalist>
          <button className="btn small" onClick={() => void check()} disabled={!key || checking} data-testid="ai-check">
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra'}
          </button>
        </div>
      </div>
      {status && (
        <p className={`chip ${status.ok ? 'good' : 'bad'}`} style={{ whiteSpace: 'normal', padding: '6px 10px' }} role="status" data-testid="ai-status">
          {status.text}
        </p>
      )}

      <div className="setting">
        <div>
          <strong>Tự chạy AI sau khi nhập</strong>
          <span className="muted small">Mỗi ghi chú mới (kể cả từ thư mục theo dõi) được AI xử lý ngay, không cần bấm.</span>
        </div>
        <input type="checkbox" className="switch" checked={config.auto} onChange={(e) => save({ auto: e.target.checked }, `${e.target.checked ? 'Bật' : 'Tắt'} tự chạy AI sau khi nhập`)} aria-label="Tự chạy AI sau khi nhập" data-testid="ai-auto" />
      </div>
      <div className="setting">
        <div>
          <strong>Câu hỏi tổng hợp mỗi trang</strong>
          <span className="muted small">Thẻ hỏi–đáp bằng chữ, nối nhiều ý trên trang. Đặt 0 để chỉ hỏi theo từng vùng.</span>
        </div>
        <input className="input tnum" type="number" min={0} max={8} value={config.extraPerPage} onChange={(e) => void saveAiConfig({ extraPerPage: Math.min(8, Math.max(0, Math.round(Number(e.target.value)) || 0)) })} aria-label="Câu hỏi tổng hợp mỗi trang" />
      </div>
      <div className="setting">
        <div>
          <strong>Ngôn ngữ câu hỏi</strong>
        </div>
        <select className="input" value={config.language} onChange={(e) => void saveAiConfig({ language: e.target.value as AiConfig['language'] })} aria-label="Ngôn ngữ câu hỏi">
          <option value="auto">Theo ghi chú</option>
          <option value="vi">Tiếng Việt</option>
          <option value="en">Tiếng Anh</option>
        </select>
      </div>

      <p className="muted small" style={{ marginTop: 10 }}>
        <Icon name="info" size={14} /> Khi chạy AI, ảnh trang ghi chú được gửi thẳng từ thiết bị này tới {info.company} và tính phí theo tài khoản của bạn (mỗi trang một yêu cầu). Khoá API chỉ lưu trên thiết bị này, không nằm trong tệp sao lưu và không bao giờ được ghi vào nhật ký.
      </p>
    </section>
  )
}

/** Nhãn ngắn kiểu "Claude · claude-opus-5-5" cho nút bấm. */
export function useAiLabel(): { ready: boolean; label: string } {
  const config = useAiConfig()
  return { ready: !!keyOf(config), label: PROVIDERS[config.provider].label }
}

export function AiSetupHint() {
  return (
    <Link to="/settings" className="btn small">
      <Icon name="gear" /> Nhập khoá API
    </Link>
  )
}

/* ---------- Thư mục theo dõi ---------- */

export function WatchFolder({ onImported }: { onImported?: (r: ScanResult) => void }) {
  const toast = useToast()
  const picker = useRef<HTMLInputElement>(null)
  const [watch, setWatch] = useState<WatchState | null>(null)
  const [permission, setPermission] = useState<WatchPermission>('none')
  const [busy, setBusy] = useState(false)
  const supported = canPickFolder()

  const refresh = async () => {
    setWatch(await getWatch())
    setPermission(await watchPermission())
  }
  useEffect(() => void refresh(), [])

  const finish = async (r: ScanResult | null) => {
    await refresh()
    if (!r) return toast('Chưa có quyền đọc thư mục', 'error')
    const queued = await autoStudy(r.imported.map((i) => i.note.id))
    toast(r.imported.length ? `Đã nhập ${r.imported.length} ghi chú mới${queued ? `, AI đang xử lý ${queued} trang` : ''}` : `Không có tệp mới (${r.found} tệp trong thư mục)`)
    onImported?.(r)
  }
  const run = async (fn: () => Promise<ScanResult | null>) => {
    setBusy(true)
    try {
      await finish(await fn())
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        log.error('import', 'Quét thư mục thất bại', { error })
        toast('Không quét được thư mục', 'error')
      }
    } finally {
      setBusy(false)
    }
  }
  const seenCount = Object.keys(watch?.seen ?? {}).length

  return (
    <section className="card" data-testid="watch-folder">
      <div className="row between">
        <div>
          <h2 style={{ marginBottom: 2 }}>Tự nhập từ thư mục</h2>
          <p className="muted small">
            Lưu tệp xuất từ Samsung Notes vào một thư mục; ứng dụng tự quét và chỉ nhập tệp mới.
            {watch?.name ? ` Đang theo dõi “${watch.name}”` : ''}
            {seenCount ? ` · đã ghi nhận ${seenCount} tệp` : ''}
          </p>
        </div>
        {supported && watch?.handle && <input type="checkbox" className="switch" checked={watch.auto} onChange={(e) => void setWatchAuto(e.target.checked).then(refresh)} aria-label="Tự quét khi mở ứng dụng" title="Tự quét khi mở ứng dụng" />}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {supported ? (
          watch?.handle ? (
            <>
              <button className="btn primary small" disabled={busy} onClick={() => void run(() => scanWatchFolder(true))} data-testid="watch-scan">
                <Icon name="download" /> {busy ? 'Đang quét…' : permission === 'granted' ? 'Quét ngay' : 'Cấp quyền và quét'}
              </button>
              <button className="btn small" disabled={busy} onClick={() => void run(async () => (await pickWatchFolder(), scanWatchFolder(true)))}>
                Đổi thư mục
              </button>
              <button className="btn small ghost" disabled={busy} onClick={() => void forgetWatchFolder().then(refresh)}>
                Bỏ theo dõi
              </button>
            </>
          ) : (
            <button className="btn primary small" disabled={busy} onClick={() => void run(async () => (await pickWatchFolder(), scanWatchFolder(true)))} data-testid="watch-pick">
              <Icon name="plus" /> Chọn thư mục theo dõi
            </button>
          )
        ) : (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              {...({ webkitdirectory: '' } as object)}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])].filter((f) => /\.(pdf|png|jpe?g|webp)$/i.test(f.name))
                e.target.value = ''
                void run(() => importNewFiles(files.map((file) => ({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file }))))
              }}
            />
            <button className="btn primary small" disabled={busy} onClick={() => picker.current?.click()}>
              <Icon name="plus" /> {busy ? 'Đang quét…' : 'Chọn thư mục để quét'}
            </button>
            <span className="muted small">Trình duyệt này không cho ghi nhớ thư mục, nên mỗi lần cần chọn lại; tệp đã nhập sẽ được bỏ qua.</span>
          </>
        )}
        {seenCount > 0 && (
          <button className="btn small ghost" disabled={busy} onClick={() => void resetSeen().then(refresh)} title="Lần quét sau sẽ nhập lại mọi tệp">
            Quên tệp đã nhập
          </button>
        )}
      </div>
    </section>
  )
}
