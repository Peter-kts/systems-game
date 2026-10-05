import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { ComponentIcon } from '../../components/ComponentIcon'
import { ALLOW, CATALOG } from '../../game/catalog'
import { cn } from '../../lib/utils'
import { useGame } from '../../store/game'
import { useSim } from '../../store/sim'

export const ComponentNode = memo(function ComponentNode({ id }: NodeProps) {
  const node = useGame((s) => s.design.nodes.find((n) => n.id === id))
  const stats = useSim((s) => s.nodes[id])
  const flashing = useSim((s) => !!s.flashing[id])
  if (!node) return null
  const spec = CATALOG[node.type]
  const count = spec.count(node.cfg)
  return (
    <div className={cn('sd-node', flashing && 'flash')} data-state={stats?.state ?? 'idle'}>
      {count > 2 && <div className="stack s2" />}
      {count > 1 && <div className="stack s1" />}
      <div className="body flex items-center gap-2.5 px-3 pb-3 pt-2.5">
        {node.type !== 'client' && <Handle type="target" position={Position.Left} />}
        <ComponentIcon type={node.type} size={22} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold leading-tight">{spec.name}</div>
          <div className="truncate font-mono text-[11px] text-muted">{spec.sub(node.cfg)}</div>
        </div>
        {stats?.badge && <span className="badge absolute right-2.5 top-1 font-mono text-[10.5px] text-muted">{stats.badge}</span>}
        <div className="absolute inset-x-3 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-line">
          <div className="util h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round((stats?.util ?? 0) * 100)}%` }} />
        </div>
        {ALLOW[node.type].length > 0 && <Handle type="source" position={Position.Right} />}
      </div>
    </div>
  )
})
