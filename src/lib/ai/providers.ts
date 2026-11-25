import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AiProvider } from '../types'
import { AiError, errorFromStatus, JSON_INSTRUCTION, PageStudySchema, parseStudy, PROVIDERS, SYSTEM_PROMPT, userPrompt, type StudyRequest, type StudyResult } from './schema'

/**
 * Bốn bộ nối tới nhà cung cấp AI. Ứng dụng không có máy chủ nên mọi yêu cầu
 * đi thẳng từ trình duyệt của người dùng tới nhà cung cấp, bằng khoá API của
 * chính họ lưu trên thiết bị (cả bốn API đều cho phép CORS).
 */
export interface CallOptions {
  apiKey: string
  model: string
  signal?: AbortSignal
  /** Chỉ dùng trong test để thay fetch. */
  fetch?: typeof fetch
}

export interface ProviderAdapter {
  study(req: StudyRequest, opts: CallOptions): Promise<StudyResult>
  listModels(opts: Omit<CallOptions, 'model'>): Promise<string[]>
}

/* ---------- Claude (SDK chính thức của Anthropic) ---------- */

/** Các model có cơ chế dự phòng phía máy chủ khi bộ phân loại an toàn từ chối. */
const CLAUDE_FALLBACK_MODELS = /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/

function claudeClient(opts: Omit<CallOptions, 'model'>): Anthropic {
  return new Anthropic({
    apiKey: opts.apiKey,
    // Người dùng tự nhập khoá của mình và khoá chỉ nằm trên máy họ (không có máy chủ trung gian).
    dangerouslyAllowBrowser: true,
    fetch: opts.fetch,
  })
}

function claudeError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof Anthropic.APIUserAbortError) return new AiError('aborted', 'Đã dừng')
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new AiError('auth', 'Khoá API Claude không hợp lệ hoặc không có quyền dùng model này', error.status, { cause: error })
  if (error instanceof Anthropic.RateLimitError) return new AiError('rate', 'Claude đang giới hạn tốc độ hoặc tài khoản hết hạn mức', 429, { cause: error })
  if (error instanceof Anthropic.APIConnectionError) return new AiError('network', 'Không kết nối được tới Claude', undefined, { cause: error })
  if (error instanceof Anthropic.APIError) return errorFromStatus(error.status ?? 400, error.message, 'Claude')
  return new AiError('network', error instanceof Error ? error.message : 'Lỗi không xác định', undefined, { cause: error })
}

const claude: ProviderAdapter = {
  async study(req, opts) {
    const client = claudeClient(opts)
    const fallback = CLAUDE_FALLBACK_MODELS.test(opts.model)
    try {
      const response = await client.beta.messages.create(
        {
          model: opts.model,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          // Đọc chữ viết tay và đặt câu hỏi là việc vừa phải: mức medium là đủ.
          output_config: { effort: 'medium', format: betaZodOutputFormat(PageStudySchema) },
          // Nếu bộ phân loại an toàn từ chối nhầm, API tự chạy lại trên model dự phòng.
          ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.imageBase64 } },
                { type: 'text', text: userPrompt(req) },
              ],
            },
          ],
        },
        { signal: opts.signal },
      )
      // Luôn xem stop_reason trước khi đọc nội dung: khi bị từ chối, nội dung rỗng.
      if (response.stop_reason === 'refusal') throw new AiError('refusal', 'Claude từ chối xử lý trang này')
      if (response.stop_reason === 'max_tokens') throw new AiError('invalid', 'Câu trả lời của Claude bị cắt giữa chừng')
      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
      return {
        study: parseStudy(text),
        model: response.model,
        usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      }
    } catch (error) {
      throw claudeError(error)
    }
  },
  async listModels(opts) {
    try {
      const ids: string[] = []
      for await (const m of claudeClient(opts).models.list({}, { signal: opts.signal })) ids.push(m.id)
      return ids
    } catch (error) {
      throw claudeError(error)
    }
  },
}

/* ---------- HTTP dùng chung cho ba nhà cung cấp còn lại ---------- */

async function http(provider: string, url: string, init: RequestInit, opts: Omit<CallOptions, 'model'>): Promise<unknown> {
  let res: Response
  try {
    res = await (opts.fetch ?? fetch)(url, { ...init, signal: opts.signal })
  } catch (cause) {
    if ((cause as Error)?.name === 'AbortError') throw new AiError('aborted', 'Đã dừng')
    throw new AiError('network', `Không kết nối được tới ${provider}`, undefined, { cause })
  }
  const body = await res.text()
  let json: unknown
  try {
    json = body ? JSON.parse(body) : {}
  } catch {
    json = undefined
  }
  if (!res.ok) {
    const e = (json as { error?: { message?: string } | string } | undefined)?.error
    throw errorFromStatus(res.status, typeof e === 'string' ? e : (e?.message ?? ''), provider)
  }
  if (json === undefined) throw new AiError('server', `${provider} trả về dữ liệu không đọc được`, res.status)
  return json
}

/* ---------- ChatGPT và DeepSeek (cùng chuẩn Chat Completions) ---------- */

interface ChatCompletion {
  model?: string
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function chatCompletions(provider: 'openai' | 'deepseek', base: string): ProviderAdapter {
  const name = PROVIDERS[provider].label
  const headers = (key: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` })
  return {
    async study(req, opts) {
      const json = (await http(
        name,
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers: headers(opts.apiKey),
          body: JSON.stringify({
            model: opts.model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `${SYSTEM_PROMPT}\n\n${JSON_INSTRUCTION}` },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userPrompt(req) },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${req.imageBase64}` } },
                ],
              },
            ],
          }),
        },
        opts,
      )) as ChatCompletion
      const choice = json.choices?.[0]
      if (choice?.message?.refusal) throw new AiError('refusal', `${name} từ chối xử lý trang này`)
      if (choice?.finish_reason === 'length') throw new AiError('invalid', `Câu trả lời của ${name} bị cắt giữa chừng`)
      if (choice?.finish_reason === 'content_filter') throw new AiError('refusal', `${name} chặn nội dung trang này`)
      const content = choice?.message?.content
      // DeepSeek thay JSON hỏng bằng khoảng trắng, nên nội dung rỗng cũng là lỗi cần thử lại.
      if (!content?.trim()) throw new AiError('invalid', `${name} trả về nội dung rỗng`)
      return { study: parseStudy(content), model: json.model ?? opts.model, usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 } }
    },
    async listModels(opts) {
      const json = (await http(name, `${base}/models`, { headers: headers(opts.apiKey) }, opts)) as { data?: { id: string }[] }
      return (json.data ?? []).map((m) => m.id).sort()
    },
  }
}

/* ---------- Gemini ---------- */

interface GeminiResponse {
  modelVersion?: string
  promptFeedback?: { blockReason?: string }
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

const gemini: ProviderAdapter = {
  async study(req, opts) {
    const json = (await http(
      'Gemini',
      `${GEMINI}/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${JSON_INSTRUCTION}` }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: req.imageBase64 } }, { text: userPrompt(req) }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
      opts,
    )) as GeminiResponse
    if (json.promptFeedback?.blockReason) throw new AiError('refusal', `Gemini chặn trang này (${json.promptFeedback.blockReason})`)
    const candidate = json.candidates?.[0]
    if (candidate?.finishReason === 'MAX_TOKENS') throw new AiError('invalid', 'Câu trả lời của Gemini bị cắt giữa chừng')
    if (candidate?.finishReason && ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(candidate.finishReason)) throw new AiError('refusal', `Gemini chặn trang này (${candidate.finishReason})`)
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
    if (!text.trim()) throw new AiError('invalid', 'Gemini trả về nội dung rỗng')
    const u = json.usageMetadata
    return { study: parseStudy(text), model: json.modelVersion ?? opts.model, usage: { input: u?.promptTokenCount ?? 0, output: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) } }
  },
  async listModels(opts) {
    const json = (await http('Gemini', `${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': opts.apiKey } }, opts)) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    return (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort()
  },
}

export const ADAPTERS: Record<AiProvider, ProviderAdapter> = {
  claude,
  openai: chatCompletions('openai', 'https://api.openai.com/v1'),
  deepseek: chatCompletions('deepseek', 'https://api.deepseek.com'),
  gemini,
}
