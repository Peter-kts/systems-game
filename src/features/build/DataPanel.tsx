import { motion, useReducedMotion } from 'motion/react'
import type { CodeSource } from '../../sim/engine'
import { cn, fmt } from '../../lib/utils'
import { useSim, type RowView } from '../../store/sim'

const VIA: Record<CodeSource, string> = { hash: 'hash', random: 'random', counter: 'counter', kgs: 'key gen' }
const FLASH: Record<RowView['last'], string> = { new: 'var(--ok)', read: 'var(--read)', over: 'var(--bad)' }

function Row({ row }: { row: RowView }) {
  const over = !!row.prev
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('relative grid grid-cols-[minmax(0,1fr)_4rem_2.6rem] items-start gap-x-2 overflow-hidden rounded-md px-2 py-1 font-mono text-[11px]', over && 'bg-bad-soft')}
    >
      <span key={row.at} className="db-flash pointer-events-none absolute inset-0" style={{ background: FLASH[row.last] }} />
      <span className="relative grid min-w-0">
        <span className="flex items-baseline gap-1.5">
          <b className={cn('font-medium', over ? 'text-bad' : 'text-ink')}>{row.code}</b>
          <small className="text-[9.5px] text-muted">{VIA[row.via]}</small>
        </span>
        {row.prev && row.prev.url !== row.url && <s className="truncate text-muted">{row.prev.url}</s>}
        <span className="truncate text-muted">{row.url}</span>
      </span>
      <span className="relative grid min-w-0">
        {row.prev && <s className="truncate text-muted">{row.prev.owner}</s>}
        <span className={cn('truncate', over && 'text-bad')}>{row.owner}</span>
      </span>
      <span className="relative text-right tabular-nums text-muted">{row.reads}</span>
    </motion.div>
  )
}

/** A live sample of the rows in one database: new links, clicks, and links written over. */
export function DataPanel({ id }: { id: string }) {
  const rows = useSim((s) => s.rows[id])
  const overwrites = useSim((s) => s.nodes[id]?.overwrites ?? 0)
  const started = useSim((s) => s.simTime > 0)
  const reduced = useReducedMotion()
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Inside the database</h3>
        {started && (
          <span className={cn('rounded-md px-1.5 font-mono text-[11px]', overwrites ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok')}>
            {fmt(overwrites)} overwritten
          </span>
        )}
      </div>
      <div className={cn('grid gap-0.5 rounded-xl border border-line bg-bg p-1.5', reduced && '[&_.db-flash]:hidden')}>
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_2.6rem] gap-x-2 px-2 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          <span>Code · long URL</span>
          <span>Owner</span>
          <span className="text-right">Clicks</span>
        </div>
        {rows?.length ? (
          rows.map((r) => <Row key={r.code} row={r} />)
        ) : (
          <p className="m-0 px-2 py-3 text-[12.5px] text-muted">
            {started ? 'Waiting for new links to reach this database…' : 'Press Run to watch new links being written here.'}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[11.5px] text-muted">
        <span><i className="mr-1 inline-block size-2 rounded-full bg-ok align-middle" />new link</span>
        <span><i className="mr-1 inline-block size-2 rounded-full bg-read align-middle" />a click read it</span>
        <span><i className="mr-1 inline-block size-2 rounded-full bg-bad align-middle" />written over another link</span>
      </div>
      <p className="m-0 text-[12px] text-muted">
        A small sample of billions of rows. Each row's code is its primary key, so a new link with a code that's already taken replaces the
        row that was there: the earlier owner's link is gone.
      </p>
    </section>
  )
}
