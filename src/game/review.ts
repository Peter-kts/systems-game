import { CATALOG } from './catalog'
import type { ComponentType, Design, Rule, RuleLevel } from './types'

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

export const totalCost = (d: Design) => d.nodes.reduce((s, n) => s + CATALOG[n.type].cost(n.cfg), 0)

/** Helpers for writing a level's design review. */
export function reviewKit(d: Design) {
  const out: Rule[] = []
  const add = (lvl: RuleLevel, title: string, detail = '') => out.push({ lvl, title, detail })
  const byId = (id: string) => d.nodes.find((n) => n.id === id)
  const typeOf = (id: string) => byId(id)?.type
  const kids = (id: string) => d.edges.filter((e) => e.from === id).map((e) => e.to)

  const reachable = new Set(['client'])
  const stack = ['client']
  while (stack.length) for (const k of kids(stack.pop()!)) if (!reachable.has(k)) { reachable.add(k); stack.push(k) }
  const live = d.nodes.filter((n) => reachable.has(n.id))
  const ofType = (t: ComponentType) => live.filter((n) => n.type === t)
  /** Distinct nodes of type `t` that any of `from` sends requests to. */
  const kidsOf = (from: { id: string }[], t: ComponentType) =>
    [...new Set(from.flatMap((a) => kids(a.id)).filter((k) => typeOf(k) === t))].map((k) => byId(k)!)

  /** Rules every level ends with: unused components and the budget. */
  const finish = (budget: number, overBudgetHint: string) => {
    const unused = d.nodes.filter((n) => n.id !== 'client' && !reachable.has(n.id))
    if (unused.length)
      add('warn', 'Unconnected components',
        `${unused.map((n) => CATALOG[n.type].name).join(', ')} ${unused.length > 1 ? "aren't" : "isn't"} reachable from Users but still cost money.`)
    const cost = totalCost(d)
    if (cost > budget) add('fail', `Over budget: $${fmt(cost)} of $${fmt(budget)} a month`, overBudgetHint)
    else add('pass', `Within budget: $${fmt(cost)} of $${fmt(budget)} a month`)
    const order: Record<RuleLevel, number> = { fail: 0, warn: 1, info: 2, pass: 3 }
    return out.sort((a, b) => order[a.lvl] - order[b.lvl])
  }

  return { add, byId, typeOf, kids, reachable, live, ofType, kidsOf, finish }
}
