/**
 * Bridge entre MedicationRow[] (CSV Apple Health) e a engine PK.
 * Transforma as linhas parsadas em medicamentos + doses com timestamps.
 */

import type { MedicationRow } from '../types/apple-health'
import {
  buildPKMedication,
  calculateConcentration,
  computeTrendFromSamples,
  findPresetKey,
  getTrendWindowMs,
  mgFromCount,
  type PKDose,
  type PKMedication,
} from './pharmacokinetics'

export interface MedGroup {
  medication: PKMedication
  doses: PKDose[]
  presetKey: string
}

function doseToMg(presetKey: string, amount: number | null, unit: string | null): number | null {
  if (amount == null || !Number.isFinite(amount)) return null

  const normalizedUnit = unit?.trim().toLowerCase()
  if (!normalizedUnit) {
    return mgFromCount(presetKey, amount)
  }

  if (normalizedUnit === 'mg' || normalizedUnit === 'miligrama' || normalizedUnit === 'miligramas') {
    return amount
  }
  if (normalizedUnit === 'mcg' || normalizedUnit === 'µg' || normalizedUnit === 'ug') {
    return amount / 1000
  }
  if (normalizedUnit === 'g' || normalizedUnit === 'grama' || normalizedUnit === 'gramas') {
    return amount * 1000
  }

  return mgFromCount(presetKey, amount)
}

/** Transforma MedicationRow[] em grupos por medicamento com doses timestampadas. */
export function buildMedGroups(rows: MedicationRow[]): MedGroup[] {
  const groups = new Map<string, MedGroup>()

  for (const row of rows) {
    if (!row.date || !row.medication) continue
    if (row.status && !/^(tomado|taken|completed|yes|sim)/i.test(row.status)) continue

    const presetKey = findPresetKey(row.medication)
    if (!presetKey) continue

    const med = buildPKMedication(row.medication)
    if (!med) continue

    const timestamp = new Date(row.date).getTime()
    if (!Number.isFinite(timestamp)) continue

    const sourceDose = row.dosage ?? row.scheduledDosage ?? 1
    const doseAmount = doseToMg(presetKey, sourceDose, row.unit)
    if (doseAmount == null || doseAmount <= 0) continue

    if (!groups.has(presetKey)) {
      groups.set(presetKey, { medication: med, doses: [], presetKey })
    }

    groups.get(presetKey)!.doses.push({
      medicationId: presetKey,
      timestamp,
      doseAmount,
    })
  }

  // Deduplica por dateOnly+presetKey: agrupa doses do mesmo dia, soma doseAmount.
  // Evita double-counting quando o Apple Health registra múltiplas entradas/dia.
  for (const group of groups.values()) {
    const dedupMap = new Map<string, PKDose>()
    for (const dose of group.doses) {
      const dateKey = new Date(dose.timestamp).toISOString().slice(0, 10)
      const existing = dedupMap.get(dateKey)
      if (!existing) {
        dedupMap.set(dateKey, { ...dose })
      } else {
        existing.doseAmount += dose.doseAmount
      }
    }
    group.doses = [...dedupMap.values()].sort((a, b) => a.timestamp - b.timestamp)
  }

  return [...groups.values()]
}

/**
 * Para cada snapshot diário, calcula uma série PK diária em modo trend.
 * Primeiro amostra a concentração ao meio-dia; depois aplica janela móvel
 * compatível com medicações crônicas para suavizar correlações dia a dia.
 */
export function buildDailyConcentrations(
  groups: MedGroup[],
  dates: string[],
  bodyWeight = 70,
): Record<string, Array<number | null>> {
  const result: Record<string, Array<number | null>> = {}

  for (const group of groups) {
    const { medication, doses, presetKey } = group
    const timestamps = dates.map((date) => new Date(`${date}T12:00:00`).getTime())
    const instantSeries = timestamps.map((noon) => {
      if (!Number.isFinite(noon)) return null
      const relevantDoses = doses.filter((d) => d.timestamp <= noon)
      if (!relevantDoses.length) return null
      const conc = calculateConcentration(medication, relevantDoses, noon, bodyWeight)
      return conc > 0.01 ? conc : null
    })
    const trendSeries = computeTrendFromSamples(
      timestamps,
      instantSeries,
      getTrendWindowMs(medication),
      3,
    )
    result[presetKey] = trendSeries.some((value) => value != null) ? trendSeries : instantSeries
  }

  return result
}
