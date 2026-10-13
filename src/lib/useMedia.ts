import { useSyncExternalStore } from 'react'

/** Tracks a CSS media query, e.g. useMedia('(max-width: 1023px)'). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Below Tailwind's `lg` breakpoint the build screen stacks into one column. */
export const NARROW = '(max-width: 1023px)'
/** Touch screens: bigger targets, no hover. */
export const COARSE = '(pointer: coarse)'
