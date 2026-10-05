import { Button } from '../../components/ui/button'
import { LEVEL, REQUIREMENTS } from '../../game/levels/urlShortener'
import type { Scope } from '../../game/types'
import { cn } from '../../lib/utils'
import { useGame } from '../../store/game'
import { Page, PageHeader } from '../shared/Page'

const LABEL: Record<Scope, string> = { must: 'Must have', nice: 'Nice to have', out: 'Out of scope' }

export function ScopeStep() {
  const { scope, scopeChecked, setScope, checkScope, setStep } = useGame()
  const good = REQUIREMENTS.filter((r) => r.accepted.includes(scope[r.id])).length
  return (
    <Page>
      <PageHeader
        eyebrow="Step 1 · Clarify requirements"
        title={LEVEL.prompt}
        lead="Interviews start vague on purpose. Spend the first five minutes deciding what's in scope. Sort each statement, then check your answers."
      />
      <div className="rounded-2xl border border-line bg-glass px-4.5 py-4">
        <p className="m-0 max-w-[65ch]">
          <b>The interviewer says:</b> {LEVEL.brief}
        </p>
      </div>
      {(['Functional', 'Non-functional'] as const).map((g) => (
        <section key={g} className="grid gap-2">
          <h3 className="font-sans text-[15px] font-semibold text-muted">{g}</h3>
          {REQUIREMENTS.filter((r) => r.group === g).map((r) => {
            const v = scope[r.id]
            const ok = v && r.accepted.includes(v)
            const head = !v ? 'Not answered.' : ok ? (v === r.answer ? 'Right.' : `Fine. Most interviewers would call it ${LABEL[r.answer].toLowerCase()}.`) : `Usually ${LABEL[r.answer].toLowerCase()}.`
            return (
              <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-2 rounded-xl border border-line bg-glass px-3 py-2.5 max-sm:grid-cols-1">
                <p className="m-0 min-w-0">{r.text}</p>
                <div role="radiogroup" aria-label="Scope" className="inline-flex w-fit overflow-hidden rounded-lg border border-line2">
                  {(['must', 'nice', 'out'] as Scope[]).map((k) => (
                    <button
                      key={k}
                      role="radio"
                      aria-checked={v === k}
                      onClick={() => setScope(r.id, k)}
                      className={cn('cursor-pointer px-2.5 py-1 text-[12.5px] [&+&]:border-l [&+&]:border-line2', v === k ? 'bg-accent/15 text-accent [text-shadow:0_0_8px_var(--accent)]' : 'text-muted hover:text-ink')}
                    >
                      {LABEL[k]}
                    </button>
                  ))}
                </div>
                {scopeChecked && (
                  <div className={cn('col-span-full rounded-lg px-2.5 py-2 text-[13px]', !v ? 'bg-warn-soft' : ok ? 'bg-ok-soft' : 'bg-bad-soft')}>
                    <b className="font-semibold">{head}</b> {r.why}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary" onClick={checkScope}>Check my scope</Button>
        {scopeChecked && <span className="text-muted">{good} of {REQUIREMENTS.length} sorted sensibly.</span>}
        <span className="flex-1" />
        <Button onClick={() => setStep('estimate')}>Next: estimate</Button>
      </div>
    </Page>
  )
}
