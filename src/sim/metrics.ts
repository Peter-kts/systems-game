import type { Level, Phase } from '../game/levels/types'
import type { Design } from '../game/types'
import { Simulation, type Bucket } from './engine'

export function percentile(values: number[], q: number) {
  if (!values.length) return NaN
  const s = Float64Array.from(values).sort()
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

export interface Window {
  reads: number[]
  writes: number[]
  readFails: number
  writeFails: number
  hits: number
  lookups: number
  /** Legitimate reads rejected by a rate limiter (included in readFails). */
  readsLimited: number
  bots: number
  botsLimited: number
  /** Bot requests that got past the limiter to the API servers. */
  botsThrough: number
}

/** Collects completed requests that started between seconds `a` (inclusive) and `b` (exclusive). */
export function gather(buckets: Bucket[], a: number, b: number): Window {
  const w: Window = { reads: [], writes: [], readFails: 0, writeFails: 0, hits: 0, lookups: 0, readsLimited: 0, bots: 0, botsLimited: 0, botsThrough: 0 }
  for (let i = Math.max(0, a); i < b; i++) {
    const x = buckets[i]
    if (!x) continue
    for (const v of x.r) w.reads.push(v)
    for (const v of x.w) w.writes.push(v)
    w.readFails += x.rf
    w.writeFails += x.wf
    w.hits += x.hit
    w.lookups += x.look
    w.readsLimited += x.rl
    w.bots += x.b
    w.botsLimited += x.bl
    w.botsThrough += x.ba
  }
  return w
}

export const readAvailability = (w: Window) => {
  const n = w.reads.length + w.readFails
  return n ? w.reads.length / n : 0
}

export const writeAvailability = (w: Window) => {
  const n = w.writes.length + w.writeFails
  return n ? w.writes.length / n : 0
}

/** How many times its limit each bot got through, on average (∞ with no bots limited at all). */
export const botRatio = (w: Window, seconds: number, keys: number, limit: number) =>
  w.bots ? w.botsThrough / seconds / keys / limit : NaN

export interface SecondStats {
  t: number
  reads: number
  writes: number
  success: number
  readP50: number
  readP99: number
  writeP99: number
  hitRate: number
  bots: number
  /** Share of bot requests rejected by a limiter. */
  botsBlocked: number
}

export function secondStats(buckets: Bucket[], s: number): SecondStats {
  const w = gather(buckets, s, s + 1)
  const rt = w.reads.length + w.readFails
  const wt = w.writes.length + w.writeFails
  return {
    t: s,
    reads: rt,
    writes: wt,
    success: rt + wt ? (w.reads.length + w.writes.length) / (rt + wt) : NaN,
    readP50: percentile(w.reads, 0.5),
    readP99: percentile(w.reads, 0.99),
    writeP99: percentile(w.writes, 0.99),
    hitRate: w.lookups ? w.hits / w.lookups : NaN,
    bots: w.bots,
    botsBlocked: w.bots ? w.botsLimited / w.bots : NaN,
  }
}

export interface PhaseResult {
  name: string
  /** One value per check of the level, in the same order. */
  values: number[]
  /** Whether each check passed, or null when it isn't graded in this scenario. */
  checks: (boolean | null)[]
  pass: boolean
}

export function gradePhase(level: Level, buckets: Bucket[], p: Phase): PhaseResult {
  const w = gather(buckets, p.from, p.to)
  const ctx = { seconds: p.to - p.from, limit: level.bots?.limit ?? 0, botKeys: level.bots?.keys ?? 0 }
  const values = level.checks.map((c) => c.measure(w, ctx))
  const checks = level.checks.map((c, i) => (p.skip?.includes(c.id) ? null : c.pass(values[i], p)))
  return { name: p.name, values, checks, pass: checks.every((c) => c !== false) }
}

/** Events of the graded run, as absolute simulated times. */
export function evaluationScript(level: Level, sim: Simulation, notify: (msg: string) => void, onEnd: () => void) {
  const steps: { t: number; run: () => void }[] = level.events.map((e) => ({
    t: e.t * 1000,
    run: () => {
      if (e.kind === 'traffic') {
        sim.multiplier = e.multiplier
        if (e.say) notify(e.say)
      } else if (e.kind === 'attack') {
        sim.attack = e.on
        notify(e.say)
      } else notify(sim.chaos(e.target))
    },
  }))
  return [...steps, { t: level.end * 1000, run: onEnd }]
}

export function simOptions(level: Level) {
  return {
    readsPerSec: level.readsPerSec,
    writesPerSec: level.writesPerSec,
    appMs: level.sim?.appMs,
    appLeaf: level.sim?.appLeaf,
    bots: level.bots,
    limit: level.bots?.limit,
  }
}

/** Runs the full graded evaluation instantly (no animation). Used by tests. */
export function runEvaluation(level: Level, design: Design, random?: () => number) {
  const sim = new Simulation(design, { ...simOptions(level), random })
  const messages: string[] = []
  let done = false
  sim.setScript(evaluationScript(level, sim, (m) => messages.push(m), () => { done = true }))
  sim.runUntil(level.end * 1000 + 1, () => done)
  return { phases: level.phases.map((p) => gradePhase(level, sim.buckets, p)), messages }
}

export type { Phase }
