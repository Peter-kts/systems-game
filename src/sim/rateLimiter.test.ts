import { describe, expect, it } from 'vitest'
import { rateLimiter as level } from '../game/levels/rateLimiter'
import { totalCost } from '../game/review'
import type { Design } from '../game/types'
import { ALGO, FAIL } from './engine'
import { runEvaluation } from './metrics'
import { seeded } from './seeded'

/** The reference design with one change applied. */
function variant(change: (d: Design, node: (type: string) => Design['nodes'][number]) => void): Design {
  const d = level.reference()
  change(d, (type) => d.nodes.find((n) => n.type === type)!)
  return d
}

const passes = (d: Design, seed: number) => runEvaluation(level, d, seeded(seed)).phases.map((p) => p.pass)

describe('rate limiter: graded evaluation', () => {
  it('reference design passes every scenario within budget', () => {
    const { phases } = runEvaluation(level, level.reference(), seeded(1))
    expect(phases.map((p) => [p.name, p.pass])).toEqual(phases.map((p) => [p.name, true]))
    expect(totalCost(level.reference())).toBeLessThanOrEqual(level.budget)
  })

  it('without a limiter, only the normal day passes', () => {
    const { phases } = runEvaluation(level, level.starter(), seeded(2))
    expect(phases.map((p) => p.pass)).toEqual([true, false, false, false])
    expect(phases[1].values[2]).toBeGreaterThan(30)
  })

  it('gateways counting on their own let each bot through several times its limit', () => {
    const d = variant((d) => {
      d.nodes = d.nodes.filter((n) => n.type !== 'counter')
      d.edges = d.edges.filter((e) => d.nodes.some((n) => n.id === e.to))
    })
    const { phases } = runEvaluation(level, d, seeded(3))
    expect(phases.map((p) => p.pass)).toEqual([true, false, false, false])
    expect(phases[1].values[0]).toBeGreaterThanOrEqual(0.999)
    expect(phases[1].values[2]).toBeGreaterThan(3)
  })

  it.each([
    ['allowing everything', (d: Design, node: (t: string) => Design['nodes'][number]) => void (node('gateway').cfg.fail = FAIL.open)],
    ['rejecting everything', (d: Design, node: (t: string) => Design['nodes'][number]) => void (node('gateway').cfg.fail = FAIL.closed)],
    ['no counter replica', (d: Design, node: (t: string) => Design['nodes'][number]) => void (node('counter').cfg.rep = 0)],
  ])('%s fails only when the counter store dies', (_name, change) => {
    expect(passes(variant(change), 4)).toEqual([true, true, false, true])
  })

  it('no spare gateway fails only when a gateway dies', () => {
    expect(passes(variant((_d, node) => void (node('gateway').cfg.inst = 3)), 5)).toEqual([true, true, true, false])
  })

  it('a sliding log overloads one counter shard, and two shards cope', () => {
    expect(passes(variant((_d, node) => void (node('gateway').cfg.algo = ALGO.slidingLog)), 6)[1]).toBe(false)
    const sharded = variant((_d, node) => {
      node('gateway').cfg.algo = ALGO.slidingLog
      node('counter').cfg.shards = 2
    })
    expect(passes(sharded, 7)).toEqual([true, true, true, true])
  })
})

describe('rate limiter: design review', () => {
  const fails = (d: Design) => level.review(d, {}).filter((r) => r.lvl === 'fail').map((r) => r.title)

  it('reference design has no failing rules', () => {
    expect(fails(level.reference())).toEqual([])
  })

  it('flags a design with no limiter', () => {
    expect(fails(level.starter())).toContain('Nothing enforces the rate limit')
  })

  it('flags gateways that count on their own and traffic that skips them', () => {
    const d = variant((d) => {
      d.nodes = d.nodes.filter((n) => n.type !== 'counter')
      d.edges = [...d.edges.filter((e) => d.nodes.some((n) => n.id === e.to)), { from: 'r1', to: 'r4' }]
    })
    expect(fails(d)).toEqual(expect.arrayContaining(['Each gateway instance counts on its own', 'Some traffic skips the rate limiter']))
  })
})
