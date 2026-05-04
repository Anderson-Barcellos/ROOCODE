import assert from 'node:assert/strict'

import type { MedicationRow } from '../src/types/apple-health'
import { buildDailyConcentrations, buildMedGroups } from '../src/utils/medication-bridge'
import {
  buildPKMedication,
  calculateConcentration,
  singleDoseConcentrationAtHours,
  type PKDose,
} from '../src/utils/pharmacokinetics'

const HOUR = 60 * 60 * 1000

function medRow(date: string, dose: number, status = 'taken', unit = 'mg'): MedicationRow {
  return {
    id: 1,
    date,
    scheduledDate: null,
    medication: 'lexapro',
    nickname: 'lexapro',
    dosage: dose,
    scheduledDosage: null,
    unit,
    status,
    archived: false,
    codings: null,
  }
}

const lexapro = buildPKMedication('lexapro')
assert.ok(lexapro)

const base = Date.parse('2026-04-13T07:00:00Z')
const dose: PKDose = { medicationId: lexapro.id, timestamp: base, doseAmount: 40 }

const singleDoseAt6h = singleDoseConcentrationAtHours(lexapro, 40, 6, 70)
const classicAt6h = calculateConcentration(lexapro, [dose], base + 6 * HOUR, 70)
assert.ok(Math.abs(singleDoseAt6h - classicAt6h) < 1e-9)

const groups = buildMedGroups([
  medRow('2026-04-13T08:00:00Z', 35),
  medRow('2026-04-13T15:30:00Z', 5),
  medRow('2026-04-14T08:00:00Z', 20),
  medRow('2026-04-14T12:00:00Z', 1000, 'taken', 'mcg'),
  medRow('2026-04-14T18:00:00Z', 50, 'skipped'),
])

assert.equal(groups.length, 1)
assert.equal(groups[0].medication.id, lexapro.id)

const groupedDoses = groups[0].doses
assert.equal(groupedDoses.length, 2)
assert.ok(Math.abs(groupedDoses[0].doseAmount - 40) < 1e-9)
assert.ok(Math.abs(groupedDoses[1].doseAmount - 21) < 1e-9)

const dates = ['2026-04-13', '2026-04-14', '2026-04-15']
const concentrations = buildDailyConcentrations(groups, dates, 70)
const series = concentrations[groups[0].presetKey]

assert.equal(series.length, dates.length)
assert.ok(series.some((value) => typeof value === 'number' && value > 0))
