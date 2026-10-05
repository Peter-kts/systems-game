import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex border-b border-line', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 border-b-2 border-transparent px-2 py-2.5 font-medium text-muted cursor-pointer',
        'transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-accent data-[state=active]:[text-shadow:0_0_10px_var(--accent)]',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('min-h-0 overflow-auto p-3.5', className)} {...props} />
}
