/* Service worker của InkRecall — được vite.config.ts điền danh sách precache khi build. */
const VERSION = '__VERSION__'
const PRECACHE = "__PRECACHE__"
const CACHE = `inkrecall-${VERSION}`
const SHARE_CACHE = 'inkrecall-share-inbox'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('inkrecall-') && k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Nhận tệp chia sẻ từ Samsung Notes (Web Share Target) rồi chuyển sang màn hình nhập. */
async function receiveShare(request) {
  const target = new URL('./#/notes?shared=1', self.registration.scope).href
  try {
    const form = await request.formData()
    const cache = await caches.open(SHARE_CACHE)
    let i = 0
    for (const file of form.getAll('files')) {
      if (!(file instanceof File)) continue
      await cache.put(
        new URL(`./__shared__/${Date.now()}-${i++}`, self.registration.scope).href,
        new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) } }),
      )
    }
  } catch (err) {
    console.error('[sw] không nhận được tệp chia sẻ', err)
  }
  return Response.redirect(target, 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(request))
    return
  }
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    // Ưu tiên mạng để nhận bản mới; mất mạng thì dùng bản đã lưu.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./', { cacheName: CACHE }).then((r) => r || Response.error())),
    )
    return
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit || fetch(request)))
})
