import { db } from './db'
import { importFiles, titleFromFile, type ImportResult } from './importer'
import { log } from './logger'

/**
 * Thư mục theo dõi: Samsung Notes không có API công khai, nên cách tự động
 * khả thi là để ứng dụng tự quét một thư mục nơi bạn lưu tệp xuất (PDF/ảnh)
 * và chỉ nhập những tệp chưa từng thấy.
 */
export const WATCH_META_KEY = 'watch'

export interface WatchState {
  /** Quyền truy cập thư mục (chỉ có trên trình duyệt hỗ trợ File System Access API). */
  handle?: FileSystemDirectoryHandle
  name?: string
  /** Tự quét khi mở ứng dụng. */
  auto: boolean
  /** Dấu vết các tệp đã nhập hoặc đã hỏng: "đường dẫn|kích thước|lần sửa cuối". */
  seen: Record<string, 'ok' | 'error'>
  lastScan?: number
}

type DirHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>
  queryPermission(d: { mode: 'read' }): Promise<PermissionState>
  requestPermission(d: { mode: 'read' }): Promise<PermissionState>
}

export const canPickFolder = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function getWatch(): Promise<WatchState> {
  const v = ((await db.meta.get(WATCH_META_KEY))?.value ?? {}) as Partial<WatchState>
  return { auto: true, ...v, seen: { ...v.seen } }
}

async function saveWatch(patch: Partial<WatchState>): Promise<WatchState> {
  const next = { ...(await getWatch()), ...patch }
  await db.meta.put({ key: WATCH_META_KEY, value: next })
  return next
}

export const setWatchAuto = (auto: boolean) => saveWatch({ auto })

export const fileKey = (path: string, file: Pick<File, 'size' | 'lastModified'>) => `${path}|${file.size}|${file.lastModified}`

const SUPPORTED = /\.(pdf|png|jpe?g|webp)$/i

/**
 * Gom tệp thành từng ghi chú: mỗi PDF một ghi chú; các ảnh cùng tên gốc
 * ("Bài 3_1.jpg", "Bài 3_2.jpg" — kiểu Samsung Notes xuất nhiều trang) thành một.
 */
export function groupFiles<T extends { name: string }>(files: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const f of files) {
    const key = /\.pdf$/i.test(f.name) ? `pdf:${f.name}` : `img:${titleFromFile(f.name)}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  return [...groups.values()]
}

async function collect(dir: DirHandle, prefix = '', depth = 0): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = []
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === 'file' && SUPPORTED.test(name)) out.push({ path: prefix + name, file: await (entry as FileSystemFileHandle).getFile() })
    else if (entry.kind === 'directory' && depth < 2 && !name.startsWith('.')) out.push(...(await collect(entry as DirHandle, `${prefix}${name}/`, depth + 1)))
  }
  return out
}

export interface ScanResult {
  found: number
  imported: ImportResult[]
  failed: number
}

/** Nhập những tệp chưa thấy trong danh sách; dùng chung cho cả hai cách chọn thư mục. */
export async function importNewFiles(entries: { path: string; file: File }[]): Promise<ScanResult> {
  const watch = await getWatch()
  const fresh = entries.filter((e) => !(fileKey(e.path, e.file) in watch.seen)).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  const result: ScanResult = { found: entries.length, imported: [], failed: 0 }
  const seen = { ...watch.seen }
  for (const group of groupFiles(fresh.map((e) => ({ name: e.file.name, entry: e })))) {
    try {
      result.imported.push(...(await importFiles(group.map((g) => g.entry.file), { source: 'folder' })))
      for (const g of group) seen[fileKey(g.entry.path, g.entry.file)] = 'ok'
    } catch (error) {
      // Tệp hỏng được đánh dấu để lần quét sau không thử lại mãi.
      result.failed += group.length
      for (const g of group) seen[fileKey(g.entry.path, g.entry.file)] = 'error'
      log.error('import', `Thư mục theo dõi: không nhập được ${group.map((g) => g.name).join(', ')}`, { error })
    }
  }
  await saveWatch({ seen, lastScan: Date.now() })
  log.info('import', `Quét thư mục theo dõi: ${entries.length} tệp, ${fresh.length} tệp mới, nhập ${result.imported.length} ghi chú`, { failed: result.failed })
  return result
}

export async function pickWatchFolder(): Promise<WatchState> {
  const handle = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'read', id: 'inkrecall-watch' })
  log.info('import', `Chọn thư mục theo dõi “${handle.name}”`)
  return saveWatch({ handle, name: handle.name })
}

export async function forgetWatchFolder(): Promise<void> {
  await saveWatch({ handle: undefined, name: undefined })
  log.info('import', 'Bỏ thư mục theo dõi')
}

export async function resetSeen(): Promise<void> {
  await saveWatch({ seen: {} })
}

export type WatchPermission = 'granted' | 'prompt' | 'denied' | 'none'

export async function watchPermission(): Promise<WatchPermission> {
  const { handle } = await getWatch()
  if (!handle) return 'none'
  try {
    return await (handle as DirHandle).queryPermission({ mode: 'read' })
  } catch {
    return 'denied'
  }
}

/**
 * Quét thư mục đã chọn. `interactive` = đang trong một lần bấm của người dùng,
 * khi đó mới được phép xin lại quyền đọc thư mục.
 */
export async function scanWatchFolder(interactive: boolean): Promise<ScanResult | null> {
  const { handle } = await getWatch()
  if (!handle) return null
  const dir = handle as DirHandle
  let permission = await dir.queryPermission({ mode: 'read' })
  if (permission === 'prompt' && interactive) permission = await dir.requestPermission({ mode: 'read' })
  if (permission !== 'granted') {
    log.debug('import', 'Thư mục theo dõi chưa được cấp quyền, bỏ qua lần quét tự động')
    return null
  }
  return importNewFiles(await collect(dir))
}
