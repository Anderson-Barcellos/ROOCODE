import type { DailySnapshot } from '@/types/apple-health'
import { pearson, type CorrelationResult } from './statistics'

export const MIN_PAIRED_DAYS_FOR_RANKING = 10
export const ROBUST_R_THRESHOLD = 0.3
export const TOP_N = 3
export const RECENT_WINDOW = 7
export const SPARKLINE_WINDOW = 14

export type DriverRankingState = 'qualified' | 'dim'
export type DriverTone = 'positive' | 'watch' | 'neutral'
export type DriverIconName = 'moon' | 'heart-pulse' | 'activity' | 'sun-medium'

export interface DriverDefinition {
  id: string
  title: string
  label: string
  unit: string
  sourcePath: string
  chartHint: string
  iconName: DriverIconName
  polarity: 'higher-is-better' | 'lower-is-better' | 'context'
  getter: (snapshot: DailySnapshot) => number | null
  precision?: number
}

export interface RankedDriver {
  id: string
  title: string
  label: string
  unit: string
  sourcePath: string
  chartHint: string
  iconName: DriverIconName
  polarity: DriverDefinition['polarity']
  precision: number
  state: DriverRankingState
  pearson: CorrelationResult | null
  recentValue: number | null
  baselineValue: number | null
  delta: number | null
  tone: DriverTone
  pairCount: number
  sparkline14d: Array<{ date: string; value: number | null; mood: number | null }>
}

export interface RankingResult {
  top3: RankedDriver[]
  others: RankedDriver[]
  total: number
  robustCount: number
  coveragePct: number
  pairedDays: number
}

export const DRIVERS: DriverDefinition[] = [
  {
    id: 'sleep',
    title: 'Sono',
    label: 'sono total',
    unit: 'h',
    sourcePath: 'DailySnapshot.health.sleepTotalHours',
    chartHint: 'Sono · SleepStages/SleepDebt',
    iconName: 'moon',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.sleepTotalHours ?? null,
    precision: 1,
  },
  {
    id: 'autonomic',
    title: 'Autonômico',
    label: 'HRV',
    unit: 'ms',
    sourcePath: 'DailySnapshot.health.hrvSdnn',
    chartHint: 'Coração · AutonomicBalance/HRV',
    iconName: 'heart-pulse',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.hrvSdnn ?? null,
    precision: 0,
  },
  {
    id: 'activity',
    title: 'Ativação',
    label: 'passos',
    unit: '',
    sourcePath: 'DailySnapshot.health.steps',
    chartHint: 'Atividade · Steps/ActivityBars',
    iconName: 'activity',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.steps ?? null,
    precision: 0,
  },
  {
    id: 'circadian',
    title: 'Circadiano',
    label: 'luz do dia',
    unit: 'min',
    sourcePath: 'DailySnapshot.health.daylightMinutes',
    chartHint: 'Atividade/Insights · ciclo circadiano',
    iconName: 'sun-medium',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.daylightMinutes ?? null,
    precision: 0,
  },
]

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toneForDelta(
  delta: number | null,
  baseline: number | null,
  polarity: DriverDefinition['polarity'],
): DriverTone {
  if (delta == null || baseline == null || baseline === 0 || polarity === 'context') return 'neutral'
  const relative = delta / Math.abs(baseline)
  if (Math.abs(relative) < 0.08) return 'neutral'
  const improving = polarity === 'higher-is-better' ? delta > 0 : delta < 0
  return improving ? 'positive' : 'watch'
}

function buildSparkline(
  snapshots: DailySnapshot[],
  driver: DriverDefinition,
): RankedDriver['sparkline14d'] {
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated).slice(-SPARKLINE_WINDOW)
  return usable.map((s) => ({
    date: s.date,
    value: driver.getter(s),
    mood: s.mood?.valence ?? null,
  }))
}

function buildRankedDriver(snapshots: DailySnapshot[], driver: DriverDefinition): RankedDriver {
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated)
  const pairedItems = usable
    .map((s) => {
      const value = driver.getter(s)
      const mood = s.mood?.valence
      return value != null && Number.isFinite(value) && mood != null
        ? { value, mood }
        : null
    })
    .filter((item): item is { value: number; mood: number } => item != null)

  const values = usable
    .map((s) => driver.getter(s))
    .filter((v): v is number => v != null && Number.isFinite(v))
  const recent = values.slice(-RECENT_WINDOW)
  const earlier = values.slice(0, Math.max(0, values.length - RECENT_WINDOW))
  const recentValue = average(recent)
  const baselineValue = average(earlier.length >= 3 ? earlier : values)
  const delta = recentValue != null && baselineValue != null ? recentValue - baselineValue : null

  const pearsonResult = pearson(
    pairedItems.map((i) => i.value),
    pairedItems.map((i) => i.mood),
  )
  const pairCount = pairedItems.length
  const state: DriverRankingState = pearsonResult != null ? 'qualified' : 'dim'

  return {
    id: driver.id,
    title: driver.title,
    label: driver.label,
    unit: driver.unit,
    sourcePath: driver.sourcePath,
    chartHint: driver.chartHint,
    iconName: driver.iconName,
    polarity: driver.polarity,
    precision: driver.precision ?? 1,
    state,
    pearson: pearsonResult,
    recentValue,
    baselineValue,
    delta,
    tone: toneForDelta(delta, baselineValue, driver.polarity),
    pairCount,
    sparkline14d: buildSparkline(snapshots, driver),
  }
}

export function rankDrivers(snapshots: DailySnapshot[]): RankingResult {
  const ranked = DRIVERS.map((d) => buildRankedDriver(snapshots, d))
  const qualified = ranked
    .filter((d) => d.state === 'qualified' && d.pearson != null)
    .sort((a, b) => Math.abs(b.pearson!.r) - Math.abs(a.pearson!.r))
  const top3 = qualified.slice(0, TOP_N)
  const othersQualified = qualified.slice(TOP_N)
  const dim = ranked.filter((d) => d.state === 'dim')
  const others = [...othersQualified, ...dim]

  const robustCount = top3.filter(
    (d) => d.pearson != null && Math.abs(d.pearson.r) >= ROBUST_R_THRESHOLD,
  ).length
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated)
  const pairedDays = usable.filter((s) => s.mood?.valence != null).length
  const coveragePct = usable.length > 0 ? Math.round((pairedDays / usable.length) * 100) : 0

  return {
    top3,
    others,
    total: ranked.length,
    robustCount,
    coveragePct,
    pairedDays,
  }
}
