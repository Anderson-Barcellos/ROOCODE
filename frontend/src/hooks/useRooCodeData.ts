import { useMemo } from 'react'

import { useDoses, useMetrics, useMood, useRegimen, useSleep, type DoseRecord } from '@/lib/api'
import { MOCK_DOSES, MOCK_DATES, MOCK_MED_ROWS, MOCK_REGIMEN } from '@/mocks/doseMock'
import { MOCK_SNAPSHOTS } from '@/mocks/snapshotMock'
import type { DailySnapshot, ForecastSignal, MedicationRow, OverviewMetrics } from '@/types/apple-health'
import type { MedicationRegimenEntry } from '@/types/pharmacology'
import { buildOverviewMetrics } from '@/utils/aggregation'
import { buildMedGroups, type MedGroup } from '@/utils/medication-bridge'
import {
  buildSnapshotsFromAPI,
  detectMoodDataQuality,
  type MoodDataQuality,
} from '@/utils/roocode-adapter'
import { useForecast, type ForecastMode } from './useForecast'
import { useInterpolation, type InterpolationMode } from './useInterpolation'

export interface RooCodeData {
  snapshots: DailySnapshot[]
  medicationRows: MedicationRow[]
  regimen: MedicationRegimenEntry[]
  doses: DoseRecord[]
  dates: string[]
  pkGroups: MedGroup[]
  overview: OverviewMetrics
  moodQuality: MoodDataQuality
  loading: boolean
  error: boolean
  usedMock: boolean
  // Interpolação (Fase 5)
  interpolationMode: InterpolationMode
  interpolationLoading: boolean
  interpolationError: boolean
  interpolationFilledCount: number
  // Progressive Unlock (Fase 5d)
  validRealDays: number
  validMoodDays: number
  // Forecast (Fase 7)
  forecastMode: ForecastMode
  forecastLoading: boolean
  forecastError: boolean
  forecastErrorMessage: string | null
  forecastedCount: number
  forecastedSnapshots: DailySnapshot[]
  forecastSignals: ForecastSignal[]
  forecastMaxConfidence: number
}

function buildLast14Days(): string[] {
  const out: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 14; i >= 1; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export function useRooCodeData(interpolation: InterpolationMode = 'off', forecast: ForecastMode = 'off'): RooCodeData {
  const sleepQuery = useSleep()
  const metricsQuery = useMetrics()
  const moodQuery = useMood()
  const dosesQuery = useDoses(14 * 24)
  const regimenQuery = useRegimen(!USE_MOCK)

  const loading =
    !USE_MOCK &&
    (sleepQuery.isLoading ||
      metricsQuery.isLoading ||
      moodQuery.isLoading ||
      dosesQuery.isLoading ||
      regimenQuery.isLoading)
  const error =
    !USE_MOCK &&
    Boolean(sleepQuery.error || metricsQuery.error || moodQuery.error || dosesQuery.error || regimenQuery.error)

  const resolved = useMemo(() => {
    if (USE_MOCK) {
      return {
        snapshots: MOCK_SNAPSHOTS,
        medicationRows: MOCK_MED_ROWS,
        regimen: MOCK_REGIMEN,
        doses: MOCK_DOSES,
        moodQuality: detectMoodDataQuality(undefined),
        usedMock: true,
      }
    }

    const adapterOut = buildSnapshotsFromAPI({
      sleep: sleepQuery.data,
      metrics: metricsQuery.data,
      mood: moodQuery.data,
      doses: dosesQuery.data,
    })

    return {
      snapshots: adapterOut.snapshots,
      medicationRows: adapterOut.medicationRows,
      regimen: regimenQuery.data ?? [],
      doses: dosesQuery.data ?? [],
      moodQuality: adapterOut.moodQuality,
      usedMock: false,
    }
  }, [sleepQuery.data, metricsQuery.data, moodQuery.data, dosesQuery.data, regimenQuery.data])

  // ─── Interpolação ──────────────────────────────────────────────────────────
  // Aplica depois do adapter, antes das derivações. Charts recebem array já
  // enriquecido com dias sintéticos marcados (interpolated=true).
  const interp = useInterpolation(resolved.snapshots, interpolation)
  const effectiveSnapshots = interp.snapshots

  // ─── Derivações (sempre a partir de effectiveSnapshots) ────────────────────
  const pkGroups = useMemo(() => buildMedGroups(resolved.medicationRows), [resolved.medicationRows])
  const overview = useMemo(() => buildOverviewMetrics(effectiveSnapshots), [effectiveSnapshots])

  // ─── Progressive Unlock (Fase 5d) ──────────────────────────────────────────
  // Conta só dias REAIS (não interpolados) — readiness reflete dados coletados.
  const { validRealDays, validMoodDays } = useMemo(() => {
    let real = 0
    let mood = 0
    for (const s of effectiveSnapshots) {
      if (s.interpolated) continue
      if (s.health != null) real += 1
      if (s.mood?.valence != null) mood += 1
    }
    return { validRealDays: real, validMoodDays: mood }
  }, [effectiveSnapshots])

  // ─── Forecast (Fase 7) ──────────────────────────────────────────────────────
  const fc = useForecast(effectiveSnapshots, forecast, validRealDays)

  // ─── dates: fix do gotcha Fase 4 ───────────────────────────────────────────
  // Antes (Fase 4): dates era wall-clock 14d, independente de snapshots.
  // Agora: quando interpolado, usa as datas dos snapshots (garante alinhamento).
  // Mock continua usando MOCK_DATES.
  const dates = useMemo(() => {
    if (USE_MOCK) return MOCK_DATES
    if (interpolation === 'off') return buildLast14Days()
    return effectiveSnapshots.map((s) => s.date)
  }, [interpolation, effectiveSnapshots])

  return {
    snapshots: effectiveSnapshots,
    medicationRows: resolved.medicationRows,
    regimen: resolved.regimen,
    doses: resolved.doses,
    dates,
    pkGroups,
    overview,
    moodQuality: resolved.moodQuality,
    loading,
    error,
    usedMock: resolved.usedMock,
    interpolationMode: interpolation,
    interpolationLoading: interp.loading,
    interpolationError: interp.error,
    interpolationFilledCount: interp.filledCount,
    validRealDays,
    validMoodDays,
    forecastMode: forecast,
    forecastLoading: fc.loading,
    forecastError: fc.error,
    forecastErrorMessage: fc.errorMessage,
    forecastedCount: fc.forecastedCount,
    forecastedSnapshots: fc.forecastedSnapshots,
    forecastSignals: fc.signals,
    forecastMaxConfidence: fc.maxConfidence,
  }
}
