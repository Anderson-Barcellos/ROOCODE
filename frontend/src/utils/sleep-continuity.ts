/**
 * Continuidade do sono — leitura clínica direta (sem score 0-100).
 *
 * Eficiência = Total Sleep ÷ tempo na cama. O "tempo na cama" prefere
 * `sleepInBedHours` quando o Apple o registra, mas no nosso pipeline ele quase
 * nunca vem (requer Sleep Schedule no Watch) — fallback robusto: duração do
 * episódio `End − Start`. WASO = `sleepAwakeHours`. Faixas AASM clássicas.
 *
 * Noites com Total Sleep < 1h são cochilos/registros degenerados e não entram
 * como noite de sono (eficiência e WASO ficam null, fora do `latest`).
 *
 * Janela = o período recebido (os snapshots passados). Sem janela interna fixa,
 * pra o card reagir ao seletor de período. Política visual_only: interpolado
 * recebe confidence 0.7.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'
import { parseLooseDateTime } from './date'

export type EfficiencyBand = 'ideal' | 'limitrofe' | 'pobre'
export type WasoBand = 'ideal' | 'limitrofe' | 'fragmentado'

const EFF_IDEAL = 85
const EFF_LIMIT = 75
const WASO_IDEAL_H = 0.5
const WASO_LIMIT_H = 1.0
const MIN_SLEEP_H = 1.0 // abaixo disso é cochilo/registro degenerado, não uma noite
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export interface SleepContinuityPoint {
  date: string
  efficiencyPct: number | null
  efficiencyBand: EfficiencyBand | null
  wasoHours: number | null
  wasoBand: WasoBand | null
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface SleepContinuitySummary {
  latest: SleepContinuityPoint | null
  meanEfficiencyPct: number | null
  meanWasoHours: number | null
  nightsUsed: number
}

function effBand(pct: number): EfficiencyBand {
  if (pct >= EFF_IDEAL) return 'ideal'
  if (pct >= EFF_LIMIT) return 'limitrofe'
  return 'pobre'
}

function wasoBand(hours: number): WasoBand {
  if (hours < WASO_IDEAL_H) return 'ideal'
  if (hours <= WASO_LIMIT_H) return 'limitrofe'
  return 'fragmentado'
}

/**
 * Tempo na cama: `sleepInBedHours` quando válido; senão a duração do episódio
 * `End − Start` (que o Apple registra em ~todas as noites, ao contrário de
 * "In Bed"). Retorna null se nenhum dos dois for derivável.
 */
function timeInBedHours(snap: DailySnapshot): number | null {
  const inBed = snap.health?.sleepInBedHours
  if (inBed != null && Number.isFinite(inBed) && inBed > 0) return inBed
  const start = parseLooseDateTime(snap.health?.sleepStartAt)
  const end = parseLooseDateTime(snap.health?.sleepEndAt)
  if (start && end) {
    const hours = (end.getTime() - start.getTime()) / 3_600_000
    if (Number.isFinite(hours) && hours > 0) return hours
  }
  return null
}

/**
 * Eficiência = Total Sleep ÷ tempo na cama, em %. Só para noites válidas
 * (Total Sleep ≥ MIN_SLEEP_H). Clamp 0–100 (dados de múltiplos episódios podem
 * passar de 100 antes do clamp).
 */
function efficiencyOf(snap: DailySnapshot): number | null {
  const total = snap.health?.sleepTotalHours
  if (total == null || !Number.isFinite(total) || total < MIN_SLEEP_H) return null
  const tib = timeInBedHours(snap)
  if (tib == null || tib <= 0) return null
  const eff = (total / tib) * 100
  return eff < 0 ? 0 : eff > 100 ? 100 : eff
}

export function computeSleepContinuitySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepContinuityPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.sleepContinuityIndex,
    'SleepContinuity',
  )

  return snapshots.map((snap) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const total = snap.health?.sleepTotalHours
    const isValidNight = total != null && Number.isFinite(total) && total >= MIN_SLEEP_H

    const efficiencyPct = isValidNight ? efficiencyOf(snap) : null
    const wasoRaw = snap.health?.sleepAwakeHours
    const wasoHours =
      isValidNight && wasoRaw != null && Number.isFinite(wasoRaw) ? wasoRaw : null

    const inputsUsed: string[] = []
    if (efficiencyPct != null) inputsUsed.push('sleepEfficiencyPct')
    if (wasoHours != null) inputsUsed.push('sleepAwakeHours')
    const hasAny = inputsUsed.length > 0
    const confidence = hasAny ? (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) : 0

    return {
      date: snap.date,
      efficiencyPct,
      efficiencyBand: efficiencyPct != null ? effBand(efficiencyPct) : null,
      wasoHours,
      wasoBand: wasoHours != null ? wasoBand(wasoHours) : null,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: hasAny && readiness.status !== 'standby',
        reason: hasAny
          ? readiness.status === 'standby'
            ? 'insufficient_readiness'
            : 'ok'
          : 'inputs_missing',
        inputsUsed,
        inputsMissing: hasAny ? [] : ['sleepEfficiencyPct', 'sleepAwakeHours'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeSleepContinuitySummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepContinuitySummary {
  const series = computeSleepContinuitySeries(snapshots)
  // Janela = período inteiro (sem slice fixo); só dias reais entram nas médias.
  const real = series.filter((p) => !p.derivedFromInterpolated)
  const withData = real.filter((p) => p.efficiencyPct != null || p.wasoHours != null)
  const latest = withData.at(-1) ?? null

  const effs = real.map((p) => p.efficiencyPct).filter((v): v is number => v != null)
  const wasos = real.map((p) => p.wasoHours).filter((v): v is number => v != null)
  const mean = (arr: number[]): number | null =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  return {
    latest,
    meanEfficiencyPct: mean(effs),
    meanWasoHours: mean(wasos),
    nightsUsed: withData.length,
  }
}
