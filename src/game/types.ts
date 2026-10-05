export type ComponentType =
  | 'client'
  | 'cdn'
  | 'lb'
  | 'app'
  | 'cache'
  | 'sql'
  | 'nosql'
  | 'kgs'
  | 'queue'
  | 'worker'

export type Config = Record<string, number>

export interface DesignNode {
  id: string
  type: ComponentType
  x: number
  y: number
  cfg: Config
}

export interface DesignEdge {
  from: string
  to: string
}

export interface Design {
  nodes: DesignNode[]
  edges: DesignEdge[]
}

export type Scope = 'must' | 'nice' | 'out'

export type RuleLevel = 'fail' | 'warn' | 'info' | 'pass'

export interface Rule {
  lvl: RuleLevel
  title: string
  detail: string
}
