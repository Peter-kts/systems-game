import type { ComponentType, Config } from './types'

export interface NumberField {
  kind: 'number'
  key: string
  label: string
  min: number
  max: number
  def: number
}

export interface ChoiceField {
  kind: 'choice'
  key: string
  label: string
  options: number[]
  unit: string
  def: number
}

export type ConfigField = NumberField | ChoiceField

export interface ComponentSpec {
  name: string
  tag: string
  fixed?: boolean
  fields: ConfigField[]
  cost: (c: Config) => number
  /** How many machines this component represents (drawn as a stack). */
  count: (c: Config) => number
  sub: (c: Config) => string
  what: string
  when: string
  watch: string
  nums: string
  here: string
}

export const CACHE_HIT: Record<number, number> = { 32: 0.75, 64: 0.85, 128: 0.92, 256: 0.95 }
export const CACHE_COST: Record<number, number> = { 32: 100, 64: 180, 128: 330, 256: 600 }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const CATALOG: Record<ComponentType, ComponentSpec> = {
  client: {
    name: 'Users',
    tag: 'Where requests come from',
    fixed: true,
    fields: [],
    cost: () => 0,
    count: () => 1,
    sub: () => 'clicks + new links',
    what: 'Browsers and phone apps. They create short links (writes) and click them (reads). Arrows on the board show which way requests travel.',
    when: 'Always the starting point of a design.',
    watch: 'Users are far from your servers. Each internet round trip costs about 40 ms in this game, or about 10 ms if a nearby CDN edge answers.',
    nums: 'Normal day: ~4,000 clicks/s and ~40 new links/s. Viral moments: 5× that.',
    here: 'Connect Users to whatever receives traffic first: a CDN, a load balancer, or (for a toy design) a single app server.',
  },
  cdn: {
    name: 'CDN',
    tag: 'Edge cache near users',
    fields: [],
    cost: () => 150,
    count: () => 1,
    sub: () => 'answers ~60% of clicks',
    what: 'A network of edge servers around the world that keep copies of responses close to users. A cached redirect is answered at the edge and never reaches your servers.',
    when: 'Static files, images, video, and any response many users ask for. For a shortener, popular redirects can be cached at the edge.',
    watch: "If the edge serves a cached 301 (permanent) redirect, your servers never see the click, so click analytics break. Teams use 302 redirects with a short cache time, or collect the CDN's logs. Writes always pass through.",
    nums: 'Edge round trip ~10 ms vs ~40 ms to your data center. About 60% of clicks hit the edge here. $150/month.',
    here: 'Optional. It removes a lot of load from your servers, but it conflicts with click tracking.',
  },
  lb: {
    name: 'Load balancer',
    tag: 'Spreads traffic',
    fields: [],
    cost: () => 25,
    count: () => 1,
    sub: () => 'managed · least busy',
    what: 'One public address that spreads incoming requests across many app servers and stops sending to servers that fail health checks.',
    when: 'As soon as you have more than one app server, which in production is always.',
    watch: 'A load balancer can itself be a single point of failure. Cloud load balancers like this one are managed and replicated for you; say so in the interview. Common algorithms: round robin, least connections, consistent hashing.',
    nums: 'Hundreds of thousands of requests/s, adds under 1 ms. $25/month.',
    here: 'Put it between Users (or the CDN) and your app servers. This one sends each request to the least busy app server.',
  },
  app: {
    name: 'App server',
    tag: 'Runs your code',
    fields: [{ kind: 'number', key: 'inst', label: 'Instances', min: 1, max: 12, def: 2 }],
    cost: (c) => 60 * c.inst,
    count: (c) => c.inst,
    sub: (c) => plural(c.inst, 'instance'),
    what: 'Runs your code: validates input, gets a short code, talks to the cache and database, and returns the redirect. Each instance has 16 worker threads, and a thread stays busy while it waits on the cache or database.',
    when: 'Every design needs one. Keep app servers stateless (nothing stored on the machine) so you can add or remove instances freely.',
    watch: 'If the database slows down, threads pile up waiting, the app runs out of threads, and requests fail even though the app itself is fine. That is a cascading failure. A single instance is a single point of failure.',
    nums: '~3 ms of work per request. One instance handles roughly 3,000–4,000 requests/s here. $60/month each.',
    here: 'Size for the 5× spike, not the average. Connect it to a cache, a database and, optionally, a key generator.',
  },
  cache: {
    name: 'Cache',
    tag: 'In-memory, Redis',
    fields: [
      { kind: 'choice', key: 'size', label: 'Memory', options: [32, 64, 128, 256], unit: 'GB', def: 64 },
      { kind: 'number', key: 'rep', label: 'Replicas', min: 0, max: 2, def: 0 },
    ],
    cost: (c) => CACHE_COST[c.size] * (1 + c.rep),
    count: (c) => 1 + c.rep,
    sub: (c) => `${c.size} GB · ${plural(c.rep, 'replica')}`,
    what: 'An in-memory key-value store. The app checks the cache first. On a hit it answers in under a millisecond; on a miss it reads the database and stores the answer for next time. This pattern is called cache-aside.',
    when: 'Read-heavy workloads where the same items are read again and again. Redirects are a perfect fit.',
    watch: 'Hit rate depends on memory: too small and popular links get evicted (LRU). If a cache node dies with no replica, every request falls through to the database at once. A restarted cache is empty ("cold") and takes time to warm up.',
    nums: '~0.15 ms per lookup, ~50,000 ops/s per node. Hit rate here: 32 GB 75%, 64 GB 85%, 128 GB 92%, 256 GB 95%.',
    here: "Your hot-data estimate (~120 GB) tells you the size. A replica means a node failure doesn't wipe the cache.",
  },
  sql: {
    name: 'SQL database',
    tag: 'Relational, Postgres',
    fields: [
      { kind: 'number', key: 'shards', label: 'Shards', min: 1, max: 8, def: 1 },
      { kind: 'number', key: 'rep', label: 'Replicas per shard', min: 0, max: 3, def: 0 },
    ],
    cost: (c) => 300 * c.shards * (1 + c.rep),
    count: (c) => c.shards * (1 + c.rep),
    sub: (c) => `${plural(c.shards, 'shard')} · ${plural(c.rep, 'replica')}`,
    what: 'A relational database (PostgreSQL, MySQL) with tables, transactions and strong consistency. A primary takes writes; read replicas copy it and serve reads. Sharding splits rows across several primaries by key.',
    when: 'Structured data with relationships, transactions, or strict consistency needs. It also works fine for a shortener: the data is one simple table.',
    watch: "Writes only go to the primary. If it dies, writes fail until a replica is promoted (~3 s here). With no replicas, that shard's data is gone until repair. Each machine holds 2 TB, so big datasets need shards.",
    nums: 'Reads ~8 ms, ~2,000/s per machine. Writes ~15 ms, ~500/s per primary. $300/month per machine.',
    here: "3 TB of links won't fit on one machine. Shard by short code and give each shard a replica.",
  },
  nosql: {
    name: 'NoSQL store',
    tag: 'Key-value, Cassandra',
    fields: [{ kind: 'number', key: 'n', label: 'Nodes', min: 1, max: 12, def: 3 }],
    cost: (c) => 250 * c.n,
    count: (c) => c.n,
    sub: (c) => `${plural(c.n, 'node')} · ${Math.min(3, c.n)} copies`,
    what: 'A distributed key-value or wide-column store (Cassandra, DynamoDB). Keys are hashed to spread data across nodes, and each item is copied to several nodes (3 here).',
    when: 'Huge datasets read by key, high write volume, and when brief staleness is acceptable. Looking up a link by its code is exactly this.',
    watch: 'No joins and limited transactions. Reads can briefly see old data (eventual consistency). Fewer than 3 nodes means a single failure can lose data or availability.',
    nums: 'Reads ~5 ms, writes ~7 ms, ~3,000 ops/s per node. Usable storage = nodes × 2 TB ÷ 3 copies. $250/month per node.',
    here: 'Scales by adding nodes, and a dead node is handled with no failover pause.',
  },
  kgs: {
    name: 'Key generator',
    tag: 'Pre-made short codes',
    fields: [{ kind: 'number', key: 'inst', label: 'Instances', min: 1, max: 3, def: 1 }],
    cost: (c) => 40 * c.inst,
    count: (c) => c.inst,
    sub: (c) => plural(c.inst, 'instance'),
    what: 'A small service that generates unique short codes ahead of time and hands them out. The app asks for a code instead of computing one.',
    when: 'Whenever you need unique IDs at scale without coordination: short codes, order numbers, Snowflake-style IDs.',
    watch: 'Without it, the app hashes the URL (or picks random characters) and must check the database for a collision before every write: one extra read per write. Two instances must never hand out the same code, so each reserves its own batch.',
    nums: '~0.5 ms per code. $40/month per instance.',
    here: 'Optional, but a classic talking point: hashing vs. counters vs. a key service.',
  },
  queue: {
    name: 'Message queue',
    tag: 'Async buffer, Kafka',
    fields: [],
    cost: () => 80,
    count: () => 1,
    sub: () => 'async buffer',
    what: 'A durable buffer (Kafka, SQS). Producers drop messages in and move on; consumers process them later at their own pace.',
    when: "Work that doesn't need to finish before you reply: analytics, emails, thumbnails. It also soaks up bursts.",
    watch: 'Something has to consume the messages. If workers are slower than producers, the backlog grows without limit.',
    nums: 'Millisecond publishes, millions of messages/s. $80/month.',
    here: 'For click analytics: each redirect publishes a click event without slowing the redirect down. Pair it with workers.',
  },
  worker: {
    name: 'Worker',
    tag: 'Background jobs',
    fields: [{ kind: 'number', key: 'inst', label: 'Instances', min: 1, max: 6, def: 1 }],
    cost: (c) => 60 * c.inst,
    count: (c) => c.inst,
    sub: (c) => plural(c.inst, 'instance'),
    what: 'Background processes that read from a queue and do the slow work, such as adding up click counts and writing them to a database in batches.',
    when: 'Any asynchronous job pipeline.',
    watch: 'Scale workers so the queue backlog stays near zero. Batching writes keeps database load low.',
    nums: '~2,000 events/s per instance here. $60/month each.',
    here: 'Only useful if click analytics are in scope.',
  },
}

/** Palette order (Users is always on the board and not in the palette). */
export const PALETTE: ComponentType[] = ['cdn', 'lb', 'app', 'cache', 'sql', 'nosql', 'kgs', 'queue', 'worker']

/** Which components each component may send requests to. */
export const ALLOW: Record<ComponentType, ComponentType[]> = {
  client: ['cdn', 'lb', 'app'],
  cdn: ['lb', 'app'],
  lb: ['app'],
  app: ['cache', 'sql', 'nosql', 'kgs', 'queue'],
  queue: ['worker'],
  worker: ['sql', 'nosql'],
  cache: [],
  sql: [],
  nosql: [],
  kgs: [],
}

/** Default column on the board when a component is added by click. */
export const COLUMN_X: Record<ComponentType, number> = {
  client: 20, cdn: 240, lb: 240, app: 460, cache: 690, kgs: 690, queue: 690, sql: 920, nosql: 920, worker: 920,
}

export function defaultConfig(type: ComponentType): Config {
  const cfg: Config = {}
  for (const f of CATALOG[type].fields) cfg[f.key] = f.def
  return cfg
}

/** Explains why a connection is not allowed, in terms a learner can act on. */
export function edgeWhy(a: ComponentType, b: ComponentType): string {
  const A = CATALOG[a].name
  const B = CATALOG[b].name
  const store: ComponentType[] = ['sql', 'nosql', 'cache']
  if (a === 'client' && store.includes(b))
    return 'Users never talk to a datastore directly: it would expose credentials and skip validation. Route through an app server.'
  if (a === 'lb' && store.includes(b))
    return "A load balancer only spreads web traffic across app servers. It doesn't speak database protocols."
  if (a === 'cache' && (b === 'sql' || b === 'nosql'))
    return 'This game uses cache-aside: the app checks the cache, and on a miss reads the database itself. Connect the app to both.'
  if (['sql', 'nosql', 'cache', 'kgs'].includes(a))
    return `${A} only answers requests; it doesn't call other components. Draw arrows from the caller to the callee.`
  if (a === 'app' && b === 'app') return "App servers are stateless and don't call each other. Add instances on one App server instead."
  if (b === 'client') return 'Arrows point the way requests travel, starting from Users.'
  if (a === 'app' && (b === 'lb' || b === 'cdn'))
    return 'Arrows point the way requests travel: Users → CDN → Load balancer → App server.'
  const ok = ALLOW[a].map((t) => CATALOG[t].name)
  return `${A} doesn't send requests to ${B}. It can connect to: ${ok.join(', ') || 'nothing'}.`
}
