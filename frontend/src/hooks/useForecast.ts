import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { DailySnapshot, ForecastSignal } from '@/types/apple-health'
import {
  enrichSnapshotsWithDerivations,
  type SnapshotDerivations,
} from '../utils/forecast-payload-enrichment'

const BASE = '/health/api'
const FORECAST_HORIZON_DAYS = 5
const FORECAST_CONTEXT_MAX_DAYS = 45
const FORECAST_SUMMARY_WINDOW_DAYS = 7
const FORECAST_MIN_CONTEXT_DAYS = 7

const FORECAST_FIELDS = [
  'sleepTotalHours',
  'hrvSdnn',
  'restingHeartRate',
  'activeEnergyKcal',
  'exerciseMinutes',
  'valence',
] as const

const SLEEP_DETAIL_FIELDS = [
  'sleepRemHours',
  'sleepDeepHours',
  'sleepCoreHours',
  'sleepAwakeHours',
  'sleepEfficiencyPct',
] as const

type ForecastField = (typeof FORECAST_FIELDS)[number]
type SleepDetailField = (typeof SLEEP_DETAIL_FIELDS)[number]

export type ForecastMode = 'off' | 'on'

export interface ForecastResult {
  forecastedSnapshots: DailySnapshot[]
  loading: boolean
  error: boolean
  errorMessage: string | null
  forecastedCount: number
  signals: ForecastSignal[]
  maxConfidence: number
}

interface ForecastResponse {
  forecasted_snapshots: DailySnapshot[]
  meta: {
    cached: boolean
    error: string | null
    forecasted_dates: string[]
    max_confidence: number
  }
  signals: ForecastSignal[]
}

interface ForecastApiError extends Error {
  status?: number
  response?: ForecastResponse
}

export interface ForecastCompactSnapshot {
  date: string
  values: Record<ForecastField, number | null>
  sleep_detail?: Partial<Record<SleepDetailField, number | null>>
  derivations?: {
    recoveryScore: number | null
    abi: number | null
    wristTempDeviation: number | null
  }
  is_interpolated?: boolean
  confidence?: number
}

export interface ForecastRollingSummary {
  window_days: number
  sample_days: number
  means: Record<ForecastField, number | null>
}

export interface ForecastPayload {
  snapshots: ForecastCompactSnapshot[]
  horizon: number
  valid_real_days: number
  rolling_summary: ForecastRollingSummary
}

function mean(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length
}

function toCompactSnapshot(
  snapshot: DailySnapshot,
  derivations: SnapshotDerivations | undefined,
): ForecastCompactSnapshot | null {
  // Sprint M6.2.e: interp/forecast agora ENTRAM no payload com flag explícita.
  // IA recebe contexto completo + sinaliza qual peso dar via is_interpolated.

  const values: Record<ForecastField, number | null> = {
    sleepTotalHours: snapshot.health?.sleepTotalHours ?? null,
    hrvSdnn: snapshot.health?.hrvSdnn ?? null,
    restingHeartRate: snapshot.health?.restingHeartRate ?? null,
    activeEnergyKcal: snapshot.health?.activeEnergyKcal ?? null,
    exerciseMinutes: snapshot.health?.exerciseMinutes ?? null,
    valence: snapshot.mood?.valence ?? null,
  }

  const hasSignal = FORECAST_FIELDS.some((field) => values[field] != null)
  if (!hasSignal) return null

  const sleepDetail: Partial<Record<SleepDetailField, number | null>> = {}
  let hasSleepDetail = false
  for (const field of SLEEP_DETAIL_FIELDS) {
    const v = snapshot.health?.[field]
    if (typeof v === 'number') {
      sleepDetail[field] = v
      hasSleepDetail = true
    }
  }

  const out: ForecastCompactSnapshot = { date: snapshot.date, values }
  if (hasSleepDetail) out.sleep_detail = sleepDetail

  const isInterp = Boolean(snapshot.interpolated || snapshot.forecasted)
  if (isInterp) out.is_interpolated = true
  if (typeof snapshot.confidence === 'number') {
    out.confidence = snapshot.confidence
  } else if (isInterp) {
    out.confidence = 0.5
  }

  if (derivations) {
    const hasAnyDerivation =
      derivations.recoveryScore !== null ||
      derivations.abi !== null ||
      derivations.wristTempDeviation !== null
    if (hasAnyDerivation) {
      out.derivations = {
        recoveryScore: derivations.recoveryScore,
        abi: derivations.abi,
        wristTempDeviation: derivations.wristTempDeviation,
      }
    }
  }

  return out
}

export function buildForecastPayload(
  snapshots: DailySnapshot[],
  validRealDays: number,
): ForecastPayload {
  const derivationsByDate = enrichSnapshotsWithDerivations(snapshots)
  const compact = snapshots
    .map((s) => toCompactSnapshot(s, derivationsByDate.get(s.date)))
    .filter((row): row is ForecastCompactSnapshot => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-FORECAST_CONTEXT_MAX_DAYS)

  // Rolling means só sobre dias reais — mesmo padrão das baselines (M3).
  // Inclui interp no payload (com flag) mas não inflar média estatística.
  const realCompact = compact.filter((row) => !row.is_interpolated)
  const summarySlice = realCompact.slice(-FORECAST_SUMMARY_WINDOW_DAYS)
  const means: Record<ForecastField, number | null> = {
    sleepTotalHours: mean(summarySlice.map((row) => row.values.sleepTotalHours)),
    hrvSdnn: mean(summarySlice.map((row) => row.values.hrvSdnn)),
    restingHeartRate: mean(summarySlice.map((row) => row.values.restingHeartRate)),
    activeEnergyKcal: mean(summarySlice.map((row) => row.values.activeEnergyKcal)),
    exerciseMinutes: mean(summarySlice.map((row) => row.values.exerciseMinutes)),
    valence: mean(summarySlice.map((row) => row.values.valence)),
  }

  return {
    snapshots: compact,
    horizon: FORECAST_HORIZON_DAYS,
    valid_real_days: validRealDays,
    rolling_summary: {
      window_days: FORECAST_SUMMARY_WINDOW_DAYS,
      sample_days: summarySlice.length,
      means,
    },
  }
}

function hashForecastPayload(payload: ForecastPayload): string {
  const rows = payload.snapshots
    .map((snapshot) => {
      const values = FORECAST_FIELDS
        .map((field) => {
          const value = snapshot.values[field]
          return value == null ? '∅' : value.toFixed(3)
        })
        .join('|')
      const sleep = SLEEP_DETAIL_FIELDS
        .map((field) => {
          const value = snapshot.sleep_detail?.[field]
          return value == null ? '∅' : value.toFixed(2)
        })
        .join('|')
      const deriv = snapshot.derivations
        ? `r:${snapshot.derivations.recoveryScore?.toFixed(1) ?? '∅'}` +
          `|a:${snapshot.derivations.abi?.toFixed(2) ?? '∅'}` +
          `|w:${snapshot.derivations.wristTempDeviation?.toFixed(2) ?? '∅'}`
        : '∅'
      const flag = snapshot.is_interpolated ? '#interp' : ''
      return `${snapshot.date}|${values}|s:${sleep}|d:${deriv}${flag}`
    })
    .join(';')

  const means = FORECAST_FIELDS
    .map((field) => {
      const value = payload.rolling_summary.means[field]
      return value == null ? '∅' : value.toFixed(3)
    })
    .join('|')

  return [
    rows,
    `vrd:${payload.valid_real_days}`,
    `h:${payload.horizon}`,
    `w:${payload.rolling_summary.window_days}`,
    `n:${payload.rolling_summary.sample_days}`,
    `m:${means}`,
  ].join('::')
}

export async function postForecast(payload: ForecastPayload): Promise<ForecastResponse> {
  const res = await fetch(`${BASE}/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const rawBody = await res.text()
  let parsed: ForecastResponse | null = null
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody) as ForecastResponse
    } catch {
      parsed = null
    }
  }

  if (!parsed || !parsed.meta) {
    const parseError: ForecastApiError = new Error(res.ok ? 'Invalid forecast response JSON' : `HTTP ${res.status}`)
    parseError.status = res.status
    throw parseError
  }

  if (!res.ok) {
    const message = parsed.meta?.error ?? `HTTP ${res.status}`
    const httpError: ForecastApiError = new Error(message)
    httpError.status = res.status
    httpError.response = parsed
    throw httpError
  }

  return parsed
}

export function useForecast(
  snapshots: DailySnapshot[],
  mode: ForecastMode,
  validRealDays: number,
): ForecastResult {
  const payload = useMemo(
    () => buildForecastPayload(snapshots, validRealDays),
    [snapshots, validRealDays],
  )
  const payloadHash = useMemo(() => hashForecastPayload(payload), [payload])

  const query = useQuery<ForecastResponse>({
    queryKey: ['forecast', payloadHash],
    queryFn: () => postForecast(payload),
    enabled: mode === 'on' && payload.snapshots.length >= FORECAST_MIN_CONTEXT_DAYS && validRealDays >= 7,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  })

  const empty: ForecastResult = {
    forecastedSnapshots: [],
    loading: false,
    error: false,
    errorMessage: null,
    forecastedCount: 0,
    signals: [],
    maxConfidence: 0,
  }

  const response = query.data ?? (query.error as ForecastApiError | undefined)?.response ?? null

  if (mode === 'off') return empty

  if (validRealDays < 7 || payload.snapshots.length < FORECAST_MIN_CONTEXT_DAYS) return empty

  if (query.isLoading) {
    return { ...empty, loading: true }
  }

  if (response?.meta?.error) {
    return { ...empty, error: true, errorMessage: response.meta.error }
  }

  if (query.error) {
    const message = query.error instanceof Error ? query.error.message : 'Forecast request failed'
    return { ...empty, error: true, errorMessage: message }
  }

  if (response) {
    return {
      forecastedSnapshots: response.forecasted_snapshots,
      loading: false,
      error: false,
      errorMessage: null,
      forecastedCount: response.meta.forecasted_dates.length,
      signals: response.signals,
      maxConfidence: response.meta.max_confidence,
    }
  }

  return empty
}
