import assert from 'node:assert/strict'

import { pearson } from '../src/utils/statistics'
import { pearson as pearsonIntraday } from '../src/utils/intraday-correlation'

const shortSample = pearson([1, 2, 3], [1, 2, 3])
assert.equal(shortSample, null)

const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const ys = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
const strong = pearson(xs, ys)

assert.ok(strong)
assert.ok(Number.isFinite(strong.pValue))
assert.ok(strong.pValue >= 0)
assert.ok(strong.pValue <= 1)
assert.equal(strong.n, 10)

// ─── Cross-implementation Pearson consistency ────────────────────────────────
// Existem duas implementações de Pearson na base:
//  - statistics.ts          → sampleCorrelation (simple-statistics), n≥10
//  - intraday-correlation.ts → fórmula manual, n≥3
//
// Auditoria 2026-05-15: confirmar que as duas produzem o mesmo r para o mesmo
// dado. Se divergirem, há bug em uma das implementações (ou ambas).

const TOLERANCE = 1e-9

function runCrossCheck(label: string, x: number[], y: number[]): void {
  const fromStats = pearson(x, y)
  const fromIntraday = pearsonIntraday(x, y)
  assert.ok(fromStats, `${label}: pearson statistics.ts retornou null`)
  assert.ok(Number.isFinite(fromIntraday), `${label}: pearson intraday retornou NaN`)
  const delta = Math.abs(fromStats.r - fromIntraday)
  assert.ok(
    delta < TOLERANCE,
    `${label}: divergência |r₁ − r₂| = ${delta} > ${TOLERANCE} (stats=${fromStats.r}, intraday=${fromIntraday})`,
  )
}

// Caso 1: perfeitamente correlacionado (r=1)
runCrossCheck('correlação perfeita', xs, ys)

// Caso 2: anti-correlação perfeita (r=-1)
runCrossCheck('anti-correlação perfeita', xs, [20, 18, 16, 14, 12, 10, 8, 6, 4, 2])

// Caso 3: dados ruidosos (r moderado)
const noisyX = [1.2, 2.5, 3.1, 4.8, 5.2, 6.7, 7.1, 8.5, 9.0, 10.3]
const noisyY = [2.1, 5.3, 5.5, 9.2, 9.8, 13.1, 13.5, 17.0, 18.4, 20.5]
runCrossCheck('dados ruidosos', noisyX, noisyY)

// Caso 4: correlação fraca, dados irregulares
const irregX = [3, 7, 2, 9, 5, 1, 8, 4, 6, 10]
const irregY = [4, 6, 7, 8, 3, 9, 5, 2, 10, 1]
runCrossCheck('correlação fraca irregular', irregX, irregY)

// Caso 5: dados negativos & positivos misturados
const mixedX = [-5, -3, -1, 1, 3, 5, 7, 9, 11, 13]
const mixedY = [-10, -6, -2, 2, 6, 10, 14, 18, 22, 26]
runCrossCheck('valores negativos e positivos', mixedX, mixedY)

console.log('statistics.test.ts — Pearson cross-implementation consistency validated (5 cases)')
