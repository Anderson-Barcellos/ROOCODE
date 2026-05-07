import assert from 'node:assert/strict'

import {
  benjaminiHochbergFdr,
  buildMoodEvents,
  buildPKMoodPairs,
  computeLagCorrelation,
  inferIntradayCorrelation,
  normalizeIntradayValence,
  spearman,
  type MoodEvent,
} from '../src/utils/intraday-correlation'
import {
  buildPKMedication,
  PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML,
  type PKDose,
} from '../src/utils/pharmacokinetics'

const med = buildPKMedication('lexapro')
assert.ok(med)

const doseTime = Date.parse('2026-04-20T12:00:00Z')
const doses: PKDose[] = [
  {
    medicationId: med.id,
    timestamp: doseTime,
    doseAmount: 40,
  },
]

const events: MoodEvent[] = [
  {
    timestamp: doseTime - 2 * 60 * 60 * 1000,
    valence: 0.1,
    valenceClass: null,
  },
  {
    timestamp: doseTime + 3 * 60 * 60 * 1000,
    valence: 0.6,
    valenceClass: null,
  },
]

const pairs = buildPKMoodPairs(events, med, doses, 70, 0)
assert.equal(pairs.length, 1)
assert.equal(pairs[0].timestamp, events[1].timestamp)
assert.ok(pairs[0].concentration > PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML)

const laggedPairs = buildPKMoodPairs([events[1]], med, doses, 70, 4)
assert.equal(laggedPairs.length, 0)

assert.equal(normalizeIntradayValence(76), 0.52)
assert.equal(normalizeIntradayValence('0,25'), 0.25)
assert.equal(normalizeIntradayValence(-0.4), -0.4)
assert.equal(normalizeIntradayValence(''), null)
assert.equal(normalizeIntradayValence('fora-escala'), null)

const deduped = buildMoodEvents([
  { start: '20/04/2026 15:00:00', end: null, type: 'Emoção Momentânea', labels: [], associations: [], valence: 0.2, valenceClass: null },
  { start: '20/04/2026 15:00:00', end: null, type: 'Emoção Momentânea', labels: [], associations: [], valence: 0.2, valenceClass: null },
])
assert.equal(deduped.length, 1)

const sparseLag = computeLagCorrelation([events[1]], med, doses, [0, 2])
assert.equal(sparseLag.length, 2)
assert.equal(Number.isNaN(sparseLag[0].r), true)
assert.equal(Number.isNaN(sparseLag[1].r), true)
assert.equal(sparseLag[0].pValuePermutation, null)
assert.equal(sparseLag[0].ci95Lower, null)
assert.equal(sparseLag[0].qValueFdr, null)

const syntheticPairs = Array.from({ length: 18 }, (_, i) => ({
  timestamp: doseTime + i * 60 * 60 * 1000,
  concentration: 10 + i * 2,
  valence: -0.5 + i * 0.06,
}))

const inference = inferIntradayCorrelation(syntheticPairs, {
  permutationIterations: 500,
  bootstrapIterations: 400,
})

assert.ok(inference)
assert.ok(Number.isFinite(inference.r))
assert.equal(inference.method, 'pearson')
assert.ok(inference.ci95Lower != null)
assert.ok(inference.ci95Upper != null)
assert.ok(inference.pValuePermutation != null)
assert.ok(inference.slope != null)
assert.ok(inference.slopeCi95Lower != null)
assert.ok(inference.slopeCi95Upper != null)

const inferenceSpearman = inferIntradayCorrelation(syntheticPairs, {
  method: 'spearman',
  permutationIterations: 500,
  bootstrapIterations: 400,
})

assert.ok(inferenceSpearman)
assert.equal(inferenceSpearman.method, 'spearman')
assert.ok(Number.isFinite(inferenceSpearman.r))
assert.ok(inferenceSpearman.pValuePermutation != null)

const monotonicX = [1, 2, 3, 4, 5]
const monotonicY = [10, 20, 30, 40, 50]
assert.equal(spearman(monotonicX, monotonicY), 1)

const qValues = benjaminiHochbergFdr([0.01, 0.02, 0.2, null, 0.04])
assert.equal(qValues.length, 5)
assert.ok(qValues[0] != null)
assert.ok(qValues[1] != null)
assert.ok(qValues[2] != null)
assert.equal(qValues[3], null)
assert.ok((qValues[0] ?? 1) <= (qValues[2] ?? 1))
