import { CACHE_HIT, CODE_NAMES, plural } from '../catalog'
import { reviewKit } from '../review'
import type { PhaseResult } from '../../sim/metrics'
import type { Design } from '../types'
import { overwriteCheck, readChecks, writeChecks } from './checks'
import type { Estimate, Level, Requirement } from './types'

const STORAGE_TB = 3
const TB_PER_MACHINE = 2

const REQUIREMENTS: Requirement[] = [
  { id: 'shorten', group: 'Functional', text: 'Given a long URL, return a short, unique link.', answer: 'must', accepted: ['must'], why: 'This is the product. Together with redirects it defines the API: POST /urls and GET /{code}.' },
  { id: 'redirect', group: 'Functional', text: 'Opening a short link redirects to the original URL.', answer: 'must', accepted: ['must'], why: 'Redirects are about 99% of traffic, so they drive the whole design.' },
  { id: 'alias', group: 'Functional', text: 'Users can pick a custom alias, like sho.rt/my-party.', answer: 'nice', accepted: ['nice', 'out'], why: 'A common follow-up. Mention it and confirm with the interviewer before designing for it. It adds a uniqueness check on writes.' },
  { id: 'expiry', group: 'Functional', text: 'Links can expire after a chosen time.', answer: 'nice', accepted: ['nice', 'out'], why: 'Cheap to support with an expiry column and a cleanup job, and it caps storage growth.' },
  { id: 'analytics', group: 'Functional', text: 'Track how many times each link is clicked.', answer: 'nice', accepted: ['nice', 'must'], why: 'Interviewers often add this later. It pushes you toward logging clicks asynchronously (queue + workers) so redirects stay fast, and it conflicts with caching redirects at a CDN.' },
  { id: 'edit', group: 'Functional', text: 'Users can change where an existing short link points.', answer: 'out', accepted: ['out'], why: 'Mutable links break caching everywhere and enable bait-and-switch abuse. Most real shorteners make links immutable.' },
  { id: 'search', group: 'Functional', text: 'Full-text search across every URL ever shortened.', answer: 'out', accepted: ['out'], why: 'Needs a search index and has nothing to do with shortening. Scope it out explicitly.' },
  { id: 'latency', group: 'Non-functional', text: 'Redirects are fast: 99% finish in under 100 ms.', answer: 'must', accepted: ['must'], why: 'A redirect sits in front of every click, so users feel any delay. The simulation grades p99 click latency against 100 ms.' },
  { id: 'avail', group: 'Non-functional', text: 'Highly available: redirects keep working when a machine dies.', answer: 'must', accepted: ['must'], why: 'If the shortener is down, every link anyone ever shared is broken. Here availability matters more than consistency.' },
  { id: 'guess', group: 'Non-functional', text: 'Short codes are hard to guess (not sequential).', answer: 'nice', accepted: ['nice', 'must'], why: 'Sequential codes let anyone enumerate every link. Random or scrambled codes avoid that.' },
  { id: 'consistency', group: 'Non-functional', text: "A new link must work worldwide the instant it's created.", answer: 'out', accepted: ['out'], why: 'A link becoming visible a second later is fine. Strong global consistency would cost latency and availability (the CAP trade-off) for no user benefit.' },
  { id: 'readheavy', group: 'Non-functional', text: 'Assume about 100 clicks for every new link.', answer: 'must', accepted: ['must', 'nice'], why: 'Say this assumption out loud: it justifies caching and read replicas.' },
]

const ESTIMATES: Estimate[] = [
  { id: 'wps', question: 'Average new links per second', unit: 'writes/s', lo: 25, hi: 60, answer: '~40', work: '100M ÷ 2.6M seconds ≈ 38, call it 40 writes/s.' },
  { id: 'rps', question: 'Average clicks per second', unit: 'reads/s', lo: 2500, hi: 6000, answer: '~4,000', work: '40 writes/s × 100 = ~4,000 reads/s. Peaks run 5–10× higher, so the evaluation throws a 5× spike at you.' },
  { id: 'links', question: 'Links stored after 5 years', unit: 'billion', lo: 4, hi: 8, answer: '6 billion', work: '100M × 12 months × 5 years = 6 billion links.' },
  { id: 'tb', question: 'Storage needed for those links', unit: 'TB', lo: 2, hi: 5, answer: '~3 TB', work: '6B × 500 bytes = 3 TB before replication (~9 TB with 3 copies). One database machine here holds 2 TB, so you need sharding or a distributed store.' },
  { id: 'len', question: 'Characters in a base62 short code', unit: 'chars', lo: 6, hi: 7, answer: '7', work: '62⁶ ≈ 57 billion and 62⁷ ≈ 3.5 trillion. Six characters covers 6B links; seven adds headroom and keeps random codes sparse so collisions stay rare.' },
  { id: 'cache', question: 'Cache memory for the hot links', unit: 'GB', lo: 60, hi: 250, answer: '~120 GB', work: "Clicks follow an 80/20 rule. Caching 20% of a year's links: 1.2B × 0.2 × 500 B ≈ 120 GB, so a 128 GB cache fits." },
]

const starter = (): Design => ({
  nodes: [
    { id: 'client', type: 'client', x: 20, y: 280, cfg: {} },
    { id: 'n1', type: 'app', x: 460, y: 280, cfg: { inst: 1, codes: 0 } },
    { id: 'n2', type: 'sql', x: 920, y: 280, cfg: { shards: 1, rep: 0 } },
  ],
  edges: [
    { from: 'client', to: 'n1' },
    { from: 'n1', to: 'n2' },
  ],
})

const reference = (): Design => ({
  nodes: [
    { id: 'client', type: 'client', x: 20, y: 280, cfg: {} },
    { id: 'r1', type: 'lb', x: 240, y: 280, cfg: {} },
    { id: 'r2', type: 'app', x: 460, y: 280, cfg: { inst: 6, codes: 1 } },
    { id: 'r3', type: 'cache', x: 690, y: 150, cfg: { size: 128, rep: 1 } },
    { id: 'r4', type: 'kgs', x: 690, y: 420, cfg: { inst: 2 } },
    { id: 'r5', type: 'nosql', x: 920, y: 280, cfg: { n: 5 } },
  ],
  edges: [
    { from: 'client', to: 'r1' },
    { from: 'r1', to: 'r2' },
    { from: 'r2', to: 'r3' },
    { from: 'r2', to: 'r5' },
    { from: 'r2', to: 'r4' },
  ],
})

const TALKING_POINTS: [string, string][] = [
  ['Generating short codes', 'Four options. Hash the long URL (MD5 → base62, take 7 chars): repeat URLs get the same code, so you must dedupe or salt. Random codes: check the database for a clash first, or insert with a uniqueness condition. A global counter in base62: no clashes, but guessable unless scrambled, and an async replica can re-issue codes after failover. Or a key service that hands out batches of pre-made random codes, so writes need no check. Say why you picked one.'],
  ['301 or 302?', '301 (permanent) lets browsers and CDNs cache the redirect: less load, but you lose click counts. 302 (temporary) sends every click to you: more load, full analytics.'],
  ['Data model', 'One table: code (primary key), long_url, created_at, expires_at, user_id. Every lookup is by code, which makes it a key-value workload. NoSQL or sharded SQL both work.'],
  ['Sharding', 'Shard by a hash of the short code so data and traffic spread evenly. Range-based sharding creates hot spots for recent links.'],
  ['Caching', 'Cache-aside with LRU eviction. Size from the 80/20 rule. Links never change, so invalidation is easy: only expiry and deletes matter.'],
  ['Failure handling', 'No single points of failure: replicated load balancer, several app instances across zones, database replicas, a cache replica. Say what happens during failover.'],
  ['Analytics', 'Publish click events to a queue and aggregate them in workers, so redirects never wait on analytics writes.'],
  ['Abuse', 'Rate-limit link creation per user or IP, and check destination URLs against malware and phishing lists.'],
]

function review(d: Design, scope: Record<string, string>) {
  const analytics = scope.analytics ?? 'nice'
  const { add, kids, typeOf, ofType, kidsOf, finish } = reviewKit(d)

  const apps = ofType('app')
  const appInstances = apps.reduce((s, n) => s + n.cfg.inst, 0)
  const appKids = (t: Parameters<typeof kidsOf>[1]) => kidsOf(apps, t)

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
  // The riskiest short-code setting among the app servers decides.
  const codes = apps.some((a) => (a.cfg.codes ?? 0) === 0) ? 'hash' : apps.some((a) => a.cfg.codes === 2) ? 'counter' : 'random'
  if (apps.length && !kgs.length) {
    if (codes === 'hash')
      add('fail', "Repeat URLs overwrite each other's links", 'About 1 in 20 new links is a URL someone already shortened. Its hash gives the same code, so it lands on their row and takes it over. Add a key generator, or switch the app server to random codes.')
    else if (codes === 'counter')
      add(scope.guess === 'must' ? 'fail' : 'warn', 'Counter codes are guessable and repeat after a failover', 'Anyone can walk …0001, …0002 to list every link. And if the database fails over to a replica that is behind, the counter hands out recent codes again, on top of existing links. Add a key generator, or use random codes.')
    else
      add('info', 'Random codes with a database check', 'This works: clashes are very rare among 3.5 trillion codes. It costs one extra database read per new link, which a key generator removes.')
  } else if (kgs.some((k) => k.cfg.inst === 1))
    add('warn', 'One key generator is a single point of failure', "If it dies, app servers use up their batch of codes and then fall back to their own Short codes setting. Run two, each owning its own range of codes.")
  else if (kgs.length) add('pass', 'Short codes come from a key service', "Random, never repeated, and no database check on write: app servers take them in batches.")

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

  return finish(urlShortener.budget, 'Look for oversized pieces. A cache is usually far cheaper than more database machines.')
}

export const urlShortener: Level = {
  id: 'url-shortener',
  difficulty: 'easy',
  title: 'URL shortener',
  tagline: 'Turn long links into short ones and redirect billions of clicks.',
  teaches: ['Caching', 'Sharding', 'Replication', 'ID generation'],
  prompt: '"Design a URL shortener like bit.ly"',
  brief:
    "Users paste a long URL and get back a short one like sho.rt/a9Xk2Qp. Anyone who opens the short link is sent to the original page. Assume it's popular.",
  budget: 3000,
  facts: [
    ['New links per month', '100 million'],
    ['Clicks per new link', '100 : 1'],
    ['Keep links for', '5 years'],
    ['Size of one record', '~500 bytes'],
  ],
  estimateHint: 'Handy: one month ≈ 2.6 million seconds. 62 characters (a–z, A–Z, 0–9) per code position.',
  readsPerSec: 4000,
  writesPerSec: 40,
  sim: { rows: true },
  words: { read: 'click', reads: 'Clicks', write: 'new link', writes: 'New links' },
  targets: { readAvailability: 0.999, readP99Ms: 100 },
  palette: ['cdn', 'lb', 'app', 'cache', 'sql', 'nosql', 'kgs', 'queue', 'worker'],
  notes: {
    client: {
      sub: 'clicks + new links',
      what: 'Browsers and phone apps. They create short links (writes) and click them (reads). Arrows on the board show which way requests travel.',
      nums: 'Normal day: ~4,000 clicks/s and ~40 new links/s. Viral moments: 5× that.',
      here: 'Connect Users to whatever receives traffic first: a CDN, a load balancer, or (for a toy design) a single app server.',
    },
    cdn: { here: 'Optional. It removes a lot of load from your servers, but it conflicts with click tracking.' },
    lb: { here: 'Put it between Users (or the CDN) and your app servers. This one sends each request to the least busy app server.' },
    app: {
      sub: (c) => `${plural(c.inst, 'instance')} · ${CODE_NAMES[c.codes ?? 0].toLowerCase()} codes`,
      what: 'Runs your code: validates input, gets a short code, talks to the cache and database, and returns the redirect. Each instance has 16 worker threads, and a thread stays busy while it waits on the cache or database.',
      here: 'Size for the 5× spike, not the average. Connect it to a cache and a database. Its Short codes setting decides how new links get their code; a key generator replaces it.',
    },
    cache: { here: "Your hot-data estimate (~120 GB) tells you the size. A replica means a node failure doesn't wipe the cache." },
    sql: { here: "3 TB of links won't fit on one machine. Shard by short code and give each shard a replica." },
    nosql: { here: 'Scales by adding nodes, and a dead node is handled with no failover pause.' },
    kgs: { here: "Connect it from the app server and the app's own Short codes setting only applies if it can't answer. Watch the arrow into it: only a trickle of batch requests, not one per new link." },
    queue: { here: 'For click analytics: each redirect publishes a click event without slowing the redirect down. Pair it with workers.' },
    worker: { here: 'Only useful if click analytics are in scope.' },
  },
  requirements: REQUIREMENTS,
  estimates: ESTIMATES,
  phases: [
    { name: 'Normal day', from: 0, to: 10 },
    { name: 'Viral spike, 5× traffic', from: 10, to: 25 },
    // Failover makes some writes slow on purpose; only their success rate is graded.
    { name: 'A database machine dies', from: 25, to: 40, skip: ['writeP99'] },
    { name: 'A cache node dies', from: 40, to: 60 },
  ],
  events: [
    { t: 10, kind: 'traffic', multiplier: 5, say: 'Viral spike: traffic jumps to 5×.' },
    { t: 25, kind: 'traffic', multiplier: 1 },
    { t: 27, kind: 'chaos', target: 'db' },
    { t: 42, kind: 'chaos', target: 'cache' },
  ],
  end: 60,
  checks: [...readChecks('Clicks', 0.999, 100), ...writeChecks('New links', 0.99, 1000), overwriteCheck],
  evalSummary: 'A graded 60-second test: normal day, 5× spike, a database failure and a cache failure. No new link may overwrite an existing one.',
  breakable: [
    { kind: 'app', label: 'App server', tip: 'Kill one app server instance.' },
    { kind: 'db', label: 'Database', tip: 'Kill a database machine: a SQL primary or a NoSQL node.' },
    { kind: 'cache', label: 'Cache', tip: 'Kill the cache node. Without a replica it restarts empty.' },
  ],
  starter,
  reference,
  referenceSummary:
    'Users → Load balancer → 6 app servers → 128 GB cache with a replica, a key generator with 2 instances, and a 5-node NoSQL store. About $2,400 a month, and it passes every scenario.',
  talkingPoints: TALKING_POINTS,
  review,
  advice: (phases) => {
    const out: [string, string][] = []
    const ow = urlShortener.checks.findIndex((c) => c.id === 'overwrites')
    // Overwrites get their own advice, so they don't count as the load or failover problems below.
    const broke = (p?: PhaseResult) => !!p && p.checks.some((ok, i) => ok === false && i !== ow)
    const [normal, spike, db, cache] = phases
    if (broke(normal))
      out.push(['It fails on a normal day', 'Check the Review tab first: something on the main path is missing, overloaded, or a single machine.'])
    if (broke(spike) && !broke(normal))
      out.push(['The 5× spike overwhelms it', "Look at which component turned red during the spike. Usually: too few app instances (each does ~3,500 req/s), or reads reaching the database because there's no cache."])
    if (broke(db))
      out.push(['A database failure breaks it', 'Without replicas a dead machine takes its links with it. SQL replicas keep serving reads during failover; NoSQL keeps copies on other nodes.'])
    if (broke(cache))
      out.push(['Losing the cache breaks it', 'When the cache dies, all reads hit the database at once (a thundering herd). Add a cache replica, or give the database enough headroom.'])
    if (phases.some((p) => p.values[ow] > 0))
      out.push(['New links overwrote existing ones', 'Click a database while it runs to watch rows turn red. Hashed codes clash whenever someone shortens a URL that was already shortened; counter codes repeat after a failover. A key generator, or random codes, avoids both.'])
    return out
  },
}
