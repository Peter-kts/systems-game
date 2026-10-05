import { Flame, Gauge, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Slider } from '../../components/ui/slider'
import { Tip } from '../../components/ui/tooltip'
import { LEVEL, PHASES } from '../../game/levels/urlShortener'
import { cn, fmt } from '../../lib/utils'
import { simControls, useSim } from '../../store/sim'

export function SimBar() {
  const { running, evalMode, speed, multiplier, simTime, phaseResults } = useSim()
  const showTimeline = evalMode || phaseResults.some((r) => r !== null)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-2">
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
        <span className="text-xs text-muted">Traffic</span>
        <Slider min={1} max={6} step={1} value={[multiplier]} onValueChange={([v]) => simControls.setMultiplier(v)} disabled={evalMode} />
        <span className="w-28 font-mono text-xs tabular-nums">{fmt(LEVEL.readsPerSec * multiplier)} clicks/s</span>
      </div>
      <Tip content="Run the simulation faster than real time.">
        <Button size="sm" variant="ghost" onClick={simControls.toggleSpeed}>
          <Gauge /> {speed}×
        </Button>
      </Tip>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Break</span>
        <Tip content="Kill one app server instance.">
          <Button size="sm" variant="danger" onClick={() => simControls.chaos('app')}>App server</Button>
        </Tip>
        <Tip content="Kill a database machine: a SQL primary or a NoSQL node.">
          <Button size="sm" variant="danger" onClick={() => simControls.chaos('db')}>Database</Button>
        </Tip>
        <Tip content="Kill the cache node. Without a replica it restarts empty.">
          <Button size="sm" variant="danger" onClick={() => simControls.chaos('cache')}>Cache</Button>
        </Tip>
      </div>
      <div className="flex-1" />
      <Tip content="A graded 60-second test: normal day, 5× spike, a database failure and a cache failure.">
        <Button size="sm" variant="primary" onClick={simControls.evaluate} disabled={evalMode}>
          <Flame /> Run evaluation
        </Button>
      </Tip>
      {showTimeline && (
        <div className="relative flex h-6 basis-full gap-0.5 overflow-hidden text-[11px]">
          {PHASES.map((p, i) => (
            <div
              key={p.name}
              style={{ flex: p.to - p.from }}
              className={cn(
                'flex min-w-0 items-center truncate rounded px-1.5',
                phaseResults[i] === true ? 'bg-ok-soft text-ok' : phaseResults[i] === false ? 'bg-bad-soft text-bad' : 'bg-soft text-muted',
              )}
            >
              {phaseResults[i] === true ? '✓ ' : phaseResults[i] === false ? '✗ ' : ''}
              {p.name}
            </div>
          ))}
          {evalMode && (
            <div className="absolute inset-y-0 w-0.5 bg-ink transition-[left] duration-300" style={{ left: `${Math.min(100, simTime / 600)}%` }} />
          )}
        </div>
      )}
    </div>
  )
}
