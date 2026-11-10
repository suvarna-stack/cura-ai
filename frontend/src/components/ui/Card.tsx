import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padded?: boolean
}

export function Card({
  children,
  padded = true,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-surface border border-border shadow-card',
        padded && 'p-8',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
