/**
 * Discrete-event queueing simulation of a design.
 *
 * Every component is a pool of identical servers (an M/M/c queue): requests
 * wait in line, get served for an exponentially distributed time, and are
 * dropped when the line is full or they waited too long. App server threads
 * stay busy while waiting on downstream calls, so a slow database backs up
 * into the app tier the way it does in real systems.
 */
import { CACHE_HIT } from '../game/catalog'
import type { ComponentType, Design } from '../game/types'

export type ReqType = 'R' | 'W'
type Op = 'read' | 'write' | 'get' | 'set' | 'key'
type Done = (ok: boolean) => void

interface Request {
  type: ReqType
  t0: number
  net: number
  viz: boolean
  cdn?: boolean
  hit?: boolean
}

interface Job {
  t: number
  start: () => void
  fail: () => void
}

export interface Pool {
  servers: number
  busy: number
  q: Job[]
  qh: number
  maxQ: number
}

interface Shard {
  primary: boolean
  rep: number
  read: Pool
  write: Pool
}

export interface RuntimeNode {
  id: string
  type: ComponentType
  cfg: Record<string, number>
  out: Partial<Record<ComponentType, string[]>>
  arrivals: number
  drops: number
  down: boolean
  pools: Pool[]
  pool?: (op: Op) => Pool
  svc?: (op: Op) => number
  handle?: (req: Request, op: Op, done: Done) => void
  entry?: string
  alive?: number
  rep?: number
  warm?: number
  shards?: Shard[]
  backlog?: number
  workers?: string[]
  p?: Pool
}

export interface Bucket {
  r: number[]
  w: number[]
  rf: number
  wf: number
  hit: number
  look: number
}

export interface SimOptions {
  readsPerSec: number
  writesPerSec: number
  random?: () => number
  onHop?: (from: string, to: string, type: ReqType) => void
  onDrop?: (id: string) => void
}

export type ChaosKind = 'app' | 'db' | 'cache'

const READ_TIMEOUT = 2000
const WRITE_TIMEOUT = 6000
const CLIENT_RTT = 40
const CDN_RTT = 10
const HOP_MS = 0.5
/** Requests drawn as dots on the board, per second, by type. */
const VIZ_PER_SEC = { R: 36, W: 5 }

interface Event {
  t: number
  f: () => void
}

class EventHeap {
  private h: Event[] = []
  get size() {
    return this.h.length
  }
  peek() {
    return this.h[0]
  }
  clear() {
    this.h = []
  }
  push(e: Event) {
    const h = this.h
    h.push(e)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (h[p].t <= e.t) break
      h[i] = h[p]
      i = p
    }
    h[i] = e
  }
  pop(): Event {
    const h = this.h
    const top = h[0]
    const last = h.pop()!
    if (h.length) {
      let i = 0
      const n = h.length
      for (;;) {
        const l = 2 * i + 1
        if (l >= n) break
        const r = l + 1
        const m = r < n && h[r].t < h[l].t ? r : l
        if (h[m].t >= last.t) break
        h[i] = h[m]
        i = m
      }
      h[i] = last
    }
    return top
  }
}

export const queueLength = (p: Pool) => p.q.length - p.qh

function makePool(servers: number): Pool {
  return { servers, busy: 0, q: [], qh: 0, maxQ: Math.max(64, servers * 25) }
}

export class Simulation {
  now = 0
  multiplier = 1
  rt: Record<string, RuntimeNode> = {}
  buckets: Bucket[] = []
  private heap = new EventHeap()
  private script: { t: number; run: () => void }[] = []
  private rand: () => number
  private design: Design
  private opts: SimOptions

  constructor(design: Design, opts: SimOptions) {
    this.design = design
    this.opts = opts
    this.rand = opts.random ?? Math.random
    this.rebuild(design)
  }

  /** Rebuild runtime state for a (possibly edited) design, keeping the clock and metrics. */
  rebuild(design: Design) {
    this.design = design
    this.rt = this.buildRuntime()
    this.heap.clear()
    this.at(0, this.arrival('R'))
    this.at(0, this.arrival('W'))
    this.at(100, () => this.tick())
  }

  get hasEntry() {
    return !!this.rt.client?.entry
  }

  /** Schedule actions at absolute simulated times (ms). */
  setScript(script: { t: number; run: () => void }[]) {
    this.script = [...script].sort((a, b) => a.t - b.t)
  }

  /** Advance the simulation to time T (ms). Stops early if `shouldStop` returns true. */
  runUntil(T: number, shouldStop?: () => boolean) {
    while (this.heap.size && this.heap.peek().t <= T) {
      const e = this.heap.pop()
      this.now = e.t
      e.f()
      if (shouldStop?.()) return
    }
    this.now = T
  }

  bucket(t = this.now): Bucket {
    const s = Math.floor(t / 1000)
    return (this.buckets[s] ??= { r: [], w: [], rf: 0, wf: 0, hit: 0, look: 0 })
  }

  hitRate(r: RuntimeNode) {
    const warmth = Math.min(1, Math.max(0, (this.now - (r.warm ?? -1e9)) / 20000))
    return CACHE_HIT[r.cfg.size] * warmth
  }

  utilization(r: RuntimeNode) {
    let u = 0
    for (const p of r.pools) if (p.servers > 0) u = Math.max(u, Math.min(1, (p.busy + queueLength(p) * 0.05) / p.servers))
    return u
  }

  isDown(r: RuntimeNode) {
    return r.down || (r.type === 'sql' && !!r.shards && r.shards.every((s) => s.read.servers === 0))
  }

  // ---- scheduling ----

  private at(dt: number, f: () => void) {
    this.heap.push({ t: this.now + dt, f })
  }

  private expo(mean: number) {
    return -Math.log(1 - this.rand()) * mean
  }

  private enter(p: Pool, job: Job) {
    if (p.servers <= 0) return false
    if (p.busy < p.servers) {
      p.busy++
      job.start()
      return true
    }
    if (queueLength(p) < p.maxQ) {
      p.q.push(job)
      return true
    }
    return false
  }

  private leave(p: Pool) {
    p.busy--
    while (p.busy < p.servers && queueLength(p) > 0) {
      const j = p.q[p.qh++]
      if (p.qh > 2048) {
        p.q = p.q.slice(p.qh)
        p.qh = 0
      }
      if (this.now - j.t > READ_TIMEOUT) {
        j.fail()
        continue
      }
      p.busy++
      j.start()
    }
  }

  private setServers(p: Pool, s: number) {
    p.servers = Math.max(0, s)
    if (p.servers === 0) {
      const waiting = p.q.slice(p.qh)
      p.q = []
      p.qh = 0
      waiting.forEach((j) => j.fail())
    } else {
      // Start queued jobs that now have a free server.
      p.busy++
      this.leave(p)
    }
  }

  private visit(from: string, id: string, req: Request, op: Op, cb: Done) {
    const r = this.rt[id]
    req.net += HOP_MS
    if (req.viz) this.opts.onHop?.(from, id, req.type)
    if (!r || r.down || !r.pool) {
      if (r) r.drops++
      if (req.viz) this.opts.onDrop?.(id)
      return cb(false)
    }
    const pool = r.pool(op)
    r.arrivals++
    const job: Job = {
      t: this.now,
      start: () =>
        this.at(this.expo(r.svc!(op)), () =>
          r.handle!(req, op, (ok) => {
            this.leave(pool)
            cb(ok)
          }),
        ),
      fail: () => {
        r.drops++
        if (req.viz) this.opts.onDrop?.(id)
        cb(false)
      },
    }
    if (!this.enter(pool, job)) job.fail()
  }

  private finish(req: Request, ok: boolean) {
    const latency = this.now - req.t0 + req.net + (req.cdn ? CDN_RTT : CLIENT_RTT)
    if (latency > (req.type === 'R' ? READ_TIMEOUT : WRITE_TIMEOUT)) ok = false
    const b = this.bucket(req.t0)
    if (req.type === 'R') {
      if (ok) b.r.push(latency)
      else b.rf++
    } else if (ok) b.w.push(latency)
    else b.wf++
  }

  private rate(type: ReqType) {
    return (type === 'R' ? this.opts.readsPerSec : this.opts.writesPerSec) * this.multiplier
  }

  private spawn(type: ReqType) {
    const rate = this.rate(type)
    const req: Request = { type, t0: this.now, net: 0, viz: this.rand() < VIZ_PER_SEC[type] / rate }
    const entry = this.rt.client?.entry
    if (!entry) return this.finish(req, false)
    this.visit('client', entry, req, type === 'R' ? 'read' : 'write', (ok) => this.finish(req, ok))
  }

  private arrival(type: ReqType) {
    const f = () => {
      this.spawn(type)
      this.at(this.expo(1000 / this.rate(type)), f)
    }
    return f
  }

  private tick() {
    for (const q of Object.values(this.rt)) {
      if (q.type !== 'queue') continue
      let capacity = 0
      for (const w of q.workers ?? []) capacity += (this.rt[w]?.alive ?? 0) * 2000 * 0.1
      q.backlog = Math.max(0, (q.backlog ?? 0) - capacity)
    }
    while (this.script.length && this.script[0].t <= this.now) this.script.shift()!.run()
    this.at(100, () => this.tick())
  }

  // ---- runtime construction ----

  private buildRuntime(): Record<string, RuntimeNode> {
    const rt: Record<string, RuntimeNode> = {}
    const typeOf = (id: string) => this.design.nodes.find((n) => n.id === id)?.type
    for (const nd of this.design.nodes) {
      const out: RuntimeNode['out'] = {}
      for (const e of this.design.edges) {
        if (e.from !== nd.id) continue
        const t = typeOf(e.to)
        if (t) (out[t] ??= []).push(e.to)
      }
      const first = (t: ComponentType) => out[t]?.[0]
      const r: RuntimeNode = { id: nd.id, type: nd.type, cfg: { ...nd.cfg }, out, arrivals: 0, drops: 0, down: false, pools: [] }
      const leaf = (_req: Request, _op: Op, done: Done) => done(true)

      switch (nd.type) {
        case 'client':
          r.entry = first('cdn') ?? first('lb') ?? first('app')
          break
        case 'cdn': {
          const p = makePool(1e6)
          const next = first('lb') ?? first('app')
          r.pool = () => p
          r.svc = () => 0.2
          r.handle = (req, op, done) => {
            if (req.type === 'R' && this.rand() < 0.6) {
              req.cdn = true
              return done(true)
            }
            if (!next) return done(false)
            this.visit(r.id, next, req, op, done)
          }
          break
        }
        case 'lb': {
          const p = makePool(1e6)
          const apps = out.app ?? []
          r.pool = () => p
          r.svc = () => 0.1
          r.handle = (req, op, done) => {
            let best: string | undefined
            let bestLoad = Infinity
            for (const a of apps) {
              const x = this.rt[a]
              if (!x || x.down || !x.p) continue
              const load = (x.p.busy + queueLength(x.p)) / Math.max(1, x.p.servers)
              if (load < bestLoad) {
                bestLoad = load
                best = a
              }
            }
            if (!best) return done(false)
            this.visit(r.id, best, req, op, done)
          }
          break
        }
        case 'app': {
          r.alive = nd.cfg.inst
          r.p = makePool(r.alive * 16)
          r.pools = [r.p]
          r.pool = () => r.p!
          r.svc = () => 3
          const cache = first('cache')
          const db = first('sql') ?? first('nosql')
          const kgs = first('kgs')
          const queue = first('queue')
          r.handle = (req, _op, done) => {
            if (req.type === 'R') {
              if (queue) {
                const q = this.rt[queue]
                if (q && !q.down) q.backlog = (q.backlog ?? 0) + 1
              }
              const dbRead = () => (db ? this.visit(r.id, db, req, 'read', done) : done(!!cache))
              if (cache) {
                this.visit(r.id, cache, req, 'get', (ok) => {
                  const b = this.bucket()
                  b.look++
                  if (ok && req.hit) {
                    b.hit++
                    return done(true)
                  }
                  dbRead()
                })
              } else dbRead()
              return
            }
            // Writes retry for a few seconds so a database failover doesn't lose them.
            let tries = 0
            const write = () => {
              const fin = (ok: boolean) => {
                if (ok || ++tries >= 5 || !db) return done(ok)
                this.at(1000, write)
              }
              if (db) this.visit(r.id, db, req, 'write', fin)
              else if (cache) this.visit(r.id, cache, req, 'set', fin)
              else done(false)
            }
            // Without a key service, check the database for a collision first.
            const checkThenWrite = () => (db ? this.visit(r.id, db, req, 'read', (ok) => (ok ? write() : done(false))) : write())
            if (kgs) this.visit(r.id, kgs, req, 'key', (ok) => (ok ? write() : checkThenWrite()))
            else checkThenWrite()
          }
          break
        }
        case 'cache': {
          r.rep = nd.cfg.rep
          r.warm = -1e9
          r.p = makePool(8)
          r.pools = [r.p]
          r.pool = () => r.p!
          r.svc = () => 0.15
          r.handle = (req, op, done) => {
            if (op === 'get') req.hit = this.rand() < this.hitRate(r)
            done(true)
          }
          break
        }
        case 'sql': {
          r.shards = Array.from({ length: nd.cfg.shards }, () => ({
            primary: true,
            rep: nd.cfg.rep,
            read: makePool((1 + nd.cfg.rep) * 16),
            write: makePool(8),
          }))
          r.pools = r.shards.flatMap((s) => [s.read, s.write])
          r.pool = (op) => {
            const s = r.shards![Math.floor(this.rand() * r.shards!.length)]
            return op === 'write' ? s.write : s.read
          }
          r.svc = (op) => (op === 'write' ? 15 : 8)
          r.handle = leaf
          break
        }
        case 'nosql':
          r.alive = nd.cfg.n
          r.p = makePool(r.alive * 16)
          r.pools = [r.p]
          r.pool = () => r.p!
          r.svc = (op) => (op === 'write' ? 7 : 5)
          r.handle = leaf
          break
        case 'kgs':
          r.alive = nd.cfg.inst
          r.p = makePool(r.alive * 8)
          r.pools = [r.p]
          r.pool = () => r.p!
          r.svc = () => 0.5
          r.handle = leaf
          break
        case 'queue':
          r.backlog = 0
          r.workers = out.worker ?? []
          break
        case 'worker':
          r.alive = nd.cfg.inst
          break
      }
      rt[nd.id] = r
    }
    return rt
  }

  // ---- chaos ----

  private firstOf(types: ComponentType[]) {
    for (const n of this.design.nodes) if (types.includes(n.type) && this.rt[n.id]) return this.rt[n.id]
    return undefined
  }

  private databaseInUse() {
    for (const n of this.design.nodes) {
      if (n.type !== 'app') continue
      const r = this.rt[n.id]
      const d = r?.out.sql?.[0] ?? r?.out.nosql?.[0]
      if (d) return this.rt[d]
    }
    return this.firstOf(['sql', 'nosql'])
  }

  /** Breaks part of the system and returns a sentence describing what happened. */
  chaos(kind: ChaosKind): string {
    if (kind === 'app') {
      let best: RuntimeNode | undefined
      for (const r of Object.values(this.rt))
        if (r.type === 'app' && (r.alive ?? 0) > 0 && (!best || r.alive! > best.alive!)) best = r
      if (!best) return 'No app server is running.'
      best.alive!--
      this.setServers(best.p!, best.alive! * 16)
      if (best.alive === 0) best.down = true
      return best.alive
        ? `An app server instance died. ${best.alive} left.`
        : 'Your only app server instance died. Nothing can serve requests.'
    }

    if (kind === 'db') {
      const r = this.databaseInUse()
      if (!r) return 'There is no database to break.'
      if (r.type === 'nosql') {
        r.alive!--
        this.setServers(r.p!, r.alive! * 16)
        if (r.alive === 0) {
          r.down = true
          return 'Your only NoSQL node died. All data is unreachable.'
        }
        this.at(10000, () => {
          r.alive!++
          this.setServers(r.p!, r.alive! * 16)
        })
        return `A NoSQL node died. The other ${r.alive} keep serving its keys from their copies; a replacement joins in 10 s.`
      }
      const s = r.shards!.find((x) => x.primary)
      if (!s) return 'Every primary is already down.'
      s.primary = false
      this.setServers(s.write, 0)
      if (s.rep === 0) {
        this.setServers(s.read, 0)
        return r.shards!.length > 1
          ? `A shard's only machine died. 1 in ${r.shards!.length} links are now unreachable.`
          : 'Your only database machine died. Every link is unreachable.'
      }
      this.setServers(s.read, s.rep * 16)
      this.at(3000, () => {
        s.rep--
        s.primary = true
        this.setServers(s.write, 8)
        this.setServers(s.read, (1 + s.rep) * 16)
        this.at(10000, () => {
          s.rep++
          this.setServers(s.read, (1 + s.rep) * 16)
        })
      })
      return 'A database primary died. Replicas keep serving reads; writes fail until a replica is promoted (~3 s).'
    }

    const r = this.firstOf(['cache'])
    if (!r) return 'There is no cache to break.'
    if ((r.rep ?? 0) > 0) {
      r.down = true
      this.at(1000, () => {
        r.down = false
        r.rep!--
      })
      return 'A cache node died. Its replica takes over in about 1 s with the data still warm.'
    }
    r.down = true
    this.at(3000, () => {
      r.down = false
      r.warm = this.now
    })
    return 'The cache died with no replica. Every click hits the database until it restarts empty and warms up.'
  }
}
