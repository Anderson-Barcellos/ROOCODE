import assert from 'node:assert/strict'

import { benjaminiHochbergFdr, fisherCi95 } from '../src/utils/intraday-correlation'
import { pearsonPValueFromR } from '../src/utils/statistics'

// Valores de referencia gerados com SciPy (stats.t.sf) para o teste bilateral
// de Pearson via estatistico t, com graus de liberdade n-2.
const SCIPY_PVALUE_CASES = [
  { r: 0.9, n: 10, p: 0.00038715624999999926 },
  { r: 0.8, n: 12, p: 0.001781839999999996 },
  { r: 0.6, n: 15, p: 0.018050087941499978 },
  { r: 0.5, n: 20, p: 0.024769558804109703 },
  { r: 0.3, n: 30, p: 0.10724594805795436 },
  { r: -0.4, n: 15, p: 0.13959512937214438 },
  { r: -0.2, n: 60, p: 0.12549031789310455 },
]

for (const testCase of SCIPY_PVALUE_CASES) {
  const computed = pearsonPValueFromR(testCase.r, testCase.n)
  assert.ok(Number.isFinite(computed), `p-value invalido para r=${testCase.r}, n=${testCase.n}`)
  const delta = Math.abs(computed - testCase.p)
  assert.ok(
    delta < 5e-12,
    `p-value divergente de SciPy para r=${testCase.r}, n=${testCase.n}: got=${computed}, expected=${testCase.p}, delta=${delta}`,
  )
}

// Referencias geradas com Fisher z + z(0.975) do SciPy.
const SCIPY_FISHER_CI_CASES = [
  { r: 0.8, n: 12, lower: 0.41802049205701985, upper: 0.9415952073545855 },
  { r: 0.6, n: 15, lower: 0.12667022628257457, upper: 0.8507716277814262 },
  { r: -0.4, n: 15, lower: -0.7571242046236263, upper: 0.14119427660352352 },
]

for (const testCase of SCIPY_FISHER_CI_CASES) {
  const ci = fisherCi95(testCase.r, testCase.n)
  assert.ok(ci, `IC95 nao retornado para r=${testCase.r}, n=${testCase.n}`)
  if (!ci) throw new Error('IC95 ausente apos assert')
  const lowerDelta = Math.abs(ci.lower - testCase.lower)
  const upperDelta = Math.abs(ci.upper - testCase.upper)
  assert.ok(
    lowerDelta < 5e-12,
    `IC95 lower divergente para r=${testCase.r}, n=${testCase.n}: got=${ci.lower}, expected=${testCase.lower}, delta=${lowerDelta}`,
  )
  assert.ok(
    upperDelta < 5e-12,
    `IC95 upper divergente para r=${testCase.r}, n=${testCase.n}: got=${ci.upper}, expected=${testCase.upper}, delta=${upperDelta}`,
  )
}

// Vetor de referencia validado contra p.adjust(method='BH') no R/StatsModels.
const qValues = benjaminiHochbergFdr([0.01, null, 0.04, 0.03, 0.2, 0.002])
const expectedQ = [0.025, null, 0.05, 0.05, 0.2, 0.01]

assert.equal(qValues.length, expectedQ.length)
for (let i = 0; i < expectedQ.length; i++) {
  const expected = expectedQ[i]
  if (expected == null) {
    assert.equal(qValues[i], null)
  } else {
    const actual = qValues[i]
    assert.ok(actual != null, `q-value ausente no indice ${i}`)
    const delta = Math.abs(actual - expected)
    assert.ok(delta < 1e-12, `q-value divergente no indice ${i}: got=${actual}, expected=${expected}`)
  }
}

console.log('pearson-reference.test.ts — scipy/r parity assertions passed')
