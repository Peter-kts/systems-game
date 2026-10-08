/**
 * Discrete-event queueing simulation of a design.
 *
 * Every component is a pool of identical servers (an M/M/c queue): requests
 * wait in line, get served for an exponentially distributed time, and are
 * dropped when the line is full or they waited too long. App server threads
 * stay busy while waiting on downstream calls, so a slow database backs up
 * into the app tier the way it does in real systems.
 *
 * Levels with a rate limiter add bot traffic: a few API keys sending far more
 * than their limit. Gateways check each request against token buckets kept
 * either in a shared counter store or in each instance's own memory.
 *
 * Levels that store rows (the URL shortener) also track where each new link's
 * short code came from, and count writes that land on a row someone else
 * already owns. A small sample of row activity is reported for display.
 */
import { CACHE_HIT } from '../game/catalog'
import type { ComponentType, Design } from '../game/types'
import { seeded } from './seeded'

/** R: read (or a legitimate API call), W: write, B: a request from an abusive bot. */
export type ReqType = 'R' | 'W' | 'B'
type Op = 'read' | 'write' | 'get' | 'set' | 'key' | 'incr' | 'log'
type Done = (ok: boolean) => void

interface Request {
  type: ReqType
  t0: number
  net: number
  viz: boolean
  /** Who sent it: 'u' is the crowd of ordinary users, 'b0', 'b1'… are bots' API keys. */
  key: string
  cdn?: boolean
  hit?: boolean
  /** Rejected by a rate limiter (HTTP 429). */
  limited?: boolean
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

interface CounterShard {
  rep: number
  p: Pool
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
  pool?: (op: Op, req: Request) => Pool
  svc?: (op: Op) => number
  /** `release` frees this node's thread early, for components that don't wait on downstream calls. */
  handle?: (req: Request, op: Op, done: Done, release: () => void) => void
  entry?: string
  alive?: number
  rep?: number
  warm?: number
  shards?: Shard[]
  counters?: CounterShard[]
  backlog?: number
  workers?: string[]
  p?: Pool
  /** Short codes an app server holds from the key generator. */
  keys?: number
  /** New links this database stored over another link's row. */
  overwrites?: number
}

export interface Bucket {
  r: number[]
  w: number[]
  rf: number
  wf: number
  hit: number
  look: number
  /** Legitimate reads rejected by a rate limiter (also counted in rf). */
  rl: number
  /** Bot requests sent, rejected by a limiter, and let through to the API servers. */
  b: number
  bl: number
  ba: number
  /** New links written over a row that already belonged to another link. */
  ow: number
}

/** How a new link gets its short code. */
export type CodeSource = 'hash' | 'random' | 'counter' | 'kgs'

/** One sampled thing that happened to a row, for the database view. */
export type RowEvent =
  | { db: string; kind: 'insert'; code: string; url: string; owner: string; via: CodeSource }
  | { db: string; kind: 'overwrite'; code: string; url: string; owner: string; via: CodeSource; prev: { url: string; owner: string } }
  | { db: string; kind: 'read' }

export interface SimOptions {
  readsPerSec: number
  writesPerSec: number
  /** Work per request on an app server, in ms. */
  appMs?: number
  /** App servers answer on their own (their database is part of their work). */
  appLeaf?: boolean
  /** Bot traffic while an attack is on: `keys` API keys each sending `perKey` requests/s. */
  bots?: { keys: number; perKey: number }
  /** Rate limit per API key, requests/s. */
  limit?: number
  /** Model short codes and rows (who owns which code). */
  rows?: boolean
  random?: () => number
  onHop?: (from: string, to: string, type: ReqType) => void
  onDrop?: (id: string) => void
  onRow?: (e: RowEvent) => void
}

export type ChaosKind = 'app' | 'db' | 'cache' | 'gateway' | 'counter'

/** Gateway settings, as stored in its config. */
export const ALGO = { tokenBucket: 0, fixedWindow: 1, slidingLog: 2 } as const
export const FAIL = { open: 0, closed: 1, local: 2 } as const

const READ_TIMEOUT = 2000
const WRITE_TIMEOUT = 6000
const CLIENT_RTT = 40
const CDN_RTT = 10
const HOP_MS = 0.5
/** Requests drawn as dots on the board, per second, by type. */
const VIZ_PER_SEC = { R: 36, W: 5, B: 24 }
const GATEWAY_MS = 1.5
/** A dead counter store with no replica is replaced by a new, empty node after this long. */
const COUNTER_RESTART_MS = 8000

/** App server setting: how it makes short codes when no key generator answers. */
export const CODES = { hash: 0, random: 1, counter: 2 } as const
/** Codes an app server takes from the key generator at a time. */
export const KEY_BATCH = 200
/** Share of new links whose long URL someone has already shortened (a viral video, a news story). */
const REPEAT_URL_SHARE = 0.05
/** How far an async replica trails its primary. */
const REPLICA_LAG_MS = 1000
/** Sampled new rows reported for display, per second. */
const ROWS_SHOWN_PER_SEC = 2

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const base62 = (n: number) => {
  let s = ''
  for (let i = 0; i < 7; i++) {
    s = BASE62[n % 62] + s
    n = Math.floor(n / 62)
  }
  return s
}
const hashCode = (url: string) => {
  let h = 2166136261
  for (const c of url) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return base62(h * 811 + url.length)
}
const POPULAR_URLS = [
  'youtube.com/watch?v=dQw4w9WgXcQ',
  'nytimes.com/2026/10/08/world/eclipse.html',
  'github.com/trending',
  'store.example.com/launch-day-sale',
  'docs.google.com/forms/d/e/1FAIpQ/signup',
]
const SITES = ['blog.example.com/post', 'shop.example.org/item', 'news.example.net/story', 'example.edu/papers', 'maps.example.com/place']
const PEOPLE = ['alice', 'bob', 'carol', 'dev', 'erin', 'farid', 'grace', 'hiro', 'ines', 'jamal', 'kim', 'lena']

interface Row {
  code: string
  url: string
  owner: string
}

type LimitState = { tokens: number; t: number; win: number; n: number; log: number[] }

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
  /** Whether the bots are attacking. */
  attack = false
  rt: Record<string, RuntimeNode> = {}
  /** Rate-limit state per scope (a counter store, or one gateway instance) and API key. */
  private limits = new Map<string, LimitState>()
  buckets: Bucket[] = []
  private heap = new EventHeap()
  private script: { t: number; run: () => void }[] = []
  private rand: () => number
  private design: Design
  private opts: SimOptions
  // Row bookkeeping, used when `rows` is on. Its own random stream keeps the queueing results unchanged.
  private rowRand = seeded(97)
  /** The database counter used for sequential codes. */
  private seq = 3 * 62 ** 6
  /** Counter codes handed out recently, oldest first, to know what a lagging replica will re-issue. */
  private issued: { t: number; row: Row }[] = []
  /** Codes a promoted replica will hand out again, with the link that already owns each. */
  private reissue = new Map<string, Row>()
  /** Who currently owns the hashed code of each popular URL. */
  private popularOwner = new Map<string, string>()

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
    this.limits.clear()
    this.at(0, this.arrival('R'))
    this.at(0, this.arrival('W'))
    this.at(0, this.arrival('B'))
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
    return (this.buckets[s] ??= { r: [], w: [], rf: 0, wf: 0, hit: 0, look: 0, rl: 0, b: 0, bl: 0, ba: 0, ow: 0 })
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
    return (
      r.down ||
      (r.type === 'sql' && !!r.shards && r.shards.every((s) => s.read.servers === 0)) ||
      (r.type === 'counter' && !!r.counters && r.counters.every((s) => s.p.servers === 0))
    )
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
    if (req.type === 'B' && r?.type === 'app') this.bucket(req.t0).ba++
    if (!r || r.down || !r.pool) {
      if (r) r.drops++
      if (req.viz) this.opts.onDrop?.(id)
      return cb(false)
    }
    const pool = r.pool(op, req)
    r.arrivals++
    const job: Job = {
      t: this.now,
      start: () =>
        this.at(this.expo(r.svc!(op)), () => {
          let held = true
          const release = () => {
            if (!held) return
            held = false
            this.leave(pool)
          }
          r.handle!(
            req,
            op,
            (ok) => {
              release()
              cb(ok)
            },
            release,
          )
        }),
      fail: () => {
        r.drops++
        if (req.viz) this.opts.onDrop?.(id)
        cb(false)
      },
    }
    if (!this.enter(pool, job)) job.fail()
  }

  private finish(req: Request, ok: boolean) {
    const b = this.bucket(req.t0)
    if (req.type === 'B') {
      b.b++
      if (req.limited) b.bl++
      return
    }
    const latency = this.now - req.t0 + req.net + (req.cdn ? CDN_RTT : CLIENT_RTT)
    if (latency > (req.type === 'R' ? READ_TIMEOUT : WRITE_TIMEOUT)) ok = false
    if (req.limited) {
      ok = false
      if (req.type === 'R') b.rl++
    }
    if (req.type === 'R') {
      if (ok) b.r.push(latency)
      else b.rf++
    } else if (ok) b.w.push(latency)
    else b.wf++
  }

  private rate(type: ReqType) {
    if (type === 'B') return this.attack && this.opts.bots ? this.opts.bots.keys * this.opts.bots.perKey : 0
    return (type === 'R' ? this.opts.readsPerSec : this.opts.writesPerSec) * this.multiplier
  }

  private spawn(type: ReqType, rate: number) {
    const key = type === 'B' ? `b${Math.floor(this.rand() * this.opts.bots!.keys)}` : 'u'
    const req: Request = { type, key, t0: this.now, net: 0, viz: this.rand() < VIZ_PER_SEC[type] / rate }
    const entry = this.rt.client?.entry
    if (!entry) return this.finish(req, false)
    this.visit('client', entry, req, type === 'W' ? 'write' : 'read', (ok) => this.finish(req, ok))
  }

  private arrival(type: ReqType) {
    const f = () => {
      const rate = this.rate(type)
      // Traffic that is switched off checks back every 100 ms.
      if (rate <= 0) return this.at(100, f)
      this.spawn(type, rate)
      this.at(this.expo(1000 / rate), f)
    }
    return f
  }

  // ---- rows ----

  /** A new link was stored in `db` with a code from `via`: counts overwrites and reports a sample. */
  private storeRow(db: string, via: CodeSource, req: Request) {
    const rr = this.rowRand
    const pick = <T,>(xs: T[]) => xs[Math.floor(rr() * xs.length)]
    let row: Row
    let prev: Row | undefined
    if (via === 'hash' && rr() < REPEAT_URL_SHARE) {
      // Same URL, same hash, same code: the row already belongs to whoever shortened it before.
      const url = pick(POPULAR_URLS)
      const code = hashCode(url)
      const before = this.popularOwner.get(code) ?? PEOPLE[code.charCodeAt(0) % PEOPLE.length]
      const owner = pick(PEOPLE.filter((p) => p !== before))
      prev = { code, url, owner: before }
      row = { code, url, owner }
      this.popularOwner.set(code, owner)
    } else {
      const url = `${pick(SITES)}/${Math.floor(rr() * 1e6)}`
      const code = via === 'hash' ? hashCode(url) : via === 'counter' ? base62(++this.seq) : base62(Math.floor(rr() * 62 ** 7))
      row = { code, url, owner: pick(PEOPLE) }
      if (via === 'counter') {
        prev = this.reissue.get(code)
        this.reissue.delete(code)
        this.issued.push({ t: this.now, row })
        if (this.issued.length > 2000) this.issued.splice(0, 1000)
      }
    }
    if (prev) {
      this.bucket(req.t0).ow++
      const r = this.rt[db]
      if (r) r.overwrites = (r.overwrites ?? 0) + 1
      this.opts.onRow?.({ db, kind: 'overwrite', ...row, via, prev: { url: prev.url, owner: prev.owner } })
    } else if (rr() < ROWS_SHOWN_PER_SEC / Math.max(1, this.rate('W'))) this.opts.onRow?.({ db, kind: 'insert', ...row, via })
  }

  /**
   * The copy of the database that takes over trails the one that died, so the counter in it
   * is behind: the codes handed out in that gap will be handed out again. Returns how many.
   */
  private rollbackCounter() {
    const since = this.now - REPLICA_LAG_MS
    const lost = this.issued.filter((x) => x.t > since)
    this.seq -= lost.length
    for (const x of lost) this.reissue.set(x.row.code, x.row)
    this.issued = this.issued.filter((x) => x.t <= since)
    return lost.length
  }

  // ---- rate limiting ----

  /** Whether `key` may make another request within its limit, as counted in `scope`. */
  private allow(scope: string, key: string, algo: number) {
    // Ordinary users are spread over a huge number of keys, each far below the limit.
    if (key === 'u') return true
    const limit = this.opts.limit ?? 50
    const id = `${scope}|${key}`
    let s = this.limits.get(id)
    if (!s) this.limits.set(id, (s = { tokens: limit, t: this.now, win: -1, n: 0, log: [] }))
    if (algo === ALGO.fixedWindow) {
      const win = Math.floor(this.now / 1000)
      if (win !== s.win) {
        s.win = win
        s.n = 0
      }
      return s.n++ < limit
    }
    if (algo === ALGO.slidingLog) {
      while (s.log.length && s.log[0] <= this.now - 1000) s.log.shift()
      if (s.log.length >= limit) return false
      s.log.push(this.now)
      return true
    }
    // Token bucket: holds up to `limit` tokens and refills at `limit` per second.
    s.tokens = Math.min(limit, s.tokens + ((this.now - s.t) * limit) / 1000)
    s.t = this.now
    if (s.tokens < 1) return false
    s.tokens--
    return true
  }

  private shardOf(key: string, n: number) {
    if (key === 'u') return Math.floor(this.rand() * n)
    let h = 0
    for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return h % n
  }

  /** Least-busy live target among `ids`, the way a load balancer picks. */
  private leastBusy(ids: string[]) {
    let best: string | undefined
    let bestLoad = Infinity
    for (const a of ids) {
      const x = this.rt[a]
      if (!x || x.down || !x.p) continue
      const load = (x.p.busy + queueLength(x.p)) / Math.max(1, x.p.servers)
      if (load < bestLoad) {
        bestLoad = load
        best = a
      }
    }
    return best
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
          r.entry = first('cdn') ?? first('lb') ?? first('gateway') ?? first('app')
          break
        case 'cdn': {
          const p = makePool(1e6)
          const next = first('lb') ?? first('gateway') ?? first('app')
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
          const targets = [...(out.gateway ?? []), ...(out.app ?? [])]
          r.pool = () => p
          r.svc = () => 0.1
          r.handle = (req, op, done) => {
            const best = this.leastBusy(targets)
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
          r.svc = () => this.opts.appMs ?? 3
          if (this.opts.appLeaf) {
            r.handle = leaf
            break
          }
          const cache = first('cache')
          const db = first('sql') ?? first('nosql')
          const kgs = first('kgs')
          const queue = first('queue')
          const codes = nd.cfg.codes ?? CODES.hash
          r.keys = 0
          r.handle = (req, _op, done) => {
            if (req.type === 'R') {
              if (queue) {
                const q = this.rt[queue]
                if (q && !q.down) q.backlog = (q.backlog ?? 0) + 1
              }
              const dbRead = () =>
                db
                  ? this.visit(r.id, db, req, 'read', (ok) => {
                      if (ok && req.viz && this.opts.rows) this.opts.onRow?.({ db, kind: 'read' })
                      done(ok)
                    })
                  : done(!!cache)
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
            const write = (via: CodeSource) => {
              const fin = (ok: boolean) => {
                if (ok && db && this.opts.rows) this.storeRow(db, via, req)
                if (ok || ++tries >= 5 || !db) return done(ok)
                this.at(1000, () => write(via))
              }
              if (db) this.visit(r.id, db, req, 'write', fin)
              else if (cache) this.visit(r.id, cache, req, 'set', fin)
              else done(false)
            }
            // Without a key service the app makes the code itself, which costs a database round trip
            // first: a hash or random code is checked for a clash, a counter fetches its next number.
            const own = () => {
              const via: CodeSource = codes === CODES.counter ? 'counter' : codes === CODES.random ? 'random' : 'hash'
              if (!db) return write(via)
              this.visit(r.id, db, req, 'read', (ok) => (ok ? write(via) : done(false)))
            }
            if (!kgs) return own()
            // Codes come from the key generator in batches and are kept in memory, so it is rarely called.
            if (r.keys! > 0) {
              r.keys!--
              return write('kgs')
            }
            this.visit(r.id, kgs, req, 'key', (ok) => {
              if (!ok) return own()
              r.keys! += KEY_BATCH - 1
              write('kgs')
            })
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
        case 'gateway': {
          r.alive = nd.cfg.inst
          r.p = makePool(r.alive * 16)
          r.pools = [r.p]
          r.pool = () => r.p!
          r.svc = () => GATEWAY_MS
          const backends = out.app ?? []
          const store = first('counter')
          const algo = nd.cfg.algo ?? ALGO.tokenBucket
          const fail = nd.cfg.fail ?? FAIL.open
          r.handle = (req, op, done, release) => {
            // The gateway's own work ends with the limit check; it doesn't hold a thread while the API works.
            const forward = () => {
              release()
              const best = this.leastBusy(backends)
              if (!best) return done(false)
              this.visit(r.id, best, req, op, done)
            }
            const reject = () => {
              req.limited = true
              done(true)
            }
            const decide = (scope: string) => (this.allow(scope, req.key, algo) ? forward() : reject())
            // Without shared counters, each instance only sees the share of a key's traffic it happens to get.
            const local = () => decide(`${r.id}#${Math.floor(this.rand() * Math.max(1, r.alive!))}`)
            if (!store) return local()
            this.visit(r.id, store, req, algo === ALGO.slidingLog ? 'log' : 'incr', (ok) => {
              if (ok) decide(store)
              else if (fail === FAIL.open) forward()
              else if (fail === FAIL.closed) reject()
              else local()
            })
          }
          break
        }
        case 'counter': {
          r.counters = Array.from({ length: nd.cfg.shards }, () => ({ rep: nd.cfg.rep, p: makePool(8) }))
          r.pools = r.counters.map((s) => s.p)
          r.pool = (_op, req) => r.counters![this.shardOf(req.key, r.counters!.length)].p
          // A sliding log is three commands per request: trim old timestamps, count, add.
          r.svc = (op) => (op === 'log' ? 0.45 : 0.15)
          r.handle = leaf
          break
        }
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

  /** Kills one instance of the biggest node of `type`. */
  private killInstance(type: 'app' | 'gateway', name: string, consequence: string) {
    let best: RuntimeNode | undefined
    for (const r of Object.values(this.rt))
      if (r.type === type && (r.alive ?? 0) > 0 && (!best || r.alive! > best.alive!)) best = r
    if (!best) return `No ${name} is running.`
    best.alive!--
    this.setServers(best.p!, best.alive! * 16)
    if (best.alive === 0) best.down = true
    return best.alive ? `An instance of the ${name} died. ${best.alive} left.` : `Your only ${name} instance died. ${consequence}`
  }

  /** Breaks part of the system and returns a sentence describing what happened. */
  chaos(kind: ChaosKind): string {
    if (kind === 'app') return this.killInstance('app', 'app server', 'Nothing can serve requests.')
    if (kind === 'gateway') return this.killInstance('gateway', 'gateway', 'Nothing can reach your API.')

    if (kind === 'counter') {
      const r = this.firstOf(['counter'])
      if (!r?.counters) return 'There is no counter store to break.'
      const s = r.counters.find((x) => x.p.servers > 0)
      if (!s) return 'The counter store is already down.'
      const idx = r.counters.indexOf(s)
      const n = r.counters.length
      this.setServers(s.p, 0)
      if (s.rep > 0) {
        this.at(1000, () => {
          s.rep--
          this.setServers(s.p, 8)
          this.at(10000, () => s.rep++)
        })
        return 'A counter store primary died. Its replica takes over in about 1 s with the counts intact. Meanwhile gateways do what their failure setting says.'
      }
      this.at(COUNTER_RESTART_MS, () => {
        // The replacement starts empty: every key on this shard gets a fresh allowance.
        for (const k of [...this.limits.keys()]) {
          const [scope, key] = k.split('|')
          if (scope === r.id && this.shardOf(key, n) === idx) this.limits.delete(k)
        }
        this.setServers(s.p, 8)
      })
      return `The counter store died with no replica. ${n > 1 ? 'Keys on that shard' : 'Limits'} can't be checked until a new, empty node starts in about ${COUNTER_RESTART_MS / 1000} s. Gateways do what their failure setting says.`
    }

    if (kind === 'db') {
      const r = this.databaseInUse()
      if (!r) return 'There is no database to break.'
      const counter = () => {
        const behind = this.rollbackCounter()
        return behind ? ` The copy that took over was ${behind} short codes behind, so the counter will hand those codes out again.` : ''
      }
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
        return `A NoSQL node died. The other ${r.alive} keep serving its keys from their copies; a replacement joins in 10 s.${counter()}`
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
      return `A database primary died. Replicas keep serving reads; writes fail until a replica is promoted (~3 s).${counter()}`
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
