import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import { useGame, useLevel } from '../../store/game'
import { Page, PageHeader } from '../shared/Page'

export function EstimateStep() {
  const { estimates, estimatesChecked, setEstimate, checkEstimates, setStep } = useGame()
  const level = useLevel()
  const ESTIMATES = level.estimates
  const inRange = (id: string, lo: number, hi: number) => {
    const n = parseFloat(estimates[id])
    return n >= lo && n <= hi
  }
  const good = ESTIMATES.filter((e) => inRange(e.id, e.lo, e.hi)).length
  return (
    <Page>
      <PageHeader
        eyebrow="Step 2 · Back-of-envelope estimates"
        title="How big is this thing?"
        lead="Rough numbers decide the design: they tell you whether one database is enough, whether you need a cache, and how big it should be. Round freely; interviewers want the right order of magnitude."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        {level.facts.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-glass px-3 py-2.5">
            <span className="block text-xs text-muted">{k}</span>
            <strong className="font-mono text-[17px] font-medium">{v}</strong>
          </div>
        ))}
      </div>
      <p className="m-0 text-[13px] text-muted">{level.estimateHint}</p>
      <div className="grid gap-2">
        {ESTIMATES.map((e) => {
          const raw = estimates[e.id] ?? ''
          const n = parseFloat(raw)
          const ok = inRange(e.id, e.lo, e.hi)
          const head = Number.isNaN(n) ? `Answer: ${e.answer}.` : ok ? `Close enough (${e.answer}).` : `Off. Expected ${e.answer}.`
          return (
            <div key={e.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-2 rounded-xl border border-line bg-glass p-3 max-sm:grid-cols-1">
              <label htmlFor={`est-${e.id}`} className="min-w-0">{e.question}</label>
              <span className="flex items-center gap-1.5">
                <input
                  id={`est-${e.id}`}
                  inputMode="decimal"
                  value={raw}
                  placeholder="?"
                  onChange={(ev) => setEstimate(e.id, ev.target.value)}
                  className="w-28 rounded-lg border border-line2 bg-bg px-2 py-1.5 font-mono text-accent outline-none transition-shadow focus:border-accent focus:shadow-glow"
                />
                <span className="min-w-16 text-xs text-muted">{e.unit}</span>
              </span>
              {estimatesChecked && (
                <div className={cn('col-span-full rounded-lg px-2.5 py-2 text-[13px]', Number.isNaN(n) ? 'bg-warn-soft' : ok ? 'bg-ok-soft' : 'bg-bad-soft')}>
                  <b className="font-semibold">{head}</b> {e.work}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={checkEstimates}>Check my numbers</Button>
        {estimatesChecked && <span className="text-muted">{good} of {ESTIMATES.length} in the right range.</span>}
        <span className="flex-1" />
        <Button onClick={() => setStep('build')}>Next: build it</Button>
      </div>
    </Page>
  )
}
