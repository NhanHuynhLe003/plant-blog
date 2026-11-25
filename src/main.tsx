import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { getSettings } from './lib/db'
import { configureLogger, installGlobalLogging, log, SESSION_ID } from './lib/logger'
import { reconcileStreak } from './lib/streakService'
import { getWatch, scanWatchFolder } from './lib/watch'
import './styles.css'

installGlobalLogging()

async function boot() {
  const s = await getSettings()
  configureLogger({ level: s.logLevel, maxLogs: s.maxLogs })
  log.info('system', 'Mở ứng dụng', {
    session: SESSION_ID,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    online: navigator.onLine,
    ua: navigator.userAgent,
  })
  await reconcileStreak()
  // Xin trình duyệt không tự xoá dữ liệu khi máy đầy bộ nhớ.
  if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
    const granted = await navigator.storage.persist()
    log.debug('system', `Lưu trữ bền vững: ${granted ? 'được cấp' : 'chưa được cấp'}`)
  }
}
boot().catch((error) => log.error('system', 'Khởi động thất bại', { error }))

/** Tự quét thư mục theo dõi khi mở app và mỗi lần quay lại app (cách nhau ít nhất 1 phút). */
let lastWatchScan = 0
async function autoScan() {
  if (Date.now() - lastWatchScan < 60_000) return
  lastWatchScan = Date.now()
  const watch = await getWatch()
  if (!watch.handle || !watch.auto) return
  const result = await scanWatchFolder(false)
  if (result?.imported.length) {
    const { autoStudy } = await import('./lib/ai/lazy')
    await autoStudy(result.imported.map((r) => r.note.id))
  }
}
const safeScan = () => void autoScan().catch((error) => log.warn('import', 'Tự quét thư mục theo dõi thất bại', { error }))
safeScan()
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && safeScan())

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => log.debug('system', 'Đã đăng ký service worker', { scope: reg.scope }))
    .catch((error) => log.warn('system', 'Không đăng ký được service worker (ứng dụng vẫn chạy, nhưng không offline)', { error }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
