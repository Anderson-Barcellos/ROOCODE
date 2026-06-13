/**
 * Sleep Architecture Index — leitura interpretativa da ESTRUTURA da noite.
 *
 * O SleepStagesChart mostra as horas de cada estágio; este índice agrega a
 * leitura clínica: que fração do sono classificado foi Deep (restaurador) e
 * REM, comparada a faixas de referência populacionais (não diagnóstico).
 *
 * Denominador = deep + rem + core (estágios classificados). Ignora o Total do
 * Apple (que sobrepõe os estágios e pode somar mais que a soma) e o Awake.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

// Faixas de referência adulto (% do sono classificado). Referência populacional,
// não alvo clínico individual. Deep abaixo do piso é o sinal mais relevante.
const DEEP_REF = { lo: 13, hi: 23 }
const REM_REF = { lo: 20, hi: 25 }

const ARCHITECTURE_MIN_NIGHTS = 5
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export type StageBand = 'baixo' | 'ideal' | 'alto'

export interface SleepArchitecturePoint {
  date: string
  pctDeep: number | null
  pctRem: number | null
  pctLight: number | null
  score: number | null
  deepBand: StageBand | null
  remBand: StageBand | null
  confidence: number
  reason?: 'inputs_missing' | 'insufficient_readiness'
  evidence: IndexEvidenceReport
}

export interface SleepArchitectureSummary {
  latest: SleepArchitecturePoint | null
  meanPctDeep: number | null
  meanPctRem: number | null
  meanScore: number | null
  nightsUsed: number
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function bandOf(pct: number, ref: { lo: number; hi: number }): StageBand {
  if (pct < ref.lo) return 'baixo'
  if (pct > ref.hi) return 'alto'
  return 'ideal'
}

// 100 dentro da faixa; abaixo do piso decai proporcionalmente (sinal forte);
// acima do teto penaliza levemente (excesso é menos preocupante que falta).
function bandScore(pct: number, ref: { lo: number; hi: number }): number {
  if (pct >= ref.lo && pct <= ref.hi) return 100
  if (pct < ref.lo) return clamp((pct / ref.lo) * 100, 0, 100)
  return clamp(100 - ((pct - ref.hi) / ref.hi) * 60, 0, 100)
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function architectureForNight(snapshot: DailySnapshot): {
  pctDeep: number
  pctRem: number
  pctLight: number
  score: number
  deepBand: StageBand
  remBand: StageBand
} | null {
  const deep = snapshot.health?.sleepDeepHours ?? null
  const rem = snapshot.health?.sleepRemHours ?? null
  const core = snapshot.health?.sleepCoreHours ?? null
  if (deep == null || rem == null || core == null) return null
  const classified = deep + rem + core
  if (!Number.isFinite(classified) || classified <= 0) return null

  const pctDeep = (deep / classified) * 100
  const pctRem = (rem / classified) * 100
  const pctLight = (core / classified) * 100
  const score = clamp(0.5 * bandScore(pctDeep, DEEP_REF) + 0.5 * bandScore(pctRem, REM_REF), 0, 100)
  return {
    pctDeep,
    pctRem,
    pctLight,
    score,
    deepBand: bandOf(pctDeep, DEEP_REF),
    remBand: bandOf(pctRem, REM_REF),
  }
}

export function computeSleepArchitectureSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepArchitecturePoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.sleepArchitectureIndex,
    'SleepArchitecture',
  )

  return snapshots.map((snapshot) => {
    const night = architectureForNight(snapshot)
    if (!night) {
      return {
        date: snapshot.date,
        pctDeep: null,
        pctRem: null,
        pctLight: null,
        score: null,
        deepBand: null,
        remBand: null,
        confidence: 0,
        reason: 'inputs_missing',
        evidence: buildIndexEvidenceReport({
          eligible: false,
          reason: 'inputs_missing',
          inputsUsed: [],
          inputsMissing: ['sleepDeepHours', 'sleepRemHours', 'sleepCoreHours'],
          proxiesUsed: [],
          usedInterpolated: false,
          confidencePenalty: 0,
          readiness: readiness.status,
        }),
      }
    }

    // A estrutura de uma noite é um fato aritmético dela (faixas fixas, sem
    // baseline pessoal) — o score vale sempre que os 3 estágios existem. O
    // readiness apenas informa a confiança da leitura agregada, não anula a noite.
    const interpolated = snapshot.interpolated === true || snapshot.health?.interpolated === true
    const confidence = interpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1

    return {
      date: snapshot.date,
      pctDeep: night.pctDeep,
      pctRem: night.pctRem,
      pctLight: night.pctLight,
      score: night.score,
      deepBand: night.deepBand,
      remBand: night.remBand,
      confidence,
      evidence: buildIndexEvidenceReport({
        eligible: true,
        reason: 'ok',
        inputsUsed: ['sleepDeepHours', 'sleepRemHours', 'sleepCoreHours'],
        inputsMissing: [],
        proxiesUsed: [],
        usedInterpolated: interpolated,
        confidencePenalty: interpolated ? INTERP_CONFIDENCE_MULTIPLIER : 0,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeSleepArchitectureSummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepArchitectureSummary {
  const series = computeSleepArchitectureSeries(snapshots)
  const valid = series.filter((point) => point.score != null)
  // Janela = período inteiro recebido (sem slice fixo), pra o card reagir ao seletor.
  const recent = valid

  const latest = valid.length ? valid[valid.length - 1] : null
  if (recent.length < ARCHITECTURE_MIN_NIGHTS) {
    return {
      latest,
      meanPctDeep: null,
      meanPctRem: null,
      meanScore: null,
      nightsUsed: recent.length,
    }
  }

  return {
    latest,
    meanPctDeep: mean(recent.map((point) => point.pctDeep!).filter((v) => Number.isFinite(v))),
    meanPctRem: mean(recent.map((point) => point.pctRem!).filter((v) => Number.isFinite(v))),
    meanScore: mean(recent.map((point) => point.score!).filter((v) => Number.isFinite(v))),
    nightsUsed: recent.length,
  }
}
