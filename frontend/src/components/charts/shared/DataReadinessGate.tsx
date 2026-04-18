import type { ReactNode } from 'react'

import { EmptyAnalyticsState } from '@/components/analytics/shared'
import type { DataReadiness } from '@/utils/data-readiness'

interface DataReadinessGateProps {
  readiness: DataReadiness
  children: ReactNode
}

export function DataReadinessGate({ readiness, children }: DataReadinessGateProps) {
  if (readiness.status === 'pending') {
    return <EmptyAnalyticsState message={readiness.pendingMessage} />
  }
  if (readiness.status === 'partial') {
    return (
      <>
        {children}
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          <span aria-hidden>⚠</span>
          <span>Coletando · {readiness.label}</span>
        </p>
      </>
    )
  }
  return <>{children}</>
}
