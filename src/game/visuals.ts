import type { ComponentType } from './types'

/**
 * Small animated SVG diagrams that show what each component does.
 * Built from trusted, static strings only (no user input).
 */
const box = (x: number, y: number, w: number, h: number, t: string) =>
  `<rect class="vb" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text class="vt" x="${x + w / 2}" y="${y + h / 2 + 3.5}" text-anchor="middle">${t}</text>`
const cyl = (x: number, y: number, w: number, h: number, t: string) =>
  `<path class="vb" d="M${x} ${y + 5}v${h - 10}a${w / 2} 5 0 0 0 ${w} 0v${-(h - 10)}a${w / 2} 5 0 0 0 ${-w} 0a${w / 2} 5 0 0 0 ${w} 0"/><text class="vt" x="${x + w / 2}" y="${y + h / 2 + 7}" text-anchor="middle">${t}</text>`
const line = (d: string) => `<path class="vl" d="${d}"/>`
const dot = (p: string, dur: number, begin: number, cls = 'vr', r = 3.5) =>
  `<circle r="${r}" class="${cls}"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${p}"/></circle>`
const caption = (t: string) => `<text class="vc" x="130" y="112" text-anchor="middle">${t}</text>`

const ring = [0, 1, 2, 3, 4, 5]
  .map((i) => {
    const a = (i * Math.PI) / 3 - Math.PI / 2
    return `<circle class="vb" cx="${180 + 40 * Math.cos(a)}" cy="${55 + 40 * Math.sin(a)}" r="9"/>`
  })
  .join('')

const VISUALS: Record<ComponentType, string> = {
  client:
    box(10, 40, 56, 28, 'Users') + box(190, 40, 62, 28, 'Service') + line('M66 54H190') +
    dot('M66 50H190', 1.6, 0) + dot('M66 50H190', 1.6, -0.55) + dot('M66 50H190', 1.6, -1.1) + dot('M66 59H190', 1.6, -0.8, 'vw') +
    caption('Every request starts with a user'),
  cdn:
    box(6, 42, 46, 26, 'User') + box(100, 42, 52, 26, 'Edge') + box(200, 42, 54, 26, 'Origin') + line('M52 55H100') + line('M152 55H200') +
    dot('M52 51L100 51L52 51', 1.3, 0, 'vh') + dot('M52 51L100 51L52 51', 1.3, -0.65, 'vh') + dot('M52 59L200 59L52 59', 2.6, -1.2) +
    caption('Popular answers served near the user'),
  lb:
    box(4, 42, 44, 26, 'Users') + box(80, 42, 40, 26, 'LB') + box(188, 8, 64, 24, 'App') + box(188, 43, 64, 24, 'App') + box(188, 78, 64, 24, 'App') +
    line('M48 55H80') + line('M120 55L188 20M120 55H188M120 55L188 90') +
    dot('M48 55L120 55L188 20', 1.8, 0) + dot('M48 55L120 55L188 55', 1.8, -0.6) + dot('M48 55L120 55L188 90', 1.8, -1.2) +
    caption('One address, many servers'),
  app:
    box(4, 42, 40, 26, 'LB') + box(100, 8, 64, 24, 'App') + box(100, 43, 64, 24, 'App') + box(100, 78, 64, 24, 'App') + cyl(206, 34, 46, 42, 'DB') +
    line('M44 55L100 20M44 55H100M44 55L100 90M164 20L206 50M164 55H206M164 90L206 62') +
    dot('M44 55L100 20L164 20L206 50', 2.2, 0) + dot('M44 55L100 55L164 55L206 55', 2.2, -0.75) + dot('M44 55L100 90L164 90L206 62', 2.2, -1.5) +
    caption('Stateless: any instance can serve any request'),
  cache:
    box(6, 42, 44, 26, 'App') + box(110, 8, 64, 26, 'Cache') + cyl(204, 54, 48, 44, 'DB') + line('M50 50L110 21') + line('M50 62L204 78') +
    dot('M50 50L110 21L50 50', 1.1, 0, 'vh') + dot('M50 50L110 21L50 50', 1.1, -0.37, 'vh') + dot('M50 50L110 21L50 50', 1.1, -0.74, 'vh') +
    dot('M50 62L204 78L50 62', 2.4, -1.2) + caption('Hit: under 1 ms · Miss: go to the database'),
  sql:
    cyl(16, 32, 64, 50, 'Primary') + cyl(180, 4, 64, 44, 'Replica') + cyl(180, 58, 64, 44, 'Replica') + line('M80 46L180 26M80 66L180 80') +
    dot('M0 57L16 57', 1, 0, 'vw') + dot('M80 46L180 26', 1.6, -0.2, 'vw') + dot('M80 66L180 80', 1.6, -0.2, 'vw') +
    dot('M262 26L244 26', 1.2, -0.5) + dot('M262 80L244 80', 1.2, -0.9) + caption('Writes to the primary, copies to replicas'),
  nosql:
    box(4, 42, 62, 26, 'hash(key)') + '<circle class="vb" cx="180" cy="55" r="40" style="fill:none"/>' + ring + line('M66 55L145 35') +
    dot('M66 55L145 35', 1.6, 0, 'vw') + dot('M145 35L180 15', 1.6, -0.8, 'vw', 3) + dot('M145 35L145 75', 1.6, -0.8, 'vw', 3) +
    caption('Each key lives on 3 of the nodes'),
  kgs:
    '<rect class="vb" x="8" y="18" width="104" height="76" rx="6"/>' +
    ['a9Xk2Qp', 'Zr41mQe', '7bTt0Lw', 'Pq3vY8n'].map((k, i) => `<text class="vt" x="60" y="${36 + i * 16}" text-anchor="middle">${k}</text>`).join('') +
    box(190, 42, 62, 26, 'App') + line('M112 55H190') + dot('M112 55H190', 1.4, 0) + dot('M112 55H190', 1.4, -0.7) +
    caption('Codes made ahead of time: no collision check'),
  queue:
    box(4, 42, 40, 26, 'App') + '<rect class="vb" x="62" y="42" width="124" height="26" rx="4"/>' +
    [93, 124, 155].map((x) => `<path class="vl" d="M${x} 42v26"/>`).join('') + box(202, 42, 52, 26, 'Worker') +
    [0, -0.5, -1, -1.5, -2, -2.5, -3, -3.5].map((b) => dot('M44 55H202', 4, b, 'vr', 3)).join('') +
    caption('Producers drop messages and move on'),
  worker:
    box(4, 42, 56, 26, 'Queue') + box(98, 42, 58, 26, 'Worker') + cyl(204, 32, 48, 44, 'DB') + line('M60 55H98M156 55H204') +
    [0, -0.2, -0.4].map((b) => dot('M60 55H98', 0.6, b, 'vr', 2.5)).join('') + dot('M156 55H204', 2.4, 0, 'vr', 6) +
    caption('Many events in, one batched write out'),
  gateway:
    box(4, 42, 46, 26, 'Users') + box(102, 34, 60, 42, 'Gateway') + box(206, 42, 48, 26, 'API') + line('M50 55H102') + line('M162 55H206') +
    dot('M50 50H102H162H206', 1.8, 0) + dot('M50 50H102H162H206', 1.8, -0.9) +
    [0, -0.3, -0.6, -0.9, -1.2].map((b) => dot('M50 60H100L50 60', 1.5, b, 'vbot', 3)).join('') +
    `<text class="vt" x="76" y="84" text-anchor="middle" style="fill:var(--bot)">429</text>` +
    caption('Within the limit: passed on · Over it: 429 at once'),
  counter:
    box(6, 10, 64, 24, 'Gateway') + box(6, 76, 64, 24, 'Gateway') + cyl(170, 30, 80, 50, 'key: 37/50') +
    line('M70 22L170 45') + line('M70 88L170 65') +
    dot('M70 22L170 45L70 22', 1.6, 0) + dot('M70 88L170 65L70 88', 1.6, -0.8) +
    caption('Every gateway checks the same count'),
}

export const visualFor = (t: ComponentType) => VISUALS[t]
