import { EVAL_SCRIPT, LEVEL, PHASES, TARGETS, type Phase } from '../game/levels/urlShortener'
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
}

/** Collects completed requests that started between seconds `a` (inclusive) and `b` (exclusive). */
export function gather(buckets: Bucket[], a: number, b: number): Window {
  const w: Window = { reads: [], writes: [], readFails: 0, writeFails: 0, hits: 0, lookups: 0 }
  for (let i = Math.max(0, a); i < b; i++) {
    const x = buckets[i]
    if (!x) continue
    for (const v of x.r) w.reads.push(v)
    for (const v of x.w) w.writes.push(v)
    w.readFails += x.rf
    w.writeFails += x.wf
    w.hits += x.hit
    w.lookups += x.look
  }
  return w
}

export interface SecondStats {
  t: number
  reads: number
  writes: number
  success: number
  readP50: number
  readP99: number
  writeP99: number
  hitRate: number
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
  }
}

export interface PhaseResult {
  name: string
  readAvailability: number
  readP99: number
  writeAvailability: number
  writeP99: number
  skipWriteLatency: boolean
  reads: number
  writes: number
  checks: [boolean, boolean, boolean, boolean]
  pass: boolean
}

export function gradePhase(buckets: Bucket[], p: Phase): PhaseResult {
  const w = gather(buckets, p.from, p.to)
  const rt = w.reads.length + w.readFails
  const wt = w.writes.length + w.writeFails
  const readAvailability = rt ? w.reads.length / rt : 0
  const writeAvailability = wt ? w.writes.length / wt : 0
  const readP99 = percentile(w.reads, 0.99)
  const writeP99 = percentile(w.writes, 0.99)
  const checks: PhaseResult['checks'] = [
    readAvailability >= TARGETS.readAvailability,
    readP99 <= TARGETS.readP99Ms,
    writeAvailability >= TARGETS.writeAvailability,
    !!p.skipWriteLatency || writeP99 <= TARGETS.writeP99Ms,
  ]
  return {
    name: p.name,
    readAvailability,
    readP99,
    writeAvailability,
    writeP99,
    skipWriteLatency: !!p.skipWriteLatency,
    reads: rt,
    writes: wt,
    checks,
    pass: checks.every(Boolean),
  }
}

/** Events of the graded run, as absolute simulated times. */
export function evaluationScript(sim: Simulation, notify: (msg: string) => void, onEnd: () => void) {
  const s = EVAL_SCRIPT
  return [
    { t: s.spikeStart * 1000, run: () => { sim.multiplier = s.spikeMultiplier; notify(`Viral spike: traffic jumps to ${s.spikeMultiplier}×.`) } },
    { t: s.spikeEnd * 1000, run: () => { sim.multiplier = 1 } },
    { t: s.killDatabase * 1000, run: () => notify(sim.chaos('db')) },
    { t: s.killCache * 1000, run: () => notify(sim.chaos('cache')) },
    { t: s.end * 1000, run: onEnd },
  ]
}

/** Runs the full graded evaluation instantly (no animation). Used by tests. */
export function runEvaluation(design: Design, random?: () => number) {
  const sim = new Simulation(design, { readsPerSec: LEVEL.readsPerSec, writesPerSec: LEVEL.writesPerSec, random })
  const messages: string[] = []
  let done = false
  sim.setScript(evaluationScript(sim, (m) => messages.push(m), () => { done = true }))
  sim.runUntil(EVAL_SCRIPT.end * 1000 + 1, () => done)
  return { phases: PHASES.map((p) => gradePhase(sim.buckets, p)), messages }
}
