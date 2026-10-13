import { ReactFlowProvider } from '@xyflow/react'
import { SlidersHorizontal } from 'lucide-react'
import { CATALOG } from '../../game/catalog'
import { cn } from '../../lib/utils'
import { useGame } from '../../store/game'
import { useSim } from '../../store/sim'
import { Board } from './Board'
import { Hud } from './Hud'
import { Palette } from './Palette'
import { SidePanel } from './SidePanel'
import { SimBar } from './SimBar'

export function BuildStep() {
  const isStarter = useGame((s) => s.design.nodes.length <= 3)
  const started = useSim((s) => s.simTime > 0)
  const selected = useGame((s) => {
    const sel = s.selection
    if (!sel) return null
    if (sel.kind === 'edge') return 'connection'
    const n = s.design.nodes.find((x) => x.id === sel.id)
    return n ? CATALOG[n.type].name : null
  })
  return (
    <ReactFlowProvider>
      <div className="grid h-full min-h-0 grid-cols-[200px_minmax(0,1fr)_360px] max-lg:h-auto max-lg:grid-cols-1">
        <Palette />
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr]">
          <SimBar />
          <div className="relative min-h-0 max-lg:h-[62svh] max-lg:min-h-[380px]">
            <Board />
            {/* Stacked layout: the settings live below the board, so offer a way down to them. */}
            {selected && (
              <button
                onClick={() => {
                  useSim.getState().setTab('learn')
                  document.getElementById('side-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="absolute left-3 top-2.5 z-10 hidden cursor-pointer items-center gap-1.5 rounded-full border border-accent/50 bg-panel px-3 py-1.5 text-[13px] text-accent shadow-glow max-lg:flex"
              >
                <SlidersHorizontal size={14} aria-hidden /> Configure {selected}
              </button>
            )}
            {isStarter && !started && (
              <p className={cn('pointer-events-none absolute left-3 top-2.5 z-10 m-0 max-w-[60ch] text-[12.5px] text-muted max-lg:pr-12', selected && 'max-lg:hidden')}>
                <span className="font-mono text-accent">// </span>Starter design: fine on a whiteboard, fragile in production. Press Run to watch it, then improve it.
              </p>
            )}
            <Hud />
          </div>
        </div>
        <SidePanel />
      </div>
    </ReactFlowProvider>
  )
}
