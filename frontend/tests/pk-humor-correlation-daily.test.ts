import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import { buildPKMedication, type PKDose } from '../src/utils/pharmacokinetics'
import {
  buildDailyEmaSamples,
  MIN_TOTAL_SAMPLES,
  pairAtLag,
} from '../src/utils/pk-humor-correlation-daily'

function makeSnapshot(
  date: string,
  valence: number | null,
  options: { interpolated?: boolean; forecasted?: boolean } = {},
): DailySnapshot {
  return {
    date,
    health: null,
    medications: null,
    mood:
      valence == null
        ? null
        : {
            date,
            interpolated: false,
            valence,
            valenceClass: null,
            entryCount: 1,
            labels: [],
            associations: [],
          },
    interpolated: options.interpolated ?? false,
    forecasted: options.forecasted ?? false,
  }
}

assert.equal(MIN_TOTAL_SAMPLES, 13)

const lagPairs = pairAtLag(
  [
    { date: '2026-01-01', ema: 10, valence: 0.1 },
    { date: '2026-01-03', ema: 20, valence: 0.2 },
    { date: '2026-01-04', ema: 30, valence: 0.3 },
    { date: '2026-01-05', ema: 40, valence: Number.NaN },
  ],
  1,
)

assert.equal(lagPairs.xs.length, 1, 'pareamento deve respeitar calendario real (sem pular dia faltante)')
assert.equal(lagPairs.ys.length, 1)
assert.equal(lagPairs.xs[0], 20)
assert.equal(lagPairs.ys[0], 0.3)

const med = buildPKMedication('lexapro')
assert.ok(med)

const baseDoseTime = Date.parse('2025-12-29T07:00:00Z')
const doses: PKDose[] = Array.from({ length: 12 }, (_, i) => ({
  medicationId: med.id,
  timestamp: baseDoseTime + i * 24 * 60 * 60 * 1000,
  doseAmount: 40,
}))

const snapshots: DailySnapshot[] = [
  makeSnapshot('2026-01-05', 0.1),
  makeSnapshot('2026-01-06', 0.2, { interpolated: true }),
  makeSnapshot('2026-01-07', -0.1, { forecasted: true }),
  makeSnapshot('2026-01-08', 0.3),
]

const samples = buildDailyEmaSamples(med, doses, snapshots, 70)
assert.deepEqual(
  samples.map((sample) => sample.date),
  ['2026-01-05', '2026-01-08'],
  'EMA diário deve ignorar snapshots interpolados/forecasted',
)
assert.ok(samples.every((sample) => Number.isFinite(sample.ema) && sample.ema > 0))

console.log('pk-humor-correlation-daily.test.ts — all assertions passed')
