import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import type { MedicationRegimenEntry } from '@/types/pharmacology'

const BASE = '/health/api'

export interface Substance {
  id: string
  display_name: string
  aliases: string[]
  dose_unit: string
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  is_custom: boolean
  // Campos PK full (retornados apenas com ?full=true; undefined no modo slim)
  model_supported?: boolean
  time_unit?: string
  bioavailability?: number | null
  half_life_hours?: number | null
  tmax_hours?: number | null
  ke_per_hour?: number | null
  ka_per_hour?: number | null
  vd_l_per_kg?: number | null
  vd_l?: number | null
  vd_basis?: string | null
  therapeutic_range_min?: number | null
  therapeutic_range_max?: number | null
  therapeutic_range_unit?: string | null
  ke0_per_hour?: number | null
  notes?: string[]
  sources?: string[]
}

export interface SubstancePayload {
  display_name: string
  aliases?: string[]
  model_supported?: boolean
  confidence?: 'high' | 'medium' | 'low' | 'unknown'
  dose_unit?: string
  time_unit?: string
  bioavailability: number
  half_life_hours: number
  tmax_hours: number
  ke_per_hour: number
  ka_per_hour: number
  vd_l_per_kg?: number | null
  vd_l?: number | null
  vd_basis?: string | null
  therapeutic_range_min?: number | null
  therapeutic_range_max?: number | null
  therapeutic_range_unit?: string | null
  ke0_per_hour?: number | null
  notes?: string[]
  sources?: string[]
}

export type SubstancePatch = Partial<SubstancePayload>

export interface DoseRecord {
  id: string
  substance: string
  dose_mg: number
  taken_at: string
  note: string
  logged_at: string
}

export type { MedicationRegimenEntry }

export interface SleepRecord {
  'Date/Time': string
  'Total Sleep (hr)': number
  'Asleep (Unspecified) (hr)': number
  'In Bed (hr)'?: number
  'Core (hr)': number
  'Deep (hr)': number
  'REM (hr)': number
  'Awake (hr)': number
}

export interface MoodRecord {
  Iniciar: string
  // Fase 8B — 'Fim' distingue tipo do registro no State of Mind:
  //   'Humor Diário' (agregado do dia, sem hora no Iniciar)
  //   'Emoção Momentânea' (ponto com timestamp HH:MM:SS no Iniciar)
  Fim?: string
  Associações: number | string
  Valência?: string
}

export interface MetricsRecord {
  'Data/Hora'?: string    // AutoExport v2 (PT-BR)
  'Date/Time'?: string    // AutoExport v1 (coluna em inglês, resto PT-BR)
  'Contador de Passos (passos)'?: number
  'Distância de Caminhada + Corrida (km)'?: number
  'Distúrbios Respiratórios (contagem)'?: number
  'Energia Ativa (kcal)'?: number
  'Energia em repouso (kcal)'?: number
  'Esforço Físico (kcal/hr·kg)'?: number
  'Frequência Cardíaca [Min] (bpm)'?: number
  'Frequência Cardíaca [Max] (bpm)'?: number
  'Frequência Cardíaca [Avg] (bpm)'?: number
  // AutoExport v2 (PT-BR completo) — fallback no roocode-adapter:
  'Frequência Cardíaca [Mínimo] (bpm)'?: number
  'Frequência Cardíaca [Máx] (bpm)'?: number
  'Frequência Cardíaca [Média] (bpm)'?: number
  'Frequência Cardíaca em Repouso (bpm)'?: number
  'Média de Frequência Cardíaca ao Caminhar (bpm)'?: number
  'Porcentagem de Assimetria ao Andar (%)'?: number
  'Saturação de Oxigênio no Sangue (%)'?: number
  'Taxa Respiratória (contagem/min)'?: number
  'Temperatura do Pulso ao Dormir Apple (ºC)'?: number
  'Tempo de Exercício da Apple (min)'?: number
  'Tempo em Pé do Apple (min)'?: number
  'Tempo à Luz do Dia (min)'?: number
  'Teste de Caminhada de Seis Minutos - Distância (m)'?: number
  'VO2 Máx (ml/(kg·min))'?: number
  'Variabilidade da Frequência Cardíaca (ms)'?: number
  'Velocidade de Caminhada (km/hr)'?: number
  'Comprimento do Passo ao Caminhar (cm)'?: number
  'Velocidade de Corrida (km/hr)'?: number
  'Recuperação Cardio (contagem/min)'?: number
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return payload as T
}

const get = <T,>(path: string) => fetch(`${BASE}${path}`).then((response) => readJson<T>(response))

export const useSubstances = () =>
  useQuery<Substance[]>({
    queryKey: ['substances'],
    queryFn: () => get<Substance[]>('/farma/substances?full=true'),
    staleTime: Infinity,
  })

// ─── Concentration series (PK daily reduction: cmax/cmin/auc) ────────────────

export interface ConcentrationSeriesPoint {
  date: string
  cmax_est: number
  cmin_est: number
  auc_est: number
}

export interface ConcentrationSeriesPayload {
  substance: string
  from: string
  to: string
  weight_kg: number
  source: 'dose_log' | 'regimen_fallback'
  events_count: number
  series: ConcentrationSeriesPoint[]
}

export const useConcentrationSeries = (
  substance: string | null,
  from: string,
  to: string,
  weightKg = 70,
) =>
  useQuery<ConcentrationSeriesPayload>({
    queryKey: ['concentration-series', substance, from, to, weightKg],
    queryFn: () =>
      get<ConcentrationSeriesPayload>(
        `/farma/concentration-series?substance=${encodeURIComponent(
          substance ?? '',
        )}&from=${from}&to=${to}&weight_kg=${weightKg}`,
      ),
    enabled: Boolean(substance && from && to),
    staleTime: 5 * 60 * 1000,
  })

export const useDoses = (hours = 72) =>
  useQuery<DoseRecord[]>({ queryKey: ['doses', hours], queryFn: () => get<DoseRecord[]>(`/farma/doses?hours=${hours}`) })

export const useRegimen = (enabled = true) =>
  useQuery<MedicationRegimenEntry[]>({
    queryKey: ['regimen'],
    queryFn: () => get<MedicationRegimenEntry[]>('/farma/regimen'),
    staleTime: 5 * 60 * 1000,
    enabled,
  })

export const useSleep = () =>
  useQuery<SleepRecord[]>({ queryKey: ['sleep'], queryFn: () => get<SleepRecord[]>('/sleep') })

export const useMood = () =>
  useQuery<MoodRecord[]>({ queryKey: ['mood'], queryFn: () => get<MoodRecord[]>('/mood') })

export const useMetrics = () =>
  useQuery<MetricsRecord[]>({ queryKey: ['metrics'], queryFn: () => get<MetricsRecord[]>('/metrics') })

// ─── Forecast summary (agregados sem IA) ────────────────────────────────────

export interface ForecastFieldTrend {
  available_days: number
  last_value: number | null
  mean_last7: number | null
  mean_prev7: number | null
  delta_last7_vs_prev7: number | null
}

export interface ForecastWeekdayEffect {
  weekend_mean: number | null
  weekday_mean: number | null
  weekend_minus_weekday: number | null
}

export interface ForecastSummary {
  context_days: number
  context_range: { from: string | null; to: string | null }
  rolling_summary: Record<string, unknown>
  field_trends: Record<string, ForecastFieldTrend>
  weekday_effect: Record<string, ForecastWeekdayEffect>
  recent_trace: Array<Record<string, unknown>>
}

export interface ForecastSummaryInputSnapshot {
  date: string
  values: {
    sleepTotalHours: number | null
    hrvSdnn: number | null
    restingHeartRate: number | null
    activeEnergyKcal: number | null
    exerciseMinutes: number | null
    valence: number | null
  }
}

// ─── Forecast accuracy (backtest predicted vs actual) ──────────────────────

export interface FieldAccuracy {
  mape: number | null
  mae: number
  rmse: number
  n: number
}

export interface ForecastAccuracyResponse {
  accuracy_by_field: Record<string, FieldAccuracy>
  window_days: number
  history_size: number
  warning: string | null
}

export const useForecastAccuracy = (
  snapshots: ForecastSummaryInputSnapshot[],
  daysBack = 30,
) => {
  const cacheKey =
    snapshots.length === 0
      ? 'empty'
      : `${snapshots.length}:${daysBack}:${snapshots[0].date}:${snapshots[snapshots.length - 1].date}`
  return useQuery<ForecastAccuracyResponse>({
    queryKey: ['forecast-accuracy', cacheKey],
    queryFn: () =>
      fetch(`${BASE}/forecast/accuracy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshots, days_back: daysBack }),
      }).then((response) => readJson<ForecastAccuracyResponse>(response)),
    staleTime: 5 * 60 * 1000,
    enabled: snapshots.length >= 1,
  })
}

export const useForecastSummary = (snapshots: ForecastSummaryInputSnapshot[]) => {
  // Cache key compacta: count + first/last date — captura mudança de janela
  // sem custo de hash do payload completo (~150 dias).
  const cacheKey =
    snapshots.length === 0
      ? 'empty'
      : `${snapshots.length}:${snapshots[0].date}:${snapshots[snapshots.length - 1].date}`
  return useQuery<ForecastSummary>({
    queryKey: ['forecast-summary', cacheKey],
    queryFn: () =>
      fetch(`${BASE}/forecast/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshots }),
      }).then((response) => readJson<ForecastSummary>(response)),
    staleTime: 5 * 60 * 1000,
    enabled: snapshots.length >= 7,
  })
}

export const useLogDose = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { substance: string; dose_mg: number; taken_at: string; note: string }) =>
      fetch(`${BASE}/farma/doses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((response) => readJson<DoseRecord>(response)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doses'] })
      qc.invalidateQueries({ queryKey: ['pk-curve'] })
      qc.invalidateQueries({ queryKey: ['pk-now'] })
    },
  })
}

export type DosePatch = Partial<Pick<DoseRecord, 'substance' | 'dose_mg' | 'taken_at' | 'note'>>

export const useUpdateDose = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DosePatch }) =>
      fetch(`${BASE}/farma/doses/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then((response) => readJson<DoseRecord>(response)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doses'] })
      qc.invalidateQueries({ queryKey: ['pk-curve'] })
      qc.invalidateQueries({ queryKey: ['pk-now'] })
    },
  })
}

export const useDeleteDose = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/farma/doses/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).then((response) => readJson<{ id: string; deleted: boolean }>(response)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doses'] })
      qc.invalidateQueries({ queryKey: ['pk-curve'] })
      qc.invalidateQueries({ queryKey: ['pk-now'] })
    },
  })
}

export const useCreateSubstance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: SubstancePayload }) =>
      fetch(`${BASE}/farma/substances/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((response) => readJson<Substance>(response)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['substances'] })
    },
  })
}

export const useUpdateSubstance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: SubstancePatch }) =>
      fetch(`${BASE}/farma/substances/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then((response) => readJson<Substance>(response)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['substances'] })
    },
  })
}

export const useDeleteSubstance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      fetch(`${BASE}/farma/substances/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }).then((response) => readJson<{ id: string; deleted: boolean; display_name: string }>(response)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['substances'] })
    },
  })
}

