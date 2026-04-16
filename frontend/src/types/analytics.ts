export interface AnalyticsRange {
  from: string | null
  to: string | null
  granularity: 'daily'
  days: number
}

export interface AnalyticsPrimaryPhysiology {
  key: string
  label: string
  value: number | null
  unit: string | null
}

export type AnalyticsSignalStatus = 'ready' | 'weak' | 'insufficient'

export interface AnalyticsSignalQuality {
  status: AnalyticsSignalStatus
  label: string
  reason: string
}

export interface AnalyticsSummary {
  mood_average: number | null
  mood_volatility_7d: number | null
  mood_volatility_30d: number | null
  sleep_average: number | null
  activity_average: number | null
  medication_adherence_rate: number | null
  primary_physiology: AnalyticsPrimaryPhysiology | null
  days_with_mood: number
  days_with_health: number
  days_with_medication_events: number
  top_correlation: AnalyticsCorrelationEntry | null
}

export interface AnalyticsMoodPoint {
  date: string
  mood_score: number | null
  mood_raw_avg: number | null
  entry_count: number
  classification: string | null
  labels: string[]
  associations: string[]
  rolling_mean_7d: number | null
  mood_volatility_7d: number | null
  mood_volatility_30d: number | null
  flags: string[]
  medication_events: string[]
  inferred_medications: string[]
}

export interface AnalyticsMoodDaySummary {
  date: string
  mood_score: number | null
  sleep_total_hr: number | null
  steps: number | null
  actual_medications: string[]
}

export interface AnalyticsMoodTimeline {
  series: AnalyticsMoodPoint[]
  best_days: AnalyticsMoodDaySummary[]
  worst_days: AnalyticsMoodDaySummary[]
}

export interface AnalyticsMedicationDay {
  date: string
  scheduled_count: number
  taken_count: number
  skipped_count: number
  ignored_count: number
  actual_medications: string[]
  scheduled_medications: string[]
  inferred_medications: string[]
  adherence_ratio: number | null
  avg_delta_minutes: number | null
}

export interface AnalyticsMedicationTrack {
  medication: string
  start_date: string
  end_date: string
  observed_days: number
  active_days: number
  taken_days: number
  skipped_days: number
  adherence_rate: number | null
  scheduled_time_mode: string | null
  avg_delta_minutes: number | null
  inferred_gap_days: number
}

export interface AnalyticsMedicationHeatmapCell {
  date: string
  status: 'taken' | 'skipped' | 'ignored' | 'none'
  dose_count: number
  mood_score: number | null
  delta_minutes: number | null
}

export interface AnalyticsMedicationHeatmapRow {
  medication: string
  taken_count: number
  skipped_count: number
  ignored_count: number
  adherence_rate: number | null
  days: AnalyticsMedicationHeatmapCell[]
}

export interface AnalyticsMedicationResponseWindow {
  medication: string
  window_days: number
  before_mood: number | null
  after_mood: number | null
  delta: number | null
  pair_count: number
}

export interface AnalyticsMedicationEventWindow {
  medication: string
  event_type: 'first_observed' | 'resume_after_gap' | 'adherence_drop'
  anchor_date: string
  gap_days: number | null
  window_days: number
  before_mood: number | null
  after_mood: number | null
  delta: number | null
  pair_count: number
  signal_quality: AnalyticsSignalQuality
}

export interface AnalyticsMedicationLayer {
  by_day: AnalyticsMedicationDay[]
  tracks: AnalyticsMedicationTrack[]
  heatmap: AnalyticsMedicationHeatmapRow[]
  response_windows: AnalyticsMedicationResponseWindow[]
  notes: string[]
}

export interface AnalyticsContextPoint {
  date: string
  [key: string]: number | string | null
}

export interface AnalyticsContextLayer {
  daily: AnalyticsContextPoint[]
  domains: {
    sleep: AnalyticsContextPoint[]
    activity: AnalyticsContextPoint[]
    physiology: AnalyticsContextPoint[]
    body: AnalyticsContextPoint[]
  }
}

export interface AnalyticsBaselineComparison {
  metric_baseline: number
  mood_when_metric_above_baseline: number | null
  mood_when_metric_below_baseline: number | null
  delta: number | null
}

export interface AnalyticsCorrelationEntry {
  metric: string
  metric_label: string
  metric_unit: string
  lag_days: number
  correlation: number
  paired_days: number
  direction: 'positive' | 'negative' | 'neutral'
  strength: string
  interpretation: string
  baseline_comparison: AnalyticsBaselineComparison | null
  signal_quality: AnalyticsSignalQuality
  promoted: boolean
}

export interface AnalyticsCorrelationLabLagValue {
  lag_days: number
  correlation: number
  paired_days: number
  signal_quality: AnalyticsSignalQuality
  promoted: boolean
}

export interface AnalyticsCorrelationLabLagRow {
  metric: string
  metric_label: string
  values: AnalyticsCorrelationLabLagValue[]
}

export interface AnalyticsCorrelationLab {
  ranked: AnalyticsCorrelationEntry[]
  promoted: AnalyticsCorrelationEntry[]
  best_per_metric: AnalyticsCorrelationEntry[]
  lag_matrix: AnalyticsCorrelationLabLagRow[]
  blocked: AnalyticsCorrelationEntry[]
}

export interface AnalyticsBaselineFeatureDay {
  date: string
  mood_delta_vs_30d: number | null
  sleep_delta_vs_30d: number | null
  hrv_delta_vs_30d: number | null
  resting_hr_delta_vs_30d: number | null
  activity_delta_vs_30d: number | null
  adherence_delta_vs_30d: number | null
}

export interface AnalyticsBaselineFeatures {
  daily: AnalyticsBaselineFeatureDay[]
}

export interface AnalyticsGroupedDays {
  bucket: 'poor' | 'neutral' | 'good'
  days: number
  avg_mood: number | null
  avg_sleep_total_hr: number | null
  avg_steps: number | null
  avg_hrv: number | null
  adherence_rate: number | null
}

export interface AnalyticsCriticalEvent {
  date: string
  mood_score: number | null
  sleep_total_hr: number | null
  steps: number | null
  hr_resting: number | null
  actual_medications: string[]
  flags: string[]
}

export interface AnalyticsPatternCard {
  title: string
  description: string
  strength: number
  tone: 'positive' | 'negative'
  frequency_label: string
  evidence: string[]
}

export interface AnalyticsPatterns {
  best_days: AnalyticsMoodDaySummary[]
  worst_days: AnalyticsMoodDaySummary[]
  grouped_days: AnalyticsGroupedDays[]
  critical_events: AnalyticsCriticalEvent[]
  repeated_patterns: AnalyticsPatternCard[]
  medication_tracks: AnalyticsMedicationTrack[]
}

export interface AnalyticsInsight {
  title: string
  text: string
  tone: 'positive' | 'neutral' | 'watch' | 'negative'
  evidence?: string[]
}

export interface AnalyticsDataQuality {
  counts: {
    total_days: number
    health_days: number
    mood_days: number
    medication_days: number
    overlap_days: number
    body_days: number
    inferred_medication_days: number
  }
  coverage: {
    health: number
    mood: number
    medications: number
    overlap: number
    body: number
  }
  missing_dates: {
    health: string[]
    mood: string[]
    medications: string[]
  }
  missing_fields: string[]
  limitations: string[]
  last_ingestions: Array<{
    timestamp: string
    source: string
    filename: string
    rows_processed: number
    date_range_start: string | null
    date_range_end: string | null
  }>
}

export interface AnalyticsSignalQualitySummary {
  thresholds: {
    ready_min_pairs: number
    ready_min_abs_correlation: number
    weak_min_pairs: number
    weak_min_abs_correlation: number
  }
  correlations: Record<AnalyticsSignalStatus, number>
  event_windows: Record<AnalyticsSignalStatus, number>
}

export interface AnalyticsPayload {
  range: AnalyticsRange
  summary: AnalyticsSummary
  mood_timeline: AnalyticsMoodTimeline
  medication_layer: AnalyticsMedicationLayer
  context_layer: AnalyticsContextLayer
  correlations: {
    top: AnalyticsCorrelationEntry[]
    all: AnalyticsCorrelationEntry[]
  }
  correlation_lab: AnalyticsCorrelationLab
  event_windows: AnalyticsMedicationEventWindow[]
  baseline_features: AnalyticsBaselineFeatures
  signal_quality: AnalyticsSignalQualitySummary
  patterns: AnalyticsPatterns
  insights: AnalyticsInsight[]
  data_quality: AnalyticsDataQuality
}
