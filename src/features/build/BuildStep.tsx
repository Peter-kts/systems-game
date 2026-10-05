import { ReactFlowProvider } from '@xyflow/react'
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
  return (
    <ReactFlowProvider>
      <div className="grid h-full min-h-0 grid-cols-[200px_minmax(0,1fr)_360px] max-lg:h-auto max-lg:grid-cols-1">
        <Palette />
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr]">
          <SimBar />
          <div className="relative min-h-0 max-lg:h-[480px]">
            <Board />
            {isStarter && !started && (
              <p className="pointer-events-none absolute left-3 top-2.5 z-10 m-0 max-w-[60ch] text-[12.5px] text-muted">
                Starter design: fine on a whiteboard, fragile in production. Press Run to watch it, then improve it.
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
