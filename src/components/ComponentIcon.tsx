import { Cog, Database, Globe, KeyRound, Network, Rows3, Server, Share2, Smartphone, Zap, type LucideProps } from 'lucide-react'
import type { ComponentType } from '../game/types'

const ICONS: Record<ComponentType, React.ComponentType<LucideProps>> = {
  client: Smartphone,
  cdn: Globe,
  lb: Network,
  app: Server,
  cache: Zap,
  sql: Database,
  nosql: Share2,
  kgs: KeyRound,
  queue: Rows3,
  worker: Cog,
}

export function ComponentIcon({ type, size = 20, className }: { type: ComponentType; size?: number; className?: string }) {
  const Icon = ICONS[type]
  return <Icon size={size} strokeWidth={1.8} className={className ?? 'text-accent'} aria-hidden />
}
