import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ComponentIcon } from '../../components/ComponentIcon'
import { Button } from '../../components/ui/button'
import { CATALOG } from '../../game/catalog'
import { specFor } from '../../game/levels'
import type { ComponentType, DesignNode } from '../../game/types'
import { visualFor } from '../../game/visuals'
import { cn, fmt } from '../../lib/utils'
import { nodeName, useGame, useLevel } from '../../store/game'
import { useSim } from '../../store/sim'

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function Visual({ type }: { type: ComponentType }) {
  const { words, bots } = useLevel()
  return (
    <div className="rounded-xl border border-line bg-bg p-2">
      <svg
        viewBox="0 0 260 120"
        role="img"
        aria-label={`Animation of what the ${CATALOG[type].name} does`}
        className="block h-auto w-full"
        ref={(el) => {
          if (el && REDUCED) el.pauseAnimations()
        }}
        dangerouslySetInnerHTML={{ __html: visualFor(type) }}
      />
      <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-muted">
        <span><i className="mr-1 inline-block size-2 rounded-full bg-read align-middle" />{words.read}{words.write ? ' (read)' : ''}</span>
        {words.write && <span><i className="mr-1 inline-block size-2 rounded-full bg-write align-middle" />{words.write} (write)</span>}
        {bots && <span><i className="mr-1 inline-block size-2 rounded-full bg-bot align-middle" />bot request</span>}
        <span><i className="mr-1 inline-block size-2 rounded-full bg-ok align-middle" />answered early</span>
      </div>
    </div>
  )
}

function LearnCard({ type }: { type: ComponentType }) {
  const c = specFor(type, useLevel())
  const section = (h: string, body: string, extra = '') => (
    <section className={extra}>
      <h4 className="mb-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted">{h}</h4>
      <p className="m-0">{body}</p>
    </section>
  )
  return (
    <div className="grid gap-3">
      <Visual type={type} />
      {section('What it does', c.what)}
      {section('Use it when', c.when)}
      {section('Watch out for', c.watch)}
      {section('Numbers in this game', c.nums)}
      {c.here && section('In this problem', c.here, 'rounded-xl bg-soft px-3 py-2.5')}
    </div>
  )
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-lg border border-line2 bg-bg2">
      <Button variant="ghost" size="icon" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus />
      </Button>
      <output className="min-w-8 text-center font-mono">{value}</output>
      <Button variant="ghost" size="icon" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </span>
  )
}

function LiveStats({ id }: { id: string }) {
  const s = useSim((st) => st.nodes[id])
  const t0 = useSim((st) => st.simTime)
  if (!s || t0 === 0) return null
  const tile = (l: string, v: string) => (
    <div key={l} className="rounded-xl border border-line bg-glass px-2.5 py-1.5">
      <span className="block text-[10.5px] text-muted">{l}</span>
      <strong className="font-mono text-[15px] font-medium tabular-nums">{v}</strong>
    </div>
  )
  const tiles =
    s.backlog !== undefined
      ? [tile('Backlog', fmt(s.backlog)), tile('Workers', String(s.workers ?? 0))]
      : [tile('Requests/s', fmt(s.rate)), tile('Busy', `${Math.round(s.util * 100)}%`), tile('Dropped/s', fmt(s.dropRate))]
  if (s.hitRate !== undefined) tiles.push(tile('Hit rate now', `${Math.round(s.hitRate * 100)}%`))
  if (s.state === 'down') tiles.push(tile('State', 'DOWN'))
  return (
    <div>
      <h3 className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Live</h3>
      <div className="grid grid-cols-2 gap-1.5">{tiles}</div>
    </div>
  )
}

function Inspector({ node }: { node: DesignNode }) {
  const spec = CATALOG[node.type]
  const { setConfig, removeNode } = useGame.getState()
  return (
    <div className="grid gap-3.5">
      <div className="flex items-center gap-2.5">
        <ComponentIcon type={node.type} size={26} />
        <h2 className="flex-1 text-xl font-bold">{spec.name}</h2>
        {!spec.fixed && (
          <Button size="sm" variant="danger" onClick={() => { const why = removeNode(node.id); if (why) toast(why) }}>
            <Trash2 /> Remove
          </Button>
        )}
      </div>
      {!spec.fixed && (
        <div className="grid gap-2 rounded-xl bg-bg px-3 py-2.5">
          {spec.fields.map((f) =>
            f.kind === 'choice' ? (
              <div key={f.key} className={cn('flex justify-between gap-x-2.5 gap-y-1.5', f.labels ? 'flex-col' : 'items-center')}>
                <span className="text-[13px]">{f.label}</span>
                <div role="radiogroup" aria-label={f.label} className={cn('overflow-hidden rounded-lg border border-line2', f.labels ? 'grid grid-flow-col auto-cols-fr' : 'inline-flex')}>
                  {f.options.map((o, i) => (
                    <button
                      key={o}
                      role="radio"
                      aria-checked={node.cfg[f.key] === o}
                      onClick={() => setConfig(node.id, f.key, o)}
                      className={cn('cursor-pointer px-2 py-1 font-mono text-xs [&+&]:border-l [&+&]:border-line2', node.cfg[f.key] === o ? 'bg-accent/15 text-accent [text-shadow:0_0_8px_var(--accent)]' : 'text-muted')}
                    >
                      {f.labels?.[i] ?? `${o} ${f.unit}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div key={f.key} className="flex items-center justify-between gap-2.5">
                <span className="text-[13px]">{f.label}</span>
                <Stepper label={f.label.toLowerCase()} value={node.cfg[f.key]} min={f.min} max={f.max} onChange={(v) => setConfig(node.id, f.key, v)} />
              </div>
            ),
          )}
          <div className="flex justify-between text-[12.5px] text-muted">
            <span>Cost</span>
            <span className="font-mono">${fmt(spec.cost(node.cfg))} / month</span>
          </div>
        </div>
      )}
      <LiveStats id={node.id} />
      <LearnCard type={node.type} />
    </div>
  )
}

function Guide() {
  const [open, setOpen] = useState<ComponentType | null>(null)
  const addNode = useGame((s) => s.addNode)
  const level = useLevel()
  if (open)
    return (
      <div className="grid gap-3.5">
        <div className="flex items-center gap-2.5">
          <ComponentIcon type={open} size={26} />
          <h2 className="flex-1 text-xl font-bold">{CATALOG[open].name}</h2>
          <Button size="sm" onClick={() => setOpen(null)}>All components</Button>
        </div>
        <LearnCard type={open} />
        {open !== 'client' && (
          <Button variant="primary" onClick={() => addNode(open)}>
            <Plus /> Add to board
          </Button>
        )}
      </div>
    )
  return (
    <div className="grid gap-3.5">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">How to play</h3>
      <ol className="m-0 grid gap-1 pl-4 text-[13px] text-muted">
        <li>Add components from the left. Click one on the board to configure it.</li>
        <li>Connect them by dragging from a component's right-hand dot to another component.</li>
        <li>Press Run to send live traffic, and use Break to kill machines.</li>
        {level.bots && <li>Start attack switches on the bots, so you can watch your limiter at work.</li>}
        <li>Run evaluation for the graded {level.end}-second test: {level.phases.map((p) => p.name.toLowerCase()).join('; ')}.</li>
      </ol>
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Component guide</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {(['client', ...level.palette] as ComponentType[]).map((t) => (
          <button key={t} onClick={() => setOpen(t)} className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-node px-2.5 py-2 text-left text-[13px] transition-colors hover:border-accent">
            <ComponentIcon type={t} />
            <span className="grid leading-snug">
              <b className="font-semibold">{CATALOG[t].name}</b>
              <small className="text-[11px] text-muted">{CATALOG[t].tag}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function LearnPanel() {
  const selection = useGame((s) => s.selection)
  const design = useGame((s) => s.design)
  const { removeEdge } = useGame.getState()
  if (selection?.kind === 'node') {
    const node = design.nodes.find((n) => n.id === selection.id)
    if (node) return <Inspector node={node} />
  }
  if (selection?.kind === 'edge') {
    const a = nodeName(design, selection.from)
    const b = nodeName(design, selection.to)
    return (
      <div className="grid gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="flex-1 text-xl font-bold">{a} → {b}</h2>
          <Button size="sm" variant="danger" onClick={() => removeEdge(selection.from, selection.to)}>
            <Trash2 /> Remove
          </Button>
        </div>
        <p className="m-0 text-muted">
          {a} sends requests to {b}. Each hop inside the data center adds about 0.5 ms. Press Delete or use Remove to disconnect.
        </p>
      </div>
    )
  }
  return <Guide />
}
