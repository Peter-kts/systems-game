import { toast } from 'sonner'
import { create } from 'zustand'
import { getLevel } from '../game/levels'
import { totalCost } from '../game/review'
import type { Design } from '../game/types'
import { Simulation, type ChaosKind, type CodeSource, type ReqType, type RowEvent } from '../sim/engine'
import { evaluationScript, gradePhase, secondStats, simOptions, type SecondStats } from '../sim/metrics'
import { useGame } from './game'

const level = () => getLevel(useGame.getState().levelId)

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
  /** Short codes an app server holds from the key generator. */
  keys?: number
  /** New links a database stored over another link's row, since the run started. */
  overwrites?: number
}

/** One row in the database view. */
export interface RowView {
  code: string
  url: string
  owner: string
  via: CodeSource
  /** The link this row held before a new link landed on it. */
  prev?: { url: string; owner: string }
  reads: number
  /** What last happened to the row, and when (performance.now), so its flash can replay. */
  last: 'new' | 'read' | 'over'
  at: number
}

export interface Particle {
  id: number
  edge: string
  type: ReqType
  born: number
}

export type PanelTab = 'learn' | 'live' | 'review' | 'results' | 'tutor'

interface SimState {
  running: boolean
  evalMode: boolean
  speed: 1 | 3
  multiplier: number
  /** Whether the bots are attacking, in levels that have them. */
  attack: boolean
  simTime: number
  nodes: Record<string, NodeStats>
  flashing: Record<string, true>
  series: SecondStats[]
  particles: Particle[]
  phaseResults: (boolean | null)[]
  /** A live sample of rows per database node, newest first. */
  rows: Record<string, RowView[]>
  tab: PanelTab
  setTab: (t: PanelTab) => void
}

export const useSim = create<SimState>()((set) => ({
  running: false,
  evalMode: false,
  speed: 1,
  multiplier: 1,
  attack: false,
  simTime: 0,
  nodes: {},
  flashing: {},
  series: [],
  particles: [],
  phaseResults: [],
  rows: {},
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
let pendingRows: RowEvent[] = []
const flashUntil = new Map<string, number>()
const prevCounts = new Map<string, { arrivals: number; drops: number; at: number }>()

function create_(design: Design) {
  return new Simulation(design, {
    ...simOptions(level()),
    onHop: (from, to, type) => {
      if (pending.length < 120) pending.push({ id: particleId++, edge: `${from}>${to}`, type, born: performance.now() })
    },
    onDrop: (id) => flashUntil.set(id, performance.now() + 300),
    onRow: (e) => {
      if (pendingRows.length < 200) pendingRows.push(e)
    },
  })
}

const MAX_ROWS = 9
/** Overwrites drawn per database per update; the counter still counts every one. */
const OVERWRITES_SHOWN = 2

/** Applies sampled row events to the database views. */
function applyRows(cur: Record<string, RowView[]>, events: RowEvent[], now: number) {
  const next = { ...cur }
  const overs = new Map<string, number>()
  for (const e of events) {
    const rows = [...(next[e.db] ?? [])]
    if (e.kind === 'read') {
      if (!rows.length) continue
      const i = Math.floor(Math.random() * rows.length)
      const r = rows[i]
      // Keep a fresh green or red flash visible; the click still counts.
      const keep = r.last !== 'read' && now - r.at < 1500
      rows[i] = { ...r, reads: r.reads + 1, ...(keep ? {} : { last: 'read' as const, at: now }) }
    } else {
      if (e.kind === 'overwrite') {
        const n = overs.get(e.db) ?? 0
        if (n >= OVERWRITES_SHOWN) continue
        overs.set(e.db, n + 1)
      }
      const i = rows.findIndex((r) => r.code === e.code)
      const row: RowView = {
        code: e.code,
        url: e.url,
        owner: e.owner,
        via: e.via,
        prev: e.kind === 'overwrite' ? e.prev : undefined,
        reads: 0,
        last: e.kind === 'insert' ? 'new' : 'over',
        at: now,
      }
      // An overwritten row that is on screen changes in place, so you see it replaced.
      if (i >= 0) rows[i] = row
      else rows.unshift(row)
      rows.length = Math.min(rows.length, MAX_ROWS)
    }
    next[e.db] = rows
  }
  return next
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
      keys: r.type === 'app' && r.out.kgs ? r.keys : undefined,
      overwrites: r.type === 'sql' || r.type === 'nosql' ? (r.overwrites ?? 0) : undefined,
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
    const rows = pendingRows.length ? applyRows(st.rows, pendingRows, ts) : st.rows
    pendingRows = []
    useSim.setState({ nodes: snapshotNodes() ?? {}, simTime: sim.now, multiplier: sim.multiplier, attack: sim.attack, rows })
    collectSeries()
  }
}

function ensureLoop() {
  if (!raf) raf = requestAnimationFrame(frame)
}

function fresh() {
  sim = create_(useGame.getState().design)
  pending = []
  pendingRows = []
  nextSecond = 0
  prevCounts.clear()
  flashUntil.clear()
  useSim.setState({ series: [], particles: [], nodes: {}, simTime: 0, flashing: {}, rows: {} })
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
    sim!.attack = useSim.getState().attack
    useSim.setState({ running: true })
  },
  pause() {
    useSim.setState({ running: false })
  },
  reset() {
    useSim.setState({ running: false, evalMode: false, multiplier: 1, attack: false, phaseResults: level().phases.map(() => null) })
    fresh()
  },
  setMultiplier(m: number) {
    if (sim) sim.multiplier = m
    useSim.setState({ multiplier: m })
  },
  toggleAttack() {
    const on = !useSim.getState().attack
    if (sim) sim.attack = on
    useSim.setState({ attack: on })
    const bots = level().bots
    if (bots && on && useSim.getState().running)
      toast(`Attack: ${bots.keys} API keys start sending ${bots.perKey.toLocaleString('en-US')} requests/s each.`)
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
    s.setScript(evaluationScript(level(), s, (m) => toast(m), finishEvaluation))
    useSim.setState({ running: true, evalMode: true })
  },
}

function finishEvaluation() {
  if (!sim) return
  const lvl = level()
  const phases = lvl.phases.map((p) => gradePhase(lvl, sim!.buckets, p))
  const game = useGame.getState()
  game.setLastEval({
    phases,
    cost: totalCost(game.design),
    rules: lvl.review(game.design, game.scope).map(({ lvl, title }) => ({ lvl, title })),
    at: Date.now(),
  })
  collectSeries()
  useSim.setState({ running: false, evalMode: false, phaseResults: phases.map((p) => p.pass), tab: 'results', simTime: lvl.end * 1000 })
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
