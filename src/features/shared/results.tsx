import type { EvalRecord } from '../../store/game'
import type { Rule } from '../../game/types'
import { TARGETS } from '../../game/levels/urlShortener'
import { cn, ms, pct } from '../../lib/utils'

const MARK: Record<Rule['lvl'], string> = { fail: 'FIX', warn: 'WARN', info: 'NOTE', pass: 'OK' }
const MARK_TONE: Record<Rule['lvl'], string> = {
  fail: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-soft text-accent',
  pass: 'bg-ok-soft text-ok',
}

export function RuleItem({ rule }: { rule: Pick<Rule, 'lvl' | 'title'> & { detail?: string } }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 rounded-xl border border-line px-3 py-2.5">
      <span className={cn('row-span-2 mt-0.5 h-fit min-w-11 rounded-md px-1.5 py-px text-center font-mono text-[11px] font-medium', MARK_TONE[rule.lvl])}>
        {MARK[rule.lvl]}
      </span>
      <b className="font-semibold">{rule.title}</b>
      {rule.detail && <p className="m-0 text-[13px] text-muted">{rule.detail}</p>}
    </div>
  )
}

export function EvalTable({ ev }: { ev: EvalRecord }) {
  const cell = (ok: boolean, text: string) => <td className={cn('whitespace-nowrap px-2 py-1.5 font-mono tabular-nums', ok ? 'text-ok' : 'text-bad')}>{text}</td>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-2 py-1.5 font-medium">Scenario</th>
            <th className="px-2 py-1.5 font-medium">Clicks OK<br />≥ {TARGETS.readAvailability * 100}%</th>
            <th className="px-2 py-1.5 font-medium">Click p99<br />≤ {TARGETS.readP99Ms} ms</th>
            <th className="px-2 py-1.5 font-medium">New links OK<br />≥ {TARGETS.writeAvailability * 100}%</th>
            <th className="px-2 py-1.5 font-medium">New link p99<br />≤ {TARGETS.writeP99Ms / 1000} s</th>
          </tr>
        </thead>
        <tbody>
          {ev.phases.map((p) => (
            <tr key={p.name} className="border-b border-line align-top">
              <td className="px-2 py-1.5">
                <span className={p.pass ? 'text-ok' : 'text-bad'}>{p.pass ? '✓' : '✗'}</span> {p.name}
              </td>
              {cell(p.checks[0], pct(p.readAvailability))}
              {cell(p.checks[1], ms(p.readP99))}
              {cell(p.checks[2], pct(p.writeAvailability))}
              {p.skipWriteLatency ? (
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-muted">
                  {ms(p.writeP99)}
                  <br />
                  <small>not graded</small>
                </td>
              ) : (
                cell(p.checks[3], ms(p.writeP99))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Plain-language reasons for each failed scenario. */
function phaseAdvice(ev: EvalRecord): [string, string][] {
  const out: [string, string][] = []
  const [normal, spike, db, cache] = ev.phases
  if (normal && !normal.pass)
    out.push(['It fails on a normal day', 'Check the Review tab first: something on the main path is missing, overloaded, or a single machine.'])
  if (spike && !spike.pass && normal?.pass)
    out.push(['The 5× spike overwhelms it', "Look at which component turned red during the spike. Usually: too few app instances (each does ~3,500 req/s), or reads reaching the database because there's no cache."])
  if (db && !db.pass)
    out.push(['A database failure breaks it', 'Without replicas a dead machine takes its links with it. SQL replicas keep serving reads during failover; NoSQL keeps copies on other nodes.'])
  if (cache && !cache.pass)
    out.push(['Losing the cache breaks it', 'When the cache dies, all reads hit the database at once (a thundering herd). Add a cache replica, or give the database enough headroom.'])
  return out
}

export function Advice({ ev }: { ev: EvalRecord }) {
  return (
    <>
      {phaseAdvice(ev).map(([t, d]) => (
        <div key={t} className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 rounded-xl border border-line px-3 py-2.5">
          <span className="row-span-2 mt-0.5 h-fit min-w-11 rounded-md bg-warn-soft px-1.5 py-px text-center font-mono text-[11px] font-medium text-warn">WHY</span>
          <b className="font-semibold">{t}</b>
          <p className="m-0 text-[13px] text-muted">{d}</p>
        </div>
      ))}
    </>
  )
}
