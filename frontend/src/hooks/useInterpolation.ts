/**
 * useInterpolation — wrapper sobre as três estratégias:
 *   'off'    → passthrough (retorna snapshots originais)
 *   'linear' → interpolateLinear() puro frontend
 *   'claude' → POST /health/api/interpolate + fallback para linear no erro
 *
 * Design note: o modo 'claude' usa TanStack Query com staleTime Infinity.
 * A queryKey inclui um hash das datas presentes, então a cache invalida
 * automaticamente quando AutoExport entrega dias novos.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { DailySnapshot } from '@/types/apple-health'
import { interpolateLinear } from '@/utils/interpolate'

const BASE = '/health/api'

export type InterpolationMode = 'off' | 'linear' | 'claude'

export interface InterpolationResult {
  snapshots: DailySnapshot[]
  loading: boolean
  error: boolean
  filledCount: number
}

interface InterpolateResponse {
  snapshots: DailySnapshot[]
  meta: {
    cached: boolean
    error: string | null
    filled_dates: string[]
  }
}

function hashDates(snapshots: DailySnapshot[]): string {
  // Hash leve: só as datas ordenadas. Mudou data → queryKey muda → re-fetch.
  return snapshots.map((s) => s.date).sort().join(',')
}

async function postInterpolate(snapshots: DailySnapshot[]): Promise<InterpolateResponse> {
  const res = await fetch(`${BASE}/interpolate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshots, strategy: 'claude' }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export function useInterpolation(
  snapshots: DailySnapshot[],
  mode: InterpolationMode,
): InterpolationResult {
  // Linear: puro memo, sync, sem network
  const linearResult = useMemo(() => {
    if (mode === 'off' || snapshots.length < 2) return snapshots
    return interpolateLinear(snapshots)
  }, [snapshots, mode])

  // Claude: TanStack Query. enabled só quando mode === 'claude' e há >=2 dias reais.
  const query = useQuery<InterpolateResponse>({
    queryKey: ['interpolate', 'claude', hashDates(snapshots)],
    queryFn: () => postInterpolate(snapshots),
    enabled: mode === 'claude' && snapshots.length >= 2,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  })

  if (mode === 'off') {
    return { snapshots, loading: false, error: false, filledCount: 0 }
  }

  if (mode === 'linear') {
    const filled = linearResult.filter((s) => s.interpolated === true).length
    return { snapshots: linearResult, loading: false, error: false, filledCount: filled }
  }

  // mode === 'claude'
  if (query.isLoading) {
    // Durante loading, usa linear como placeholder pra UI não travar
    const filled = linearResult.filter((s) => s.interpolated === true).length
    return { snapshots: linearResult, loading: true, error: false, filledCount: filled }
  }
  if (query.error || query.data?.meta?.error) {
    // Erro do backend ou rede → fallback pra linear com flag de erro
    const filled = linearResult.filter((s) => s.interpolated === true).length
    return { snapshots: linearResult, loading: false, error: true, filledCount: filled }
  }
  if (query.data) {
    return {
      snapshots: query.data.snapshots,
      loading: false,
      error: false,
      filledCount: query.data.meta.filled_dates.length,
    }
  }

  // Fallback defensivo (não deve chegar aqui)
  return { snapshots, loading: false, error: false, filledCount: 0 }
}
