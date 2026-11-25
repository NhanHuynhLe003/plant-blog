import { describe, expect, it } from 'vitest'
import { findCutRow, iou, segmentGray, toGray } from './segment'

/** Trang giả: nền sáng, mỗi "dòng chữ" là một dải nét gạch đứt quãng. */
function page(width: number, height: number, bg = 250) {
  const gray = new Uint8Array(width * height).fill(bg)
  const ink = (x0: number, y0: number, w: number, h: number, v = 30) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if ((x + y) % 3 !== 0) gray[y * width + x] = v
  }
  return { gray, ink }
}

describe('segmentGray', () => {
  it('gom các dòng sát nhau thành đoạn, tách ở khoảng trắng lớn', () => {
    const { gray, ink } = page(200, 400)
    // Đoạn 1: 3 dòng cách nhau 6px
    ink(20, 20, 150, 10)
    ink(20, 36, 140, 10)
    ink(20, 52, 120, 10)
    // Đoạn 2: 2 dòng, cách đoạn 1 khoảng 60px
    ink(20, 122, 160, 10)
    ink(20, 138, 90, 10)
    // Đoạn 3
    ink(30, 300, 100, 12)

    const paragraphs = segmentGray(gray, 200, 400, { granularity: 'paragraph' })
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].y * 400).toBeLessThanOrEqual(20)
    expect((paragraphs[0].y + paragraphs[0].h) * 400).toBeGreaterThanOrEqual(62)
    expect((paragraphs[0].y + paragraphs[0].h) * 400).toBeLessThan(110)

    const lines = segmentGray(gray, 200, 400, { granularity: 'line' })
    expect(lines).toHaveLength(6)

    const blocks = segmentGray(gray, 200, 400, { granularity: 'block' })
    expect(blocks.length).toBeLessThan(paragraphs.length + 1)
  })

  it('ôm sát vùng mực theo chiều ngang', () => {
    const { gray, ink } = page(200, 200)
    ink(100, 50, 60, 12)
    const [r] = segmentGray(gray, 200, 200)
    expect(r.x * 200).toBeGreaterThan(90)
    expect((r.x + r.w) * 200).toBeLessThan(170)
  })

  it('tách ghi chú hai cột', () => {
    const { gray, ink } = page(300, 200)
    ink(10, 40, 100, 12)
    ink(190, 40, 100, 12)
    const rects = segmentGray(gray, 300, 200)
    expect(rects).toHaveLength(2)
    expect(rects[0].x).toBeLessThan(rects[1].x)
  })

  it('bỏ qua dòng kẻ của mẫu giấy', () => {
    const { gray, ink } = page(200, 300)
    for (let y = 20; y < 300; y += 20) for (let x = 0; x < 200; x++) gray[y * 200 + x] = 150
    ink(20, 44, 120, 12)
    ink(20, 204, 120, 12)
    expect(segmentGray(gray, 200, 300)).toHaveLength(2)
  })

  it('hoạt động với nền tối, mực sáng', () => {
    const { gray, ink } = page(200, 200, 20)
    ink(20, 40, 120, 12, 240)
    ink(20, 140, 120, 12, 240)
    expect(segmentGray(gray, 200, 200)).toHaveLength(2)
  })

  it('trang trống hoặc chỉ có nhiễu thì không có vùng nào', () => {
    const { gray } = page(200, 200)
    gray[50 * 200 + 50] = 0
    expect(segmentGray(gray, 200, 200)).toEqual([])
  })
})

describe('tiện ích', () => {
  it('findCutRow chọn giữa dải trắng dài nhất', () => {
    const { gray, ink } = page(100, 300)
    ink(10, 0, 80, 100)
    ink(10, 108, 80, 60) // khe hẹp 100..107
    ink(10, 200, 80, 100) // khe rộng 168..199
    const cut = findCutRow(gray, 100, 300, 90, 260)
    expect(cut).toBeGreaterThanOrEqual(175)
    expect(cut).toBeLessThanOrEqual(192)
  })

  it('findCutRow vẫn trả về hàng ít mực nhất khi không có khe trắng', () => {
    const { gray, ink } = page(100, 100)
    ink(0, 0, 100, 100)
    const cut = findCutRow(gray, 100, 100, 40, 60)
    expect(cut).toBeGreaterThanOrEqual(40)
    expect(cut).toBeLessThan(60)
  })

  it('toGray trộn ảnh trong suốt với nền trắng', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255])
    expect([...toGray(rgba, 3, 1)]).toEqual([255, 0, 255])
  })

  it('iou', () => {
    const a = { x: 0, y: 0, w: 0.5, h: 0.5 }
    expect(iou(a, a)).toBeCloseTo(1)
    expect(iou(a, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })).toBe(0)
    expect(iou(a, { x: 0.25, y: 0, w: 0.5, h: 0.5 })).toBeCloseTo(1 / 3)
  })
})
