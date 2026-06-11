import type { ReactNode } from 'react'

import { EmptyAnalyticsState } from '@/components/analytics/shared'
import type { DataReadiness } from '@/utils/data-readiness'

interface DataReadinessGateProps {
  readiness: DataReadiness
  children: ReactNode
}

export function DataReadinessGate({ readiness, children }: DataReadinessGateProps) {
  const robustLabel = readiness.label.includes('pares')
    ? `${readiness.current} pares válidos`
    : `${readiness.current} dias válidos`

  if (readiness.status === 'standby') {
    return <EmptyAnalyticsState message={readiness.pendingMessage} />
  }

  if (readiness.status === 'collecting') {
    return (
      <>
        {children}
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <span aria-hidden>⚠</span>
          <span>Coletando · {readiness.label} · exploratório em {readiness.exploratoryMin}</span>
        </p>
      </>
    )
  }

  if (readiness.status === 'exploratory') {
    return (
      <>
        {children}
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          <span aria-hidden>◔</span>
          <span>Exploratório · {readiness.label} · robusto em {readiness.robustMin}</span>
        </p>
      </>
    )
  }

  return (
    <>
      {children}
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        <span aria-hidden>●</span>
        <span>Robusto · {robustLabel}</span>
      </p>
    </>
  )
}
