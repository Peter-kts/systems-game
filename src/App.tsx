import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { DebriefStep } from './features/debrief/DebriefStep'
import { EstimateStep } from './features/estimate/EstimateStep'
import { ScopeStep } from './features/scope/ScopeStep'
import { LEVEL } from './game/levels/urlShortener'
import { cn } from './lib/utils'
import { useGame, type Step } from './store/game'

// The board, simulation and charts are the heavy part; load them when first needed.
const BuildStep = lazy(() => import('./features/build/BuildStep').then((m) => ({ default: m.BuildStep })))

const STEPS: { id: Step; label: string }[] = [
  { id: 'scope', label: 'Scope' },
  { id: 'estimate', label: 'Estimate' },
  { id: 'build', label: 'Build & test' },
  { id: 'debrief', label: 'Debrief' },
]

const VIEWS: Record<Step, React.ComponentType> = {
  scope: ScopeStep,
  estimate: EstimateStep,
  build: BuildStep,
  debrief: DebriefStep,
}

export default function App() {
  const step = useGame((s) => s.step)
  const setStep = useGame((s) => s.setStep)
  const done: Record<Step, boolean> = {
    scope: useGame((s) => s.scopeChecked),
    estimate: useGame((s) => s.estimatesChecked),
    build: useGame((s) => !!s.lastEval),
    debrief: false,
  }
  const reduce = useReducedMotion()
  const View = VIEWS[step]
  return (
    <TooltipProvider>
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr] max-lg:h-auto max-lg:min-h-full">
        <header className="flex flex-wrap items-center gap-5 border-b border-line bg-panel px-4 py-2.5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="text-[19px] font-bold">System Design Lab</h1>
            <span className="font-mono text-xs text-muted">Level 1 · {LEVEL.title}</span>
          </div>
          <nav aria-label="Steps" className="ml-auto flex flex-wrap gap-1 max-sm:ml-0">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                aria-current={step === s.id ? 'step' : undefined}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-muted',
                  step === s.id && 'border-soft bg-soft text-ink',
                )}
              >
                <b
                  className={cn(
                    'grid size-5 place-items-center rounded-full border border-line2 font-mono text-[11px] font-medium',
                    step === s.id ? 'border-accent bg-accent text-accent-ink' : done[s.id] && 'border-ok text-ok',
                  )}
                >
                  {i + 1}
                </b>
                <span className="max-sm:hidden">{s.label}</span>
              </button>
            ))}
          </nav>
        </header>
        <main className="relative min-h-0 overflow-hidden max-lg:overflow-visible">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="h-full"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Suspense fallback={<p className="p-6 text-muted">Loading the board…</p>}>
                <View />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toaster position="top-center" theme="system" toastOptions={{ className: 'font-sans' }} />
    </TooltipProvider>
  )
}
