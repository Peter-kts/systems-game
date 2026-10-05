import { ALGO, FAIL } from '../../sim/engine'
import { fmt, reviewKit } from '../review'
import type { ComponentType, Design } from '../types'
import { botCheck, readChecks } from './checks'
import type { Estimate, Level, Requirement } from './types'

const LEGIT = 5000
const BOT_KEYS = 5
const BOT_RATE = 3000
const LIMIT = 50
const ATTACK = LEGIT + BOT_KEYS * BOT_RATE
const ALLOWED = LEGIT + BOT_KEYS * LIMIT
/** Requests/s one instance handles at 100% busy, from the catalog's service times. */
const GATEWAY_CAP = 9000
const APP_CAP = 1000
const LOG_CAP = 17000

const REQUIREMENTS: Requirement[] = [
  { id: 'limit', group: 'Functional', text: 'Limit each API key to 50 requests per second, and answer extra requests with HTTP 429.', answer: 'must', accepted: ['must'], why: 'This is the product. 429 Too Many Requests tells clients to back off, and the limit is per key because keys identify customers.' },
  { id: 'headers', group: 'Functional', text: 'Tell clients where they stand with X-RateLimit-Remaining and Retry-After headers.', answer: 'nice', accepted: ['nice', 'must'], why: 'Cheap, and API users expect it (GitHub and Stripe send them). Good clients slow down before they hit the wall.' },
  { id: 'tiers', group: 'Functional', text: 'Different limits per plan (free vs. paid), changeable without a deploy.', answer: 'nice', accepted: ['nice', 'must'], why: 'Store the rules in a config service that gateways cache and refresh. Mention it; the core design stays the same.' },
  { id: 'ip', group: 'Functional', text: 'Also limit requests that have no API key, by IP address.', answer: 'nice', accepted: ['nice', 'out'], why: 'Login and sign-up pages need it. Many people share one IP (offices, mobile carriers), so IP limits have to be looser.' },
  { id: 'queue', group: 'Functional', text: 'Hold over-limit requests in a queue and serve them later instead of rejecting them.', answer: 'out', accepted: ['out'], why: "That's traffic shaping, not rate limiting. Queued requests hold connections and time out anyway. Rejecting fast with Retry-After lets clients retry with backoff." },
  { id: 'ban', group: 'Functional', text: 'Automatically detect abusive users and ban them permanently.', answer: 'out', accepted: ['out'], why: 'Abuse detection is its own system (fraud models, manual review). The limiter only enforces limits, though its rejections are a useful signal for that system.' },
  { id: 'billing', group: 'Functional', text: 'Bill customers for every request they make.', answer: 'out', accepted: ['out'], why: 'Billing needs exact, durable counts. A limiter is allowed to be approximate and to forget. Keep them separate.' },
  { id: 'latency', group: 'Non-functional', text: 'Adds almost no latency: the limit check takes about a millisecond.', answer: 'must', accepted: ['must'], why: 'The check sits in front of every API call. Keep counters in memory near the gateways, with one round trip per check.' },
  { id: 'accurate', group: 'Non-functional', text: "Accurate across servers: a client can't get extra quota by landing on different machines.", answer: 'must', accepted: ['must', 'nice'], why: 'Otherwise the real limit is the limit times the number of gateways, and it changes every time you scale. This is what forces shared counters.' },
  { id: 'available', group: 'Non-functional', text: 'If the limiter breaks, the API keeps serving normal users.', answer: 'must', accepted: ['must'], why: "The limiter protects the API; it must not become the reason the API is down. Decide what happens when the counters can't be reached." },
  { id: 'exact', group: 'Non-functional', text: 'Counts are exact to the request, across all regions, at every moment.', answer: 'out', accepted: ['out'], why: 'Global strong consistency would add a cross-region round trip to every request. Being off by a few requests for a moment is fine.' },
  { id: 'flood', group: 'Non-functional', text: 'Keeps working during a flood many times normal traffic.', answer: 'must', accepted: ['must'], why: "Floods are exactly when you need it. The limiter processes every request, including the ones it rejects, so it's sized for the attack, not the average." },
]

const ESTIMATES: Estimate[] = [
  { id: 'peak', question: 'Requests/s reaching the limiter during the attack', unit: 'req/s', lo: 15000, hi: 25000, answer: '~20,000', work: '5,000 normal + 5 bots × 3,000 = 20,000/s. The limiter sees all of it, even the requests it rejects.' },
  { id: 'blocked', question: 'Share of bot requests that should be rejected', unit: '%', lo: 95, hi: 99.5, answer: '~98%', work: 'Each bot may send 50 of its 3,000 requests a second: 2,950 ÷ 3,000 ≈ 98.3% get a 429.' },
  { id: 'api', question: 'Requests/s your API servers must handle during the attack', unit: 'req/s', lo: 5000, hi: 6000, answer: '~5,250', work: '5,000 normal + 5 bots × 50 allowed = 5,250/s. Without a limiter it would be 20,000/s.' },
  { id: 'apps', question: 'API server instances (~1,000 req/s each), with headroom', unit: 'instances', lo: 6, hi: 8, answer: '7', work: '5,250 ÷ 1,000 ≈ 5.3 instances at 100% busy. Queues explode near 100%, so aim for 70–80%: about 7.' },
  { id: 'gw', question: "Gateway instances (~9,000 req/s each) that survive losing one", unit: 'instances', lo: 4, hi: 5, answer: '4', work: '20,000 ÷ 9,000 ≈ 2.2, so 3 run at about 75% busy. Add one spare so a machine dying mid-attack doesn\'t overload the rest: 4.' },
  { id: 'mem', question: 'Counter memory for 1 million active keys (token bucket)', unit: 'MB', lo: 50, hi: 300, answer: '~100 MB', work: '1M keys × ~100 bytes (key, tokens left, last refill time) ≈ 100 MB, which one Redis node holds easily. A sliding log keeps up to 50 timestamps per key: dozens of times more.' },
]

const starter = (): Design => ({
  nodes: [
    { id: 'client', type: 'client', x: 20, y: 280, cfg: {} },
    { id: 'n1', type: 'lb', x: 240, y: 280, cfg: {} },
    { id: 'n2', type: 'app', x: 760, y: 280, cfg: { inst: 7 } },
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
    { id: 'r2', type: 'gateway', x: 460, y: 280, cfg: { inst: 4, algo: ALGO.tokenBucket, fail: FAIL.local } },
    { id: 'r3', type: 'counter', x: 760, y: 140, cfg: { shards: 1, rep: 1 } },
    { id: 'r4', type: 'app', x: 760, y: 420, cfg: { inst: 7 } },
  ],
  edges: [
    { from: 'client', to: 'r1' },
    { from: 'r1', to: 'r2' },
    { from: 'r2', to: 'r3' },
    { from: 'r2', to: 'r4' },
  ],
})

const TALKING_POINTS: [string, string][] = [
  ['Algorithms', 'Token bucket (smooth, allows short bursts, one counter per key), leaky bucket (constant outflow), fixed window (cheapest, but 2× bursts at window edges), sliding log (exact, memory-heavy), sliding window counter (weights two fixed windows: nearly exact and cheap). Pick one and say why.'],
  ['Where it runs', "In an API gateway or middleware, before any expensive work. Limits in the client help well-behaved apps but can't be trusted."],
  ['Shared counters', 'Keep counters in Redis and update them atomically (a Lua script, or INCR with EXPIRE) so two gateways never both spend the last token. Shard counters by API key.'],
  ['Local vs. global', 'Counting in each instance is fast but gives a key N× its limit across N instances. Some systems combine both: a local check plus a periodic sync with the shared store.'],
  ['When the counters fail', "Fail open, fail closed, or fall back to local limits. Most public APIs choose availability: stay up with approximate limits rather than reject everyone or let a flood through."],
  ['Telling clients', 'Return 429 with Retry-After and X-RateLimit-Limit/Remaining/Reset headers so clients can back off. Log rejections; they feed abuse detection.'],
  ['Rules', 'Limits per plan, endpoint or IP live in a config service and are cached on the gateways, so they change without a deploy.'],
  ['Many regions', 'A truly global count would cross regions on every request. Usually each region limits on its own, or regions sync counts in the background and accept a small overshoot.'],
]

function review(d: Design) {
  const { add, kids, typeOf, ofType, kidsOf, finish, byId } = reviewKit(d)
  const gateways = ofType('gateway')
  const apps = ofType('app')
  const stores = kidsOf(gateways, 'counter')
  const gwInst = gateways.reduce((s, n) => s + n.cfg.inst, 0)
  const appInst = apps.reduce((s, n) => s + n.cfg.inst, 0)
  const inst = (id: string) => byId(id)?.cfg.inst ?? 1

  if (!apps.length) add('fail', "Requests can't reach an API server", 'Draw a path like Users → Load balancer → API gateway → App server.')

  const front: ComponentType[] = ['gateway', 'app']
  const direct = kids('client').filter((k) => front.includes(typeOf(k)!))
  if (direct.length && (direct.length > 1 || direct.some((k) => inst(k) > 1)))
    add('fail', 'Users are wired straight to several machines', 'Users only know one address. Put a load balancer in front so traffic spreads and dead machines are skipped.')
  else if (ofType('lb').length && (gateways.length || apps.length)) add('pass', 'A load balancer spreads the traffic', 'It also stops sending requests to dead instances.')

  // Can a request reach an app server without passing through a gateway?
  const seen = new Set(['client'])
  const stack = ['client']
  let bypass = false
  while (stack.length)
    for (const k of kids(stack.pop()!)) {
      if (seen.has(k) || typeOf(k) === 'gateway') continue
      if (typeOf(k) === 'app') bypass = true
      seen.add(k)
      stack.push(k)
    }

  if (!gateways.length)
    add('fail', 'Nothing enforces the rate limit', 'Every bot request reaches your API servers. Put an API gateway between the load balancer and the app servers.')
  else if (bypass)
    add('fail', 'Some traffic skips the rate limiter', "There's a path from Users to the app servers that doesn't pass through a gateway. Bots will find it.")
  else add('pass', 'Every request passes the rate limiter', 'Over-limit requests get a 429 before they cost your API anything.')

  if (gateways.length) {
    const local = gateways.filter((g) => !kids(g.id).some((k) => typeOf(k) === 'counter'))
    if (local.length && gwInst > 1)
      add('fail', 'Each gateway instance counts on its own',
        `The load balancer spreads a key's requests over ${gwInst} instances, and each allows the full limit, so the key gets about ${gwInst}× its limit. Connect the gateways to a shared counter store.`)
    else if (stores.length > 1)
      add('warn', 'Gateways use different counter stores', 'Each store keeps its own count, so a key gets its limit once per store. Connect every gateway to the same one.')
    else if (stores.length) add('pass', 'All gateways share one count per key', 'A key gets its limit no matter which instance serves it.')

    if (gwInst === 1)
      add('fail', 'One gateway is a single point of failure', 'If it dies, nothing reaches your API. Run at least 2 instances.')
    if (gwInst * GATEWAY_CAP * 0.85 < ATTACK)
      add('warn', "Gateways can't absorb the attack",
        `${gwInst} × ~${fmt(GATEWAY_CAP)} requests/s is too little for the ~${fmt(ATTACK)}/s that arrive during the attack. The limiter handles every request, even the ones it rejects.`)
    else if ((gwInst - 1) * GATEWAY_CAP * 0.85 < ATTACK)
      add('warn', 'No spare gateway for the attack', "If one instance dies mid-attack, the rest can't keep up. Run one more than you need (N+1).")
    else add('pass', 'Gateways can carry the attack, even with one down')

    const algos = new Set(gateways.map((g) => g.cfg.algo))
    if (algos.has(ALGO.fixedWindow))
      add('warn', 'Fixed windows allow bursts at the edges', 'A key can use its whole limit at the end of one second and again at the start of the next: 2× the limit in a moment. Token buckets and sliding windows smooth that out.')
    if (algos.has(ALGO.slidingLog))
      add('warn', 'A sliding log is exact but expensive', 'It stores a timestamp for every request in the window (up to 50 per key) and takes 3 store commands per check. A token bucket or sliding-window counter is nearly as accurate for a fraction of the cost.')
    if (algos.has(ALGO.tokenBucket)) add('pass', 'Token bucket: smooth limits, small bursts', 'One tiny counter per key and one atomic command per check.')

    const fails = new Set(gateways.filter((g) => kids(g.id).some((k) => typeOf(k) === 'counter')).map((g) => g.cfg.fail))
    if (fails.has(FAIL.open))
      add('warn', '"Allow all" lets the flood in', 'If the counter store is unreachable during an attack, every bot request goes straight to your API servers.')
    if (fails.has(FAIL.closed))
      add('warn', '"Reject all" turns a blip into an outage', 'If the counter store is unreachable, every user gets a 429: a counter failure takes your whole API down.')
    if (fails.has(FAIL.local))
      add('pass', 'Falls back to counting locally', 'While the counters are unreachable, each instance enforces the limit on its own: looser (about N× the limit), but bounded, and the API stays up.')
  }

  for (const s of stores) {
    if (s.cfg.rep === 0)
      add('fail', 'The counter store has no replica', "If it dies, limits can't be checked until a new, empty node starts. A replica takes over in about a second.")
    else add('pass', 'Counters survive a node failure', 'A replica holds a copy of every counter and takes over in about a second.')
    const logUsers = gateways.filter((g) => g.cfg.algo === ALGO.slidingLog && kids(g.id).includes(s.id))
    if (logUsers.length && s.cfg.shards * LOG_CAP * 0.85 < ATTACK)
      add('warn', "The counter store can't keep up with a sliding log",
        `3 commands per request at ~${fmt(ATTACK)} requests/s is more than ${s.cfg.shards === 1 ? 'one shard' : `${s.cfg.shards} shards`} can do. Add shards or use a token bucket.`)
  }

  if (apps.length && appInst === 1)
    add('fail', 'One API server is a single point of failure', 'If that machine dies, the API is down. Run at least 2 instances.')
  if (apps.length && gateways.length) {
    if (appInst * APP_CAP * 0.8 < ALLOWED)
      add('warn', 'API servers have no headroom',
        `${appInst} × ~${fmt(APP_CAP)} requests/s for ~${fmt(ALLOWED)}/s of normal and allowed traffic. Near 100% busy, queues and latency explode.`)
    else add('pass', 'API servers have headroom', `~${fmt(ALLOWED)}/s of normal and allowed traffic on ${appInst} instances.`)
  }

  return finish(rateLimiter.budget, 'Absorbing a flood with more servers is the expensive fix. Reject it cheaply at the gateway instead.')
}

export const rateLimiter: Level = {
  id: 'rate-limiter',
  difficulty: 'medium',
  title: 'Rate limiter',
  tagline: 'Keep a public API fast for everyone while a few keys try to flood it.',
  teaches: ['API gateway', 'Distributed counters', 'Fail open vs. closed', 'Limiting algorithms'],
  prompt: '"Design a rate limiter for a public API"',
  brief:
    'Your company runs a public API used by about a million API keys. Each key may make 50 requests a second. Some clients (scrapers, buggy scripts) send far more. Build the limiter so normal users never notice it and abusers are held to their limit.',
  budget: 1200,
  facts: [
    ['Normal traffic', '5,000 requests/s'],
    ['Active API keys', '1 million'],
    ['Limit per key', '50 requests/s'],
    ['Attack', '5 keys × 3,000/s'],
  ],
  estimateHint: 'Handy: the limiter has to look at every request, including the ones it rejects.',
  readsPerSec: LEGIT,
  writesPerSec: 0,
  bots: { keys: BOT_KEYS, perKey: BOT_RATE, limit: LIMIT },
  sim: { appMs: 15, appLeaf: true },
  words: { read: 'request', reads: 'Requests' },
  targets: { readAvailability: 0.999, readP99Ms: 200 },
  palette: ['lb', 'gateway', 'counter', 'app'],
  columns: { app: 760, counter: 760 },
  notes: {
    client: {
      sub: 'API users + bots',
      what: 'Programs calling your public API with an API key: mobile apps, partner integrations, scripts. Almost all stay far below the limit. A few keys (scrapers, a runaway retry loop) send thousands of requests a second.',
      nums: 'Normal: 5,000 requests/s spread over about a million keys. Attack: 5 keys add 3,000 requests/s each.',
      here: 'Connect Users to a load balancer, then to the gateways.',
    },
    lb: { here: "Spreads requests over gateway instances, least busy first. It doesn't look at API keys, so one key's requests land on every gateway." },
    gateway: {
      here: "This is where the limit is enforced. Connect it to the app servers, and to a counter store so every instance shares one count per key. Size it for the attack: it sees every request, even the ones it rejects.",
    },
    counter: { here: 'One shard handles this traffic with a token bucket. Give it a replica so a node failure lasts a second, not a restart.' },
    app: {
      what: "Your product's API servers. They do the real work behind each request, including their own database calls (not drawn separately in this level). Each instance has 16 worker threads.",
      nums: '~15 ms of work per request, so one instance handles about 1,000 requests/s. $60/month each.',
      here: 'Size for normal traffic plus what the limiter lets the bots send, with headroom. Absorbing the whole attack instead would take ~20 more instances.',
    },
  },
  requirements: REQUIREMENTS,
  estimates: ESTIMATES,
  phases: [
    { name: 'Normal day', from: 0, to: 10, skip: ['bots'] },
    { name: 'Scraper attack', from: 10, to: 25 },
    // While counters fail over, limits loosen for a moment and the extra traffic slows some requests,
    // so only success and how far the bots got are graded.
    { name: 'Counter store dies mid-attack', from: 25, to: 40, skip: ['readP99'], botTolerance: 2.5 },
    { name: 'A gateway dies mid-attack', from: 40, to: 60 },
  ],
  events: [
    { t: 10, kind: 'attack', on: true, say: `Attack: ${BOT_KEYS} API keys start sending ${fmt(BOT_RATE)} requests/s each.` },
    { t: 27, kind: 'chaos', target: 'counter' },
    { t: 42, kind: 'chaos', target: 'gateway' },
  ],
  end: 60,
  checks: [...readChecks('Requests', 0.999, 200), { ...botCheck, target: `≤ 1.25× (${LIMIT}/s)` }],
  evalSummary: 'A graded 60-second test: normal day, a scraper attack, then the counter store and a gateway die while the attack goes on.',
  breakable: [
    { kind: 'gateway', label: 'Gateway', tip: 'Kill one API gateway instance.' },
    { kind: 'counter', label: 'Counters', tip: 'Kill a counter store node. Without a replica, a new empty one starts in about 8 s.' },
    { kind: 'app', label: 'API server', tip: 'Kill one API server instance.' },
  ],
  starter,
  reference,
  referenceSummary:
    'Users → Load balancer → 4 gateway instances (token bucket, count locally if the counters are down) → a counter store with a replica, and 7 API servers. About $900 a month, and it passes every scenario.',
  talkingPoints: TALKING_POINTS,
  review,
  advice: (phases) => {
    const out: [string, string][] = []
    const [normal, attack, store, gateway] = phases
    if (normal && !normal.pass)
      out.push(['It fails on a normal day', 'Check the Review tab: something on the main path is missing, or the API servers are too busy (each does ~1,000 requests/s).'])
    if (attack && !attack.pass && normal?.pass)
      out.push(['The attack gets through', 'Check "Bots let through". Far above 1×: nothing limits the bots, or each gateway instance counts on its own. Bots held but users failing: the gateways or API servers ran out of room.'])
    if (store && !store.pass)
      out.push(['Losing the counter store breaks it', 'With no replica, limits are gone for seconds. With "Allow all", the flood reaches your API while the store is down; with "Reject all", every user gets a 429. "Count locally" keeps limits roughly in place and the API up.'])
    if (gateway && !gateway.pass)
      out.push(['Losing a gateway breaks it', 'The remaining instances must carry the whole attack. Run one more gateway instance than the attack needs.'])
    return out
  },
}
