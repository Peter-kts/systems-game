import { ComponentIcon } from '../../components/ComponentIcon'
import { CATALOG, PALETTE } from '../../game/catalog'
import { useGame } from '../../store/game'
import { useSim } from '../../store/sim'
import { DND_TYPE } from './Board'

export function Palette() {
  const addNode = useGame((s) => s.addNode)
  return (
    <aside aria-label="Components" className="flex min-h-0 flex-col gap-1.5 overflow-auto border-r border-line bg-panel p-3 max-lg:flex-row max-lg:border-b max-lg:border-r-0 max-lg:px-4">
      <h3 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted max-lg:hidden">Components</h3>
      {PALETTE.map((t) => (
        <button
          key={t}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_TYPE, t)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          onClick={() => {
            addNode(t)
            useSim.getState().setTab('learn')
          }}
          className="flex shrink-0 cursor-grab items-center gap-2.5 rounded-xl border border-line bg-node px-2.5 py-2 text-left hover:border-accent active:cursor-grabbing"
        >
          <ComponentIcon type={t} />
          <span className="grid leading-tight">
            <span>{CATALOG[t].name}</span>
            <small className="text-[11px] text-muted max-lg:hidden">{CATALOG[t].tag}</small>
          </span>
        </button>
      ))}
      <p className="mt-1.5 text-xs text-muted max-lg:hidden">
        Drag onto the board or click to add. Drag from a component's right-hand dot to another component to connect them.
      </p>
    </aside>
  )
}
