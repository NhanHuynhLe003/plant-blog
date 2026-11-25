import { db } from '../db'
import type { AiConfig, AiProvider } from '../types'
import { DEFAULT_AI_CONFIG } from './catalog'

/** Cấu hình AI nằm ở một hàng meta riêng để không bao giờ lọt vào tệp sao lưu. */
export const AI_META_KEY = 'ai'

export function mergeAiConfig(value: unknown): AiConfig {
  const v = (value ?? {}) as Partial<AiConfig>
  return { ...DEFAULT_AI_CONFIG, ...v, keys: { ...v.keys }, models: { ...v.models } }
}

export async function getAiConfig(): Promise<AiConfig> {
  return mergeAiConfig((await db.meta.get(AI_META_KEY))?.value)
}

export async function saveAiConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
  const next = { ...(await getAiConfig()), ...patch }
  await db.meta.put({ key: AI_META_KEY, value: next })
  return next
}

export function keyOf(config: AiConfig, provider: AiProvider = config.provider): string {
  return config.keys[provider]?.trim() ?? ''
}

/** Hiện khoá dạng che bớt, ví dụ "sk-a…9f2c". */
export function maskKey(key: string): string {
  const k = key.trim()
  if (!k) return ''
  return k.length <= 10 ? '•'.repeat(k.length) : `${k.slice(0, 4)}…${k.slice(-4)}`
}
