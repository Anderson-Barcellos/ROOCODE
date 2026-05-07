/**
 * Intraday correlation — helpers para a aba "Descritivo e Insights" (Fase 8B).
 *
 * Os dados brutos já têm granularidade horária:
 * - /farma/doses: timestamp exato em taken_at (ISO)
 * - /mood: 'Emoção Momentânea' tem HH:MM:SS no Iniciar (DD/MM/YYYY HH:MM:SS)
 * - calculateConcentration: aceita qualquer instante t
 *
 * Este módulo só muda a lente de agregação pra expor essa granularidade.
 * Não altera o pipeline de snapshots diários existente.
 */

import { parse as parseDate, isValid } from 'date-fns'

import type { DoseRecord, Substance } from '@/lib/api'
import type { MoodEntryRow } from '@/types/apple-health'
import {
  calculateConcentration,
  DEFAULT_PK_BODY_WEIGHT_KG,
  PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML,
  type PKDose,
  type PKMedication,
} from './pharmacokinetics'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MoodEvent {
  timestamp: number
  valence: number
  valenceClass: string | null
}

export interface PKMoodPair {
  timestamp: number
  concentration: number
  valence: number
}

export interface LagCorrelation {
  lagHours: number
  r: number
  n: number
  pValuePermutation: number | null
  ci95Lower: number | null
  ci95Upper: number | null
  qValueFdr: number | null
}

export type IntradayCorrelationMethod = 'pearson' | 'spearman'

export interface IntradayCorrelationInference {
  method: IntradayCorrelationMethod
  r: number
  n: number
  pValuePermutation: number | null
  ci95Lower: number | null
  ci95Upper: number | null
  slope: number | null
  slopeCi95Lower: number | null
  slopeCi95Upper: number | null
}

interface IntradayInferenceOptions {
  method?: IntradayCorrelationMethod
  permutationIterations?: number
  bootstrapIterations?: number
}

const DEFAULT_PERMUTATION_ITERATIONS = 1500
const DEFAULT_BOOTSTRAP_ITERATIONS = 1200
const Z_975 = 1.959963984540054

export function normalizeIntradayValence(value: unknown): number | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed.replace(',', '.'))
    return normalizeIntradayValence(parsed)
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value >= -1 && value <= 1) return value
  if (value >= 0 && value <= 100) return (value - 50) / 50
  return null
}

// ─── Parse timestamps do mood ────────────────────────────────────────────────

/**
 * Tenta parsear Iniciar do mood com ou sem hora. Retorna ms epoch ou null.
 * Suporta formatos: "DD/MM/YYYY HH:MM:SS" e "DD/MM/YYYY".
 */
export function parseMoodTimestamp(iniciar: string | null | undefined): number | null {
  if (!iniciar) return null
  const formats = ['dd/MM/yyyy HH:mm:ss', 'dd/MM/yyyy HH:mm', 'dd/MM/yyyy']
  for (const fmt of formats) {
    const parsed = parseDate(iniciar, fmt, new Date())
    if (isValid(parsed)) return parsed.getTime()
  }
  return null
}

/**
 * Heurística: timestamp tem componente horário se HH:MM:SS ≠ 00:00:00.
 * iPhone State of Mind entrega Humor Diário sem hora e Emoção Momentânea com hora.
 */
export function hasTimeComponent(iniciar: string | null | undefined): boolean {
  if (!iniciar) return false
  const parts = iniciar.trim().split(/\s+/)
  if (parts.length < 2) return false
  const time = parts[1]
  return /^\d{2}:\d{2}/.test(time) && time !== '00:00:00' && time !== '00:00'
}

// ─── Build mood events ───────────────────────────────────────────────────────

/**
 * Filtra rows que são 'Emoção Momentânea' E têm timestamp horário real.
 * Humor Diário (agregado do dia) fica de fora — não pareável intraday.
 */
export function buildMoodEvents(rows: MoodEntryRow[]): MoodEvent[] {
  const events: MoodEvent[] = []
  for (const row of rows) {
    const isMomentary = row.type === 'Emoção Momentânea'
    if (!isMomentary) continue
    if (!hasTimeComponent(row.start)) continue
    const timestamp = parseMoodTimestamp(row.start)
    if (timestamp == null) continue
    if (row.valence == null) continue
    events.push({
      timestamp,
      valence: row.valence,
      valenceClass: row.valenceClass,
    })
  }

  const deduped = new Map<string, MoodEvent>()
  for (const event of events) {
    const key = `${event.timestamp}|${event.valence.toFixed(6)}`
    if (!deduped.has(key)) deduped.set(key, event)
  }

  return Array.from(deduped.values()).sort((a, b) => a.timestamp - b.timestamp)
}

// ─── PK × Mood pairs ─────────────────────────────────────────────────────────

/**
 * Para cada mood event, calcula concentração da med naquele exato instante
 * (com opcional lag horário — concentração em t+lagHours).
 *
 * lagHours positivo = "quanto antes do humor foi medida a concentração?"
 * Isso responde: "a concentração HÁ X HORAS prediz o humor AGORA?"
 */
export function buildPKMoodPairs(
  events: MoodEvent[],
  med: PKMedication,
  doses: PKDose[],
  weightKg = DEFAULT_PK_BODY_WEIGHT_KG,
  lagHours = 0,
): PKMoodPair[] {
  const pairs: PKMoodPair[] = []
  const lagMs = lagHours * 3600 * 1000
  for (const event of events) {
    const t = event.timestamp - lagMs
    const conc = calculateConcentration(med, doses, t, weightKg)
    if (!Number.isFinite(conc) || conc <= PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML) continue
    pairs.push({
      timestamp: event.timestamp,
      concentration: conc,
      valence: event.valence,
    })
  }
  return pairs
}

// ─── Pearson correlation ─────────────────────────────────────────────────────

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 3) return NaN
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) {
    sx += x[i]
    sy += y[i]
  }
  const mx = sx / n
  const my = sy / n
  let num = 0, dxs = 0, dys = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    num += dx * dy
    dxs += dx * dx
    dys += dy * dy
  }
  const denom = Math.sqrt(dxs * dys)
  return denom === 0 ? NaN : num / denom
}

function rankValues(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((a, b) => a.value - b.value)

  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) {
      j += 1
    }
    const avgRank = (i + j + 2) / 2
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].index] = avgRank
    }
    i = j + 1
  }
  return ranks
}

export function spearman(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 3) return Number.NaN
  const xSlice = x.slice(0, n)
  const ySlice = y.slice(0, n)
  const xRanks = rankValues(xSlice)
  const yRanks = rankValues(ySlice)
  return pearson(xRanks, yRanks)
}

function correlationByMethod(method: IntradayCorrelationMethod): (x: number[], y: number[]) => number {
  return method === 'spearman' ? spearman : pearson
}

/**
 * Regressão linear simples (mínimos quadrados) — retorna slope e intercept.
 * Útil pra sobrepor linha de regressão no scatter PK×humor.
 */
export function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = Math.min(x.length, y.length)
  if (n < 2) return { slope: 0, intercept: 0 }
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) {
    sx += x[i]
    sy += y[i]
  }
  const mx = sx / n
  const my = sy / n
  let num = 0, denom = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    num += dx * (y[i] - my)
    denom += dx * dx
  }
  const slope = denom === 0 ? 0 : num / denom
  const intercept = my - slope * mx
  return { slope, intercept }
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  if (state === 0) state = 0x9e3779b9
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

function hashSeries(xs: number[], ys: number[], salt: number): number {
  let hash = (2166136261 ^ salt) >>> 0
  const total = Math.min(xs.length, ys.length)
  for (let i = 0; i < total; i++) {
    const x = Math.round(xs[i] * 1_000_000)
    const y = Math.round(ys[i] * 1_000_000)
    hash ^= x >>> 0
    hash = Math.imul(hash, 16777619) >>> 0
    hash ^= y >>> 0
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function shuffleInPlace(values: number[], random: () => number): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = values[i]
    values[i] = values[j]
    values[j] = tmp
  }
}

function percentile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return Number.NaN
  const clampedQ = Math.max(0, Math.min(1, q))
  const position = (sortedValues.length - 1) * clampedQ
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  const weight = position - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function fisherCi95(r: number, n: number): { lower: number; upper: number } | null {
  if (!Number.isFinite(r) || n < 4) return null
  const clamped = Math.max(-0.999999, Math.min(0.999999, r))
  const z = 0.5 * Math.log((1 + clamped) / (1 - clamped))
  const se = 1 / Math.sqrt(n - 3)
  const lower = Math.tanh(z - Z_975 * se)
  const upper = Math.tanh(z + Z_975 * se)
  return { lower, upper }
}

function permutationPValue(
  xs: number[],
  ys: number[],
  observedR: number,
  iterations: number,
  correlationFn: (x: number[], y: number[]) => number,
): number | null {
  if (!Number.isFinite(observedR) || xs.length < 8 || ys.length < 8 || iterations < 100) return null
  const random = createSeededRandom(hashSeries(xs, ys, 0xa5a5a5a5))
  const observed = Math.abs(observedR)
  let extreme = 0
  let valid = 0

  for (let i = 0; i < iterations; i++) {
    const permutedY = ys.slice()
    shuffleInPlace(permutedY, random)
    const permutedR = correlationFn(xs, permutedY)
    if (!Number.isFinite(permutedR)) continue
    valid += 1
    if (Math.abs(permutedR) >= observed) extreme += 1
  }

  if (valid < 100) return null
  return (extreme + 1) / (valid + 1)
}

function slopeFromSeries(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return Number.NaN
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let num = 0
  let denom = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    num += dx * (ys[i] - my)
    denom += dx * dx
  }
  if (denom === 0) return Number.NaN
  return num / denom
}

function bootstrapCi95(
  xs: number[],
  ys: number[],
  iterations: number,
  statistic: (sampleX: number[], sampleY: number[]) => number,
  seedSalt: number,
): { lower: number; upper: number } | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 10 || iterations < 200) return null

  const random = createSeededRandom(hashSeries(xs, ys, seedSalt))
  const estimates: number[] = []

  for (let i = 0; i < iterations; i++) {
    const sampleX = new Array<number>(n)
    const sampleY = new Array<number>(n)
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(random() * n)
      sampleX[j] = xs[idx]
      sampleY[j] = ys[idx]
    }
    const estimate = statistic(sampleX, sampleY)
    if (Number.isFinite(estimate)) estimates.push(estimate)
  }

  if (estimates.length < 200) return null
  estimates.sort((a, b) => a - b)
  return {
    lower: percentile(estimates, 0.025),
    upper: percentile(estimates, 0.975),
  }
}

export function inferIntradayCorrelation(
  pairs: PKMoodPair[],
  options: IntradayInferenceOptions = {},
): IntradayCorrelationInference | null {
  if (pairs.length < 3) return null

  const xs = pairs.map((pair) => pair.concentration)
  const ys = pairs.map((pair) => pair.valence)
  const n = Math.min(xs.length, ys.length)
  const method = options.method ?? 'pearson'
  const correlationFn = correlationByMethod(method)
  const r = correlationFn(xs, ys)
  if (!Number.isFinite(r)) return null

  const permutationIterations = options.permutationIterations ?? DEFAULT_PERMUTATION_ITERATIONS
  const bootstrapIterations = options.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS

  const fisherCi = fisherCi95(r, n)
  const slope = slopeFromSeries(xs, ys)
  const slopeFinite = Number.isFinite(slope) ? slope : null

  const pValuePermutation = permutationPValue(xs, ys, r, permutationIterations, correlationFn)
  const rBootstrapCi = bootstrapCi95(xs, ys, bootstrapIterations, correlationFn, 0x1234567)
  const slopeBootstrapCi =
    slopeFinite == null
      ? null
      : bootstrapCi95(xs, ys, bootstrapIterations, slopeFromSeries, 0x7654321)

  return {
    method,
    r,
    n,
    pValuePermutation,
    ci95Lower: rBootstrapCi?.lower ?? fisherCi?.lower ?? null,
    ci95Upper: rBootstrapCi?.upper ?? fisherCi?.upper ?? null,
    slope: slopeFinite,
    slopeCi95Lower: slopeBootstrapCi?.lower ?? null,
    slopeCi95Upper: slopeBootstrapCi?.upper ?? null,
  }
}

export function benjaminiHochbergFdr(pValues: Array<number | null | undefined>): Array<number | null> {
  const valid = pValues
    .map((p, index) => ({ p, index }))
    .filter((item): item is { p: number; index: number } => (
      typeof item.p === 'number' && Number.isFinite(item.p) && item.p >= 0 && item.p <= 1
    ))

  const adjusted = new Array<number | null>(pValues.length).fill(null)
  if (valid.length === 0) return adjusted

  valid.sort((a, b) => a.p - b.p)
  const m = valid.length
  const rawQ = valid.map((item, rankIndex) => (item.p * m) / (rankIndex + 1))

  let minSoFar = 1
  for (let i = valid.length - 1; i >= 0; i--) {
    minSoFar = Math.min(minSoFar, rawQ[i])
    adjusted[valid[i].index] = Math.max(0, Math.min(1, minSoFar))
  }

  return adjusted
}

// ─── Lag correlation sweep ───────────────────────────────────────────────────

/**
 * Pra cada lag (em horas), computa Pearson entre conc(t-lag) e valence(t).
 * Input lags pode ser [-6,-5,...,5,6] pra ver anti-correlação também.
 * Pico de |r| positivo em lag 4-8h pro Lexapro confirmaria PK→humor.
 */
export function computeLagCorrelation(
  events: MoodEvent[],
  med: PKMedication,
  doses: PKDose[],
  lagsHours: number[],
  weightKg = DEFAULT_PK_BODY_WEIGHT_KG,
  options: IntradayInferenceOptions = {},
): LagCorrelation[] {
  const method = options.method ?? 'pearson'
  const raw = lagsHours.map((lag) => {
    const pairs = buildPKMoodPairs(events, med, doses, weightKg, lag)
    const inference = inferIntradayCorrelation(pairs, {
      method,
      permutationIterations: options.permutationIterations ?? 600,
      bootstrapIterations: options.bootstrapIterations ?? 600,
    })
    return {
      lagHours: lag,
      r: inference?.r ?? Number.NaN,
      n: pairs.length,
      pValuePermutation: inference?.pValuePermutation ?? null,
      ci95Lower: inference?.ci95Lower ?? null,
      ci95Upper: inference?.ci95Upper ?? null,
      qValueFdr: null,
    }
  })

  const qValues = benjaminiHochbergFdr(raw.map((item) => item.pValuePermutation))
  return raw.map((item, index) => ({
    ...item,
    qValueFdr: qValues[index],
  }))
}

/**
 * Helper pra converter DoseRecord[] em PKDose[] — mesmo pattern usado em
 * pk-medication-grid.tsx. Centralizado aqui pra reuso nos charts novos.
 */
export function toPKDoses(records: DoseRecord[]): PKDose[] {
  return records.map((r) => ({
    medicationId: r.substance,
    timestamp: new Date(r.taken_at).getTime(),
    doseAmount: r.dose_mg,
  }))
}

/**
 * Helper idêntico ao usado em pk-medication-grid.tsx — converte Substance em
 * PKMedication compatível com o engine. Retorna null se dados PK incompletos.
 */
export function substanceToPKMedication(sub: Substance): PKMedication | null {
  if (sub.half_life_hours == null || sub.ka_per_hour == null || sub.bioavailability == null) {
    return null
  }
  const vdPerKg =
    sub.vd_l_per_kg != null
      ? sub.vd_l_per_kg
      : sub.vd_l != null
        ? sub.vd_l / DEFAULT_PK_BODY_WEIGHT_KG
        : null
  if (vdPerKg == null) return null

  const therapeuticRange =
    sub.therapeutic_range_min != null && sub.therapeutic_range_max != null
      ? {
          min: sub.therapeutic_range_min,
          max: sub.therapeutic_range_max,
          unit: sub.therapeutic_range_unit ?? 'ng/mL',
        }
      : undefined

  return {
    id: sub.id,
    name: sub.display_name.split(' ')[0],
    category: 'Other',
    halfLife: sub.half_life_hours,
    volumeOfDistribution: vdPerKg,
    bioavailability: sub.bioavailability,
    absorptionRate: sub.ka_per_hour,
    therapeuticRange,
  }
}
