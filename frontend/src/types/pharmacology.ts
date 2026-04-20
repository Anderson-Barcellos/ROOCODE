import type { PKDose } from '../utils/pharmacokinetics'
import type { CorrelationResult } from '../utils/statistics'

export interface MedicationRegimenEntry {
  id: string
  substance: string
  dose_mg: number
  times: string[]
  days_of_week: number[]
  active: boolean
  start_date: string | null
  end_date: string | null
  color: string | null
}

export type RegimenDoseSource = 'regimen' | 'logged'

export interface ExpandedPKDose extends PKDose {
  source: RegimenDoseSource
  scheduledTimestamp?: number
  loggedDoseId?: string | null
}

export interface PKTimelinePoint {
  timestamp: number
  date: string
  normalizedPct: number | null
  rawConcentration: number | null
  moodValence?: number | null
}

export interface PKTimelineSeries {
  presetKey: string
  name: string
  color: string
  referenceCmax: number
  referenceDose: number
  doses: ExpandedPKDose[]
  points: PKTimelinePoint[]
}

export interface PKLagCorrelationRow {
  presetKey: string
  name: string
  color: string
  lagDays: number
  n: number
  result: CorrelationResult | null
}
