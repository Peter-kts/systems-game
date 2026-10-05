import type { ChaosKind } from '../../sim/engine'
import type { PhaseResult, Window } from '../../sim/metrics'
import type { ComponentNote } from '../catalog'
import type { ComponentType, Design, Rule, Scope } from '../types'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Requirement {
  id: string
  group: 'Functional' | 'Non-functional'
  text: string
  answer: Scope
  accepted: Scope[]
  why: string
}

export interface Estimate {
  id: string
  question: string
  unit: string
  lo: number
  hi: number
  answer: string
  work: string
}

export interface Phase {
  name: string
  from: number
  to: number
  /** Ids of checks not graded in this scenario, e.g. write latency during a failover. */
  skip?: string[]
  /** How far over the limit bots may get in this scenario (default 1.25×). */
  botTolerance?: number
}

export interface GradeContext {
  seconds: number
  /** Rate limit per API key, requests/s. */
  limit: number
  botKeys: number
}

/** One graded number per scenario, shown as a column of the results table. */
export interface Check {
  id: string
  label: string
  target: string
  measure: (w: Window, ctx: GradeContext) => number
  pass: (v: number, phase: Phase) => boolean
  format: (v: number) => string
  /** A different target in some scenarios, shown under the value. */
  note?: (phase: Phase) => string | undefined
}

/** Something that happens during the graded run, at second `t`. */
export type ScriptEvent =
  | { t: number; kind: 'traffic'; multiplier: number; say?: string }
  | { t: number; kind: 'attack'; on: boolean; say: string }
  | { t: number; kind: 'chaos'; target: ChaosKind }

export interface Level {
  id: string
  difficulty: Difficulty
  title: string
  /** One line for the system select card. */
  tagline: string
  /** What the level teaches, as short tags. */
  teaches: string[]
  prompt: string
  brief: string
  budget: number
  facts: [string, string][]
  /** Hint under the facts on the Estimate step. */
  estimateHint: string
  readsPerSec: number
  writesPerSec: number
  /** Bot traffic switched on by the "attack" events, and the per-key limit it should be held to. */
  bots?: { keys: number; perKey: number; limit: number }
  /** Simulation details that differ per level. */
  sim?: { appMs?: number; appLeaf?: boolean }
  /** How requests are called in this problem. */
  words: { read: string; reads: string; write?: string; writes?: string }
  /** Success and p99 latency targets for reads, used for the live numbers. */
  targets: { readAvailability: number; readP99Ms: number }
  palette: ComponentType[]
  /** Board column for each component when added by click, if not the default. */
  columns?: Partial<Record<ComponentType, number>>
  notes: Partial<Record<ComponentType, ComponentNote>>
  requirements: Requirement[]
  estimates: Estimate[]
  phases: Phase[]
  events: ScriptEvent[]
  /** Second at which the graded run ends. */
  end: number
  checks: Check[]
  /** One sentence describing the graded run. */
  evalSummary: string
  breakable: { kind: ChaosKind; label: string; tip: string }[]
  starter: () => Design
  reference: () => Design
  referenceSummary: string
  talkingPoints: [string, string][]
  /** Rule checks a senior interviewer would apply, worst first. */
  review: (d: Design, scope: Record<string, Scope>) => Rule[]
  /** Plain-language reasons for each failed scenario. */
  advice: (phases: PhaseResult[]) => [string, string][]
}

/** A system that isn't playable yet, shown locked on the select screen. */
export interface UpcomingLevel {
  id: string
  difficulty: Difficulty
  title: string
  tagline: string
  teaches: string[]
}
