import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { OccludedPage, PageFrame } from '../components/PageView'
import { useToast } from '../components/ui'
import { db } from '../lib/db'
import { useSettings } from '../lib/hooks'
import { log } from '../lib/logger'
import { queueTotal } from '../lib/queue'
import { answerCard, loadQueue, undoReview, type LoadedQueue } from '../lib/review'
import { formatInterval, preview, RATING_LABEL, STATE_LABEL } from '../lib/scheduler'
import { formatDuration, formatTime } from '../lib/time'
import type { Card, Page, Rating } from '../lib/types'

interface Current {
  queue: LoadedQueue
  card: Card | null
  page: Page | null
  others: Card[]
}

const RATINGS: Rating[] = [1, 2, 3, 4]

export function Review() {
  const [params] = useSearchParams()
  const noteId = params.get('note') ?? undefined
  const settings = useSettings()
  const toast = useToast()
  const note = useLiveQuery(() => (noteId ? db.notes.get(noteId) : undefined), [noteId])

  const [cur, setCur] = useState<Current | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [fullPage, setFullPage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastReview, setLastReview] = useState<number | null>(null)
  const [session, setSession] = useState({ count: 0, again: 0, timeMs: 0 })
  const shownAt = useRef(performance.now())
  const lastCard = useRef<string | null>(null)

  const load = useCallback(
    async (at = Date.now()) => {
      const queue = await loadQueue(at, noteId)
      // Tránh hiện lại ngay thẻ vừa chấm nếu còn thẻ khác.
      const card = queue.ready.find((c) => c.id !== lastCard.current) ?? queue.ready[0] ?? null
      const page = card ? ((await db.pages.get(card.pageId)) ?? null) : null
      const others = card ? (await db.cards.where('pageId').equals(card.pageId).toArray()).filter((c) => c.id !== card.id && c.kind !== 'qa') : []
      if (card && !page) log.error('review', 'Thẻ trỏ tới trang không còn tồn tại', { cardId: card.id, pageId: card.pageId })
      setCur({ queue, card, page, others })
      setRevealed(false)
      setFullPage(false)
      shownAt.current = performance.now()
    },
    [noteId],
  )

  useEffect(() => {
    log.info('review', noteId ? 'Bắt đầu phiên ôn theo ghi chú' : 'Bắt đầu phiên ôn', { noteId })
    void load()
  }, [load, noteId])

  const intervals = useMemo(() => {
    if (!cur?.card) return null
    const now = Date.now()
    const p = preview(cur.card.sched, now, settings.retention)
    return Object.fromEntries(RATINGS.map((r) => [r, formatInterval(p[r].due - now)])) as Record<Rating, string>
  }, [cur?.card, settings.retention])

  const rate = useCallback(
    async (rating: Rating) => {
      if (!cur?.card || busy || !revealed) return
      setBusy(true)
      try {
        const durationMs = Math.round(performance.now() - shownAt.current)
        const res = await answerCard(cur.card.id, rating, durationMs)
        lastCard.current = cur.card.id
        setLastReview(res.reviewId)
        setSession((s) => ({ count: s.count + 1, again: s.again + (rating === 1 ? 1 : 0), timeMs: s.timeMs + Math.min(durationMs, 120_000) }))
        if (res.justQualified) toast(`Hoàn thành mục tiêu hôm nay · chuỗi ${res.streak} ngày`)
        if (res.freezeEarned) toast('Bạn nhận được 1 lá chắn chuỗi')
        await load()
      } catch (error) {
        log.error('review', 'Không lưu được lượt chấm', { error, cardId: cur.card.id })
        toast('Không lưu được lượt chấm, hãy thử lại', 'error')
      } finally {
        setBusy(false)
      }
    },
    [cur, busy, revealed, load, toast],
  )

  const undo = useCallback(async () => {
    if (lastReview === null || busy) return
    setBusy(true)
    try {
      const entry = await undoReview(lastReview)
      setLastReview(null)
      lastCard.current = null
      if (entry) {
        setSession((s) => ({ count: Math.max(0, s.count - 1), again: Math.max(0, s.again - (entry.rating === 1 ? 1 : 0)), timeMs: Math.max(0, s.timeMs - Math.min(entry.durationMs, 120_000)) }))
        toast('Đã hoàn tác lượt chấm vừa rồi')
      }
      await load()
    } finally {
      setBusy(false)
    }
  }, [lastReview, busy, load, toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else void rate(3)
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as Rating)
      else if (e.key === 'z' || e.key === 'u') void undo()
      else if (e.key === 'f') setFullPage((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, rate, undo])

  if (!cur) return null
  const { queue, card, page, others } = cur
  const left = queueTotal(queue)
  const goal = settings.dailyGoal
  const undoBtn = lastReview !== null && (
    <button className="btn small" onClick={() => void undo()} disabled={busy} data-testid="undo">
      <Icon name="undo" /> Hoàn tác <kbd>Z</kbd>
    </button>
  )

  const header = (
    <>
      <div className="row between">
        <div>
          <h1 style={{ fontSize: '1.25rem' }}>{note ? `Ôn: ${note.title}` : 'Ôn tập'}</h1>
          <span className="muted small tnum" data-testid="review-counts">
            Đang học {queue.counts.learning} · Ôn tập {queue.counts.review} · Mới {queue.counts.fresh}
          </span>
        </div>
        <span className="chip tnum" title="Số thẻ đã ôn hôm nay so với mục tiêu">
          {queue.stat.reviews}/{goal} hôm nay
        </span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, queue.stat.reviews)}>
        <i style={{ width: `${Math.min(100, (queue.stat.reviews / goal) * 100)}%` }} />
      </div>
    </>
  )

  if (!card || !page) {
    const waiting = queue.waitingUntil
    return (
      <div className="review">
        {header}
        <section className="card empty" data-testid="review-done">
          <div className="big-icon">
            <Icon name={waiting ? 'clock' : 'check'} />
          </div>
          {waiting ? (
            <>
              <h2>Tạm hết thẻ</h2>
              <p>
                Còn {queue.counts.learning} thẻ đang học, thẻ sớm nhất đến hạn lúc {formatTime(waiting).slice(0, 5)}.
              </p>
              <button className="btn primary" onClick={() => void load(waiting)}>
                Ôn luôn bây giờ
              </button>
            </>
          ) : (
            <>
              <h2>{queue.stat.reviews > 0 ? 'Đã ôn hết thẻ hôm nay' : 'Không có thẻ nào cần ôn'}</h2>
              <p>
                {session.count > 0
                  ? `Phiên này: ${session.count} thẻ trong ${formatDuration(session.timeMs)}, nhớ được ${Math.round((1 - session.again / session.count) * 100)}%.`
                  : queue.stat.reviews > 0
                    ? `Hôm nay bạn đã ôn ${queue.stat.reviews} thẻ. Thẻ tiếp theo sẽ xuất hiện khi đến hạn.`
                    : 'Nhập ghi chú và tạo thẻ để bắt đầu ôn.'}
              </p>
            </>
          )}
          <div className="row">
            {undoBtn}
            <Link to="/" className="btn">
              Về trang chủ
            </Link>
            <Link to="/stats" className="btn">
              Xem thống kê
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="review">
      {header}
      <div className="row between">
        <div className="row" style={{ gap: 6 }}>
          <span className="chip">{STATE_LABEL[card.state]}</span>
          <span className="muted small">
            Trang {card.pageIndex + 1} · còn {left} thẻ
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {undoBtn}
          {card.kind !== 'qa' && (
            <button className={`btn small ${fullPage ? 'on' : ''}`} onClick={() => setFullPage((v) => !v)} aria-pressed={fullPage}>
              <Icon name="expand" /> Cả trang
            </button>
          )}
        </div>
      </div>

      {card.kind === 'qa' ? (
        <section className="card qa" data-testid="qa-card">
          <span className="chip">Câu hỏi tổng hợp · AI</span>
          <p className="qa-q">{card.prompt}</p>
          {revealed && (
            <>
              <hr />
              <p className="qa-a" data-testid="qa-answer">
                {card.answer}
              </p>
              <details className="help">
                <summary>Xem trang ghi chú gốc</summary>
                <div style={{ marginTop: 10 }}>
                  <PageFrame page={page} />
                </div>
              </details>
            </>
          )}
        </section>
      ) : (
        <>
          {card.prompt && (
            <p className="card" style={{ padding: '10px 14px' }} data-testid="card-question">
              <b>{card.aiPrompt === card.prompt ? 'Câu hỏi:' : 'Gợi ý:'}</b> {card.prompt}
            </p>
          )}
          <OccludedPage page={page} target={card} others={others} revealed={revealed} hideAll={settings.occlusion === 'all'} fullPage={fullPage} />
          {revealed && card.answer && (
            <p className="muted small" style={{ textAlign: 'center' }}>
              AI đọc được: {card.answer}
            </p>
          )}
        </>
      )}

      <div className="review-actions">
        {!revealed ? (
          <button className="btn primary big" style={{ width: '100%' }} onClick={() => setRevealed(true)} data-testid="reveal">
            <Icon name="eye" /> Hiện đáp án <kbd style={{ background: 'transparent', color: 'inherit' }}>Space</kbd>
          </button>
        ) : (
          <div className="rate" role="group" aria-label="Bạn nhớ vùng này thế nào?">
            {RATINGS.map((r) => (
              <button key={r} className={`r${r}`} onClick={() => void rate(r)} disabled={busy} data-testid={`rate-${r}`}>
                {RATING_LABEL[r]}
                <small>{intervals?.[r]}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
