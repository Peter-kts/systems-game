import { Button } from '../../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { useReview } from '../../game/useReview'
import { cn, fmt } from '../../lib/utils'
import { useGame, useLevel } from '../../store/game'
import { useSim, type PanelTab } from '../../store/sim'
import { Advice, EvalTable, RuleItem } from '../shared/results'
import { LearnPanel } from './LearnPanel'
import { LivePanel } from './LivePanel'
import { TutorPanel } from './TutorPanel'

function ReviewPanel() {
  const rules = useReview()
  return (
    <div className="grid gap-2">
      <p className="m-0 text-[13px] text-muted">Rule checks a senior interviewer would apply. They update as you edit.</p>
      {rules.map((r) => (
        <RuleItem key={r.title} rule={r} />
      ))}
    </div>
  )
}

function ResultsPanel() {
  const ev = useGame((s) => s.lastEval)
  const setStep = useGame((s) => s.setStep)
  const level = useLevel()
  if (!ev)
    return (
      <div className="grid gap-2 text-muted">
        <p className="m-0">
          No evaluation yet. Press <b className="text-ink">Run evaluation</b> for the graded 60-second test:
        </p>
        <ol className="m-0 grid gap-1 pl-4 text-[13px]">
          {level.phases.map((p) => (
            <li key={p.name}>
              <b className="text-ink">{p.name}</b> ({p.from}–{p.to} s)
            </li>
          ))}
        </ol>
        <p className="m-0 text-[13px]">
          Each scenario checks {level.checks.map((c) => `${c.label.toLowerCase()} ${c.target}`).join(', ')}.
        </p>
      </div>
    )
  const passed = ev.phases.filter((p) => p.pass).length
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <strong className={cn('font-display text-4xl', passed === ev.phases.length ? 'text-ok [text-shadow:0_0_14px_var(--ok)]' : 'neon-text')}>{passed}/{ev.phases.length}</strong>
        <span className="text-muted">scenarios passed · ${fmt(ev.cost)}/month</span>
      </div>
      <EvalTable ev={ev} />
      <Advice ev={ev} />
      <Button onClick={() => setStep('debrief')}>Open the full debrief</Button>
    </div>
  )
}

export function SidePanel() {
  const tab = useSim((s) => s.tab)
  const setTab = useSim((s) => s.setTab)
  const fails = useReview().filter((r) => r.lvl === 'fail').length
  return (
    <aside className="grid min-h-0 grid-rows-[auto_1fr] border-l border-line bg-glass backdrop-blur-md max-lg:border-l-0 max-lg:border-t">
      <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="contents">
        <TabsList>
          <TabsTrigger value="learn">Learn</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="review">
            Review
            <span className={cn('rounded-full px-1.5 font-mono text-[11px]', fails ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok')}>{fails}</span>
          </TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="tutor">Tutor</TabsTrigger>
        </TabsList>
        <TabsContent value="learn"><LearnPanel /></TabsContent>
        <TabsContent value="live"><LivePanel /></TabsContent>
        <TabsContent value="review"><ReviewPanel /></TabsContent>
        <TabsContent value="results"><ResultsPanel /></TabsContent>
        <TabsContent value="tutor" className="overflow-hidden max-lg:h-[560px]"><TutorPanel /></TabsContent>
      </Tabs>
    </aside>
  )
}
