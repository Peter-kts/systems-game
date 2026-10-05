import type { Design, Scope } from '../types'

export interface Requirement {
  id: string
  group: 'Functional' | 'Non-functional'
  text: string
  answer: Scope
  accepted: Scope[]
  why: string
}

export interface Estimate {
  id: string
  question: string
  unit: string
  lo: number
  hi: number
  answer: string
  work: string
}

export interface Phase {
  name: string
  from: number
  to: number
  /** Failover makes some writes slow on purpose; only their success rate is graded. */
  skipWriteLatency?: boolean
}

export const LEVEL = {
  title: 'URL shortener',
  prompt: '"Design a URL shortener like bit.ly"',
  brief:
    "Users paste a long URL and get back a short one like sho.rt/a9Xk2Qp. Anyone who opens the short link is sent to the original page. Assume it's popular.",
  budget: 3000,
  readsPerSec: 4000,
  writesPerSec: 40,
  facts: [
    ['New links per month', '100 million'],
    ['Clicks per new link', '100 : 1'],
    ['Keep links for', '5 years'],
    ['Size of one record', '~500 bytes'],
  ] as [string, string][],
}

export const REQUIREMENTS: Requirement[] = [
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

export const ESTIMATES: Estimate[] = [
  { id: 'wps', question: 'Average new links per second', unit: 'writes/s', lo: 25, hi: 60, answer: '~40', work: '100M ÷ 2.6M seconds ≈ 38, call it 40 writes/s.' },
  { id: 'rps', question: 'Average clicks per second', unit: 'reads/s', lo: 2500, hi: 6000, answer: '~4,000', work: '40 writes/s × 100 = ~4,000 reads/s. Peaks run 5–10× higher, so the evaluation throws a 5× spike at you.' },
  { id: 'links', question: 'Links stored after 5 years', unit: 'billion', lo: 4, hi: 8, answer: '6 billion', work: '100M × 12 months × 5 years = 6 billion links.' },
  { id: 'tb', question: 'Storage needed for those links', unit: 'TB', lo: 2, hi: 5, answer: '~3 TB', work: '6B × 500 bytes = 3 TB before replication (~9 TB with 3 copies). One database machine here holds 2 TB, so you need sharding or a distributed store.' },
  { id: 'len', question: 'Characters in a base62 short code', unit: 'chars', lo: 6, hi: 7, answer: '7', work: '62⁶ ≈ 57 billion and 62⁷ ≈ 3.5 trillion. Six characters covers 6B links; seven adds headroom and keeps random codes sparse so collisions stay rare.' },
  { id: 'cache', question: 'Cache memory for the hot links', unit: 'GB', lo: 60, hi: 250, answer: '~120 GB', work: "Clicks follow an 80/20 rule. Caching 20% of a year's links: 1.2B × 0.2 × 500 B ≈ 120 GB, so a 128 GB cache fits." },
]

export const PHASES: Phase[] = [
  { name: 'Normal day', from: 0, to: 10 },
  { name: 'Viral spike, 5× traffic', from: 10, to: 25 },
  { name: 'A database machine dies', from: 25, to: 40, skipWriteLatency: true },
  { name: 'A cache node dies', from: 40, to: 60 },
]

/** Timeline of the graded evaluation, in simulated seconds. */
export const EVAL_SCRIPT = {
  spikeStart: 10,
  spikeEnd: 25,
  spikeMultiplier: 5,
  killDatabase: 27,
  killCache: 42,
  end: 60,
}

export const TARGETS = {
  readAvailability: 0.999,
  readP99Ms: 100,
  writeAvailability: 0.99,
  writeP99Ms: 1000,
}

export const STARTER = (): Design => ({
  nodes: [
    { id: 'client', type: 'client', x: 20, y: 280, cfg: {} },
    { id: 'n1', type: 'app', x: 460, y: 280, cfg: { inst: 1 } },
    { id: 'n2', type: 'sql', x: 920, y: 280, cfg: { shards: 1, rep: 0 } },
  ],
  edges: [
    { from: 'client', to: 'n1' },
    { from: 'n1', to: 'n2' },
  ],
})

export const REFERENCE = (): Design => ({
  nodes: [
    { id: 'client', type: 'client', x: 20, y: 280, cfg: {} },
    { id: 'r1', type: 'lb', x: 240, y: 280, cfg: {} },
    { id: 'r2', type: 'app', x: 460, y: 280, cfg: { inst: 6 } },
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

export const TALKING_POINTS: [string, string][] = [
  ['Generating short codes', 'Three options. Hash the long URL (MD5 → base62, take 7 chars) and check for collisions. Use a global counter encoded in base62 (no collisions, but guessable unless scrambled). Or a key service that pre-generates random codes. Say why you picked one.'],
  ['301 or 302?', '301 (permanent) lets browsers and CDNs cache the redirect: less load, but you lose click counts. 302 (temporary) sends every click to you: more load, full analytics.'],
  ['Data model', 'One table: code (primary key), long_url, created_at, expires_at, user_id. Every lookup is by code, which makes it a key-value workload. NoSQL or sharded SQL both work.'],
  ['Sharding', 'Shard by a hash of the short code so data and traffic spread evenly. Range-based sharding creates hot spots for recent links.'],
  ['Caching', 'Cache-aside with LRU eviction. Size from the 80/20 rule. Links never change, so invalidation is easy: only expiry and deletes matter.'],
  ['Failure handling', 'No single points of failure: replicated load balancer, several app instances across zones, database replicas, a cache replica. Say what happens during failover.'],
  ['Analytics', 'Publish click events to a queue and aggregate them in workers, so redirects never wait on analytics writes.'],
  ['Abuse', 'Rate-limit link creation per user or IP, and check destination URLs against malware and phishing lists.'],
]
