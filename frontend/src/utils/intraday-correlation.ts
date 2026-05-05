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
  return events.sort((a, b) => a.timestamp - b.timestamp)
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
): LagCorrelation[] {
  return lagsHours.map((lag) => {
    const pairs = buildPKMoodPairs(events, med, doses, weightKg, lag)
    const x = pairs.map((p) => p.concentration)
    const y = pairs.map((p) => p.valence)
    const r = pearson(x, y)
    return { lagHours: lag, r: Number.isFinite(r) ? r : 0, n: pairs.length }
  })
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
