/**
 * Respiração Noturna — quadro de vigilância respiratória do sono.
 *
 * Métrica primária: respiratoryDisturbances (proxy de AHI da Apple, agregado
 * POR NOITE — não episódios individuais). Escala híbrida: banda AASM absoluta
 * (contexto clínico) + percentil pessoal (sensibilidade na faixa real, que é
 * toda normal). Co-sinais SpO2 e taxa respiratória; co-ocorrência (distúrbios
 * atípico + dessaturação) é a assinatura que apneia real deixaria.
 *
 * Política visual_only: dia interpolado/forecastado recebe valor com confidence
 * 0.7, mas NUNCA dispara flag (atypical/desaturation/coOccurrence). Percentis
 * pessoais usam só dias reais — coerente com a regra interim das baselines.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type AhiBand = 'normal' | 'leve' | 'moderada' | 'grave'

const AHI_LEVE = 5
const AHI_MODERADA = 15
const AHI_GRAVE = 30

const PERSONAL_WINDOW_DAYS = 30
const PERSONAL_MIN_POINTS = 14
const SPO2_ABSOLUTE_FLOOR = 95
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export interface RespiratoryLoadPoint {
  date: string
  disturbances: number | null
  ahiBand: AhiBand | null
  personalP90: number | null
  atypical: boolean
  spo2: number | null
  spo2Floor: number | null
  respiratoryRate: number | null
  desaturationFlag: boolean
  coOccurrenceFlag: boolean
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface RespiratoryLoadSummary {
  latest: RespiratoryLoadPoint | null
  meanDisturbances: number | null
  currentBand: AhiBand | null
  atypicalNights: number
  coOccurrenceNights: number
  nightsUsed: number
}

function bandOfAhi(value: number): AhiBand {
  if (value < AHI_LEVE) return 'normal'
  if (value < AHI_MODERADA) return 'leve'
  if (value < AHI_GRAVE) return 'moderada'
  return 'grave'
}

// Percentil empírico com interpolação linear (padrão dos helpers do codebase).
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (base + 1 < sorted.length) return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  return sorted[base]
}

function realValues(
  snapshots: ReadonlyArray<DailySnapshot>,
  pick: (s: DailySnapshot) => number | null | undefined,
): number[] {
  const out: number[] = []
  for (const s of snapshots) {
    if (s.interpolated || s.forecasted) continue
    const v = pick(s)
    if (v != null && Number.isFinite(v)) out.push(v)
  }
  return out
}

export function computeRespiratoryLoadSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): RespiratoryLoadPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.respiratoryLoadIndex,
    'RespiratoryLoad',
  )

  return snapshots.map((snap, idx) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const disturbances = snap.health?.respiratoryDisturbances ?? null
    const spo2 = snap.health?.spo2 ?? null
    const respiratoryRate = snap.health?.respiratoryRate ?? null

    // Janela rolante de dias reais ATÉ esta noite (inclusive).
    const past = snapshots.slice(0, idx + 1)
    const distWindow = realValues(past, (s) => s.health?.respiratoryDisturbances).slice(-PERSONAL_WINDOW_DAYS)
    const spo2Window = realValues(past, (s) => s.health?.spo2).slice(-PERSONAL_WINDOW_DAYS)

    const personalP90 =
      distWindow.length >= PERSONAL_MIN_POINTS
        ? quantileSorted([...distWindow].sort((a, b) => a - b), 0.9)
        : null
    const spo2Floor =
      spo2Window.length >= PERSONAL_MIN_POINTS
        ? quantileSorted([...spo2Window].sort((a, b) => a - b), 0.1)
        : null

    const ahiBand = disturbances != null ? bandOfAhi(disturbances) : null
    const atypical =
      !derivedFromInterpolated && disturbances != null && personalP90 != null
        ? disturbances > personalP90
        : false
    const effectiveFloor = spo2Floor ?? SPO2_ABSOLUTE_FLOOR
    const desaturationFlag =
      !derivedFromInterpolated && spo2 != null ? spo2 < effectiveFloor : false
    const coOccurrenceFlag = atypical && desaturationFlag

    const hasPrimary = disturbances != null
    const confidence = hasPrimary ? (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) : 0

    const inputsUsed: string[] = []
    if (disturbances != null) inputsUsed.push('respiratoryDisturbances')
    if (spo2 != null) inputsUsed.push('spo2')
    if (respiratoryRate != null) inputsUsed.push('respiratoryRate')

    return {
      date: snap.date,
      disturbances,
      ahiBand,
      personalP90,
      atypical,
      spo2,
      spo2Floor,
      respiratoryRate,
      desaturationFlag,
      coOccurrenceFlag,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: hasPrimary && readiness.status !== 'standby',
        reason: hasPrimary
          ? readiness.status === 'standby'
            ? 'insufficient_readiness'
            : 'ok'
          : 'inputs_missing',
        inputsUsed,
        inputsMissing: hasPrimary ? [] : ['respiratoryDisturbances'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeRespiratoryLoadSummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): RespiratoryLoadSummary {
  const series = computeRespiratoryLoadSeries(snapshots)
  const withDist = series.filter((p) => p.disturbances != null)
  // Janela = período inteiro recebido (sem slice fixo), pra o card reagir ao seletor.
  const recent = withDist
  const latest = withDist.length ? withDist[withDist.length - 1] : null

  const realRecent = recent.filter((p) => !p.derivedFromInterpolated)
  const meanDisturbances =
    realRecent.length > 0
      ? realRecent.reduce((acc, p) => acc + (p.disturbances as number), 0) / realRecent.length
      : null
  const currentBand = meanDisturbances != null ? bandOfAhi(meanDisturbances) : null

  return {
    latest,
    meanDisturbances,
    currentBand,
    atypicalNights: recent.filter((p) => p.atypical).length,
    coOccurrenceNights: recent.filter((p) => p.coOccurrenceFlag).length,
    nightsUsed: realRecent.length,
  }
}
