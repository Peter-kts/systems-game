import { ArrowUp, KeyRound, Maximize2, Minimize2, RotateCcw, Sparkles, Square } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../../components/ui/button'
import { CATALOG } from '../../game/catalog'
import { cn } from '../../lib/utils'
import { useGame } from '../../store/game'
import { TUTOR_MODELS, useTutor, type TutorModel } from '../../store/tutor'

function KeySettings({ onDone }: { onDone?: () => void }) {
  const { apiKey, model, setKey, setModel } = useTutor()
  const [draft, setDraft] = useState(apiKey)
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5 text-[13px] text-muted">
        <p className="m-0">
          The tutor is Claude, called with <b className="text-ink">your own Anthropic API key</b>. Create one at{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-accent underline">
            console.anthropic.com
          </a>{' '}
          under API Keys, and add a little credit under Billing. A Claude.ai subscription doesn't cover API use.
        </p>
        <p className="m-0">
          The key is saved only in this browser and is sent only to Anthropic. A question costs about a cent or two on Opus 5.5.
        </p>
      </div>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setKey(draft)
          onDone?.()
        }}
      >
        <label htmlFor="tutor-key" className="font-mono text-[11px] uppercase tracking-wider text-muted">
          API key
        </label>
        <input
          id="tutor-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-lg border border-line2 bg-bg px-2.5 py-2 font-mono text-[13px] text-accent outline-none transition-shadow focus:border-accent focus:shadow-glow"
        />
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Model</span>
        <div role="radiogroup" aria-label="Model" className="grid grid-cols-2 gap-1.5">
          {TUTOR_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={model === m.id}
              onClick={() => setModel(m.id as TutorModel)}
              className={cn(
                'cursor-pointer rounded-lg border px-2.5 py-1.5 text-left text-[13px]',
                model === m.id ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-muted hover:text-ink',
              )}
            >
              <b className="block font-semibold">{m.label}</b>
              <small className="text-[11px] text-muted">{m.note}</small>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            <KeyRound /> Save key
          </Button>
          {apiKey && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setKey('')
                setDraft('')
              }}
            >
              Forget key
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function suggestions(selected: string | null, evaluated: boolean): string[] {
  const out = [
    evaluated ? 'Why did my design fail the scenarios it failed?' : 'What will break first in my current design?',
    'What should I change first, and why?',
    'What would an interviewer ask me about this design?',
  ]
  if (selected) out.unshift(`Explain the ${selected} and how it fits my design.`)
  return out
}

function Chat({ large = false, onSettings, onExpand }: { large?: boolean; onSettings: () => void; onExpand: () => void }) {
  const { messages, busy, ask, stop, clear } = useTutor()
  const selected = useGame((s) => {
    if (s.selection?.kind !== 'node') return null
    const id = s.selection.id
    const n = s.design.nodes.find((x) => x.id === id)
    return n ? CATALOG[n.type].name.toLowerCase() : null
  })
  const evaluated = useGame((s) => !!s.lastEval)
  const [draft, setDraft] = useState('')
  const list = useRef<HTMLDivElement>(null)

  // When a question is sent, bring it to the top so the answer is read from its start
  // instead of the view chasing the end of the text while it streams in.
  useEffect(() => {
    const box = list.current
    const asked = box?.querySelectorAll<HTMLElement>('[data-role="user"]')
    const el = asked?.[asked.length - 1]
    if (box && el) box.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' })
  }, [messages.length])

  const send = (q: string) => {
    if (!q.trim() || busy) return
    void ask(q)
    setDraft('')
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(draft)
  }
  const text = large ? 'text-[15px]' : 'text-[13.5px]'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-1">
        <Sparkles size={16} className="mr-1 shrink-0 text-accent" aria-hidden />
        <span className="flex-1 text-[13px] text-muted">Ask anything. The tutor sees your board, live numbers and results.</span>
        {messages.length > 0 && (
          <Button size="icon" variant="ghost" aria-label="New conversation" onClick={clear}>
            <RotateCcw />
          </Button>
        )}
        <Button size="icon" variant="ghost" aria-label="Key settings" onClick={onSettings}>
          <KeyRound />
        </Button>
        <Button size="icon" variant="ghost" aria-label={large ? 'Back to the side panel' : 'Expand the chat'} onClick={onExpand}>
          {large ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </div>

      <div ref={list} className="relative grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
        {messages.length === 0 && (
          <div className="grid gap-1.5">
            {suggestions(selected, evaluated).map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="cursor-pointer rounded-xl border border-line bg-node px-3 py-2 text-left text-[13px] transition-colors hover:border-accent hover:text-accent"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} data-role="user" className={cn('ml-6 rounded-xl rounded-br-sm border border-accent/30 bg-accent/10 px-3 py-2', text)}>
              {m.text}
            </div>
          ) : (
            <div key={i} className={cn('tutor-md min-w-0', text, m.error && 'text-bad')}>
              {m.text ? (
                <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
              ) : (
                <span className="animate-pulse font-mono text-xs text-accent">thinking…</span>
              )}
            </div>
          ),
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-1.5 rounded-xl border border-line2 bg-bg p-1.5 focus-within:border-accent focus-within:shadow-glow">
        <textarea
          aria-label="Ask the tutor"
          rows={large ? 3 : 2}
          value={draft}
          placeholder="Why is my cache hit rate only 75%?"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
          className={cn('min-h-10 flex-1 resize-none bg-transparent px-1.5 py-1 text-ink outline-none placeholder:text-muted', text)}
        />
        {busy ? (
          <Button type="button" size="icon" variant="danger" aria-label="Stop" onClick={stop}>
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" variant="primary" aria-label="Send" disabled={!draft.trim()}>
            <ArrowUp />
          </Button>
        )}
      </form>
    </div>
  )
}

export function TutorPanel() {
  const apiKey = useTutor((s) => s.apiKey)
  const [settings, setSettings] = useState(false)
  const [expanded, setExpanded] = useState(false)

  if (!apiKey || settings) return <KeySettings onDone={() => setSettings(false)} />

  return (
    <>
      {expanded ? (
        <div className="grid h-full place-content-center gap-2 text-center text-[13px] text-muted">
          <p className="m-0">The tutor is open in the large view.</p>
          <Button size="sm" onClick={() => setExpanded(false)}>
            <Minimize2 /> Bring it back here
          </Button>
        </div>
      ) : (
        <Chat onSettings={() => setSettings(true)} onExpand={() => setExpanded(true)} />
      )}
      <Dialog.Root open={expanded} onOpenChange={setExpanded}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 flex h-[min(88vh,900px)] w-[min(calc(100vw-32px),920px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-accent/40 bg-panel p-4 shadow-glow outline-none"
          >
            <Dialog.Title className="mb-2 font-display text-lg font-bold">
              Tutor <span className="font-sans text-[13px] font-normal text-muted">· press Esc to close</span>
            </Dialog.Title>
            <div className="min-h-0 flex-1">
              <Chat
                large
                onSettings={() => {
                  setExpanded(false)
                  setSettings(true)
                }}
                onExpand={() => setExpanded(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
