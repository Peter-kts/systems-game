import type { ReactNode } from 'react'

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto px-4 pb-12 pt-6">
      <div className="mx-auto grid max-w-[860px] gap-5">{children}</div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="grid gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent">{eyebrow}</span>
      <h2 className="text-[28px] font-bold leading-tight">{title}</h2>
      <p className="m-0 max-w-[65ch] text-muted">{lead}</p>
    </header>
  )
}
