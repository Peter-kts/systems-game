import { useGame } from '../store/game'
import { useSim } from '../store/sim'
import { CATALOG } from './catalog'
import { ESTIMATES, LEVEL, PHASES, REQUIREMENTS, TALKING_POINTS, TARGETS } from './levels/urlShortener'
import { review, totalCost } from './review'

const pct = (v: number) => (Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(2)}%`)
const ms = (v: number) => (Number.isNaN(v) ? 'n/a' : `${Math.round(v)} ms`)

/**
 * Everything that stays the same between questions: the tutor's role, the level and the
 * component explanations. Kept byte-stable so the API can cache it.
 */
export const TUTOR_SYSTEM = [
  `You are the tutor inside System Design Lab, a game for practising system design interviews (Google/Meta style).
The player is learning. They build an architecture by dragging components onto a board and wiring them up, then a discrete-event queueing simulation load-tests it.

How to answer:
- Answer the question asked, about the player's actual design when it is relevant. Each question comes with a <game_state> snapshot of what is on screen.
- Explain like a senior engineer mentoring a candidate: concrete, with numbers from the game where they help, and why it matters in an interview.
- Prefer short answers (a few short paragraphs or a small list). Use Markdown sparingly.
- When the player asks what to change, give the one or two highest-impact changes first and say what they fix.
- If a question is outside this level (another system, a general concept), answer it anyway; you are a general system design tutor.
- Never invent simulation results. Only quote numbers that appear in the snapshot or the reference below.`,
  `# Level 1: ${LEVEL.title}
Prompt: ${LEVEL.prompt}
Brief: ${LEVEL.brief}
Facts: ${LEVEL.facts.map(([k, v]) => `${k}: ${v}`).join('; ')}
Budget: $${LEVEL.budget}/month. Base load: ${LEVEL.readsPerSec} clicks/s (reads), ${LEVEL.writesPerSec} new links/s (writes).

## Scope step (correct answers)
${REQUIREMENTS.map((r) => `- ${r.text} → ${r.answer}. ${r.why}`).join('\n')}

## Estimate step (accepted ranges)
${ESTIMATES.map((e) => `- ${e.question} → ${e.answer} (${e.lo}–${e.hi} ${e.unit}). ${e.work}`).join('\n')}

## Graded evaluation (60 s)
${PHASES.map((p) => `- ${p.name}: ${p.from}–${p.to} s${p.skipWriteLatency ? ' (write latency not graded)' : ''}`).join('\n')}
Each scenario passes when click success ≥ ${TARGETS.readAvailability * 100}%, click p99 ≤ ${TARGETS.readP99Ms} ms, new-link success ≥ ${TARGETS.writeAvailability * 100}%, new-link p99 ≤ ${TARGETS.writeP99Ms / 1000} s.

## Components in the game
${Object.values(CATALOG)
  .map((c) => `### ${c.name} (${c.tag})\nWhat: ${c.what}\nUse when: ${c.when}\nWatch out: ${c.watch}\nNumbers: ${c.nums}\nIn this problem: ${c.here}`)
  .join('\n\n')}

## Interview talking points
${TALKING_POINTS.map(([t, d]) => `- ${t}: ${d}`).join('\n')}

## Reference design
Users → Load balancer → 6 app servers → 128 GB cache with a replica, a key generator with 2 instances, and a 5-node NoSQL store. About $2,375/month; passes every scenario.`,
].join('\n\n')

/** A plain-text snapshot of what the player is looking at right now. */
export function gameSnapshot(): string {
  const g = useGame.getState()
  const s = useSim.getState()
  const d = g.design
  const name = (id: string) => {
    const n = d.nodes.find((x) => x.id === id)
    return n ? `${CATALOG[n.type].name} [${n.id}]` : id
  }
  const lines: string[] = [`Current step: ${g.step}`]

  lines.push(
    '',
    `Design (cost $${totalCost(d)}/month of $${LEVEL.budget}):`,
    ...d.nodes.map((n) => `- ${name(n.id)}: ${CATALOG[n.type].sub(n.cfg)} ($${CATALOG[n.type].cost(n.cfg)}/month)`),
    'Connections:',
    ...(d.edges.length ? d.edges.map((e) => `- ${name(e.from)} → ${name(e.to)}`) : ['- none']),
  )

  if (g.selection?.kind === 'node') lines.push('', `Selected: ${name(g.selection.id)}`)
  else if (g.selection?.kind === 'edge') lines.push('', `Selected connection: ${name(g.selection.from)} → ${name(g.selection.to)}`)

  const rules = review(d, g.scope.analytics ?? 'nice')
  lines.push('', 'Design review:', ...rules.map((r) => `- [${r.lvl}] ${r.title}${r.detail ? `: ${r.detail}` : ''}`))

  if (s.simTime > 0) {
    const last = s.series.at(-1)
    lines.push('', `Simulation: ${s.running ? 'running' : 'paused'} at ${(s.simTime / 1000).toFixed(1)} s${s.evalMode ? ' (graded evaluation)' : ''}, traffic ×${s.multiplier}`)
    if (last)
      lines.push(
        `Last second: ${Math.round(last.reads)} clicks/s, success ${pct(last.success)}, click p99 ${ms(last.readP99)}, new-link p99 ${ms(last.writeP99)}, cache hits ${pct(last.hitRate)}`,
      )
    for (const [id, st] of Object.entries(s.nodes))
      lines.push(`- ${name(id)}: ${st.state}, ${Math.round(st.rate)} req/s, ${Math.round(st.util * 100)}% busy, ${Math.round(st.dropRate)} dropped/s`)
  }

  if (g.lastEval) {
    lines.push('', `Last graded evaluation (design cost $${g.lastEval.cost}):`)
    for (const p of g.lastEval.phases)
      lines.push(
        `- ${p.name}: ${p.pass ? 'PASS' : 'FAIL'}; clicks OK ${pct(p.readAvailability)}, click p99 ${ms(p.readP99)}, new links OK ${pct(p.writeAvailability)}, new-link p99 ${ms(p.writeP99)}`,
      )
  }

  if (g.scopeChecked)
    lines.push('', 'Player scope answers:', ...REQUIREMENTS.map((r) => `- ${r.text}: ${g.scope[r.id] ?? 'unanswered'} (expected ${r.answer})`))
  if (g.estimatesChecked)
    lines.push('', 'Player estimates:', ...ESTIMATES.map((e) => `- ${e.question}: ${g.estimates[e.id] || 'blank'} ${e.unit} (accepted ${e.lo}–${e.hi})`))

  return lines.join('\n')
}
