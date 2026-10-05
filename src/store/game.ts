import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ALLOW, CATALOG, defaultConfig, edgeWhy } from '../game/catalog'
import { columnFor, getLevel, type Level } from '../game/levels'
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

/** Everything the player has done in one system. */
export interface LevelProgress {
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
}

interface GameState extends LevelProgress {
  /** The system being played, or null on the system select screen. */
  levelId: string | null
  /** Progress in the systems that aren't open right now. */
  progress: Record<string, LevelProgress>
  selection: Selection

  openLevel: (id: string) => void
  showSystems: () => void
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

const freshProgress = (level: Level): LevelProgress => ({
  step: 'scope',
  design: level.starter(),
  seq: 10,
  scope: {},
  scopeChecked: false,
  estimates: {},
  estimatesChecked: false,
  lastEval: null,
  saved: null,
})

const currentProgress = (s: LevelProgress): LevelProgress => ({
  step: s.step,
  design: s.design,
  seq: s.seq,
  scope: s.scope,
  scopeChecked: s.scopeChecked,
  estimates: s.estimates,
  estimatesChecked: s.estimatesChecked,
  lastEval: s.lastEval,
  saved: s.saved,
})

function freeSpot(d: Design, type: ComponentType, level: Level) {
  const x = columnFor(type, level)
  for (const y of [280, 150, 410, 40, 520])
    if (!d.nodes.some((n) => Math.abs(n.x - x) < 190 && Math.abs(n.y - y) < 80)) return { x, y }
  return { x: x + 30, y: 300 }
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      levelId: null,
      progress: {},
      ...freshProgress(getLevel(null)),
      selection: null,

      openLevel: (id) => {
        const s = get()
        if (s.levelId === id) return
        const progress = s.levelId ? { ...s.progress, [s.levelId]: currentProgress(s) } : s.progress
        set({ ...(progress[id] ?? freshProgress(getLevel(id))), levelId: id, progress, selection: null })
      },
      showSystems: () => {
        const s = get()
        if (!s.levelId) return
        set({ progress: { ...s.progress, [s.levelId]: currentProgress(s) }, levelId: null, selection: null })
      },
      setStep: (step) => set({ step }),
      setScope: (id, v) => set((s) => ({ scope: { ...s.scope, [id]: v } })),
      checkScope: () => set({ scopeChecked: true }),
      setEstimate: (id, v) => set((s) => ({ estimates: { ...s.estimates, [id]: v } })),
      checkEstimates: () => set({ estimatesChecked: true }),

      addNode: (type, pos) => {
        const { design, seq, levelId } = get()
        const id = `n${seq}`
        const p = pos ?? freeSpot(design, type, getLevel(levelId))
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
        const { design, saved, levelId } = get()
        const showingReference = design.nodes.some((n) => n.id === 'r1')
        set({ saved: showingReference ? saved : structuredClone(design), design: getLevel(levelId).reference(), selection: null })
      },
      restoreMine: () => {
        const { saved } = get()
        if (saved) set({ design: saved, saved: null, selection: null })
      },
    }),
    {
      name: 'system-design-lab',
      version: 2,
      partialize: ({ selection: _selection, ...rest }) => rest,
      migrate: (old, version) => {
        const s = old as Record<string, unknown>
        if (version < 2) {
          // Version 1 had a single level, the URL shortener, and graded fixed columns.
          const ev = s.lastEval as { phases: Record<string, unknown>[] } | null
          if (ev)
            ev.phases = ev.phases.map((p) => ({
              name: p.name,
              values: [p.readAvailability, p.readP99, p.writeAvailability, p.writeP99],
              checks: (p.checks as boolean[]).map((c, i) => (i === 3 && p.skipWriteLatency ? null : c)),
              pass: p.pass,
            }))
          return { ...s, levelId: 'url-shortener', progress: {} }
        }
        return s
      },
    },
  ),
)

/** The level being played (the URL shortener while the select screen is open). */
export const useLevel = () => getLevel(useGame((s) => s.levelId))

export const nodeName = (d: Design, id: string) => {
  const t = d.nodes.find((n) => n.id === id)?.type
  return t ? CATALOG[t].name : ''
}
