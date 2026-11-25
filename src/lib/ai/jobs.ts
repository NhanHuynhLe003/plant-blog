/** Trạng thái hàng đợi AI — tách riêng để giao diện theo dõi mà không phải tải SDK. */
export interface AiJobState {
  running: boolean
  total: number
  done: number
  failed: number
  current?: string
  lastError?: string
}

let state: AiJobState = { running: false, total: 0, done: 0, failed: 0 }
const listeners = new Set<() => void>()

export function emitJobs(patch: Partial<AiJobState>): void {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

export const aiJobs = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  get: () => state,
}
