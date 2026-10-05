import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

export const pct = (v: number) => (Number.isNaN(v) ? '–' : `${(v * 100).toFixed(v >= 0.999 && v < 1 ? 2 : 1)}%`)

export const ms = (v: number) => (Number.isNaN(v) ? '–' : `${fmt(v)} ms`)
