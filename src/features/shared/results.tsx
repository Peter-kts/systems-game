import { useLevel, type EvalRecord } from '../../store/game'
import type { Rule } from '../../game/types'
import { cn } from '../../lib/utils'

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
  const level = useLevel()
  // A result saved by another version of the level can't be shown column by column.
  if (ev.phases.some((p) => p.values.length !== level.checks.length)) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-2 py-1.5 font-medium">Scenario</th>
            {level.checks.map((c) => (
              <th key={c.id} className="px-2 py-1.5 font-medium">
                {c.label}
                <br />
                {c.target}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ev.phases.map((p, i) => (
            <tr key={p.name} className="border-b border-line align-top">
              <td className="px-2 py-1.5">
                <span className={p.pass ? 'text-ok' : 'text-bad'}>{p.pass ? '✓' : '✗'}</span> {p.name}
              </td>
              {level.checks.map((c, j) => {
                const ok = p.checks[j]
                const phase = level.phases[i]
                const note = ok === null ? 'not graded' : phase && c.note?.(phase)
                return (
                  <td key={c.id} className={cn('whitespace-nowrap px-2 py-1.5 font-mono tabular-nums', ok === null ? 'text-muted' : ok ? 'text-ok' : 'text-bad')}>
                    {c.format(p.values[j])}
                    {note && (
                      <>
                        <br />
                        <small className="text-muted">{note}</small>
                      </>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Advice({ ev }: { ev: EvalRecord }) {
  const level = useLevel()
  return (
    <>
      {level.advice(ev.phases).map(([t, d]) => (
        <div key={t} className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 rounded-xl border border-line px-3 py-2.5">
          <span className="row-span-2 mt-0.5 h-fit min-w-11 rounded-md bg-warn-soft px-1.5 py-px text-center font-mono text-[11px] font-medium text-warn">WHY</span>
          <b className="font-semibold">{t}</b>
          <p className="m-0 text-[13px] text-muted">{d}</p>
        </div>
      ))}
    </>
  )
}
