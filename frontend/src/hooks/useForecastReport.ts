import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { DailySnapshot, ForecastSignal } from '@/types/apple-health'

import { buildForecastPayload, type ForecastPayload } from './useForecast'

const BASE = '/health/api'

export interface ForecastNarrative {
  contexto_recente: string
  hipoteses_ativas: string
  tendencias: string
  drivers_principais: string
  projecao_5d: string
  recomendacoes_monitoramento: string
}

export type ForecastDriverImpact = 'alto' | 'medio' | 'baixo'
export type ForecastDriverDirection = 'positivo' | 'negativo' | 'neutro'

export interface ForecastDriver {
  name: string
  impact: ForecastDriverImpact
  direction: ForecastDriverDirection
  rationale: string
}

export interface ForecastReport {
  report_id: string
  generated_at: string
  narrative: ForecastNarrative
  forecast_snapshots: DailySnapshot[]
  signals: ForecastSignal[]
  drivers: ForecastDriver[]
  max_confidence: number
}

interface ForecastReportErrorResponse {
  forecasted_snapshots: DailySnapshot[]
  meta: {
    cached: boolean
    error: string | null
    forecasted_dates: string[]
    max_confidence: number
  }
  signals: ForecastSignal[]
}

interface ForecastReportApiError extends Error {
  status?: number
  response?: ForecastReportErrorResponse
}

export interface ForecastReportInput {
  snapshots: DailySnapshot[]
  validRealDays: number
}

function isErrorResponse(value: unknown): value is ForecastReportErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'meta' in value &&
    typeof (value as { meta?: unknown }).meta === 'object'
  )
}

function isReport(value: unknown): value is ForecastReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    'report_id' in value &&
    'narrative' in value
  )
}

export async function postForecastReport(payload: ForecastPayload): Promise<ForecastReport> {
  const res = await fetch(`${BASE}/forecast/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const rawBody = await res.text()
  let parsed: unknown = null
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      parsed = null
    }
  }

  if (!res.ok) {
    const message =
      isErrorResponse(parsed) && parsed.meta?.error
        ? parsed.meta.error
        : `HTTP ${res.status}`
    const httpError: ForecastReportApiError = new Error(message)
    httpError.status = res.status
    if (isErrorResponse(parsed)) {
      httpError.response = parsed
    }
    throw httpError
  }

  if (!isReport(parsed)) {
    const parseError: ForecastReportApiError = new Error('Invalid forecast report response JSON')
    parseError.status = res.status
    throw parseError
  }

  return parsed
}

export function useForecastReport() {
  const queryClient = useQueryClient()
  return useMutation<ForecastReport, ForecastReportApiError, ForecastReportInput>({
    mutationKey: ['forecast-report'],
    mutationFn: async ({ snapshots, validRealDays }) => {
      const payload = buildForecastPayload(snapshots, validRealDays)
      return postForecastReport(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forecast-reports-list'] })
    },
  })
}
