/**
 * PK Coverage Classifier (Sprint D — Card "Dose coverage / janela de
 * vulnerabilidade").
 *
 * Analisa últimas 48h pra cada medicação ativa do regime e classifica
 * o estado de cobertura em 5 classes clinicamente úteis:
 *
 *   1. `acima_faixa`           — concentração estimada > therapeutic max.
 *   2. `vulnerabilidade`       — concentração estimada < therapeutic min.
 *   3. `queda`                 — concentração caindo e projeta < min em ≤12h.
 *   4. `cobertura_incompleta`  — regime esperava dose nas últimas 48h e o
 *                                histórico logado não cobre o intervalo
 *                                (cNow < 1.2× min como guarda — concentração
 *                                ainda saudável não dispara o aviso).
 *   5. `adequada`              — dentro do range terapêutico, sem falhas.
 *
 * Ordem de prioridade (severidade): vulnerabilidade > acima_faixa >
 * cobertura_incompleta > queda > adequada.
 */

import type { DoseRecord } from '@/lib/api'
import type { MedicationRegimenEntry } from '@/types/pharmacology'
import {
  PK_PRESETS,
  calculateConcentration,
  findPresetKey,
  type PKMedication,
  type PKDose,
} from './pharmacokinetics'
import { USER_PROFILE } from './user-profile'

export type CoverageClass =
  | 'adequada'
  | 'queda'
  | 'vulnerabilidade'
  | 'acima_faixa'
  | 'cobertura_incompleta'

export interface PKStatusInput {
  concentration: number
  therapeuticMin: number
  therapeuticMax: number
  missedDoses: number
  hoursUntilBelowMin: number | null
}

/**
 * Pure classifier — order matters and encodes severity:
 *   1. supraterapêutico (acima do ceiling)
 *   2. subterapêutico (abaixo do floor)
 *   3. decay acentuado (cruza min em ≤12h)
 *   4. cobertura incompleta + concentração já saudável-pra-baixo (< 1.2× min)
 *   5. default: em faixa
 *
 * A guarda `concentration < therapeuticMin * 1.2` em (4) evita o bug histórico
 * em que doses esperadas faltando disparavam o aviso mesmo com concentração
 * confortavelmente dentro da faixa terapêutica.
 */
export function derivePKStatus(input: PKStatusInput): CoverageClass {
  const { concentration, therapeuticMin, therapeuticMax, missedDoses, hoursUntilBelowMin } = input
  if (concentration > therapeuticMax) return 'acima_faixa'
  if (concentration < therapeuticMin) return 'vulnerabilidade'
  if (hoursUntilBelowMin != null && hoursUntilBelowMin <= 12) return 'queda'
  if (missedDoses > 0 && concentration < therapeuticMin * 1.2) return 'cobertura_incompleta'
  return 'adequada'
}

export interface CoverageStatus {
  presetKey: string
  displayName: string
  brandName?: string
  klass: CoverageClass
  concentrationNow: number
  concentration24hAgo: number
  therapeuticMin: number
  therapeuticMax: number
  unit: string
  trendPctPerDay: number | null
  expectedDosesLast48h: number
  loggedDosesLast48h: number
  missedDoses: number
  hoursUntilBelowMin: number | null
}

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

function presetToPKMedication(key: string, preset: typeof PK_PRESETS[string]): PKMedication {
  return { id: key, ...preset }
}

function dosesForSubstance(records: DoseRecord[], presetKey: string): PKDose[] {
  return records
    .filter((r) => findPresetKey(r.substance) === presetKey)
    .map((r) => ({
      medicationId: presetKey,
      timestamp: new Date(r.taken_at).getTime(),
      doseAmount: r.dose_mg,
    }))
}

function countExpectedDosesInWindow(
  regimen: MedicationRegimenEntry[],
  presetKey: string,
  windowStart: number,
  windowEnd: number,
): number {
  const entries = regimen.filter((r) => r.active && findPresetKey(r.substance) === presetKey)
  if (entries.length === 0) return 0

  // Pra cada entry, expandir times × dias do range.
  let total = 0
  for (const entry of entries) {
    const validDays = new Set(entry.days_of_week ?? [0, 1, 2, 3, 4, 5, 6])
    const startDay = new Date(windowStart)
    const endDay = new Date(windowEnd)
    for (
      let d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
      d.getTime() <= endDay.getTime();
      d.setDate(d.getDate() + 1)
    ) {
      const dow = d.getDay()
      if (!validDays.has(dow)) continue
      for (const time of entry.times ?? []) {
        const [hh, mm] = time.split(':').map((p) => parseInt(p, 10))
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue
        const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime()
        if (ts >= windowStart && ts <= windowEnd) total += 1
      }
    }
  }
  return total
}

function projectHoursUntilBelowMin(
  med: PKMedication,
  doses: PKDose[],
  now: number,
  min: number,
  bodyWeight: number,
): number | null {
  const cNow = calculateConcentration(med, doses, now, bodyWeight)
  if (cNow < min) return 0
  // Probe at 1h steps up to 48h; if never crosses, return null.
  for (let h = 1; h <= 48; h += 1) {
    const c = calculateConcentration(med, doses, now + h * MS_PER_HOUR, bodyWeight)
    if (c < min) return h
  }
  return null
}

export interface CoverageOptions {
  now?: number
  bodyWeightKg?: number
}

export function computeCoverageStatus(
  doses: DoseRecord[],
  regimen: MedicationRegimenEntry[] | undefined | null,
  options: CoverageOptions = {},
): CoverageStatus[] {
  const now = options.now ?? Date.now()
  const bodyWeight = options.bodyWeightKg ?? USER_PROFILE.weightKg
  const windowStart = now - 48 * MS_PER_HOUR
  const windowEnd = now

  const out: CoverageStatus[] = []
  for (const [presetKey, preset] of Object.entries(PK_PRESETS)) {
    if (!preset.therapeuticRange) continue

    const med = presetToPKMedication(presetKey, preset)
    const substanceDoses = dosesForSubstance(doses, presetKey)
    const dosesInWindow = substanceDoses.filter((d) => d.timestamp >= windowStart && d.timestamp <= windowEnd)
    const expectedDoses = regimen ? countExpectedDosesInWindow(regimen, presetKey, windowStart, windowEnd) : 0
    const missed = Math.max(0, expectedDoses - dosesInWindow.length)

    const cNow = calculateConcentration(med, substanceDoses, now, bodyWeight)
    const c24h = calculateConcentration(med, substanceDoses, now - MS_PER_DAY, bodyWeight)
    const trendPctPerDay = c24h > 0 ? ((cNow - c24h) / c24h) * 100 : null

    const min = preset.therapeuticRange.min
    const max = preset.therapeuticRange.max
    const unit = preset.therapeuticRange.unit

    const hoursUntilBelowMin = projectHoursUntilBelowMin(med, substanceDoses, now, min, bodyWeight)

    const klass = derivePKStatus({
      concentration: cNow,
      therapeuticMin: min,
      therapeuticMax: max,
      missedDoses: missed,
      hoursUntilBelowMin,
    })

    out.push({
      presetKey,
      displayName: preset.name,
      brandName: preset.brandName,
      klass,
      concentrationNow: cNow,
      concentration24hAgo: c24h,
      therapeuticMin: min,
      therapeuticMax: max,
      unit,
      trendPctPerDay,
      expectedDosesLast48h: expectedDoses,
      loggedDosesLast48h: dosesInWindow.length,
      missedDoses: missed,
      hoursUntilBelowMin,
    })
  }

  return out
}
