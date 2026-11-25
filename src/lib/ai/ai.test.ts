import 'fake-indexeddb/auto'
import { strFromU8, unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportBackup, importBackup } from '../backup'
import { makeCard } from '../cards'
import { db } from '../db'
import { flushLogs, redact, sanitize } from '../logger'
import type { AiConfig, Card, Page } from '../types'
import { fileKey, groupFiles } from '../watch'
import { getAiConfig, maskKey, saveAiConfig } from './config'
import { ADAPTERS, type ProviderAdapter } from './providers'
import { AiError, DEFAULT_AI_CONFIG, modelOf, parseStudy, type PageStudy, type StudyRequest } from './schema'
import { aiJobs, applyStudy, enqueuePages, orderRegions, studyPage } from './study'

const STUDY: PageStudy = {
  language: 'vi',
  summary: ['Quang hợp tạo glucose và oxy'],
  regions: [
    { id: 1, text: 'Quang hợp là gì?', question: '', skip: true },
    { id: 2, text: '6CO2 + 6H2O → C6H12O6 + 6O2', question: 'Phương trình tổng quát của quang hợp?', skip: false },
  ],
  extra: [{ question: 'Quang hợp cần những nguyên liệu gì?', answer: 'CO2, nước và ánh sáng' }],
}
const REQ: StudyRequest = { imageBase64: 'QUJD', regionCount: 2, extraCount: 1, language: 'auto', noteTitle: 'Sinh học' }
const KEY = 'sk-test-0123456789abcdefghij'

/** fetch giả: ghi lại yêu cầu và trả về một phản hồi JSON. */
function mockFetch(body: unknown, status = 200) {
  const calls: { url: string; headers: Headers; body: any }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null
    const text = req ? await req.clone().text() : typeof init?.body === 'string' ? init.body : ''
    calls.push({ url: req ? req.url : String(input), headers: new Headers(req ? req.headers : init?.headers), body: text ? JSON.parse(text) : undefined })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

describe('parseStudy', () => {
  it('đọc JSON thuần, JSON trong hàng rào mã và JSON kèm chữ thừa', () => {
    const json = JSON.stringify(STUDY)
    expect(parseStudy(json).regions).toHaveLength(2)
    expect(parseStudy('```json\n' + json + '\n```').summary).toEqual(STUDY.summary)
    expect(parseStudy(`Đây là kết quả:\n${json}\nHết.`).extra[0].answer).toBe('CO2, nước và ánh sáng')
  })
  it('vùng không có câu hỏi được coi là bỏ qua; cắt khoảng trắng', () => {
    const s = parseStudy(JSON.stringify({ ...STUDY, regions: [{ id: 1, text: ' a ', question: '  ', skip: false }] }))
    expect(s.regions[0]).toEqual({ id: 1, text: 'a', question: '', skip: true })
  })
  it('báo lỗi có thể thử lại khi không phải JSON hoặc sai khuôn', () => {
    for (const bad of ['xin lỗi', '{"language": "vi"', JSON.stringify({ language: 'vi', summary: 'x', regions: [], extra: [] })]) {
      try {
        parseStudy(bad)
        expect.unreachable()
      } catch (e) {
        expect(e).toBeInstanceOf(AiError)
        expect((e as AiError).kind).toBe('invalid')
        expect((e as AiError).retryable).toBe(true)
      }
    }
  })
})

describe('ChatGPT và DeepSeek (Chat Completions)', () => {
  const ok = { model: 'gpt-x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(STUDY) } }], usage: { prompt_tokens: 900, completion_tokens: 120 } }

  it('gửi ảnh dạng data URL, bật JSON mode, đọc kết quả và số token', async () => {
    const m = mockFetch(ok)
    const r = await ADAPTERS.openai.study(REQ, { apiKey: KEY, model: 'gpt-6.2-sol', fetch: m.fetch })
    const c = m.calls[0]
    expect(c.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(c.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(c.body.model).toBe('gpt-6.2-sol')
    expect(c.body.response_format).toEqual({ type: 'json_object' })
    expect(c.body.messages[0].role).toBe('system')
    expect(c.body.messages[0].content.toLowerCase()).toContain('json')
    expect(c.body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } })
    expect(r.study.regions[1].question).toBe('Phương trình tổng quát của quang hợp?')
    expect(r.usage).toEqual({ input: 900, output: 120 })
  })

  it('DeepSeek dùng địa chỉ riêng và model deepseek-flash mặc định', async () => {
    const m = mockFetch(ok)
    await ADAPTERS.deepseek.study(REQ, { apiKey: KEY, model: modelOf({ ...DEFAULT_AI_CONFIG, provider: 'deepseek' }), fetch: m.fetch })
    expect(m.calls[0].url).toBe('https://api.deepseek.com/chat/completions')
    expect(m.calls[0].body.model).toBe('deepseek-flash')
  })

  it('phân loại lỗi: sai khoá, giới hạn tốc độ, nội dung rỗng, từ chối', async () => {
    const kind = async (body: unknown, status = 200) => ADAPTERS.openai.study(REQ, { apiKey: KEY, model: 'm', fetch: mockFetch(body, status).fetch }).then(() => 'ok', (e: AiError) => e.kind)
    expect(await kind({ error: { message: 'Incorrect API key' } }, 401)).toBe('auth')
    expect(await kind({ error: { message: 'slow down' } }, 429)).toBe('rate')
    expect(await kind({ error: { message: 'boom' } }, 503)).toBe('server')
    expect(await kind({ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] })).toBe('invalid')
    expect(await kind({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] })).toBe('refusal')
    expect(await kind({ choices: [{ finish_reason: 'length', message: { content: '{"lang' } }] })).toBe('invalid')
  })

  it('lấy danh sách model', async () => {
    const m = mockFetch({ data: [{ id: 'b-model' }, { id: 'a-model' }] })
    expect(await ADAPTERS.deepseek.listModels({ apiKey: KEY, fetch: m.fetch })).toEqual(['a-model', 'b-model'])
    expect(m.calls[0].url).toBe('https://api.deepseek.com/models')
  })
})

describe('Gemini', () => {
  it('gửi inlineData + khoá trong header, bỏ phần suy nghĩ khi ghép câu trả lời', async () => {
    const m = mockFetch({
      modelVersion: 'gemini-3.6-flash',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'đang nghĩ…', thought: true }, { text: JSON.stringify(STUDY) }] } }],
      usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 100, thoughtsTokenCount: 50 },
    })
    const r = await ADAPTERS.gemini.study(REQ, { apiKey: 'AIzaTestKey', model: 'gemini-3.6-flash', fetch: m.fetch })
    const c = m.calls[0]
    expect(c.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent')
    expect(c.url).not.toContain('AIza')
    expect(c.headers.get('x-goog-api-key')).toBe('AIzaTestKey')
    expect(c.body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } })
    expect(c.body.generationConfig.responseMimeType).toBe('application/json')
    expect(r.study.extra).toHaveLength(1)
    expect(r.usage).toEqual({ input: 700, output: 150 })
  })
  it('bị chặn nội dung → refusal; chỉ liệt kê model dùng được generateContent', async () => {
    const blocked = mockFetch({ promptFeedback: { blockReason: 'SAFETY' } })
    await expect(ADAPTERS.gemini.study(REQ, { apiKey: 'k', model: 'm', fetch: blocked.fetch })).rejects.toMatchObject({ kind: 'refusal' })
    const list = mockFetch({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] })
    expect(await ADAPTERS.gemini.listModels({ apiKey: 'k', fetch: list.fetch })).toEqual(['gemini-a'])
  })
})

describe('Claude (SDK chính thức)', () => {
  const message = (text: string, stop = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 300 } })

  it('gửi ảnh base64, lược đồ kết quả, mức effort và bật dự phòng khi bị từ chối', async () => {
    const m = mockFetch(message(JSON.stringify(STUDY)))
    const r = await ADAPTERS.claude.study(REQ, { apiKey: 'sk-ant-test', model: 'claude-opus-5-5', fetch: m.fetch })
    const c = m.calls[0]
    expect(c.url).toContain('https://api.anthropic.com/v1/messages')
    // SDK tự chọn header xác thực theo phiên bản API; chỉ cần khoá được gửi đúng một nơi.
    expect([c.headers.get('x-api-key'), c.headers.get('authorization')]).toContain(c.headers.get('x-api-key') ? 'sk-ant-test' : 'Bearer sk-ant-test')
    expect(c.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(c.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(c.body.model).toBe('claude-opus-5-5')
    expect(c.body.fallbacks).toBe('default')
    expect(c.body.output_config.effort).toBe('medium')
    expect(c.body.output_config.format.type).toBe('json_schema')
    expect(c.body.thinking).toBeUndefined()
    expect(c.body.temperature).toBeUndefined()
    expect(c.body.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } })
    expect(r.study.regions).toHaveLength(2)
    expect(r.usage).toEqual({ input: 1500, output: 300 })
  })

  it('không gửi tham số dự phòng cho model không hỗ trợ (Haiku)', async () => {
    const m = mockFetch(message(JSON.stringify(STUDY)))
    await ADAPTERS.claude.study(REQ, { apiKey: 'sk-ant-test', model: 'claude-haiku-5-5', fetch: m.fetch })
    expect(m.calls[0].body.fallbacks).toBeUndefined()
    expect(m.calls[0].headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback')
  })

  it('từ chối và sai khoá được phân loại đúng', async () => {
    const refusal = mockFetch(message('', 'refusal'))
    await expect(ADAPTERS.claude.study(REQ, { apiKey: 'k', model: 'claude-opus-5-5', fetch: refusal.fetch })).rejects.toMatchObject({ kind: 'refusal' })
    const auth = mockFetch({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)
    await expect(ADAPTERS.claude.study(REQ, { apiKey: 'k', model: 'claude-opus-5-5', fetch: auth.fetch })).rejects.toMatchObject({ kind: 'auth' })
  })
})

describe('áp kết quả vào thẻ', () => {
  const page: Page = { id: 'p1', noteId: 'n1', index: 0, blob: new Blob(['x']), width: 100, height: 100 }
  const config: AiConfig = { ...DEFAULT_AI_CONFIG, provider: 'openai', keys: { openai: KEY }, extraPerPage: 1 }
  const fake = (results: (PageStudy | AiError)[]): ProviderAdapter & { calls: number } => {
    const a = {
      calls: 0,
      async study() {
        const r = results[Math.min(a.calls++, results.length - 1)]
        if (r instanceof AiError) throw r
        return { study: r, model: 'fake-1', usage: { input: 10, output: 5 } }
      },
      async listModels() {
        return []
      },
    }
    return a
  }
  const deps = (adapter: ProviderAdapter) => ({ adapter, image: async () => 'QUJD', backoffMs: 1 })
  let top: Card
  let bottom: Card

  beforeEach(async () => {
    await flushLogs()
    await Promise.all(db.tables.map((t) => t.clear()))
    await db.notes.add({ id: 'n1', title: 'Sinh học', createdAt: 1, updatedAt: 1, source: 'image', pageCount: 1 })
    await db.pages.add(page)
    // Cố ý thêm ngược thứ tự để kiểm tra việc đánh số theo vị trí.
    bottom = makeCard(page, { x: 0.1, y: 0.5, w: 0.8, h: 0.1 }, 'auto')
    top = makeCard(page, { x: 0.1, y: 0.1, w: 0.8, h: 0.1 }, 'auto')
    await db.cards.bulkAdd([bottom, top])
  })

  it('đánh số vùng từ trên xuống và bỏ thẻ hỏi–đáp', () => {
    const qa: Card = { ...makeCard(page, { x: 0, y: 0, w: 0, h: 0 }, 'ai'), kind: 'qa' }
    expect(orderRegions([bottom, qa, top]).map((c) => c.id)).toEqual([top.id, bottom.id])
  })

  it('ghi câu hỏi, chữ đọc được, thẻ tổng hợp và tóm tắt', async () => {
    const out = await studyPage('p1', config, undefined, deps(fake([STUDY])))
    expect(out).toEqual({ questions: 1, skipped: 1, qaCards: 1 })
    expect(await db.cards.get(top.id)).toMatchObject({ prompt: '', answer: 'Quang hợp là gì?' })
    expect(await db.cards.get(bottom.id)).toMatchObject({ prompt: 'Phương trình tổng quát của quang hợp?', answer: '6CO2 + 6H2O → C6H12O6 + 6O2' })
    const qa = await db.cards.filter((c) => c.kind === 'qa').toArray()
    expect(qa).toHaveLength(1)
    expect(qa[0]).toMatchObject({ origin: 'ai', state: 0, prompt: 'Quang hợp cần những nguyên liệu gì?', answer: 'CO2, nước và ánh sáng', pageId: 'p1' })
    expect(await db.pages.get('p1')).toMatchObject({ summary: STUDY.summary, ai: { status: 'done', provider: 'openai', model: 'fake-1' } })
  })

  it('chạy lại: giữ câu hỏi người dùng tự sửa, thay thẻ tổng hợp chưa học, giữ thẻ đã học', async () => {
    await studyPage('p1', config, undefined, deps(fake([STUDY])))
    await db.cards.update(bottom.id, { prompt: 'Câu hỏi của tôi' })
    const [qa] = await db.cards.filter((c) => c.kind === 'qa').toArray()
    await db.cards.update(qa.id, { state: 2 })
    const second: PageStudy = { ...STUDY, regions: [STUDY.regions[0], { ...STUDY.regions[1], question: 'Câu hỏi AI mới' }], extra: [STUDY.extra[0], { question: 'Câu mới', answer: 'Đáp án mới' }] }
    const out = await studyPage('p1', config, undefined, deps(fake([second])))
    expect((await db.cards.get(bottom.id))!.prompt).toBe('Câu hỏi của tôi')
    expect(out.qaCards).toBe(1)
    expect((await db.cards.filter((c) => c.kind === 'qa').toArray()).map((c) => c.prompt).sort()).toEqual(['Câu mới', 'Quang hợp cần những nguyên liệu gì?'])
  })

  it('thử lại khi AI trả JSON hỏng; sai khoá thì dừng ngay và đánh dấu lỗi', async () => {
    const flaky = fake([new AiError('invalid', 'hỏng'), STUDY])
    await studyPage('p1', config, undefined, deps(flaky))
    expect(flaky.calls).toBe(2)

    const bad = fake([new AiError('auth', 'Khoá API không hợp lệ', 401)])
    await expect(studyPage('p1', config, undefined, deps(bad))).rejects.toMatchObject({ kind: 'auth' })
    expect(bad.calls).toBe(1)
    expect((await db.pages.get('p1'))!.ai).toMatchObject({ status: 'error', error: 'Khoá API không hợp lệ' })
  })

  it('chưa nhập khoá thì không gọi nhà cung cấp', async () => {
    const a = fake([STUDY])
    await expect(studyPage('p1', { ...config, keys: {} }, undefined, deps(a))).rejects.toMatchObject({ kind: 'auth' })
    expect(a.calls).toBe(0)
  })

  it('applyStudy bỏ qua số vùng AI bịa thêm', async () => {
    const out = await applyStudy(page, [top], { ...STUDY, regions: [{ id: 7, text: 'x', question: 'y', skip: false }], extra: [] }, { status: 'done' })
    expect(out).toEqual({ questions: 0, skipped: 0, qaCards: 0 })
    expect((await db.cards.get(top.id))!.prompt).toBe('')
  })

  it('hàng đợi chạy lần lượt và báo tiến độ', async () => {
    await saveAiConfig(config)
    await db.pages.add({ ...page, id: 'p2', index: 1 })
    await enqueuePages(['p1', 'p2'], deps(fake([STUDY])))
    await vi.waitFor(() => expect(aiJobs.get().running).toBe(false))
    expect(aiJobs.get()).toMatchObject({ total: 2, done: 2, failed: 0 })
    expect((await db.pages.get('p2'))!.ai?.status).toBe('done')
  })
})

describe('bảo vệ khoá API', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('che khoá trong nhật ký và khi hiển thị', () => {
    expect(redact(`lỗi với ${KEY} và AIzaSyA-0123456789abcdefghijk`)).toBe('lỗi với [khoá đã ẩn] và [khoá đã ẩn]')
    expect(JSON.stringify(sanitize({ headers: { authorization: `Bearer ${KEY}` }, error: new Error(`bad key ${KEY}`) }))).not.toContain(KEY)
    expect(maskKey(KEY)).toBe('sk-t…ghij')
    expect(maskKey('')).toBe('')
  })

  it('khoá không nằm trong tệp sao lưu và không bị mất khi khôi phục', async () => {
    await saveAiConfig({ provider: 'gemini', keys: { gemini: 'AIzaSecretKeyThatMustStayLocal' } })
    await db.meta.put({ key: 'settings', value: { dailyGoal: 7 } })
    const zip = await exportBackup()
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    const json = strFromU8(files['data.json'])
    expect(json).not.toContain('AIzaSecretKeyThatMustStayLocal')
    expect(JSON.parse(json).meta.map((m: { key: string }) => m.key)).toEqual(['settings'])

    await db.meta.put({ key: 'settings', value: { dailyGoal: 99 } })
    await importBackup(zip)
    expect((await db.meta.get('settings'))!.value).toEqual({ dailyGoal: 7 })
    expect((await getAiConfig()).keys.gemini).toBe('AIzaSecretKeyThatMustStayLocal')
  })
})

describe('thư mục theo dõi', () => {
  it('gom ảnh nhiều trang thành một ghi chú, mỗi PDF một ghi chú', () => {
    const names = ['Bai 3_1.jpg', 'Bai 3_2.jpg', 'Toan.pdf', 'Hoa hoc.png', 'Toan.png']
    expect(groupFiles(names.map((name) => ({ name }))).map((g) => g.map((f) => f.name))).toEqual([['Bai 3_1.jpg', 'Bai 3_2.jpg'], ['Toan.pdf'], ['Hoa hoc.png'], ['Toan.png']])
  })
  it('dấu vết tệp đổi khi nội dung đổi', () => {
    expect(fileKey('a/b.pdf', { size: 10, lastModified: 5 })).toBe('a/b.pdf|10|5')
    expect(fileKey('a/b.pdf', { size: 11, lastModified: 5 })).not.toBe(fileKey('a/b.pdf', { size: 10, lastModified: 5 }))
  })
})
