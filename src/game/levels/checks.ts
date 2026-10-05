import { botRatio, percentile, readAvailability, writeAvailability } from '../../sim/metrics'
import { ms, pct } from '../../lib/utils'
import type { Check } from './types'

/** Read success and p99 latency, the checks every level grades. */
export function readChecks(label: string, availability: number, p99Ms: number): Check[] {
  return [
    {
      id: 'readOk',
      label: `${label} OK`,
      target: `≥ ${availability * 100}%`,
      measure: readAvailability,
      pass: (v) => v >= availability,
      format: pct,
    },
    {
      id: 'readP99',
      label: `${label} p99`,
      target: `≤ ${p99Ms} ms`,
      measure: (w) => percentile(w.reads, 0.99),
      pass: (v) => v <= p99Ms,
      format: ms,
    },
  ]
}

export function writeChecks(label: string, availability: number, p99Ms: number): Check[] {
  return [
    {
      id: 'writeOk',
      label: `${label} OK`,
      target: `≥ ${availability * 100}%`,
      measure: writeAvailability,
      pass: (v) => v >= availability,
      format: pct,
    },
    {
      id: 'writeP99',
      label: `${label} p99`,
      target: `≤ ${p99Ms / 1000} s`,
      measure: (w) => percentile(w.writes, 0.99),
      pass: (v) => v <= p99Ms,
      format: ms,
    },
  ]
}

/** Bots held to their limit: average allowed rate per bot key, as a multiple of the limit. */
export const botCheck: Check = {
  id: 'bots',
  label: 'Bots let through',
  target: '≤ 1.25× limit',
  measure: (w, ctx) => botRatio(w, ctx.seconds, ctx.botKeys, ctx.limit),
  pass: (v, phase) => v <= (phase.botTolerance ?? 1.25),
  format: (v) => (Number.isNaN(v) ? '–' : `${v < 10 ? v.toFixed(2) : Math.round(v)}×`),
  note: (phase) => (phase.botTolerance ? `≤ ${phase.botTolerance}× here` : undefined),
}
