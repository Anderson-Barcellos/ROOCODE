import type { DailyHealthMetrics, DailySnapshot } from '@/types/apple-health'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ReadinessStatus = 'standby' | 'collecting' | 'exploratory' | 'robust'

export interface DataReadiness {
  status: ReadinessStatus
  current: number
  robustMin: number
  exploratoryMin: number
  collectingMin: number
  label: string
  pendingMessage: string
}

type HealthField = keyof DailyHealthMetrics
type MoodField = 'mood.valence'

export type ReadinessRequirement =
  | {
      type: 'days'
      robustMin: number
      exploratoryMin: number
      collectingMin: number
      field?: HealthField | MoodField
    }
  | { type: 'pairs'; robustMin: number; exploratoryMin: number; collectingMin: number }
  | {
      type: 'dow_coverage'
      robustMin: number
      exploratoryMin: number
      collectingMin: number
      minDows: number
      minSamplesPerDow: number
    }

// ─── Contagens ───────────────────────────────────────────────────────────────

function countValidHealthDays(snapshots: DailySnapshot[], field?: HealthField): number {
  return snapshots.filter((s) => {
    if (s.interpolated || s.forecasted) return false
    if (!s.health) return false
    if (field) return s.health[field] != null
    return true
  }).length
}

function countValidMoodDays(snapshots: DailySnapshot[]): number {
  return snapshots.filter((s) => !s.interpolated && !s.forecasted && s.mood?.valence != null).length
}

function dayOfWeekFromIsoDate(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  // Usa construtor local (ano, mês-1, dia) para evitar deslocamento por UTC
  // em strings YYYY-MM-DD.
  const localDate = new Date(year, month - 1, day)
  if (!Number.isFinite(localDate.getTime())) return null
  return localDate.getDay()
}

function countDowCoverage(
  snapshots: DailySnapshot[],
  minSamplesPerDow: number,
): { coveredDows: number; totalDays: number } {
  const bucket: Record<number, number> = {}
  for (const s of snapshots) {
    if (s.interpolated || s.forecasted || !s.health) continue
    const dow = dayOfWeekFromIsoDate(s.date)
    if (dow == null) continue
    bucket[dow] = (bucket[dow] ?? 0) + 1
  }
  const coveredDows = Object.values(bucket).filter((n) => n >= minSamplesPerDow).length
  const totalDays = Object.values(bucket).reduce((a, b) => a + b, 0)
  return { coveredDows, totalDays }
}

// ─── Mensagem de pending ─────────────────────────────────────────────────────
// TODO(Anders): troca o tom/formato abaixo do jeito que tu quer.
// Exemplos de call sites:
//   buildPendingMessage('Scatter HRV×Sono', 5, 20, 'pares')  → cards da aba patterns
//   buildPendingMessage('HRV', 2, 7, 'dias')                 → aba executive/sleep
//   buildPendingMessage('Humor', 3, 7, 'dias')               → aba moodMedication
// Trade-offs:
//   1. Tom: clínico ("Requer 20 pares para análise confiável") vs gauchesco ("Bah, faltam 12 pares ainda") R: Clinico
//   2. Detalhe: incluir chartName específico ou só a métrica? R: Ao a Metrica meu velho!
//   3. Quantificação: "faltam X" (diferença) vs "X/Y" (progresso) vs ambos R: AMbos
//   4. Mood: contexto ("precisa histórico maior") ou só fato ("faltam 12 dias") R(Fato)
// A string entra num <p> dentro de EmptyAnalyticsState — sem quebra, sem markdown.

function buildPendingMessage(
  _chartName: string,
  current: number,
  required: number,
  exploratoryMin: number,
  unit: 'dias' | 'pares',
): string {
  const missing = Math.max(0, required - current)
  const descriptor = unit === 'pares' ? 'Standby estatístico' : 'Standby de série'
  return `${descriptor} · mínimo robusto ${required} ${unit} · exploratório ${exploratoryMin} · atual ${current}/${required} · faltam ${missing}`
}

function classifyReadiness(current: number, req: Pick<ReadinessRequirement, 'robustMin' | 'exploratoryMin' | 'collectingMin'>): ReadinessStatus {
  if (current >= req.robustMin) return 'robust'
  if (current >= req.exploratoryMin) return 'exploratory'
  if (current >= req.collectingMin) return 'collecting'
  return 'standby'
}

// ─── API pública ─────────────────────────────────────────────────────────────

export function evaluateReadiness(
  snapshots: DailySnapshot[],
  req: ReadinessRequirement,
  chartName: string,
  extras?: { pairCount?: number },
): DataReadiness {
  if (req.type === 'pairs') {
    const current = extras?.pairCount ?? 0
    const status = classifyReadiness(current, req)
    return {
      status,
      current,
      robustMin: req.robustMin,
      exploratoryMin: req.exploratoryMin,
      collectingMin: req.collectingMin,
      label: `${current}/${req.robustMin} pares`,
      pendingMessage: buildPendingMessage(chartName, current, req.robustMin, req.exploratoryMin, 'pares'),
    }
  }

  if (req.type === 'dow_coverage') {
    const { coveredDows, totalDays } = countDowCoverage(snapshots, req.minSamplesPerDow)
    const status = coveredDows >= req.minDows ? classifyReadiness(totalDays, req) : 'standby'
    return {
      status,
      current: totalDays,
      robustMin: req.robustMin,
      exploratoryMin: req.exploratoryMin,
      collectingMin: req.collectingMin,
      label: `${totalDays}/${req.robustMin} dias`,
      pendingMessage: buildPendingMessage(chartName, totalDays, req.robustMin, req.exploratoryMin, 'dias'),
    }
  }

  let current: number
  if (req.field === 'mood.valence') {
    current = countValidMoodDays(snapshots)
  } else if (req.field) {
    current = countValidHealthDays(snapshots, req.field)
  } else {
    current = countValidHealthDays(snapshots)
  }
  const status = classifyReadiness(current, req)
  return {
    status,
    current,
    robustMin: req.robustMin,
    exploratoryMin: req.exploratoryMin,
    collectingMin: req.collectingMin,
    label: `${current}/${req.robustMin} dias`,
    pendingMessage: buildPendingMessage(chartName, current, req.robustMin, req.exploratoryMin, 'dias'),
  }
}

// ─── Config central — fonte única de thresholds ──────────────────────────────

export const CHART_REQUIREMENTS = {
  timelineChart: { type: 'days', robustMin: 14, exploratoryMin: 7, collectingMin: 3 },
  hrvAnalysis: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'hrvSdnn' },
  heartRateBands: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'restingHeartRate' },
  activityBars: { type: 'days', robustMin: 14, exploratoryMin: 7, collectingMin: 3 },
  sleepStagesChart: { type: 'days', robustMin: 14, exploratoryMin: 7, collectingMin: 3, field: 'sleepTotalHours' },
  spo2Chart: { type: 'days', robustMin: 14, exploratoryMin: 7, collectingMin: 3, field: 'spo2' },
  moodTimeline: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'mood.valence' },
  correlationHeatmap: { type: 'pairs', robustMin: 35, exploratoryMin: 20, collectingMin: 10 },
  scatterCorrelation: { type: 'pairs', robustMin: 35, exploratoryMin: 20, collectingMin: 10 },
  // Fase 8A — Activity/Physiology
  // VO2 Máx é baseline crônico (atualiza com 48-72h de dados acumulados). Usamos threshold mais alto.
  vo2MaxChart: { type: 'days', robustMin: 28, exploratoryMin: 14, collectingMin: 7, field: 'vo2Max' },
  // Walking vitality combina speed + asymmetry. Velocidade muda dia a dia, mas é marcador estável.
  walkingVitalityChart: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'walkingSpeedKmh' },
  // Steps é o sinal mais denso — quase sempre presente se o watch foi usado.
  stepsTimelineChart: { type: 'days', robustMin: 14, exploratoryMin: 7, collectingMin: 3, field: 'steps' },
  // Fase 8B — Descritivo e Insights
  // Scatter PK×humor: cada par = 1 emoção momentânea. Pearson r com n<10 é ruído.
  pkMoodScatter: { type: 'pairs', robustMin: 30, exploratoryMin: 15, collectingMin: 8 },
  // Lag correlation: mesma base de pares, threshold ligeiramente maior pra estabilidade.
  lagCorrelation: { type: 'pairs', robustMin: 30, exploratoryMin: 15, collectingMin: 8 },
  // Fase 10D — charts clínicos novos
  respiratoryDisturbancesChart: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'respiratoryDisturbances' },
  vitalSignsTimelineChart: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'respiratoryRate' },
  cardioRecoveryChart: { type: 'days', robustMin: 28, exploratoryMin: 14, collectingMin: 7, field: 'cardioRecoveryBpm' },
  hrRangeChart: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'heartRateMean' },
} as const satisfies Record<string, ReadinessRequirement>
