import { ArrowRight, Lock } from 'lucide-react'
import { DIFFICULTIES, LEVELS, UPCOMING } from '../../game/levels'
import type { Difficulty, Level, UpcomingLevel } from '../../game/levels/types'
import { cn } from '../../lib/utils'
import { useGame, type LevelProgress } from '../../store/game'
import { simControls } from '../../store/sim'
import { useTutor } from '../../store/tutor'
import { Page, PageHeader } from '../shared/Page'

const TONE: Record<Difficulty, string> = { easy: 'var(--ok)', medium: 'var(--warn)', hard: 'var(--bad)' }
const STEP_LABEL: Record<LevelProgress['step'], string> = { scope: 'Scope', estimate: 'Estimate', build: 'Build & test', debrief: 'Debrief' }

/** Three bars, filled up to the difficulty. */
function Bars({ level }: { level: Difficulty }) {
  const n = { easy: 1, medium: 2, hard: 3 }[level]
  return (
    <span className="inline-flex items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <i key={i} className="w-1 rounded-sm" style={{ height: 6 + i * 4, background: i < n ? TONE[level] : 'var(--line2)', boxShadow: i < n ? `0 0 6px ${TONE[level]}` : undefined }} />
      ))}
    </span>
  )
}

function status(p: LevelProgress | undefined, level: Level) {
  if (!p) return { text: 'Not started', done: false }
  if (p.lastEval) {
    const passed = p.lastEval.phases.filter((x) => x.pass).length
    return { text: `${passed}/${level.phases.length} scenarios passed`, done: passed === level.phases.length }
  }
  return { text: `In progress · ${STEP_LABEL[p.step]}`, done: false }
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-md border border-line2 px-1.5 py-px font-mono text-[10.5px] text-muted">
          {t}
        </span>
      ))}
    </span>
  )
}

function PlayableCard({ level }: { level: Level }) {
  const progress = useGame((s) => s.progress[level.id])
  const openLevel = useGame((s) => s.openLevel)
  const st = status(progress, level)
  return (
    <button
      onClick={() => {
        openLevel(level.id)
        simControls.reset()
        useTutor.getState().clear()
      }}
      className="group grid cursor-pointer content-start gap-2.5 rounded-2xl border border-line bg-glass p-4 text-left backdrop-blur-md transition-[border-color,box-shadow] hover:border-accent hover:shadow-glow focus-visible:border-accent focus-visible:shadow-glow focus-visible:outline-none"
    >
      <span className="flex items-center gap-2">
        <span className="flex-1 font-display text-lg font-bold">{level.title}</span>
        <ArrowRight size={18} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </span>
      <span className="text-[13.5px] text-muted">{level.tagline}</span>
      <Tags tags={level.teaches} />
      <span className={cn('font-mono text-[11px] uppercase tracking-wider', st.done ? 'text-ok' : progress ? 'text-accent' : 'text-muted')}>{st.text}</span>
    </button>
  )
}

function LockedCard({ level }: { level: UpcomingLevel }) {
  return (
    <div aria-disabled className="grid content-start gap-2.5 rounded-2xl border border-dashed border-line2 p-4 opacity-60">
      <span className="flex items-center gap-2">
        <span className="flex-1 font-display text-lg font-bold">{level.title}</span>
        <Lock size={16} className="text-muted" aria-label="Locked" />
      </span>
      <span className="text-[13.5px] text-muted">{level.tagline}</span>
      <Tags tags={level.teaches} />
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Coming soon</span>
    </div>
  )
}

export function SystemSelect() {
  return (
    <Page>
      <PageHeader
        eyebrow="Choose a system"
        title="What will you design today?"
        lead="Each system is a full mock interview: scope it, estimate it, build it on the board, then load-test it while things break. Start easy; harder systems add new components and sharper trade-offs."
      />
      {DIFFICULTIES.map((d) => (
        <section key={d.id} aria-labelledby={`diff-${d.id}`} className="grid gap-2.5">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id={`diff-${d.id}`} className="flex items-center gap-2 font-display text-xl font-bold" style={{ color: TONE[d.id] }}>
              <Bars level={d.id} /> {d.label}
            </h3>
            <span className="text-[13px] text-muted">{d.blurb}</span>
          </header>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
            {LEVELS.filter((l) => l.difficulty === d.id).map((l) => (
              <PlayableCard key={l.id} level={l} />
            ))}
            {UPCOMING.filter((l) => l.difficulty === d.id).map((l) => (
              <LockedCard key={l.id} level={l} />
            ))}
          </div>
        </section>
      ))}
    </Page>
  )
}
