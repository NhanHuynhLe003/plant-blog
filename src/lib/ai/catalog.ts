import type { AiConfig, AiProvider } from '../types'

/** Danh mục nhà cung cấp — tách riêng (không phụ thuộc thư viện nào) để giao diện dùng mà không kéo theo SDK. */
export const PROVIDERS: Record<AiProvider, { label: string; company: string; defaultModel: string; keyHint: string; keyUrl: string }> = {
  claude: { label: 'Claude', company: 'Anthropic', defaultModel: 'claude-opus-5-5', keyHint: 'sk-ant-…', keyUrl: 'https://platform.claude.com/settings/keys' },
  openai: { label: 'ChatGPT', company: 'OpenAI', defaultModel: 'gpt-6.2-sol', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Gemini', company: 'Google', defaultModel: 'gemini-3.6-flash', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
  deepseek: { label: 'DeepSeek', company: 'DeepSeek', defaultModel: 'deepseek-flash', keyHint: 'sk-…', keyUrl: 'https://platform.deepseek.com/api_keys' },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as AiProvider[]

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'claude',
  keys: {},
  models: {},
  auto: false,
  extraPerPage: 2,
  language: 'auto',
}

export function modelOf(config: AiConfig, provider = config.provider): string {
  return config.models[provider]?.trim() || PROVIDERS[provider].defaultModel
}

