import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { ComponentIcon } from '../../components/ComponentIcon'
import { HUE } from '../../components/hues'
import { ALLOW, CATALOG } from '../../game/catalog'
import { cn, fmt } from '../../lib/utils'
import { useGame } from '../../store/game'
import { useSim } from '../../store/sim'

export const ComponentNode = memo(function ComponentNode({ id }: NodeProps) {
  const node = useGame((s) => s.design.nodes.find((n) => n.id === id))
  const stats = useSim((s) => s.nodes[id])
  const flashing = useSim((s) => !!s.flashing[id])
  if (!node) return null
  const spec = CATALOG[node.type]
  const count = spec.count(node.cfg)
  const live = !!stats && stats.state !== 'idle'
  return (
    <div className={cn('sd-node', flashing && 'flash')} data-state={stats?.state ?? 'idle'} style={{ '--hue': HUE[node.type] } as CSSProperties}>
      {count > 2 && <div className="stack s2" />}
      {count > 1 && <div className="stack s1" />}
      <div className="body px-3 pb-2.5 pt-3">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
          <div className="scan" />
        </div>
        {node.type !== 'client' && <Handle type="target" position={Position.Left} />}
        <div className="relative flex items-center gap-2.5">
          <span className="icon-tile grid size-9 shrink-0 place-items-center rounded-[10px]">
            <ComponentIcon type={node.type} size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[14px] font-semibold leading-tight">{spec.name}</div>
            <div className="truncate font-mono text-[10.5px] text-muted">{spec.sub(node.cfg)}</div>
          </div>
          {count > 1 && <span className="rounded-md border border-line2 px-1.5 font-mono text-[10.5px] text-muted">×{count}</span>}
        </div>
        {node.type !== 'client' && (
          <div className="relative mt-2.5">
            <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-wider">
              <span className="text-muted">{live ? `${fmt(stats.rate)}/s` : 'idle'}</span>
              {stats?.badge && <span className="badge">{stats.badge}</span>}
            </div>
            <div className="gauge h-1 overflow-hidden rounded-full">
              <div className="util h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round((stats?.util ?? 0) * 100)}%` }} />
            </div>
          </div>
        )}
        {ALLOW[node.type].length > 0 && <Handle type="source" position={Position.Right} />}
      </div>
    </div>
  )
})
