import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import type { ComponentType } from '../../game/types'
import { useGame } from '../../store/game'
import { useSim } from '../../store/sim'
import { ComponentNode } from './ComponentNode'
import { FlowEdge } from './FlowEdge'

const nodeTypes = { component: ComponentNode }
const edgeTypes = { flow: FlowEdge }
export const DND_TYPE = 'application/x-system-component'

export function Board() {
  const design = useGame((s) => s.design)
  const selection = useGame((s) => s.selection)
  const running = useSim((s) => s.running)
  const { moveNode, removeNode, addEdge, removeEdge, select, addNode } = useGame.getState()
  const { screenToFlowPosition, fitView } = useReactFlow()

  // Re-frame the board when a different design is loaded (e.g. the reference design).
  const loadedKey = design.nodes.some((n) => n.id === 'r1') ? 'reference' : 'mine'
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
    return () => clearTimeout(t)
  }, [loadedKey, fitView])

  // React Flow reports each node's measured size; keep it so derived nodes stay visible.
  const [measured, setMeasured] = useState<Record<string, Node['measured']>>({})
  const nodes = useMemo<Node[]>(
    () =>
      design.nodes.map((n) => ({
        id: n.id,
        type: 'component',
        position: { x: n.x, y: n.y },
        data: {},
        measured: measured[n.id],
        deletable: n.id !== 'client',
        selected: selection?.kind === 'node' && selection.id === n.id,
      })),
    [design.nodes, selection, measured],
  )

  const edges = useMemo<Edge[]>(
    () =>
      design.edges.map((e) => ({
        id: `${e.from}>${e.to}`,
        source: e.from,
        target: e.to,
        type: 'flow',
        className: running ? 'live' : undefined,
        selected: selection?.kind === 'edge' && selection.from === e.from && selection.to === e.to,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: running ? 'var(--accent)' : 'var(--line2)' },
      })),
    [design.edges, selection, running],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) {
          const size = c.dimensions
          setMeasured((m) => ({ ...m, [c.id]: size }))
        } else if (c.type === 'position' && c.position) moveNode(c.id, c.position.x, c.position.y)
        else if (c.type === 'remove') {
          const why = removeNode(c.id)
          if (why) toast(why)
        } else if (c.type === 'select' && c.selected) select({ kind: 'node', id: c.id })
      }
    },
    [moveNode, removeNode, select],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const c of changes) {
        if (c.type !== 'remove' && c.type !== 'select') continue
        const [from, to] = c.id.split('>')
        if (c.type === 'remove') removeEdge(from, to)
        else if (c.selected) select({ kind: 'edge', from, to })
      }
    },
    [removeEdge, select],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      const why = addEdge(c.source, c.target)
      if (why) toast("That connection doesn't work", { description: why, duration: 6000 })
      else useSim.getState().setTab('learn')
    },
    [addEdge],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData(DND_TYPE) as ComponentType
      if (!type) return
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(type, { x: p.x - 95, y: p.y - 30 })
      useSim.getState().setTab('learn')
    },
    [screenToFlowPosition, addNode],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={() => select(null)}
      onNodeClick={() => useSim.getState().setTab('learn')}
      onEdgeClick={() => useSim.getState().setTab('learn')}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={onDrop}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.3}
      maxZoom={1.75}
      snapToGrid
      snapGrid={[10, 10]}
      deleteKeyCode={['Backspace', 'Delete']}
      proOptions={{ hideAttribution: true }}
      className="board-bg"
      aria-label="Design board"
    >
      <Background variant={BackgroundVariant.Lines} gap={28} lineWidth={1} color="var(--grid)" />
      <Background id="major" variant={BackgroundVariant.Lines} gap={140} lineWidth={1} color="var(--line2)" style={{ opacity: 0.4 }} />
      <Controls showInteractive={false} position="top-right" />
      {design.nodes.length > 5 && <MiniMap pannable zoomable position="bottom-right" style={{ width: 150, height: 96 }} className="!mb-20 max-sm:hidden"
          maskColor="color-mix(in srgb, var(--bg) 75%, transparent)"
          nodeColor="var(--line2)" />}
    </ReactFlow>
  )
}
