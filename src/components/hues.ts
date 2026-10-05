import type { ComponentType } from '../game/types'

/** Each component's neon colour, used for its glow on the board and in the palette. */
export const HUE: Record<ComponentType, string> = {
  client: '#9aa8ff',
  cdn: '#a77bff',
  lb: '#22e5ff',
  app: '#3d8bff',
  cache: '#ffd23f',
  sql: '#ff8a3d',
  nosql: '#ff3df2',
  kgs: '#7dff6a',
  queue: '#2bffc6',
  worker: '#c8ff3d',
}
