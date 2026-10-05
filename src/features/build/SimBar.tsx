import { Bot, Flame, Gauge, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Slider } from '../../components/ui/slider'
import { Tip } from '../../components/ui/tooltip'
import { cn, fmt } from '../../lib/utils'
import { useLevel } from '../../store/game'
import { simControls, useSim } from '../../store/sim'

export function SimBar() {
  const { running, evalMode, speed, multiplier, attack, simTime, phaseResults } = useSim()
  const level = useLevel()
  const showTimeline = evalMode || phaseResults.some((r) => r !== null)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-glass px-3 py-2 backdrop-blur-md">
      <div className="flex items-center gap-1.5">
        {running ? (
          <Button size="sm" variant="primary" onClick={simControls.pause}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={simControls.start}>
            <Play /> Run
          </Button>
        )}
        <Button size="sm" onClick={simControls.reset}>
          <RotateCcw /> Reset
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Traffic</span>
        <Slider min={1} max={6} step={1} value={[multiplier]} onValueChange={([v]) => simControls.setMultiplier(v)} disabled={evalMode} />
        <span className="w-32 font-mono text-xs tabular-nums text-accent">{fmt(level.readsPerSec * multiplier)} {level.words.reads.toLowerCase()}/s</span>
      </div>
      {level.bots && (
        <Tip content={`Turn the bots on or off: ${level.bots.keys} API keys sending ${fmt(level.bots.perKey)} requests/s each, against a limit of ${level.bots.limit}/s.`}>
          <Button size="sm" variant={attack ? 'danger' : undefined} onClick={simControls.toggleAttack} disabled={evalMode} aria-pressed={attack}>
            <Bot /> {attack ? 'Stop attack' : 'Start attack'}
          </Button>
        </Tip>
      )}
      <Tip content="Run the simulation faster than real time.">
        <Button size="sm" variant="ghost" onClick={simControls.toggleSpeed}>
          <Gauge /> {speed}×
        </Button>
      </Tip>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Break</span>
        {level.breakable.map((b) => (
          <Tip key={b.kind} content={b.tip}>
            <Button size="sm" variant="danger" onClick={() => simControls.chaos(b.kind)}>{b.label}</Button>
          </Tip>
        ))}
      </div>
      <div className="flex-1" />
      <Tip content={level.evalSummary}>
        <Button size="sm" variant="primary" onClick={simControls.evaluate} disabled={evalMode}>
          <Flame /> Run evaluation
        </Button>
      </Tip>
      {showTimeline && (
        <div className="relative flex h-6 basis-full gap-0.5 overflow-hidden text-[11px]">
          {level.phases.map((p, i) => (
            <div
              key={p.name}
              style={{ flex: p.to - p.from }}
              className={cn(
                'flex min-w-0 items-center truncate rounded px-1.5',
                phaseResults[i] === true ? 'bg-ok-soft text-ok' : phaseResults[i] === false ? 'bg-bad-soft text-bad' : 'bg-soft text-muted',
                'font-mono uppercase tracking-wide',
              )}
            >
              {phaseResults[i] === true ? '✓ ' : phaseResults[i] === false ? '✗ ' : ''}
              {p.name}
            </div>
          ))}
          {evalMode && (
            <div className="absolute inset-y-0 w-0.5 bg-accent shadow-glow transition-[left] duration-300" style={{ left: `${Math.min(100, simTime / (level.end * 10))}%` }} />
          )}
        </div>
      )}
    </div>
  )
}
