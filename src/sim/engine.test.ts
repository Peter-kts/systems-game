import { describe, expect, it } from 'vitest'
import { REFERENCE, STARTER } from '../game/levels/urlShortener'
import { review, totalCost } from '../game/review'
import type { Design } from '../game/types'
import { runEvaluation } from './metrics'

/** Deterministic random numbers so calibration tests are stable. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function withApps(inst: number): Design {
  const d = REFERENCE()
  d.nodes.find((n) => n.type === 'app')!.cfg.inst = inst
  return d
}

describe('graded evaluation', () => {
  it('reference design passes every scenario within budget', () => {
    const { phases } = runEvaluation(REFERENCE(), seeded(1))
    expect(phases.map((p) => [p.name, p.pass])).toEqual(phases.map((p) => [p.name, true]))
    expect(totalCost(REFERENCE())).toBeLessThanOrEqual(3000)
  })

  it('starter design fails every scenario', () => {
    const { phases } = runEvaluation(STARTER(), seeded(2))
    expect(phases.every((p) => !p.pass)).toBe(true)
  })

  it('too few app servers fail only the spike', () => {
    const { phases } = runEvaluation(withApps(2), seeded(3))
    expect(phases.map((p) => p.pass)).toEqual([true, false, true, true])
  })

  it('a database with no replicas loses reads when it dies', () => {
    const d = REFERENCE()
    const db = d.nodes.find((n) => n.type === 'nosql')!
    d.nodes = d.nodes.map((n) => (n.id === db.id ? { ...n, type: 'sql', cfg: { shards: 2, rep: 0 } } : n))
    const { phases } = runEvaluation(d, seeded(4))
    expect(phases[2].pass).toBe(false)
    expect(phases[2].readAvailability).toBeLessThan(0.99)
  })
})

describe('design review', () => {
  it('reference design has no failing rules', () => {
    expect(review(REFERENCE()).filter((r) => r.lvl === 'fail')).toEqual([])
  })

  it('flags the starter design single points of failure', () => {
    const titles = review(STARTER()).filter((r) => r.lvl === 'fail').map((r) => r.title)
    expect(titles).toContain('One app server is a single point of failure')
    expect(titles).toContain('Database machines have no replicas')
  })
})
