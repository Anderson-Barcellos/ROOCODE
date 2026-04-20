import type { DailyHealthMetrics, DailySnapshot } from '@/types/apple-health'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ReadinessStatus = 'ready' | 'partial' | 'pending'

export interface DataReadiness {
  status: ReadinessStatus
  current: number
  required: number
  partial: number
  label: string
  pendingMessage: string
}

type HealthField = keyof DailyHealthMetrics
type MoodField = 'mood.valence'

export type ReadinessRequirement =
  | { type: 'days'; readyMin: number; partialMin: number; field?: HealthField | MoodField }
  | { type: 'pairs'; readyMin: number; partialMin: number }
  | {
      type: 'dow_coverage'
      readyMin: number
      partialMin: number
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

function countDowCoverage(
  snapshots: DailySnapshot[],
  minSamplesPerDow: number,
): { coveredDows: number; totalDays: number } {
  const bucket: Record<number, number> = {}
  for (const s of snapshots) {
    if (s.interpolated || s.forecasted || !s.health) continue
    const dow = new Date(s.date).getDay()
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
  unit: 'dias' | 'pares',
): string {
  const missing = Math.max(0, required - current)
  const descriptor = unit === 'pares' ? 'Correlação requer' : 'Análise requer'
  return `${descriptor} ${required} ${unit} · ${current}/${required} · faltam ${missing}`
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
    const status: ReadinessStatus =
      current >= req.readyMin ? 'ready' : current >= req.partialMin ? 'partial' : 'pending'
    return {
      status,
      current,
      required: req.readyMin,
      partial: req.partialMin,
      label: `${current}/${req.readyMin} pares`,
      pendingMessage: buildPendingMessage(chartName, current, req.readyMin, 'pares'),
    }
  }

  if (req.type === 'dow_coverage') {
    const { coveredDows, totalDays } = countDowCoverage(snapshots, req.minSamplesPerDow)
    const status: ReadinessStatus =
      totalDays >= req.readyMin && coveredDows >= req.minDows
        ? 'ready'
        : totalDays >= req.partialMin
          ? 'partial'
          : 'pending'
    return {
      status,
      current: totalDays,
      required: req.readyMin,
      partial: req.partialMin,
      label: `${totalDays}/${req.readyMin} dias`,
      pendingMessage: buildPendingMessage(chartName, totalDays, req.readyMin, 'dias'),
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
  const status: ReadinessStatus =
    current >= req.readyMin ? 'ready' : current >= req.partialMin ? 'partial' : 'pending'
  return {
    status,
    current,
    required: req.readyMin,
    partial: req.partialMin,
    label: `${current}/${req.readyMin} dias`,
    pendingMessage: buildPendingMessage(chartName, current, req.readyMin, 'dias'),
  }
}

// ─── Config central — fonte única de thresholds ──────────────────────────────

export const CHART_REQUIREMENTS = {
  timelineChart: { type: 'days', readyMin: 3, partialMin: 1 },
  hrvAnalysis: { type: 'days', readyMin: 7, partialMin: 3, field: 'hrvSdnn' },
  heartRateBands: { type: 'days', readyMin: 7, partialMin: 3, field: 'restingHeartRate' },
  activityBars: { type: 'days', readyMin: 3, partialMin: 1 },
  sleepStagesChart: { type: 'days', readyMin: 3, partialMin: 1, field: 'sleepTotalHours' },
  spo2Chart: { type: 'days', readyMin: 3, partialMin: 1, field: 'spo2' },
  moodTimeline: { type: 'days', readyMin: 7, partialMin: 3, field: 'mood.valence' },
  moodDonut: { type: 'days', readyMin: 7, partialMin: 3, field: 'mood.valence' },
  weeklyPatternChart: {
    type: 'dow_coverage',
    readyMin: 14,
    partialMin: 7,
    minDows: 5,
    minSamplesPerDow: 2,
  },
  correlationHeatmap: { type: 'pairs', readyMin: 20, partialMin: 10 },
  scatterCorrelation: { type: 'pairs', readyMin: 20, partialMin: 10 },
  // Fase 8A — Activity/Physiology
  // VO2 Máx é baseline crônico (atualiza com 48-72h de dados acumulados). Usamos threshold mais alto.
  vo2MaxChart: { type: 'days', readyMin: 14, partialMin: 7, field: 'vo2Max' },
  // Walking vitality combina speed + asymmetry. Velocidade muda dia a dia, mas é marcador estável.
  walkingVitalityChart: { type: 'days', readyMin: 7, partialMin: 3, field: 'walkingSpeedKmh' },
  // Steps é o sinal mais denso — quase sempre presente se o watch foi usado.
  stepsTimelineChart: { type: 'days', readyMin: 3, partialMin: 1, field: 'steps' },
  // Fase 8B — Descritivo e Insights
  // Scatter PK×humor: cada par = 1 emoção momentânea. Pearson r com n<10 é ruído.
  pkMoodScatter: { type: 'pairs', readyMin: 20, partialMin: 10 },
  // Lag correlation: mesma base de pares, threshold ligeiramente maior pra estabilidade.
  lagCorrelation: { type: 'pairs', readyMin: 25, partialMin: 12 },
  // Adherence: 3 doses por substância é o mínimo pra std dev ter semântica.
  medicationAdherence: { type: 'pairs', readyMin: 3, partialMin: 2 },
} as const satisfies Record<string, ReadinessRequirement>
