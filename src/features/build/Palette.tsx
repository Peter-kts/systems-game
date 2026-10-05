import type { CSSProperties } from 'react'
import { ComponentIcon } from '../../components/ComponentIcon'
import { HUE } from '../../components/hues'
import { CATALOG } from '../../game/catalog'
import { useGame, useLevel } from '../../store/game'
import { useSim } from '../../store/sim'
import { DND_TYPE } from './Board'

export function Palette() {
  const addNode = useGame((s) => s.addNode)
  const level = useLevel()
  return (
    <aside aria-label="Components" className="flex min-h-0 flex-col gap-1.5 overflow-auto border-r border-line bg-glass p-3 backdrop-blur-md max-lg:flex-row max-lg:border-b max-lg:border-r-0 max-lg:px-4">
      <h3 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted max-lg:hidden">Components</h3>
      {level.palette.map((t) => (
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
          style={{ '--hue': HUE[t] } as CSSProperties}
          className="group flex shrink-0 cursor-grab items-center gap-2.5 rounded-xl border border-line bg-node px-2 py-1.5 text-left transition-[border-color,box-shadow] hover:border-[var(--hue)] hover:shadow-[0_0_16px_-6px_var(--hue)] active:cursor-grabbing"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--hue)_35%,transparent)] bg-[color-mix(in_srgb,var(--hue)_10%,transparent)]">
            <ComponentIcon type={t} size={17} />
          </span>
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
