import { useQuery } from '@tanstack/react-query'

import type { DailySnapshot, ForecastSignal } from '@/types/apple-health'

const BASE = '/health/api'

export type ForecastMode = 'off' | 'on'

export interface ForecastResult {
  forecastedSnapshots: DailySnapshot[]
  loading: boolean
  error: boolean
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

function hashDates(snapshots: DailySnapshot[]): string {
  return snapshots.map((s) => s.date).sort().join(',')
}

async function postForecast(
  snapshots: DailySnapshot[],
  validRealDays: number,
): Promise<ForecastResponse> {
  const res = await fetch(`${BASE}/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshots, horizon: 5, valid_real_days: validRealDays }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useForecast(
  snapshots: DailySnapshot[],
  mode: ForecastMode,
  validRealDays: number,
): ForecastResult {
  const query = useQuery<ForecastResponse>({
    queryKey: ['forecast', hashDates(snapshots), validRealDays],
    queryFn: () => postForecast(snapshots, validRealDays),
    enabled: mode === 'on' && snapshots.length >= 2 && validRealDays >= 7,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  })

  const empty: ForecastResult = {
    forecastedSnapshots: [],
    loading: false,
    error: false,
    forecastedCount: 0,
    signals: [],
    maxConfidence: 0,
  }

  if (mode === 'off') return empty

  if (validRealDays < 7) return empty

  if (query.isLoading) {
    return { ...empty, loading: true }
  }

  if (query.error || query.data?.meta?.error) {
    return { ...empty, error: true }
  }

  if (query.data) {
    return {
      forecastedSnapshots: query.data.forecasted_snapshots,
      loading: false,
      error: false,
      forecastedCount: query.data.meta.forecasted_dates.length,
      signals: query.data.signals,
      maxConfidence: query.data.meta.max_confidence,
    }
  }

  return empty
}
