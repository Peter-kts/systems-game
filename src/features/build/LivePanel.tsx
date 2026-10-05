import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EVAL_SCRIPT, PHASES, TARGETS } from '../../game/levels/urlShortener'
import { useSim } from '../../store/sim'

const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false }

function Chart({
  title,
  dataKey,
  color,
  unit,
  target,
  domain,
  format,
  tick,
}: {
  title: string
  dataKey: 'reads' | 'success' | 'readP99'
  color: string
  unit: string
  target?: number
  domain?: [number | string, number | string]
  format?: (v: number) => string
  tick?: (v: number) => string
}) {
  const series = useSim((s) => s.series)
  const graded = useSim((s) => s.evalMode || s.phaseResults.some((r) => r !== null))
  const data = series.map((s) => ({ ...s, success: Number.isNaN(s.success) ? null : s.success * 100, readP99: Number.isNaN(s.readP99) ? null : s.readP99 }))
  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex justify-between text-[12.5px]">
        <b className="font-semibold">{title}</b>
        {target !== undefined && <span className="text-muted">target {format ? format(target) : target}{unit}</span>}
      </figcaption>
      <div className="h-28">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            {graded &&
              PHASES.map((p, i) => (
                <ReferenceArea key={p.name} x1={p.from} x2={p.to} fill={i % 2 ? 'var(--soft)' : 'transparent'} fillOpacity={0.6} />
              ))}
            {graded && [EVAL_SCRIPT.killDatabase, EVAL_SCRIPT.killCache].map((t) => <ReferenceLine key={t} x={t} stroke="var(--bad)" strokeDasharray="3 3" />)}
            <XAxis dataKey="t" type="number" allowDecimals={false} domain={graded ? [0, EVAL_SCRIPT.end] : ['dataMin', 'dataMax']} {...axis} tickFormatter={(v) => `${v}s`} />
            <YAxis domain={domain ?? [0, 'auto']} {...axis} width={46} allowDecimals={false} tickFormatter={tick ?? format} />
            {target !== undefined && <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" />}
            <Tooltip
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(v) => `${v} s`}
              formatter={(v) => [`${typeof v === 'number' ? (format ? format(v) : Math.round(v)) : v}${unit}`, title]}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export function LivePanel() {
  const n = useSim((s) => s.series.length)
  if (!n)
    return (
      <p className="m-0 text-muted">
        Press <b>Run</b> or <b>Run evaluation</b>. Charts of traffic, success rate and latency appear here, one point per simulated second.
      </p>
    )
  return (
    <div className="grid gap-4">
      <Chart title="Clicks per second" dataKey="reads" color="var(--read)" unit="" format={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
      <Chart title="Success rate" dataKey="success" color="var(--ok)" unit="%" target={TARGETS.readAvailability * 100} domain={[0, 100]} format={(v) => v.toFixed(v > 99 ? 1 : 0)} tick={(v) => String(Math.round(v))} />
      <Chart title="Click latency, p99" dataKey="readP99" color="var(--write)" unit=" ms" target={TARGETS.readP99Ms} />
      <p className="m-0 text-xs text-muted">Shaded bands are the evaluation scenarios; dashed red lines mark the moments a machine is killed.</p>
    </div>
  )
}
