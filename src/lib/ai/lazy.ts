import type { AiProvider } from '../types'

/**
 * Cửa ngõ tải lười phần AI: SDK của Anthropic và bộ kiểm lược đồ chỉ được tải
 * khi người dùng thật sự chạy AI, nên người không dùng AI không phải tải thêm gì.
 */
const study = () => import('./study')

export const runAi = async (pageIds: string[]) => (await study()).enqueuePages(pageIds)
export const stopAi = async () => (await study()).stopAiJobs()
export const autoStudy = async (noteIds: string[]) => (await study()).autoStudyNotes(noteIds)
export const pendingAiPages = async (noteId?: string) => (await study()).pendingPageIds(noteId)

export async function listModels(provider: AiProvider, apiKey: string): Promise<string[]> {
  const { ADAPTERS } = await import('./providers')
  return ADAPTERS[provider].listModels({ apiKey })
}
