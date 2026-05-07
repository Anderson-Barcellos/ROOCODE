import type { AnalyticsPayload } from '@/types/analytics'

export type CsvKind = 'health' | 'mood' | 'medications'

export type ImportStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ParsedCsvFile {
  name: string
  kind: CsvKind
  rowCount: number
}

export interface HealthAutoExportRow {
  dateTime: string
  sleepTotalHours: number | null
  sleepAsleepHours: number | null
  sleepInBedHours: number | null
  sleepCoreHours: number | null
  sleepDeepHours: number | null
  sleepRemHours: number | null
  sleepAwakeHours: number | null
  respiratoryDisturbances: number | null
  activeEnergyKcal: number | null
  restingEnergyKcal: number | null
  heartRateMin: number | null
  heartRateMax: number | null
  heartRateMean: number | null
  restingHeartRate: number | null
  spo2: number | null
  respiratoryRate: number | null
  pulseTemperatureC: number | null
  exerciseMinutes: number | null
  standingMinutes: number | null
  daylightMinutes: number | null
  hrvSdnn: number | null
  // Fase 8A — novos campos Activity/Physiology (2026-04-20)
  steps: number | null
  distanceKm: number | null
  physicalEffort: number | null
  walkingHeartRateAvg: number | null
  walkingAsymmetryPct: number | null
  walkingSpeedKmh: number | null
  walkingStepLengthCm: number | null
  runningSpeedKmh: number | null
  vo2Max: number | null
  sixMinuteWalkMeters: number | null
  cardioRecoveryBpm: number | null
  isPlaceholderRestingEnergy: boolean
}

export interface MoodEntryRow {
  start: string
  end: string | null
  type: string | null
  labels: string[]
  associations: string[]
  valence: number | null
  valenceClass: string | null
}

export interface MedicationRow {
  id: number | null
  date: string | null
  scheduledDate: string | null
  medication: string | null
  nickname: string | null
  dosage: number | null
  scheduledDosage: number | null
  unit: string | null
  status: string | null
  archived: boolean | null
  codings: string | null
}

export interface DailyHealthMetrics {
  date: string
  interpolated?: boolean
  sleepTotalHours: number | null
  sleepAsleepHours: number | null
  sleepInBedHours: number | null
  sleepCoreHours: number | null
  sleepDeepHours: number | null
  sleepRemHours: number | null
  sleepAwakeHours: number | null
  sleepEfficiencyPct: number | null
  respiratoryDisturbances: number | null
  activeEnergyKcal: number | null
  restingEnergyKcal: number | null
  heartRateMin: number | null
  heartRateMax: number | null
  heartRateMean: number | null
  restingHeartRate: number | null
  spo2: number | null
  respiratoryRate: number | null
  pulseTemperatureC: number | null
  exerciseMinutes: number | null
  standingMinutes: number | null
  daylightMinutes: number | null
  hrvSdnn: number | null
  // Fase 8A — novos campos Activity/Physiology (2026-04-20)
  steps: number | null
  distanceKm: number | null
  physicalEffort: number | null
  walkingHeartRateAvg: number | null
  walkingAsymmetryPct: number | null
  walkingSpeedKmh: number | null
  walkingStepLengthCm: number | null
  runningSpeedKmh: number | null
  vo2Max: number | null
  sixMinuteWalkMeters: number | null
  cardioRecoveryBpm: number | null
  recordCount: number
  placeholderRestingEnergyRows: number
}

export interface DailyMoodMetrics {
  date: string
  interpolated?: boolean
  valence: number | null
  valenceClass: string | null
  entryCount: number
  labels: string[]
  associations: string[]
}

export interface DailyMedicationMetrics {
  date: string
  count: number
  medications: string[]
}

export interface DailySnapshot {
  date: string
  health: DailyHealthMetrics | null
  mood: DailyMoodMetrics | null
  medications: DailyMedicationMetrics | null
  interpolated?: boolean
  confidence?: number
  forecasted?: boolean
  forecastConfidence?: number
  forecastRationale?: string
}

export interface ForecastSignal {
  field: string
  observation: string
}

export type TimelineSeriesKey =
  | 'sleepTotalHours'
  | 'sleepEfficiencyPct'
  | 'restingHeartRate'
  | 'hrvSdnn'
  | 'spo2'
  | 'activeEnergyKcal'
  | 'exerciseMinutes'
  | 'standingMinutes'
  | 'daylightMinutes'
  | 'valence'
  // Fase 8A — novos campos plotáveis
  | 'steps'
  | 'vo2Max'
  | 'walkingSpeedKmh'
  | 'walkingHeartRateAvg'
  | 'respiratoryRate'
  | 'pulseTemperatureC'

export interface TimelinePoint {
  date: string
  values: Partial<Record<TimelineSeriesKey, number | null>>
  interpolated?: boolean
  forecasted?: boolean
  forecastConfidence?: number
}

export interface MoodHeatmapDay {
  date: string
  valence: number | null
  valenceClass: string | null
  entryCount: number
  labels: string[]
  associations: string[]
}

export interface OverviewMetrics {
  sleep7dHours: number | null
  restingHeartRate7d: number | null
  hrv7d: number | null
  spo27d: number | null
  mood7d: number | null
  activeEnergy7dKcal: number | null
  exercise7dMinutes: number | null
  daylight7dMinutes: number | null
  medication7dCount: number
}

export interface AppleHealthBundle {
  healthRows: HealthAutoExportRow[]
  moodRows: MoodEntryRow[]
  medicationRows: MedicationRow[]
  dailySnapshots: DailySnapshot[]
  parsedFiles: ParsedCsvFile[]
}

export interface AppleHealthStoreState {
  status: ImportStatus
  error: string | null
  importedAt: string | null
  files: ParsedCsvFile[]
  bundle: AppleHealthBundle | null
  analytics: AnalyticsPayload | null
}

export interface AppleHealthStoreActions {
  hydrate: () => Promise<void>
  refresh: () => Promise<void>
}

export type AppleHealthStore = AppleHealthStoreState & AppleHealthStoreActions
