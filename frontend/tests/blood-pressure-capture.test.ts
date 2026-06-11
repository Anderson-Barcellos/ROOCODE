import assert from 'node:assert/strict'

import type { MetricsRecord } from '../src/lib/api'
import { buildSnapshotsFromAPI } from '../src/utils/roocode-adapter'

// Fase 0 — a pressão arterial já chega no metrics.csv (colunas
// "Pressão Arterial [Systolic]/(Diastolic) (mmHg)") mas o pipeline a descartava.
// Este teste blinda a captura: um MetricsRecord com pressão deve produzir um
// snapshot com systolicMmHg/diastolicMmHg preenchidos.

const metrics: MetricsRecord[] = [
  {
    'Data/Hora': '10/06/2026 12:00:00',
    'Pressão Arterial [Systolic] (mmHg)': 123,
    'Pressão Arterial [Diastolic] (mmHg)': 76.5,
    'Frequência Cardíaca em Repouso (bpm)': 58,
  },
]

const { snapshots } = buildSnapshotsFromAPI({ metrics })
const day = snapshots.find((s) => s.date === '2026-06-10')

assert.ok(day, 'snapshot de 2026-06-10 deve existir')
assert.ok(day.health, 'health do dia deve existir')
assert.equal(day.health!.systolicMmHg, 123)
assert.equal(day.health!.diastolicMmHg, 76.5)

// Dia sem pressão: campos devem ser null (não undefined, não inventados)
const metricsNoBp: MetricsRecord[] = [
  { 'Data/Hora': '09/06/2026 12:00:00', 'Frequência Cardíaca em Repouso (bpm)': 60 },
]
const { snapshots: snaps2 } = buildSnapshotsFromAPI({ metrics: metricsNoBp })
const day2 = snaps2.find((s) => s.date === '2026-06-09')
assert.ok(day2?.health, 'health do dia sem pressão deve existir')
assert.equal(day2!.health!.systolicMmHg, null)
assert.equal(day2!.health!.diastolicMmHg, null)

console.log('blood-pressure-capture.test.ts — all assertions passed')
