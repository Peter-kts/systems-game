import { useMemo } from 'react'
import { useGame } from '../store/game'
import { review } from './review'

/** The live design review for the current design and scope answers. */
export function useReview() {
  const design = useGame((s) => s.design)
  const analytics = useGame((s) => s.scope.analytics ?? 'nice')
  return useMemo(() => review(design, analytics), [design, analytics])
}
