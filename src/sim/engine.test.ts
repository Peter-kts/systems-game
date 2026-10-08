import { describe, expect, it } from 'vitest'
import { urlShortener as level } from '../game/levels/urlShortener'
import { totalCost } from '../game/review'
import type { Design } from '../game/types'
import { Simulation } from './engine'
import { runEvaluation, simOptions } from './metrics'
import { seeded } from './seeded'

function withApps(inst: number): Design {
  const d = level.reference()
  d.nodes.find((n) => n.type === 'app')!.cfg.inst = inst
  return d
}

describe('URL shortener: graded evaluation', () => {
  it('reference design passes every scenario within budget', () => {
    const { phases } = runEvaluation(level, level.reference(), seeded(1))
    expect(phases.map((p) => [p.name, p.pass])).toEqual(phases.map((p) => [p.name, true]))
    expect(totalCost(level.reference())).toBeLessThanOrEqual(level.budget)
  })

  it('starter design fails every scenario', () => {
    const { phases } = runEvaluation(level, level.starter(), seeded(2))
    expect(phases.every((p) => !p.pass)).toBe(true)
  })

  it('too few app servers fail only the spike', () => {
    const { phases } = runEvaluation(level, withApps(2), seeded(11))
    expect(phases.map((p) => p.pass)).toEqual([true, false, true, true])
  })

  it('a database with no replicas loses reads when it dies', () => {
    const d = level.reference()
    const db = d.nodes.find((n) => n.type === 'nosql')!
    d.nodes = d.nodes.map((n) => (n.id === db.id ? { ...n, type: 'sql', cfg: { shards: 2, rep: 0 } } : n))
    const { phases } = runEvaluation(level, d, seeded(4))
    expect(phases[2].pass).toBe(false)
    expect(phases[2].values[0]).toBeLessThan(0.99)
  })
})

describe('URL shortener: design review', () => {
  it('reference design has no failing rules', () => {
    expect(level.review(level.reference(), {}).filter((r) => r.lvl === 'fail')).toEqual([])
  })

  it('flags the starter design single points of failure', () => {
    const titles = level.review(level.starter(), {}).filter((r) => r.lvl === 'fail').map((r) => r.title)
    expect(titles).toContain('One app server is a single point of failure')
    expect(titles).toContain('Database machines have no replicas')
  })
})

describe('URL shortener: short codes', () => {
  /** The reference design with no key generator and the given app setting. */
  function codes(setting: number): Design {
    const d = level.reference()
    const kgs = d.nodes.find((n) => n.type === 'kgs')!.id
    d.nodes = d.nodes.filter((n) => n.id !== kgs).map((n) => (n.type === 'app' ? { ...n, cfg: { ...n.cfg, codes: setting } } : n))
    d.edges = d.edges.filter((e) => e.to !== kgs)
    return d
  }
  const overwrites = (phases: { values: number[] }[]) => phases.map((p) => p.values[level.checks.findIndex((c) => c.id === 'overwrites')])

  it('hashed codes overwrite repeat URLs in every scenario', () => {
    const { phases } = runEvaluation(level, codes(0), seeded(5))
    expect(phases.every((p) => !p.pass)).toBe(true)
    expect(overwrites(phases).every((v) => v > 0)).toBe(true)
  })

  it('random codes pass every scenario', () => {
    const { phases } = runEvaluation(level, codes(1), seeded(6))
    expect(phases.map((p) => p.pass)).toEqual([true, true, true, true])
  })

  it('counter codes repeat only after the database fails over', () => {
    const { phases, messages } = runEvaluation(level, codes(2), seeded(7))
    expect(overwrites(phases).map((v) => v > 0)).toEqual([false, false, true, false])
    expect(messages.some((m) => m.includes('hand those codes out again'))).toBe(true)
  })

  it('the key generator is called once per batch, not per new link', () => {
    const d = level.reference()
    const sim = new Simulation(d, { ...simOptions(level) })
    sim.runUntil(20000)
    const kgs = Object.values(sim.rt).find((r) => r.type === 'kgs')!
    expect(kgs.arrivals).toBeLessThan((20 * level.writesPerSec) / 50)
  })
})

describe('URL shortener: advice', () => {
  it('blames overwrites, not failover, when only links were overwritten', () => {
    const d = level.reference()
    const kgs = d.nodes.find((n) => n.type === 'kgs')!.id
    d.nodes = d.nodes.filter((n) => n.id !== kgs).map((n) => (n.type === 'app' ? { ...n, cfg: { ...n.cfg, codes: 2 } } : n))
    d.edges = d.edges.filter((e) => e.to !== kgs)
    const titles = level.advice(runEvaluation(level, d, seeded(7)).phases).map(([t]) => t)
    expect(titles).toEqual(['New links overwrote existing ones'])
  })
})
