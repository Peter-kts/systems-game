import { Slider as SliderPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn('relative flex h-5 w-28 touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent shadow-glow" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label="Traffic multiplier"
        className="block size-4 cursor-grab rounded-full border-2 border-accent bg-bg shadow-glow"
      />
    </SliderPrimitive.Root>
  )
}
