import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { useSim } from '../../store/sim'

/** A connection that shows sampled requests travelling along it. */
export const FlowEdge = memo(function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style } = props
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const all = useSim((s) => s.particles)
  const mine = useMemo(() => all.filter((p) => p.edge === id), [all, id])
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
      {mine.length > 0 && (
        <EdgeLabelRenderer>
          {mine.map((p) => (
            <div key={p.id} className={`particle ${p.type}`} style={{ offsetPath: `path('${path}')` }} />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  )
})
