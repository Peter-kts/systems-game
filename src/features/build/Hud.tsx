import type { ReactNode } from 'react'
import { Tip } from '../../components/ui/tooltip'
import { totalCost } from '../../game/review'
import { cn, fmt, ms, pct } from '../../lib/utils'
import { useGame, useLevel } from '../../store/game'
import { useSim } from '../../store/sim'

function Tile({ label, value, tone, tip }: { label: string; value: ReactNode; tone?: 'good' | 'bad'; tip: string }) {
  return (
    <Tip content={tip}>
      <div
        tabIndex={0}
        className={cn(
          'pointer-events-auto min-w-26 rounded-xl border border-line bg-glass px-3 py-1.5 backdrop-blur-md',
          tone === 'good' && 'border-ok/40 shadow-[0_0_16px_-8px_var(--ok)]',
          tone === 'bad' && 'border-bad/50 shadow-[0_0_16px_-6px_var(--bad)]',
        )}
      >
        <span className="block whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-muted">{label}</span>
        <strong
          className={cn(
            'font-mono text-[17px] font-semibold tabular-nums',
            tone === 'good' && 'text-ok [text-shadow:0_0_10px_var(--ok)]',
            tone === 'bad' && 'text-bad [text-shadow:0_0_10px_var(--bad)]',
          )}
        >
          {value}
        </strong>
      </div>
    </Tip>
  )
}

/** Headline numbers floating over the board. */
export function Hud() {
  const design = useGame((s) => s.design)
  const level = useLevel()
  const { words, targets } = level
  const last = useSim((s) => s.series.at(-1))
  const cost = totalCost(design)
  return (
    <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 z-10 flex flex-wrap gap-1.5">
      {last && last.reads > 0 && (
        <>
          <Tile label={`${words.reads}/s`} value={fmt(last.reads)} tip={`${words.reads} per second reaching your system${level.bots ? ', not counting bots' : ''}.`} />
          <Tile
            label="Success"
            value={pct(last.success)}
            tone={last.success >= targets.readAvailability ? 'good' : 'bad'}
            tip={`Share of requests that got an answer in time${level.bots ? ' and weren\'t rejected by the limiter' : ''}. The target is ${targets.readAvailability * 100}%.`}
          />
          <Tile
            label={`${words.read} p99`}
            value={ms(last.readP99)}
            tone={last.readP99 <= targets.readP99Ms ? 'good' : 'bad'}
            tip={`99th percentile latency: 99% of ${words.reads.toLowerCase()} were faster than this. The target is ${targets.readP99Ms} ms.`}
          />
          {words.write && <Tile label={`${words.write} p99`} value={ms(last.writeP99)} tip={`99% of ${words.writes!.toLowerCase()} finished faster than this.`} />}
          {!Number.isNaN(last.hitRate) && <Tile label="Cache hits" value={pct(last.hitRate)} tip="Share of reads answered from the cache without touching the database." />}
          {last.bots > 0 && (
            <Tile
              label="Bots blocked"
              value={pct(last.botsBlocked)}
              tone={last.botsBlocked >= 0.95 ? 'good' : 'bad'}
              tip={`Share of bot requests rejected with a 429. Each bot sends ${fmt(level.bots!.perKey)}/s against a limit of ${level.bots!.limit}/s, so about ${pct(1 - level.bots!.limit / level.bots!.perKey)} should be.`}
            />
          )}
        </>
      )}
      <Tile label="Cost / month" value={`$${fmt(cost)}`} tone={cost > level.budget ? 'bad' : undefined} tip={`Your budget is $${fmt(level.budget)} a month.`} />
    </div>
  )
}
