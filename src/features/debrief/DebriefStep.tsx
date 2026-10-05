import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { useGame, useLevel } from '../../store/game'
import { simControls } from '../../store/sim'
import { useReview } from '../../game/useReview'
import { Page, PageHeader } from '../shared/Page'
import { Advice, EvalTable, RuleItem } from '../shared/results'

export function DebriefStep() {
  const { lastEval, scope, scopeChecked, estimates, estimatesChecked, saved, loadReference, restoreMine, setStep } = useGame()
  const rules = useReview()
  const level = useLevel()
  const { requirements: REQUIREMENTS, estimates: ESTIMATES, talkingPoints: TALKING_POINTS } = level
  const fails = rules.filter((r) => r.lvl === 'fail').length
  const scopeGood = REQUIREMENTS.filter((r) => r.accepted.includes(scope[r.id])).length
  const estGood = ESTIMATES.filter((e) => {
    const n = parseFloat(estimates[e.id])
    return n >= e.lo && n <= e.hi
  }).length
  const facts: [string, string][] = [
    ['Scope', scopeChecked ? `${scopeGood}/${REQUIREMENTS.length}` : '–'],
    ['Estimates', estimatesChecked ? `${estGood}/${ESTIMATES.length}` : '–'],
    ['Scenarios passed', lastEval ? `${lastEval.phases.filter((p) => p.pass).length}/${lastEval.phases.length}` : '–'],
    ['Design issues to fix', String(fails)],
  ]
  return (
    <Page>
      <PageHeader
        eyebrow="Step 4 · Debrief"
        title="How did your design do?"
        lead="This is what you'd walk an interviewer through at the end: what you built, how it held up, and what you'd change."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-glass px-3 py-2.5">
            <span className="block text-xs text-muted">{k}</span>
            <strong className="font-mono text-[17px] font-medium">{v}</strong>
          </div>
        ))}
      </div>
      <section className="grid gap-3 rounded-2xl border border-line bg-glass p-4">
        <h3 className="text-lg font-bold">Load test</h3>
        {lastEval ? (
          <>
            <EvalTable ev={lastEval} />
            <Advice ev={lastEval} />
          </>
        ) : (
          <p className="m-0 text-muted">Run an evaluation in Build &amp; test to see results here.</p>
        )}
      </section>
      <section className="grid gap-2 rounded-2xl border border-line bg-glass p-4">
        <h3 className="mb-1 text-lg font-bold">Design review</h3>
        {rules.map((r) => (
          <RuleItem key={r.title} rule={r} />
        ))}
      </section>
      <section className="grid gap-3 rounded-2xl border border-line bg-glass p-4">
        <h3 className="text-lg font-bold">Compare with a reference design</h3>
        <p className="m-0 max-w-[65ch] text-muted">
          {level.referenceSummary} Load it, run the evaluation, and compare.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="primary"
            onClick={() => {
              loadReference()
              simControls.reset()
              setStep('build')
              toast('Reference design loaded.', { description: 'Your design is saved; restore it from the Debrief.' })
            }}
          >
            Load reference design
          </Button>
          {saved && (
            <Button
              onClick={() => {
                restoreMine()
                simControls.reset()
                setStep('build')
                toast('Your design is back.')
              }}
            >
              Restore my design
            </Button>
          )}
        </div>
      </section>
      <h3 className="text-xl font-bold">What interviewers listen for</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
        {TALKING_POINTS.map(([t, d]) => (
          <article key={t} className="rounded-xl border border-line bg-glass px-3.5 py-3">
            <h4 className="mb-1 font-display text-[15px] font-bold">{t}</h4>
            <p className="m-0 text-[13.5px] text-muted">{d}</p>
          </article>
        ))}
      </div>
    </Page>
  )
}
