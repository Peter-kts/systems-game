import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Cpu, LayoutGrid } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { DebriefStep } from './features/debrief/DebriefStep'
import { EstimateStep } from './features/estimate/EstimateStep'
import { ScopeStep } from './features/scope/ScopeStep'
import { SystemSelect } from './features/select/SystemSelect'
import { cn } from './lib/utils'
import { useGame, useLevel, type Step } from './store/game'
import { simControls } from './store/sim'

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
  const playing = useGame((s) => !!s.levelId)
  const showSystems = useGame((s) => s.showSystems)
  const level = useLevel()
  const done: Record<Step, boolean> = {
    scope: useGame((s) => s.scopeChecked),
    estimate: useGame((s) => s.estimatesChecked),
    build: useGame((s) => !!s.lastEval),
    debrief: false,
  }
  const reduce = useReducedMotion()
  const View = playing ? VIEWS[step] : SystemSelect
  const viewKey = playing ? `${level.id}:${step}` : 'select'
  return (
    <TooltipProvider>
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr] max-lg:h-auto max-lg:min-h-full">
        <header className="relative z-20 flex flex-wrap items-center gap-5 border-b border-line bg-glass px-4 py-2.5 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg border border-accent/50 bg-accent/10 text-accent shadow-glow">
              <Cpu size={18} aria-hidden />
            </span>
            <h1 className="text-[19px] font-bold tracking-tight">
              System Design <span className="neon-text">Lab</span>
            </h1>
            {playing && (
              <button
                onClick={() => {
                  showSystems()
                  simControls.reset()
                }}
                title="Choose another system"
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line2 px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <LayoutGrid size={12} aria-hidden />
                <span className="uppercase">{level.difficulty}</span> · {level.title}
              </button>
            )}
          </div>
          {playing && <nav aria-label="Steps" className="ml-auto flex flex-wrap gap-1 max-sm:ml-0">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                aria-current={step === s.id ? 'step' : undefined}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-muted transition-colors hover:text-ink',
                  step === s.id && 'border-accent/40 bg-accent/10 text-accent',
                )}
              >
                <b
                  className={cn(
                    'grid size-5 place-items-center rounded-full border border-line2 font-mono text-[11px] font-medium',
                    step === s.id ? 'border-accent bg-accent text-accent-ink shadow-glow' : done[s.id] && 'border-ok text-ok',
                  )}
                >
                  {i + 1}
                </b>
                <span className="max-sm:hidden">{s.label}</span>
              </button>
            ))}
          </nav>}
        </header>
        <main className="relative min-h-0 overflow-hidden max-lg:overflow-visible">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={viewKey}
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
      <Toaster position="top-center" theme="dark" toastOptions={{
          className: 'font-sans',
          style: { background: 'var(--panel)', color: 'var(--ink)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', boxShadow: 'var(--glow)' },
        }} />
    </TooltipProvider>
  )
}
