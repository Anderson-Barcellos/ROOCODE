/**
 * Type stubs for weekly-pattern-chart.tsx.
 * Full hook implementation deferred to Fase 4.
 */

import type { CorrelationResult } from '@/utils/statistics'

export interface WeeklyDayStats {
  dayName: string
  dayIndex: number
  avgExercise: number | null
  avgEnergy: number | null
  avgDaylight: number | null
  count: number
}

export interface LoadBalancePoint {
  date: string
  load: number | null
  recovery: number | null
  balance: number | null
}

export interface ActivityImpact {
  label: string
  description: string
  correlation: CorrelationResult | null
}
