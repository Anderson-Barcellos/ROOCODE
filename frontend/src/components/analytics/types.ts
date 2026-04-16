export type AnalyticsTone = 'positive' | 'neutral' | 'watch' | 'negative'

export interface AnalyticsWindow {
  label?: string | null
  from?: string | null
  to?: string | null
  coveredDays?: number | null
}

export interface AnalyticsHeadline {
  title: string
  summary: string
  tone?: AnalyticsTone
  confidence?: number | null
  evidence?: string[]
}

export interface AnalyticsMetric {
  label: string
  value: number | string | null
  unit?: string | null
  changeLabel?: string | null
  benchmark?: string | null
  tone?: AnalyticsTone
  detail?: string | null
}

export interface AnalyticsScoreBand {
  label: string
  value: number | null
  max?: number
  tone?: AnalyticsTone
  note?: string | null
}

export interface AnalyticsCorrelation {
  leftLabel: string
  rightLabel: string
  coefficient: number | null
  lagDays?: number | null
  direction?: 'positive' | 'negative' | 'mixed' | 'neutral' | null
  interpretation?: string | null
  pairCount?: number | null
  significant?: boolean | null
  qualityLabel?: string | null
  qualityTone?: AnalyticsTone
}

export interface AnalyticsNarrative {
  title: string
  body: string
  tone?: AnalyticsTone
  bullets?: string[]
}

export interface AnalyticsExperiment {
  title: string
  hypothesis: string
  successSignal?: string | null
  duration?: string | null
}

export interface AnalyticsPattern {
  title: string
  description: string
  frequencyLabel?: string | null
  strength?: number | null
  tone?: AnalyticsTone
  evidence?: string[]
}

export interface AnalyticsCoverageRow {
  label: string
  value: number | null
  total?: number | null
  note?: string | null
}

export interface AnalyticsLagComparisonPoint {
  lagLabel: string
  coefficient: number | null
  pairCount?: number | null
  qualityLabel?: string | null
  promoted?: boolean
}

export interface AnalyticsLagComparisonRow {
  label: string
  values: AnalyticsLagComparisonPoint[]
}

export interface MedicationEventWindowCard {
  title: string
  windowLabel: string
  delta: number | null
  qualityLabel: string
  tone?: AnalyticsTone
  note?: string | null
}

export interface ExecutiveAnalyticsPayload {
  window?: AnalyticsWindow | null
  status?: string | null
  summaryMetrics?: AnalyticsMetric[]
  headlines?: AnalyticsHeadline[]
  risks?: AnalyticsNarrative[]
  opportunities?: AnalyticsNarrative[]
  domainCoverage?: AnalyticsCoverageRow[]
  nextBestActions?: AnalyticsExperiment[]
}

export interface MedicationEffect {
  medication: string
  effectSummary: string
  adherencePct?: number | null
  responseLag?: string | null
  moodDelta?: number | null
  confidence?: number | null
  tone?: AnalyticsTone
  watchouts?: string[]
  observedDoseSummary?: string | null
  inferredExposureSummary?: string | null
  eventWindows?: MedicationEventWindowCard[]
}

export interface MoodDriver {
  label: string
  contribution: number | null
  direction?: 'up' | 'down' | 'mixed' | 'flat'
  note?: string | null
  qualityLabel?: string | null
}

export interface MoodMedicationAnalyticsPayload {
  window?: AnalyticsWindow | null
  status?: string | null
  summary?: AnalyticsHeadline[]
  medications?: MedicationEffect[]
  drivers?: MoodDriver[]
  correlations?: AnalyticsCorrelation[]
  eventWindows?: AnalyticsNarrative[]
  doseVsExposure?: AnalyticsNarrative[]
  cautions?: AnalyticsNarrative[]
  experiments?: AnalyticsExperiment[]
}

export interface SleepStageBalance {
  label: string
  value: number | null
  target?: string | null
}

export interface SleepPhysiologyAnalyticsPayload {
  window?: AnalyticsWindow | null
  status?: string | null
  summary?: AnalyticsHeadline[]
  scoreBands?: AnalyticsScoreBand[]
  sleepArchitecture?: SleepStageBalance[]
  physiologyLinks?: AnalyticsCorrelation[]
  respiratorySignals?: AnalyticsNarrative[]
  cautions?: AnalyticsNarrative[]
  experiments?: AnalyticsExperiment[]
}

export interface PatternAxis {
  label: string
  value: number | null
  benchmark?: number | null
  tone?: AnalyticsTone
}

export interface PatternAnalyticsPayload {
  window?: AnalyticsWindow | null
  status?: string | null
  summary?: AnalyticsHeadline[]
  repeatedPatterns?: AnalyticsPattern[]
  weekdayPatterns?: PatternAxis[]
  sequencePatterns?: AnalyticsPattern[]
  correlationRankings?: AnalyticsCorrelation[]
  lagComparisons?: AnalyticsLagComparisonRow[]
  signalSummary?: AnalyticsCoverageRow[]
  outliers?: AnalyticsNarrative[]
  experiments?: AnalyticsExperiment[]
}
