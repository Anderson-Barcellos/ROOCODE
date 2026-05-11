import assert from 'node:assert/strict'

import { RECOVERY_WEIGHTS, type RecoveryComponents } from '../src/utils/recovery-score'
import { rankLimitingFactors } from '../src/utils/recovery-score-ranking'

// ─── Test 1: Componente zerado puxa o ranking ────────────────────────────────

const allHigh: RecoveryComponents = { hrv: 95, sleepEff: 95, rhr: 95, sleepDebt: 95, mood: 95 }
const sleepCrashed: RecoveryComponents = { ...allHigh, sleepEff: 20 }
const ranked = rankLimitingFactors(sleepCrashed)
assert.equal(ranked[0].component, 'sleepEff')
assert.equal(ranked[0].componentValue, 20)
// Shortfall = (100-20) * 0.25 = 20
assert.ok(Math.abs(ranked[0].weightedShortfall - 20) < 1e-9)

// ─── Test 2: Componente com peso maior pesa mais no ranking ──────────────────

// HRV (30%) com 50 vs Mood (10%) com 30 → HRV puxa mais que mood.
// HRV shortfall = (100-50) * 0.30 = 15
// Mood shortfall = (100-30) * 0.10 = 7
const mixed: RecoveryComponents = { hrv: 50, sleepEff: 90, rhr: 90, sleepDebt: 90, mood: 30 }
const ranked2 = rankLimitingFactors(mixed)
assert.equal(ranked2[0].component, 'hrv')
assert.equal(ranked2[1].component, 'mood')
assert.ok(ranked2[0].weightedShortfall > ranked2[1].weightedShortfall)

// ─── Test 3: Score perfeito retorna shortfalls zero ──────────────────────────

const perfect: RecoveryComponents = { hrv: 100, sleepEff: 100, rhr: 100, sleepDebt: 100, mood: 100 }
const ranked3 = rankLimitingFactors(perfect)
ranked3.forEach((f) => assert.equal(f.weightedShortfall, 0))

// ─── Test 4: Pesos batem com RECOVERY_WEIGHTS ────────────────────────────────

const ranked4 = rankLimitingFactors(allHigh)
const weightMap = new Map(ranked4.map((f) => [f.component, f.weight]))
assert.equal(weightMap.get('hrv'), RECOVERY_WEIGHTS.hrv)
assert.equal(weightMap.get('sleepEff'), RECOVERY_WEIGHTS.sleepEff)
assert.equal(weightMap.get('rhr'), RECOVERY_WEIGHTS.rhr)
assert.equal(weightMap.get('sleepDebt'), RECOVERY_WEIGHTS.sleepDebt)
assert.equal(weightMap.get('mood'), RECOVERY_WEIGHTS.mood)

// ─── Test 5: Ranking sempre tem 5 componentes ────────────────────────────────

assert.equal(ranked.length, 5)
assert.equal(ranked2.length, 5)
assert.equal(ranked3.length, 5)

console.log('recovery-score-ranking.test.ts — all assertions passed')
