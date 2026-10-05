import type Anthropic from '@anthropic-ai/sdk'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getLevel } from '../game/levels'
import { gameSnapshot, tutorSystem } from '../game/tutor'
import { useGame } from './game'

export const TUTOR_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'best explanations' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'faster, about half the cost' },
] as const
export type TutorModel = (typeof TUTOR_MODELS)[number]['id']

export interface ChatMessage {
  role: 'user' | 'assistant'
  /** What the chat shows. */
  text: string
  /** What the API saw for a user turn: the question plus the game snapshot at that moment. */
  sent?: string
  error?: boolean
}

interface TutorState {
  apiKey: string
  model: TutorModel
  messages: ChatMessage[]
  busy: boolean
  setKey: (k: string) => void
  setModel: (m: TutorModel) => void
  clear: () => void
  ask: (question: string) => Promise<void>
  stop: () => void
}

let controller: AbortController | null = null

/** API history: earlier turns exactly as they were sent, so the conversation stays append-only. */
function history(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages
    .filter((m) => !m.error && (m.role === 'assistant' || m.sent))
    .map((m) => ({ role: m.role, content: m.role === 'user' ? (m.sent as string) : m.text }))
}

export const useTutor = create<TutorState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      model: 'claude-opus-5-5',
      messages: [],
      busy: false,
      setKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setModel: (model) => set({ model }),
      clear: () => {
        controller?.abort()
        set({ messages: [], busy: false })
      },
      stop: () => controller?.abort(),

      ask: async (question) => {
        const { apiKey, model, messages, busy } = get()
        if (!apiKey || busy || !question.trim()) return
        const sent = `<game_state>\n${gameSnapshot()}\n</game_state>\n\n${question.trim()}`
        const prior = history(messages)
        set({ busy: true, messages: [...messages, { role: 'user', text: question.trim(), sent }, { role: 'assistant', text: '' }] })
        const update = (patch: Partial<ChatMessage>) =>
          set((s) => ({ messages: s.messages.map((m, i) => (i === s.messages.length - 1 ? { ...m, ...patch } : m)) }))

        // Loaded on first use so the SDK stays out of the main bundle.
        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        // The key lives only in this browser, so calling the API directly from the page is acceptable here.
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
        controller = new AbortController()
        try {
          const stream = client.beta.messages.stream(
            {
              model,
              max_tokens: 16000,
              system: tutorSystem(getLevel(useGame.getState().levelId)),
              cache_control: { type: 'ephemeral' },
              output_config: { effort: model === 'claude-opus-5-5' ? 'medium' : 'low' },
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
              messages: [...prior, { role: 'user', content: sent }],
            },
            { signal: controller.signal },
          )
          let text = ''
          stream.on('text', (delta) => {
            text += delta
            update({ text })
          })
          const final = await stream.finalMessage()
          if (final.stop_reason === 'refusal')
            update({ text: "The tutor couldn't answer that one. Try rephrasing it.", error: true })
          else if (final.stop_reason === 'max_tokens') update({ text: `${text}\n\n_(answer cut off)_` })
        } catch (err) {
          let msg = 'Something went wrong reaching Claude. Check your connection and try again.'
          if (err instanceof Anthropic.APIUserAbortError) msg = '_(stopped)_'
          else if (err instanceof Anthropic.AuthenticationError) msg = 'That API key was rejected. Check it in the key settings below.'
          else if (err instanceof Anthropic.PermissionDeniedError) msg = "Your API key doesn't have access to this model."
          else if (err instanceof Anthropic.RateLimitError) msg = 'Rate limited. Wait a moment and ask again.'
          else if (err instanceof Anthropic.APIError) msg = `Claude returned an error (${err.status ?? 'network'}): ${err.message}`
          const partial = get().messages.at(-1)?.text
          if (msg === '_(stopped)_' && partial) update({ text: `${partial}\n\n${msg}` })
          else update({ text: msg, error: true })
        } finally {
          controller = null
          set({ busy: false })
        }
      },
    }),
    {
      name: 'system-design-lab-tutor',
      // The chat itself is not saved; only the key and model choice, in this browser.
      partialize: (s) => ({ apiKey: s.apiKey, model: s.model }),
    },
  ),
)
