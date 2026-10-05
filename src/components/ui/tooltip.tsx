import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

export const TooltipProvider = TooltipPrimitive.Provider

/** Hover or focus hint. Keep the text to one or two short sentences. */
export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-64 rounded-lg border border-accent/40 bg-panel px-3 py-2 text-[12.5px] leading-snug text-ink shadow-glow"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-accent/40" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
