import assert from 'node:assert/strict'
import { addDays, format, startOfDay } from 'date-fns'

import type { DailySnapshot, MedicationRow } from '../src/types/apple-health'
import type { MedicationRegimenEntry, PKTimelineSeries } from '../src/types/pharmacology'
import {
  buildConcentrationByConvolution,
  buildPKLagCorrelations,
  buildPKTimelinePayload,
  expandRegimenDoses,
} from '../src/utils/medication-bridge'
import {
  buildPKMedication,
  calculateConcentration,
  singleDoseConcentrationAtHours,
  type PKDose,
} from '../src/utils/pharmacokinetics'

const HOUR = 60 * 60 * 1000

function snapshot(date: string, mood: number | null = null): DailySnapshot {
  return {
    date,
    health: null,
    mood: mood == null
      ? null
      : {
          date,
          valence: mood,
          valenceClass: null,
          entryCount: 1,
          labels: [],
          associations: [],
        },
    medications: null,
  }
}

function medRow(date: string, dose: number): MedicationRow {
  return {
    id: 1,
    date,
    scheduledDate: null,
    medication: 'lexapro',
    nickname: 'lexapro',
    dosage: dose,
    scheduledDosage: null,
    unit: 'mg',
    status: 'taken',
    archived: false,
    codings: null,
  }
}

function regimen(overrides: Partial<MedicationRegimenEntry> = {}): MedicationRegimenEntry {
  return {
    id: 'lexapro-test',
    substance: 'lexapro',
    dose_mg: 40,
    times: ['07:00'],
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    start_date: null,
    end_date: null,
    color: '#0f766e',
    ...overrides,
  }
}

function localStamp(timestamp: number): string {
  const date = new Date(timestamp)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

const lexapro = buildPKMedication('lexapro')
assert.ok(lexapro)

const base = new Date('2026-04-13T07:00:00').getTime()
const dose: PKDose = { medicationId: lexapro.id, timestamp: base, doseAmount: 40 }

const singleDoseAt6h = singleDoseConcentrationAtHours(lexapro, 40, 6, 70)
const classicAt6h = calculateConcentration(lexapro, [dose], base + 6 * HOUR, 70)
assert.ok(Math.abs(singleDoseAt6h - classicAt6h) < 1e-9)

const oneDoseCurve = buildConcentrationByConvolution(
  lexapro,
  [{ ...dose, source: 'logged' }],
  Array.from({ length: 13 }, (_, index) => base + index * HOUR),
  60,
  70,
)
assert.ok(Math.abs(oneDoseCurve[6] - classicAt6h) < 1e-9)

const secondDose = { ...dose, timestamp: base + 24 * HOUR }
const twoDoseCurve = buildConcentrationByConvolution(
  lexapro,
  [{ ...dose, source: 'logged' }, { ...secondDose, source: 'logged' }],
  Array.from({ length: 31 }, (_, index) => base + index * HOUR),
  60,
  70,
)
const classicAt30h = calculateConcentration(lexapro, [dose, secondDose], base + 30 * HOUR, 70)
assert.ok(Math.abs(twoDoseCurve[30] - classicAt30h) < 1e-9)

const expanded = expandRegimenDoses(
  [regimen({ times: ['07:00', '22:00'], days_of_week: [1, 3] })],
  [],
  new Date('2026-04-13T00:00:00').getTime(),
  new Date('2026-04-16T00:00:00').getTime(),
)
assert.deepEqual(
  expanded.map((item) => localStamp(item.timestamp)),
  [
    '2026-04-13T07:00',
    '2026-04-13T22:00',
    '2026-04-15T07:00',
    '2026-04-15T22:00',
  ],
)

const replaced = expandRegimenDoses(
  [regimen({ times: ['07:00'] })],
  [
    medRow('2026-04-13T08:00:00', 35),
    medRow('2026-04-13T15:30:00', 5),
  ],
  new Date('2026-04-13T00:00:00').getTime(),
  new Date('2026-04-13T23:59:00').getTime(),
)
assert.equal(replaced.length, 2)
assert.equal(replaced.filter((item) => item.source === 'logged').length, 2)
assert.equal(replaced.some((item) => item.source === 'regimen'), false)
assert.equal(replaced[0].scheduledTimestamp, new Date('2026-04-13T07:00:00').getTime())

const payload = buildPKTimelinePayload(
  [regimen()],
  [],
  [snapshot('2026-04-13', 0.1), snapshot('2026-04-14', 0.2)],
  {
    startTime: new Date('2026-04-13T00:00:00').getTime(),
    endTime: new Date('2026-04-14T23:00:00').getTime(),
    resolutionMinutes: 60,
    bodyWeightKg: 70,
  },
)
const firstNonNullPoint = payload.series[0].points.find((point) => point.rawConcentration != null)
assert.ok(firstNonNullPoint)
assert.ok(payload.series[0].referenceCmax > 0)
assert.ok(Math.abs((firstNonNullPoint.rawConcentration! / payload.series[0].referenceCmax) * 100 - firstNonNullPoint.normalizedPct!) < 1e-9)

const lagDates = Array.from({ length: 14 }, (_, index) => (
  format(addDays(startOfDay(new Date('2026-04-01T00:00:00')), index), 'yyyy-MM-dd')
))
const syntheticSeries: PKTimelineSeries = {
  presetKey: 'lexapro',
  name: 'Lexapro',
  color: '#0f766e',
  referenceCmax: 1,
  referenceDose: 40,
  doses: [],
  points: lagDates.map((date, index) => ({
    timestamp: new Date(`${date}T12:00:00`).getTime(),
    date,
    normalizedPct: index,
    rawConcentration: index,
  })),
}
const laggedSnapshots = lagDates.map((date, index) => snapshot(date, index >= 2 ? index - 2 : null))
const lagRows = buildPKLagCorrelations([syntheticSeries], laggedSnapshots, 7)
const lag2 = lagRows.find((row) => row.lagDays === 2)
assert.ok(lag2?.result)
assert.equal(lag2.n, 12)
assert.ok(Math.abs(lag2.result.r - 1) < 1e-9)
