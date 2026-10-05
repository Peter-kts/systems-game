import { toast } from 'sonner'
import { create } from 'zustand'
import { EVAL_SCRIPT, LEVEL, PHASES } from '../game/levels/urlShortener'
import { review, totalCost } from '../game/review'
import type { Design } from '../game/types'
import { Simulation, type ChaosKind, type ReqType } from '../sim/engine'
import { evaluationScript, gradePhase, secondStats, type SecondStats } from '../sim/metrics'
import { useGame } from './game'

export type NodeState = 'idle' | 'ok' | 'warn' | 'hot' | 'down'

export interface NodeStats {
  state: NodeState
  util: number
  rate: number
  dropRate: number
  badge: string
  backlog?: number
  hitRate?: number
  workers?: number
}

export interface Particle {
  id: number
  edge: string
  type: ReqType
  born: number
}

export type PanelTab = 'learn' | 'live' | 'review' | 'results'

interface SimState {
  running: boolean
  evalMode: boolean
  speed: 1 | 3
  multiplier: number
  simTime: number
  nodes: Record<string, NodeStats>
  flashing: Record<string, true>
  series: SecondStats[]
  particles: Particle[]
  phaseResults: (boolean | null)[]
  tab: PanelTab
  setTab: (t: PanelTab) => void
}

export const useSim = create<SimState>()((set) => ({
  running: false,
  evalMode: false,
  speed: 1,
  multiplier: 1,
  simTime: 0,
  nodes: {},
  flashing: {},
  series: [],
  particles: [],
  phaseResults: PHASES.map(() => null),
  tab: 'learn',
  setTab: (tab) => set({ tab }),
}))

// ---- controller: owns the Simulation and the animation loop ----

let sim: Simulation | null = null
let raf = 0
let lastFrame = 0
let lastUi = 0
let lastParticles = 0
let nextSecond = 0
let particleId = 0
let pending: Particle[] = []
const flashUntil = new Map<string, number>()
const prevCounts = new Map<string, { arrivals: number; drops: number; at: number }>()

function create_(design: Design) {
  return new Simulation(design, {
    readsPerSec: LEVEL.readsPerSec,
    writesPerSec: LEVEL.writesPerSec,
    onHop: (from, to, type) => {
      if (pending.length < 120) pending.push({ id: particleId++, edge: `${from}>${to}`, type, born: performance.now() })
    },
    onDrop: (id) => flashUntil.set(id, performance.now() + 300),
  })
}

function snapshotNodes() {
  if (!sim) return
  const out: Record<string, NodeStats> = {}
  const showing = sim.now > 0
  for (const r of Object.values(sim.rt)) {
    if (r.type === 'client') continue
    const prev = prevCounts.get(r.id) ?? { arrivals: 0, drops: 0, at: 0 }
    const dt = Math.max(0.001, (sim.now - prev.at) / 1000)
    const rate = (r.arrivals - prev.arrivals) / dt
    const drops = r.drops - prev.drops
    prevCounts.set(r.id, { arrivals: r.arrivals, drops: r.drops, at: sim.now })
    const util = sim.utilization(r)
    const down = sim.isDown(r)
    const state: NodeState = !showing ? 'idle' : down ? 'down' : drops > 0 || util > 0.9 ? 'hot' : util > 0.7 ? 'warn' : 'ok'
    let badge = ''
    if (showing) {
      if (down) badge = 'DOWN'
      else if (r.type === 'queue') badge = `backlog ${Math.round(r.backlog ?? 0).toLocaleString('en-US')}`
      else if (drops > 0) badge = 'dropping'
      else if (r.pools.length) badge = `${Math.round(util * 100)}%`
    }
    out[r.id] = {
      state,
      util,
      rate,
      dropRate: drops / dt,
      badge,
      backlog: r.type === 'queue' ? r.backlog : undefined,
      hitRate: r.type === 'cache' ? sim.hitRate(r) : undefined,
      workers: r.type === 'queue' ? r.workers?.length : undefined,
    }
  }
  return out
}

function collectSeries() {
  if (!sim) return
  // Requests are bucketed by start time, so wait 2 s for a second's requests to finish.
  const ready = Math.floor(sim.now / 1000) - 2
  if (ready < nextSecond) return
  const add: SecondStats[] = []
  for (; nextSecond <= ready; nextSecond++) add.push(secondStats(sim.buckets, nextSecond))
  const keep = useSim.getState().evalMode ? 70 : 60
  useSim.setState((s) => ({ series: [...s.series, ...add].slice(-keep) }))
}

function frame(ts: number) {
  raf = requestAnimationFrame(frame)
  const dt = Math.min(50, ts - (lastFrame || ts))
  lastFrame = ts
  const st = useSim.getState()
  if (st.running && sim) {
    sim.runUntil(sim.now + dt * st.speed, () => !useSim.getState().running)
  }
  if (ts - lastParticles > 90) {
    lastParticles = ts
    const flashing: Record<string, true> = {}
    for (const [id, until] of flashUntil) {
      if (until > ts) flashing[id] = true
      else flashUntil.delete(id)
    }
    const alive = st.particles.filter((p) => ts - p.born < 600)
    if (pending.length || alive.length !== st.particles.length || Object.keys(flashing).length || Object.keys(st.flashing).length) {
      useSim.setState({ particles: [...alive, ...pending], flashing })
      pending = []
    }
  }
  if (ts - lastUi > 300 && sim) {
    lastUi = ts
    useSim.setState({ nodes: snapshotNodes() ?? {}, simTime: sim.now, multiplier: sim.multiplier })
    collectSeries()
  }
}

function ensureLoop() {
  if (!raf) raf = requestAnimationFrame(frame)
}

function fresh() {
  sim = create_(useGame.getState().design)
  pending = []
  nextSecond = 0
  prevCounts.clear()
  flashUntil.clear()
  useSim.setState({ series: [], particles: [], nodes: {}, simTime: 0, flashing: {} })
}

export const simControls = {
  start() {
    ensureLoop()
    if (!sim || sim.now === 0) fresh()
    if (!sim!.hasEntry) {
      toast('Connect Users to something first: drag from the dot on the right of Users.')
      return
    }
    sim!.multiplier = useSim.getState().multiplier
    useSim.setState({ running: true })
  },
  pause() {
    useSim.setState({ running: false })
  },
  reset() {
    useSim.setState({ running: false, evalMode: false, multiplier: 1, phaseResults: PHASES.map(() => null) })
    fresh()
  },
  setMultiplier(m: number) {
    if (sim) sim.multiplier = m
    useSim.setState({ multiplier: m })
  },
  toggleSpeed() {
    useSim.setState((s) => ({ speed: s.speed === 1 ? 3 : 1 }))
  },
  chaos(kind: ChaosKind) {
    if (!sim || !useSim.getState().running) {
      toast('Press Run first, then break things while traffic flows.')
      return
    }
    toast(sim.chaos(kind))
  },
  evaluate() {
    simControls.reset()
    ensureLoop()
    if (!sim!.hasEntry) {
      toast('Connect Users to something first: drag from the dot on the right of Users.')
      return
    }
    const s = sim!
    s.setScript(evaluationScript(s, (m) => toast(m), finishEvaluation))
    useSim.setState({ running: true, evalMode: true })
  },
}

function finishEvaluation() {
  if (!sim) return
  const phases = PHASES.map((p) => gradePhase(sim!.buckets, p))
  const game = useGame.getState()
  const analytics = game.scope.analytics ?? 'nice'
  game.setLastEval({
    phases,
    cost: totalCost(game.design),
    rules: review(game.design, analytics).map(({ lvl, title }) => ({ lvl, title })),
    at: Date.now(),
  })
  collectSeries()
  useSim.setState({ running: false, evalMode: false, phaseResults: phases.map((p) => p.pass), tab: 'results', simTime: EVAL_SCRIPT.end * 1000 })
  const passed = phases.filter((p) => p.pass).length
  toast(`Evaluation done: ${passed} of ${phases.length} scenarios passed.`, { description: 'See the Results tab.' })
}

/** What the simulation depends on: components, settings and wiring, but not positions. */
const topology = (d: Design) => JSON.stringify([d.nodes.map((n) => [n.id, n.type, n.cfg]), d.edges])

// Keep the running simulation in sync with edits to the design.
useGame.subscribe((state, prev) => {
  if (state.design === prev.design || !sim) return
  if (topology(state.design) === topology(prev.design)) return
  if (sim.now > 0) sim.rebuild(state.design)
  else sim = create_(state.design)
})
