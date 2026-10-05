import { describe, expect, it } from 'vitest'
import { urlShortener as level } from '../game/levels/urlShortener'
import { totalCost } from '../game/review'
import type { Design } from '../game/types'
import { runEvaluation } from './metrics'
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
    const { phases } = runEvaluation(level, withApps(2), seeded(3))
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
