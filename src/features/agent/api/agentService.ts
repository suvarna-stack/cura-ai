import type {
  AgentSeedExample,
  ChatMode,
} from '../types/agent.types'
import {
  CHIPS,
  MOCK_SEED_EXAMPLE,
  REPLIES,
} from '../types/agent.types'

/**
 * Toggle mock responses until the real agent API is ready.
 */
const USE_MOCK = true

/**
 * Placeholder agent API — wire to shared apiClient when ready.
 */
export async function fetchAgentSeedExample(): Promise<AgentSeedExample | null> {
  if (USE_MOCK) {
    return { ...MOCK_SEED_EXAMPLE }
  }
  // TODO: const { data } = await apiClient.get<AgentSeedExample>('/agent/seed')
  return null
}

export async function sendAgentMessage(
  mode: ChatMode,
  text: string,
  replyIdx: number,
): Promise<{ reply: string; nextReplyIdx: number }> {
  if (USE_MOCK) {
    const chipIdx = CHIPS[mode].indexOf(text)
    const reply =
      REPLIES[mode][chipIdx >= 0 ? chipIdx : replyIdx % REPLIES[mode].length]
    return {
      reply,
      nextReplyIdx: chipIdx < 0 ? replyIdx + 1 : replyIdx,
    }
  }
  // TODO: const { data } = await apiClient.post('/agent/chat', { mode, text })
  void mode
  void text
  void replyIdx
  throw new Error('sendAgentMessage is not implemented')
}
