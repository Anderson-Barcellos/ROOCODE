import assert from 'node:assert/strict'

import {
  computePanoramaConfidence,
  computePanoramaCoverage,
} from '../src/utils/panorama-top'

const mixedSnapshots = [
  { date: '2026-05-01' },
  { date: '2026-05-02', interpolated: true },
  { date: '2026-05-03' },
  { date: '2026-05-04', forecasted: true },
  { date: '2026-05-05' },
]

const coverage = computePanoramaCoverage(mixedSnapshots)
assert.equal(coverage.realDays, 3)
assert.equal(coverage.totalDays, 5)
assert.equal(coverage.coveragePct, 60)
assert.equal(coverage.label, '3 dias reais')
assert.equal(coverage.detail, '60% da janela')

const confidenceWithInterpolation = computePanoramaConfidence({
  snapshotsInRange: mixedSnapshots,
  score: 58,
  completeness: 1,
  confidence: 0.96,
  derivedFromInterpolated: false,
})
assert.equal(confidenceWithInterpolation.tier, 'parcial')
assert.equal(confidenceWithInterpolation.label, 'Confiança parcial')
assert.equal(confidenceWithInterpolation.detail, '1 dia interpolado na janela')

const lowConfidence = computePanoramaConfidence({
  snapshotsInRange: [{ date: '2026-05-01' }, { date: '2026-05-02' }],
  score: null,
  completeness: 0.4,
  confidence: 0.5,
  derivedFromInterpolated: false,
})
assert.equal(lowConfidence.tier, 'baixa')
assert.equal(lowConfidence.label, 'Confiança baixa')
assert.equal(lowConfidence.detail, '2 dias reais')

const robustConfidence = computePanoramaConfidence({
  snapshotsInRange: new Array(7).fill(null).map((_, idx) => ({ date: `2026-05-0${idx + 1}` })),
  score: 72,
  completeness: 1,
  confidence: 0.97,
  derivedFromInterpolated: false,
})
assert.equal(robustConfidence.tier, 'robusta')
assert.equal(robustConfidence.label, 'Confiança robusta')
assert.equal(robustConfidence.detail, '7 dias reais · sem interpolação')

console.log('panorama-top.test.ts — all assertions passed')
