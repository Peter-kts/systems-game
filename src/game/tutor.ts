import { useGame } from '../store/game'
import { useSim } from '../store/sim'
import { CATALOG } from './catalog'
import { getLevel, specFor, type Level } from './levels'
import { totalCost } from './review'

const pct = (v: number) => (Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(2)}%`)
const ms = (v: number) => (Number.isNaN(v) ? 'n/a' : `${Math.round(v)} ms`)

/**
 * Everything that stays the same between questions: the tutor's role, the level and the
 * component explanations. Kept byte-stable per level so the API can cache it.
 */
export const tutorSystem = (level: Level) => [
  `You are the tutor inside System Design Lab, a game for practising system design interviews (Google/Meta style).
The player is learning. They build an architecture by dragging components onto a board and wiring them up, then a discrete-event queueing simulation load-tests it.

How to answer:
- Answer the question asked, about the player's actual design when it is relevant. Each question comes with a <game_state> snapshot of what is on screen.
- Explain like a senior engineer mentoring a candidate: concrete, with numbers from the game where they help, and why it matters in an interview.
- Prefer short answers (a few short paragraphs or a small list). Use Markdown sparingly.
- When the player asks what to change, give the one or two highest-impact changes first and say what they fix.
- If a question is outside this level (another system, a general concept), answer it anyway; you are a general system design tutor.
- Never invent simulation results. Only quote numbers that appear in the snapshot or the reference below.`,
  `# System: ${level.title} (${level.difficulty})
Prompt: ${level.prompt}
Brief: ${level.brief}
Facts: ${level.facts.map(([k, v]) => `${k}: ${v}`).join('; ')}
Budget: $${level.budget}/month. Base load: ${level.readsPerSec} ${level.words.reads.toLowerCase()}/s (reads)${level.words.writes ? `, ${level.writesPerSec} ${level.words.writes.toLowerCase()}/s (writes)` : ''}.${level.bots ? `\nAttack traffic: ${level.bots.keys} API keys sending ${level.bots.perKey} requests/s each; the limit is ${level.bots.limit} requests/s per key.` : ''}

## Scope step (correct answers)
${level.requirements.map((r) => `- ${r.text} → ${r.answer}. ${r.why}`).join('\n')}

## Estimate step (accepted ranges)
${level.estimates.map((e) => `- ${e.question} → ${e.answer} (${e.lo}–${e.hi} ${e.unit}). ${e.work}`).join('\n')}

## Graded evaluation (${level.end} s)
${level.evalSummary}
${level.phases.map((p) => `- ${p.name}: ${p.from}–${p.to} s${p.skip?.length ? ` (not graded: ${p.skip.join(', ')})` : ''}${p.botTolerance ? ` (bots may reach ${p.botTolerance}× the limit)` : ''}`).join('\n')}
Each scenario checks: ${level.checks.map((c) => `${c.label} ${c.target}`).join('; ')}.

## Components in the game
${(['client', ...level.palette] as const)
  .map((t) => specFor(t, level))
  .map((c) => `### ${c.name} (${c.tag})\nWhat: ${c.what}\nUse when: ${c.when}\nWatch out: ${c.watch}\nNumbers: ${c.nums}${c.here ? `\nIn this problem: ${c.here}` : ''}`)
  .join('\n\n')}

## Interview talking points
${level.talkingPoints.map(([t, d]) => `- ${t}: ${d}`).join('\n')}

## Reference design
${level.referenceSummary}`,
].join('\n\n')

/** A plain-text snapshot of what the player is looking at right now. */
export function gameSnapshot(): string {
  const g = useGame.getState()
  const s = useSim.getState()
  const level = getLevel(g.levelId)
  const d = g.design
  const name = (id: string) => {
    const n = d.nodes.find((x) => x.id === id)
    return n ? `${CATALOG[n.type].name} [${n.id}]` : id
  }
  const lines: string[] = [`Current step: ${g.step}`]

  lines.push(
    '',
    `Design (cost $${totalCost(d)}/month of $${level.budget}):`,
    ...d.nodes.map((n) => `- ${name(n.id)}: ${specFor(n.type, level).sub(n.cfg)} ($${CATALOG[n.type].cost(n.cfg)}/month)`),
    'Connections:',
    ...(d.edges.length ? d.edges.map((e) => `- ${name(e.from)} → ${name(e.to)}`) : ['- none']),
  )

  if (g.selection?.kind === 'node') lines.push('', `Selected: ${name(g.selection.id)}`)
  else if (g.selection?.kind === 'edge') lines.push('', `Selected connection: ${name(g.selection.from)} → ${name(g.selection.to)}`)

  const rules = level.review(d, g.scope)
  lines.push('', 'Design review:', ...rules.map((r) => `- [${r.lvl}] ${r.title}${r.detail ? `: ${r.detail}` : ''}`))

  if (s.simTime > 0) {
    const last = s.series.at(-1)
    const w = level.words
    lines.push('', `Simulation: ${s.running ? 'running' : 'paused'} at ${(s.simTime / 1000).toFixed(1)} s${s.evalMode ? ' (graded evaluation)' : ''}, traffic ×${s.multiplier}${level.bots ? `, bot attack ${s.attack ? 'on' : 'off'}` : ''}`)
    if (last)
      lines.push(
        [
          `Last second: ${Math.round(last.reads)} ${w.reads.toLowerCase()}/s`,
          `success ${pct(last.success)}`,
          `${w.read} p99 ${ms(last.readP99)}`,
          w.write && `${w.write} p99 ${ms(last.writeP99)}`,
          !Number.isNaN(last.hitRate) && `cache hits ${pct(last.hitRate)}`,
          last.bots > 0 && `${Math.round(last.bots)} bot requests/s, ${pct(last.botsBlocked)} blocked`,
        ]
          .filter(Boolean)
          .join(', '),
      )
    for (const [id, st] of Object.entries(s.nodes))
      lines.push(`- ${name(id)}: ${st.state}, ${Math.round(st.rate)} req/s, ${Math.round(st.util * 100)}% busy, ${Math.round(st.dropRate)} dropped/s`)
  }

  if (g.lastEval) {
    lines.push('', `Last graded evaluation (design cost $${g.lastEval.cost}):`)
    for (const p of g.lastEval.phases)
      lines.push(
        `- ${p.name}: ${p.pass ? 'PASS' : 'FAIL'}; ${level.checks
          .map((c, i) => `${c.label} ${c.format(p.values[i])}${p.checks[i] === null ? ' (not graded)' : p.checks[i] ? '' : ' (missed)'}`)
          .join(', ')}`,
      )
  }

  if (g.scopeChecked)
    lines.push('', 'Player scope answers:', ...level.requirements.map((r) => `- ${r.text}: ${g.scope[r.id] ?? 'unanswered'} (expected ${r.answer})`))
  if (g.estimatesChecked)
    lines.push('', 'Player estimates:', ...level.estimates.map((e) => `- ${e.question}: ${g.estimates[e.id] || 'blank'} ${e.unit} (accepted ${e.lo}–${e.hi})`))

  return lines.join('\n')
}
