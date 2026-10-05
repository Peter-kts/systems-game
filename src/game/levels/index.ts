import { CATALOG, COLUMN_X, type ComponentSpec } from '../catalog'
import type { ComponentType } from '../types'
import { rateLimiter } from './rateLimiter'
import type { Difficulty, Level, UpcomingLevel } from './types'
import { urlShortener } from './urlShortener'

export const LEVELS: Level[] = [urlShortener, rateLimiter]

/** Systems shown as "coming soon" on the select screen. */
export const UPCOMING: UpcomingLevel[] = [
  { id: 'pastebin', difficulty: 'easy', title: 'Pastebin', tagline: 'Store text snippets behind short links, with expiry.', teaches: ['Object storage', 'Expiry'] },
  { id: 'news-feed', difficulty: 'medium', title: 'News feed', tagline: 'Show each user the latest posts from everyone they follow.', teaches: ['Fan-out', 'Timelines'] },
  { id: 'chat', difficulty: 'medium', title: 'Chat app', tagline: 'Deliver messages instantly to people who are online.', teaches: ['WebSockets', 'Presence'] },
  { id: 'notifications', difficulty: 'medium', title: 'Notification service', tagline: 'Send push, email and SMS reliably, without spamming.', teaches: ['Queues', 'Retries'] },
  { id: 'ride-sharing', difficulty: 'hard', title: 'Ride sharing', tagline: 'Match riders with nearby drivers in real time.', teaches: ['Geo index', 'Matching'] },
  { id: 'video', difficulty: 'hard', title: 'Video streaming', tagline: 'Upload, transcode and stream video to millions.', teaches: ['Transcoding', 'CDN'] },
  { id: 'crawler', difficulty: 'hard', title: 'Web crawler', tagline: 'Fetch billions of pages politely, without repeats.', teaches: ['Distributed queues', 'Dedup'] },
]

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'One clear bottleneck. Learn the core building blocks.' },
  { id: 'medium', label: 'Medium', blurb: 'New components and real trade-offs between accuracy, cost and availability.' },
  { id: 'hard', label: 'Hard', blurb: 'Many moving parts, real-time data and global scale.' },
]

export const DEFAULT_LEVEL = urlShortener.id

export const getLevel = (id: string | null | undefined): Level => LEVELS.find((l) => l.id === id) ?? urlShortener

/** A component's description with the level's notes applied. */
export function specFor(type: ComponentType, level: Level): ComponentSpec & { here?: string } {
  const base = CATALOG[type]
  const note = level.notes[type]
  if (!note) return base
  const { sub, ...text } = note
  return { ...base, ...text, sub: sub ? () => sub : base.sub }
}

export const columnFor = (type: ComponentType, level: Level) => level.columns?.[type] ?? COLUMN_X[type]

export type { Level }
