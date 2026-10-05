import { CACHE_HIT, CATALOG } from './catalog'
import { LEVEL } from './levels/urlShortener'
import type { ComponentType, Design, Rule, RuleLevel, Scope } from './types'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const STORAGE_TB = 3
const TB_PER_MACHINE = 2

export const totalCost = (d: Design) => d.nodes.reduce((s, n) => s + CATALOG[n.type].cost(n.cfg), 0)

/** Rule checks a senior interviewer would apply, worst first. */
export function review(d: Design, analytics: Scope = 'nice'): Rule[] {
  const out: Rule[] = []
  const add = (lvl: RuleLevel, title: string, detail = '') => out.push({ lvl, title, detail })
  const byId = (id: string) => d.nodes.find((n) => n.id === id)
  const typeOf = (id: string) => byId(id)?.type
  const kids = (id: string) => d.edges.filter((e) => e.from === id).map((e) => e.to)

  const reachable = new Set(['client'])
  const stack = ['client']
  while (stack.length) for (const k of kids(stack.pop()!)) if (!reachable.has(k)) { reachable.add(k); stack.push(k) }
  const live = d.nodes.filter((n) => reachable.has(n.id))
  const ofType = (t: ComponentType) => live.filter((n) => n.type === t)

  const apps = ofType('app')
  const appInstances = apps.reduce((s, n) => s + n.cfg.inst, 0)
  const appKids = (t: ComponentType) => [...new Set(apps.flatMap((a) => kids(a.id)).filter((k) => typeOf(k) === t))].map((k) => byId(k)!)

  if (!apps.length) add('fail', "Users can't reach an app server", 'Draw a path from Users to an App server, for example Users → Load balancer → App server.')

  const direct = kids('client').filter((k) => typeOf(k) === 'app')
  if (direct.length && (appInstances > 1 || direct.length > 1))
    add('fail', 'Users are wired straight to app servers', 'Users only know one address. Without a load balancer, one server gets all the traffic and nothing routes around failures.')
  else if (ofType('lb').length && apps.length) add('pass', 'A load balancer spreads the traffic', 'It also stops sending requests to dead instances.')

  if (apps.length && appInstances === 1)
    add('fail', 'One app server is a single point of failure', 'If that machine dies, every link breaks. Run at least 2 instances, and enough to survive the 5× spike.')

  const dbs = [...appKids('sql'), ...appKids('nosql')]
  if (apps.length && !dbs.length) {
    if (appKids('cache').length) add('fail', 'Your only storage is a cache', 'Caches live in memory and evict old entries, but links must survive 5 years. Add a database.')
    else add('fail', 'Links have nowhere to live', 'Connect your app servers to a SQL database or NoSQL store.')
  }
  for (const db of dbs) {
    const capacity = db.type === 'sql' ? db.cfg.shards * TB_PER_MACHINE : (db.cfg.n * TB_PER_MACHINE) / Math.min(3, db.cfg.n)
    if (capacity < STORAGE_TB)
      add('fail', `Not enough disk: ${capacity.toFixed(1)} TB for ${STORAGE_TB} TB of links`,
        db.type === 'sql'
          ? 'Each SQL machine holds 2 TB, and replicas hold copies, not extra data. Add shards: 2 shards gives 4 TB.'
          : 'Usable space is nodes × 2 TB ÷ 3 copies. 5 nodes gives about 3.3 TB.')
    else
      add('pass', `Storage fits: ${capacity.toFixed(1)} TB usable for ${STORAGE_TB} TB`,
        db.type === 'sql' ? 'Sharded by short code, so each lookup goes to exactly one shard.' : 'Keys are hashed across nodes, so data spreads evenly.')
    if (db.type === 'sql' && db.cfg.rep === 0)
      add('fail', 'Database machines have no replicas', 'When a primary dies, its links are unreachable until someone repairs it. Add at least one replica per shard.')
    else if (db.type === 'nosql' && db.cfg.n < 3)
      add('fail', 'Fewer than 3 NoSQL nodes', 'With 3 copies of each key you need at least 3 nodes, or one failure can lose data.')
    else
      add('pass', 'Data survives a machine failure',
        db.type === 'sql' ? 'Replicas take over reads immediately and one is promoted to primary.' : 'Each key has copies on other nodes.')
  }
  if (dbs.length > 1) add('info', 'Two databases connected', "App servers use the first one they're connected to. One store is enough for this problem.")

  const caches = appKids('cache')
  if (apps.length && !caches.length)
    add('warn', 'No cache on a 100:1 read-heavy workload', 'Every click goes to the database. A cache in front absorbs most reads in under a millisecond.')
  for (const c of caches) {
    const hit = Math.round(CACHE_HIT[c.cfg.size] * 100)
    if (c.cfg.size < 128) add('warn', `Cache is smaller than the hot set (${c.cfg.size} GB vs ~120 GB)`, `Hit rate is ${hit}%. Misses go to the database.`)
    else add('pass', 'Cache fits the hot links', `${hit}% of clicks are answered from memory.`)
    if (c.cfg.rep === 0) add('warn', 'Cache has no replica', 'If the cache node dies, all reads hit the database at once and the cache comes back empty.')
  }

  const kgs = appKids('kgs')
  if (apps.length && !kgs.length)
    add('info', 'No key generator', 'Each new link hashes the URL and checks the database for a collision first: one extra read per write. Fine at 40 writes/s, but be ready to discuss it.')
  else if (kgs.some((k) => k.cfg.inst === 1))
    add('warn', 'One key generator is a single point of failure', "App servers fall back to hashing if it dies, but say how you'd run two that never hand out the same code.")
  else if (kgs.length) add('pass', 'Short codes come from a key service', "No collision checks on write, and codes can be random so they aren't guessable.")

  if (ofType('cdn').length) {
    if (analytics !== 'out')
      add('warn', 'A CDN hides clicks from your analytics', "Redirects answered at the edge never reach your servers. Use 302 redirects with a short cache time, or collect the CDN's logs.")
    else add('pass', 'The CDN takes popular redirects off your servers', 'Clicks are answered at the edge in ~10 ms.')
  }

  const queues = ofType('queue')
  if (analytics === 'must' && !queues.length)
    add('warn', 'Click analytics have no pipeline', 'You marked analytics a must. Publish click events to a queue and count them with workers so redirects stay fast.')
  for (const q of queues) {
    if (!kids(q.id).some((k) => typeOf(k) === 'worker')) add('fail', 'The queue has no consumer', 'Messages pile up forever. Connect a Worker.')
    else if (analytics === 'out') add('warn', 'You built analytics you scoped out', 'The queue and workers cost money for a feature you excluded.')
    else add('pass', 'Clicks are logged asynchronously', 'Redirects publish an event and return immediately; workers count them later.')
  }

  const unused = d.nodes.filter((n) => n.id !== 'client' && !reachable.has(n.id))
  if (unused.length)
    add('warn', 'Unconnected components',
      `${unused.map((n) => CATALOG[n.type].name).join(', ')} ${unused.length > 1 ? "aren't" : "isn't"} reachable from Users but still cost money.`)

  const cost = totalCost(d)
  if (cost > LEVEL.budget)
    add('fail', `Over budget: $${fmt(cost)} of $${fmt(LEVEL.budget)} a month`, 'Look for oversized pieces. A cache is usually far cheaper than more database machines.')
  else add('pass', `Within budget: $${fmt(cost)} of $${fmt(LEVEL.budget)} a month`)

  const order: Record<RuleLevel, number> = { fail: 0, warn: 1, info: 2, pass: 3 }
  return out.sort((a, b) => order[a.lvl] - order[b.lvl])
}
