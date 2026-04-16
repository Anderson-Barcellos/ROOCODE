/**
 * Type stubs for hrv-analysis.tsx and heart-rate-bands.tsx.
 * Full hook implementation deferred to Fase 4 — charts receive
 * these props as optional, so stubs are sufficient for Fase 2+3.
 */

export interface HrvBaselineBand {
  date: string
  mean: number
  upper: number
  lower: number
}

export interface OvertrainingStatus {
  isOvertrained: boolean
  daysElevated: number
  baselineMean: number
  baselineUpper: number
}

export interface RecoveryScore {
  score: number | null
  hrvComponent: number | null
  fcComponent: number | null
  sleepComponent: number | null
  tone: 'emerald' | 'amber' | 'rose'
  label: string
  sparkline: Array<number | null>
}
