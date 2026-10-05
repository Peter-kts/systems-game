import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ALLOW, CATALOG, COLUMN_X, defaultConfig, edgeWhy } from '../game/catalog'
import { REFERENCE, STARTER } from '../game/levels/urlShortener'
import type { ComponentType, Design, Rule, Scope } from '../game/types'
import type { PhaseResult } from '../sim/metrics'

export type Step = 'scope' | 'estimate' | 'build' | 'debrief'

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; from: string; to: string } | null

export interface EvalRecord {
  phases: PhaseResult[]
  cost: number
  rules: Pick<Rule, 'lvl' | 'title'>[]
  at: number
}

interface GameState {
  step: Step
  design: Design
  seq: number
  scope: Record<string, Scope>
  scopeChecked: boolean
  estimates: Record<string, string>
  estimatesChecked: boolean
  lastEval: EvalRecord | null
  /** The player's own design, kept while the reference design is loaded. */
  saved: Design | null
  selection: Selection

  setStep: (s: Step) => void
  setScope: (id: string, v: Scope) => void
  checkScope: () => void
  setEstimate: (id: string, v: string) => void
  checkEstimates: () => void
  addNode: (type: ComponentType, pos?: { x: number; y: number }) => string
  moveNode: (id: string, x: number, y: number) => void
  setConfig: (id: string, key: string, value: number) => void
  removeNode: (id: string) => string | null
  /** Returns an explanation when the connection isn't allowed. */
  addEdge: (from: string, to: string) => string | null
  removeEdge: (from: string, to: string) => void
  select: (s: Selection) => void
  setLastEval: (e: EvalRecord) => void
  loadReference: () => void
  restoreMine: () => void
}

function freeSpot(d: Design, type: ComponentType) {
  const x = COLUMN_X[type]
  for (const y of [280, 150, 410, 40, 520])
    if (!d.nodes.some((n) => Math.abs(n.x - x) < 190 && Math.abs(n.y - y) < 80)) return { x, y }
  return { x: x + 30, y: 300 }
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      step: 'scope',
      design: STARTER(),
      seq: 10,
      scope: {},
      scopeChecked: false,
      estimates: {},
      estimatesChecked: false,
      lastEval: null,
      saved: null,
      selection: null,

      setStep: (step) => set({ step }),
      setScope: (id, v) => set((s) => ({ scope: { ...s.scope, [id]: v } })),
      checkScope: () => set({ scopeChecked: true }),
      setEstimate: (id, v) => set((s) => ({ estimates: { ...s.estimates, [id]: v } })),
      checkEstimates: () => set({ estimatesChecked: true }),

      addNode: (type, pos) => {
        const { design, seq } = get()
        const id = `n${seq}`
        const p = pos ?? freeSpot(design, type)
        set({
          seq: seq + 1,
          design: { ...design, nodes: [...design.nodes, { id, type, x: Math.round(p.x), y: Math.round(p.y), cfg: defaultConfig(type) }] },
          selection: { kind: 'node', id },
        })
        return id
      },
      moveNode: (id, x, y) =>
        set((s) => ({ design: { ...s.design, nodes: s.design.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) } })),
      setConfig: (id, key, value) =>
        set((s) => ({ design: { ...s.design, nodes: s.design.nodes.map((n) => (n.id === id ? { ...n, cfg: { ...n.cfg, [key]: value } } : n)) } })),
      removeNode: (id) => {
        if (id === 'client') return 'Users stay on the board: every design starts with them.'
        set((s) => ({
          design: { nodes: s.design.nodes.filter((n) => n.id !== id), edges: s.design.edges.filter((e) => e.from !== id && e.to !== id) },
          selection: null,
        }))
        return null
      },
      addEdge: (from, to) => {
        const { design } = get()
        if (from === to) return null
        const a = design.nodes.find((n) => n.id === from)?.type
        const b = design.nodes.find((n) => n.id === to)?.type
        if (!a || !b) return null
        if (design.edges.some((e) => e.from === from && e.to === to)) return 'Those two are already connected.'
        if (!ALLOW[a].includes(b)) return edgeWhy(a, b)
        set({ design: { ...design, edges: [...design.edges, { from, to }] }, selection: { kind: 'edge', from, to } })
        return null
      },
      removeEdge: (from, to) =>
        set((s) => ({ design: { ...s.design, edges: s.design.edges.filter((e) => !(e.from === from && e.to === to)) }, selection: null })),
      select: (selection) => set({ selection }),
      setLastEval: (lastEval) => set({ lastEval }),
      loadReference: () => {
        const { design, saved } = get()
        const showingReference = design.nodes.some((n) => n.id === 'r1')
        set({ saved: showingReference ? saved : structuredClone(design), design: REFERENCE(), selection: null })
      },
      restoreMine: () => {
        const { saved } = get()
        if (saved) set({ design: saved, saved: null, selection: null })
      },
    }),
    {
      name: 'system-design-lab',
      version: 1,
      partialize: ({ selection: _selection, ...rest }) => rest,
    },
  ),
)

export const nodeName = (d: Design, id: string) => {
  const t = d.nodes.find((n) => n.id === id)?.type
  return t ? CATALOG[t].name : ''
}
