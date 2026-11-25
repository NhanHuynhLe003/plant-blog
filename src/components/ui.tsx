import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/* ---------- Thông báo nổi ---------- */
interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}
type Notify = (text: string, kind?: Toast['kind']) => void

const ToastCtx = createContext<Notify>(() => {})
export const useToast = () => useContext(ToastCtx)

/* ---------- Hộp xác nhận ---------- */
interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirm?: string
  danger?: boolean
}
type Confirm = (opts: ConfirmOptions) => Promise<boolean>
const ConfirmCtx = createContext<Confirm>(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function Overlays({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const notify = useCallback<Notify>((text, kind = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const confirm = useCallback<Confirm>((opts) => new Promise<boolean>((resolve) => setAsk({ ...opts, resolve })), [])
  useEffect(() => {
    if (ask && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [ask])
  const close = (ok: boolean) => {
    ask?.resolve(ok)
    dialog.current?.close()
    setAsk(null)
  }

  return (
    <ToastCtx.Provider value={notify}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
        {ask && (
          <dialog ref={dialog} className="modal" onCancel={() => close(false)}>
            <h2>{ask.title}</h2>
            {ask.body && <div className="muted">{ask.body}</div>}
            <div className="row">
              <button className="btn" onClick={() => close(false)}>
                Huỷ
              </button>
              <button className={`btn ${ask.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>
                {ask.confirm ?? 'Đồng ý'}
              </button>
            </div>
          </dialog>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  )
}

/* ---------- Chú giải nổi theo con trỏ ---------- */
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => setTip({ x: e.clientX, y: e.clientY, content }), [])
  const hide = useCallback(() => setTip(null), [])
  const node = useMemo(
    () =>
      tip ? (
        <div className="tooltip" style={{ left: Math.min(Math.max(tip.x, 90), window.innerWidth - 90), top: Math.max(tip.y, 44) }}>
          {tip.content}
        </div>
      ) : null,
    [tip],
  )
  return { show, hide, node }
}

export function Ring({ value, max, size = 112, children }: { value: number; max: number; size?: number; children?: ReactNode }) {
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${value} trên ${max}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {frac > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={frac >= 1 ? 'var(--good)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />}
      </svg>
      <div className="center">{children}</div>
    </div>
  )
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
