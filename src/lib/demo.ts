import { makeCard } from './cards'
import { db, getSettings, saveStreakMeta, uid } from './db'
import { canvasToBlob, ctx2d, grayOf, makeCanvas, scaleCanvas } from './image'
import { log } from './logger'
import { emptyDay } from './review'
import { grade } from './scheduler'
import { segmentGray } from './segment'
import { addDays, dayKeyOf, dayStartTs } from './time'
import type { Card, DayStat, Note, Page, Rating, ReviewEntry } from './types'

/**
 * Dữ liệu mẫu để xem thử ứng dụng: vài trang "viết tay" vẽ bằng canvas và
 * ~4 tháng lịch sử ôn tập mô phỏng. Mọi thứ đều gắn nhãn [Mẫu].
 */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOTES: { title: string; pages: { heading: string; blocks: string[][] }[] }[] = [
  {
    title: '[Mẫu] Sinh học – Quang hợp',
    pages: [
      {
        heading: 'Quang hợp là gì?',
        blocks: [
          ['Quá trình cây dùng ánh sáng để tổng hợp', 'chất hữu cơ từ CO₂ và nước.'],
          ['Phương trình tổng quát:', '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂'],
          ['Diễn ra ở lục lạp, nơi chứa', 'sắc tố diệp lục (chlorophyll).'],
          ['Hai pha: pha sáng (màng thylakoid)', 'và pha tối (chất nền stroma).'],
        ],
      },
      {
        heading: 'Pha sáng & pha tối',
        blocks: [
          ['Pha sáng: quang phân li nước', '→ tạo ATP, NADPH và giải phóng O₂'],
          ['Pha tối = chu trình Calvin', 'cố định CO₂ nhờ enzyme RuBisCO'],
          ['Yếu tố ảnh hưởng: ánh sáng,', 'nồng độ CO₂, nhiệt độ, nước'],
        ],
      },
    ],
  },
  {
    title: '[Mẫu] Tiếng Anh – Từ vựng IELTS',
    pages: [
      {
        heading: 'Vocabulary – Environment',
        blocks: [
          ['sustainable (adj) – bền vững', 'e.g. sustainable development'],
          ['deforestation (n) – nạn phá rừng'],
          ['mitigate (v) – giảm nhẹ', 'mitigate the effects of climate change'],
          ['biodiversity (n) – đa dạng sinh học'],
          ['renewable energy – năng lượng tái tạo', 'solar, wind, hydro power'],
        ],
      },
    ],
  },
  {
    title: '[Mẫu] Lịch sử – Cách mạng công nghiệp',
    pages: [
      {
        heading: 'Cách mạng công nghiệp lần 1',
        blocks: [
          ['Bắt đầu ở Anh, khoảng 1760 – 1840'],
          ['Máy hơi nước của James Watt (1769)', '→ thay sức người bằng sức máy'],
          ['Ngành dệt đi đầu: máy kéo sợi Jenny,', 'máy dệt chạy bằng sức nước'],
          ['Hệ quả: đô thị hoá, hình thành', 'giai cấp công nhân và tư sản'],
          ['Đường sắt đầu tiên: 1825', 'Stockton – Darlington'],
        ],
      },
    ],
  },
]

function drawPage(heading: string, blocks: string[][], rand: () => number): HTMLCanvasElement {
  const W = 1000
  const H = 1414
  const c = makeCanvas(W, H)
  const ctx = ctx2d(c)
  ctx.fillStyle = '#fdfcf7'
  ctx.fillRect(0, 0, W, H)
  const font = (px: number) => `${px}px "Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive`
  const write = (text: string, x: number, y: number, px: number, color: string) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((rand() - 0.5) * 0.02)
    ctx.font = font(px)
    ctx.fillStyle = color
    ctx.fillText(text, 0, 0)
    ctx.restore()
    return ctx.measureText(text).width
  }

  ctx.font = font(58)
  const hw = write(heading, 70, 130, 58, '#1c3faa')
  // Gạch chân tiêu đề bằng nét tay hơi run.
  ctx.strokeStyle = '#d6336c'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(70, 152)
  for (let x = 70; x <= 70 + hw * 1.05; x += 30) ctx.lineTo(x, 152 + (rand() - 0.5) * 6)
  ctx.stroke()

  let y = 290
  for (const lines of blocks) {
    const x = 80 + rand() * 30
    ctx.fillStyle = '#1f2933'
    ctx.beginPath()
    ctx.arc(x - 26, y - 14, 7, 0, Math.PI * 2)
    ctx.fill()
    for (const line of lines) {
      write(line, x, y, 40, '#1f2933')
      y += 62
    }
    y += 110
  }
  return c
}

export async function hasDemo(): Promise<boolean> {
  return (await db.notes.filter((n) => n.source === 'demo').count()) > 0
}

export async function createDemo(now = Date.now()): Promise<{ notes: number; cards: number; reviews: number }> {
  const s = await getSettings()
  const rand = rng(20261125)
  const today = dayKeyOf(now, s.rolloverHour)
  const DAYS = 130

  const notes: Note[] = []
  const pages: Page[] = []
  const cards: Card[] = []
  const created = dayStartTs(addDays(today, -DAYS), s.rolloverHour)
  for (const [ni, def] of NOTES.entries()) {
    const note: Note = { id: uid(), title: def.title, createdAt: created + ni, updatedAt: created + ni, source: 'demo', pageCount: def.pages.length }
    for (const [pi, p] of def.pages.entries()) {
      const canvas = drawPage(p.heading, p.blocks, rand)
      const page: Page = { id: uid(), noteId: note.id, index: pi, blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height }
      pages.push(page)
      if (pi === 0) note.thumb = await canvasToBlob(scaleCanvas(canvas, 360), 0.8)
      const g = grayOf(canvas, canvas.width, canvas.height)
      for (const rect of segmentGray(g.gray, g.width, g.height, { granularity: 'paragraph' })) cards.push(makeCard(page, rect, 'auto', created + ni))
    }
    notes.push(note)
  }

  // Mô phỏng lịch sử: nghỉ vài ngày ngẫu nhiên, 12 ngày gần nhất học đều.
  const reviews: ReviewEntry[] = []
  const days = new Map<string, DayStat>()
  const goal = 8
  let introduced = 0
  for (let d = DAYS; d >= 1; d--) {
    const day = addDays(today, -d)
    const skip = d > 12 && rand() < 0.2
    if (skip) {
      // Một số ngày nghỉ lẻ được lá chắn cứu.
      const prev = days.get(addDays(day, -1))
      if (prev?.qualified && rand() < 0.35) days.set(day, { ...emptyDay(day, goal), frozen: true })
      continue
    }
    const start = dayStartTs(day, s.rolloverHour) + (15 + Math.floor(rand() * 6)) * 3_600_000
    const end = dayStartTs(addDays(day, 1), s.rolloverHour)
    const stat = emptyDay(day, goal)
    let t = start
    const due = cards.filter((c) => c.state !== 0 && c.due < end)
    // Để dành ~1/3 số thẻ ở trạng thái Mới cho người dùng tự học thử.
    const fresh = d % 3 === 0 && introduced < cards.length * 0.65 ? cards.slice(introduced, introduced + 2) : []
    introduced += fresh.length
    for (const card of [...due, ...fresh]) {
      const r = rand()
      const rating: Rating = card.state === 0 ? (r < 0.15 ? 1 : r < 0.3 ? 2 : r < 0.9 ? 3 : 4) : r < 0.1 ? 1 : r < 0.22 ? 2 : r < 0.88 ? 3 : 4
      const prev = card.sched
      const next = grade(prev, t, rating, s.retention)
      const durationMs = 4000 + Math.floor(rand() * 14000)
      reviews.push({ cardId: card.id, noteId: card.noteId, ts: t, day, rating, stateBefore: prev.state, stateAfter: next.state, scheduledDays: next.scheduled_days, stability: next.stability, difficulty: next.difficulty, durationMs, prev })
      Object.assign(card, { sched: next, due: next.due, state: next.state })
      stat.reviews++
      stat[(['again', 'hard', 'good', 'easy'] as const)[rating - 1]]++
      if (prev.state === 0) stat.newCards++
      stat.timeMs += durationMs
      t += durationMs + 1500
    }
    // Ôn hết thẻ đến hạn trong ngày = hoàn thành, kể cả khi ít hơn mục tiêu.
    stat.qualified = true
    stat.qualifiedAt = t
    days.set(day, stat)
  }

  await db.transaction('rw', [db.notes, db.pages, db.cards, db.reviews, db.days, db.meta], async () => {
    await db.notes.bulkAdd(notes)
    await db.pages.bulkAdd(pages)
    await db.cards.bulkAdd(cards)
    await db.reviews.bulkAdd(reviews)
    for (const stat of days.values()) if (!(await db.days.get(stat.day))) await db.days.add(stat)
    await saveStreakMeta({ freezes: 1 })
  })
  log.info('system', `Tạo dữ liệu mẫu: ${notes.length} ghi chú, ${cards.length} thẻ, ${reviews.length} lượt ôn mô phỏng`)
  return { notes: notes.length, cards: cards.length, reviews: reviews.length }
}

export async function removeDemo(): Promise<void> {
  const ids = (await db.notes.filter((n) => n.source === 'demo').toArray()).map((n) => n.id)
  await db.transaction('rw', [db.notes, db.pages, db.cards, db.reviews], async () => {
    for (const id of ids) {
      await db.cards.where('noteId').equals(id).delete()
      await db.pages.where('noteId').equals(id).delete()
      await db.reviews.where('noteId').equals(id).delete()
      await db.notes.delete(id)
    }
  })
  log.info('system', `Gỡ dữ liệu mẫu (${ids.length} ghi chú)`)
}
