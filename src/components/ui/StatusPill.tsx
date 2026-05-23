import type { ReactNode } from 'react'

export type StatusKind = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const CLASSES: Record<StatusKind, string> = {
  success: 'bg-success-soft text-success-fg border-success',
  danger: 'bg-danger-soft text-danger-fg border-danger',
  warning: 'bg-warning-soft text-warning-fg border-warning',
  info: 'bg-info-soft text-info-fg border-info',
  neutral: 'bg-elev text-muted border-default',
}

export function StatusPill({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border ${CLASSES[kind]}`}>
      {children}
    </span>
  )
}
