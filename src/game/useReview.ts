import { useMemo } from 'react'
import { useGame, useLevel } from '../store/game'

/** The live design review for the current design and scope answers. */
export function useReview() {
  const design = useGame((s) => s.design)
  const scope = useGame((s) => s.scope)
  const level = useLevel()
  return useMemo(() => level.review(design, scope), [level, design, scope])
}
