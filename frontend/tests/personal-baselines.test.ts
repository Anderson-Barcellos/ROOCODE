import assert from 'node:assert/strict'

import {
  computeRollingBaseline,
  rollingStandardDeviation,
} from '../src/utils/personal-baselines'

// ─── computeRollingBaseline ───────────────────────────────────────────────

// Caso normal: 14 valores entre 36.5 e 36.9 → baseline limpa
const tempValues = [36.5, 36.6, 36.7, 36.8, 36.9, 36.5, 36.6, 36.7, 36.8, 36.9, 36.5, 36.6, 36.7, 36.8]
const baseline = computeRollingBaseline(tempValues)
assert.ok(baseline)
assert.equal(baseline.n, 14)
assert.ok(Math.abs(baseline.mean - 36.7) < 0.05)
assert.ok(baseline.sd > 0 && baseline.sd < 0.2)

// Janela: pega só os últimos windowSize. Quando customiza windowSize abaixo
// do default minPoints (14), precisa passar minPoints explícito.
const longSeries = Array.from({ length: 60 }, (_, i) => i + 1) // 1..60
const windowed = computeRollingBaseline(longSeries, { windowSize: 10, minPoints: 10 })
assert.ok(windowed)
assert.equal(windowed.n, 10)
assert.equal(windowed.mean, 55.5) // média de 51..60

// minPoints: 13 valores com minPoints=14 → null
const tooFew = computeRollingBaseline(tempValues.slice(0, 13))
assert.equal(tooFew, null)

// Filtra null/NaN antes de avaliar minPoints
const withNulls: Array<number | null> = [...tempValues.slice(0, 7), null, NaN, ...tempValues.slice(7, 14)]
const filtered = computeRollingBaseline(withNulls)
assert.ok(filtered)
assert.equal(filtered.n, 14)

// minPoints custom
const small = computeRollingBaseline([1, 2, 3, 4, 5], { minPoints: 3 })
assert.ok(small)
assert.equal(small.n, 5)
assert.equal(small.mean, 3)

// Array vazio
assert.equal(computeRollingBaseline([]), null)
assert.equal(computeRollingBaseline([null, null, NaN]), null)

// SD amostral usa n-1 (Bessel)
// Pra [1,2,3,4,5]: mean=3, variance=(4+1+0+1+4)/4=2.5, sd≈1.58
const sdCheck = computeRollingBaseline([1, 2, 3, 4, 5], { minPoints: 3 })
assert.ok(sdCheck)
assert.ok(Math.abs(sdCheck.sd - Math.sqrt(2.5)) < 0.01)

// ─── rollingStandardDeviation ─────────────────────────────────────────────

// Janela 7d sobre série constante → SD = 0 onde a janela é cheia, null nos primeiros < minPoints
const constant = [10, 10, 10, 10, 10, 10, 10, 10, 10]
const sdConst = rollingStandardDeviation(constant, 7, 4)
assert.equal(sdConst.length, 9)
// Primeiros 3 índices: janela tem 1, 2, 3 valores < minPoints=4 → null
assert.equal(sdConst[0], null)
assert.equal(sdConst[1], null)
assert.equal(sdConst[2], null)
// A partir do índice 3: janela tem 4+ valores → SD = 0 (constante)
assert.ok(sdConst[3] !== null && sdConst[3] === 0)
assert.ok(sdConst[8] !== null && sdConst[8] === 0)

// Janela com null: filtra antes de computar
const withMissingValues: Array<number | null> = [1, null, 2, null, 3, 4, 5, 6, 7]
const sdMixed = rollingStandardDeviation(withMissingValues, 7, 4)
// Índice 6: janela [1, null, 2, null, 3, 4, 5] → válidos [1,2,3,4,5] (n=5, ≥ minPoints)
assert.ok(sdMixed[6] !== null)
assert.ok(sdMixed[6]! > 1.4 && sdMixed[6]! < 1.7) // SD([1,2,3,4,5]) ≈ 1.58

// minPoints default = ceil(windowSize/2)
const sdDefault = rollingStandardDeviation([1, 2, 3, 4], 4)
// minPoints default = 2; índice 0: janela=[1] (n=1) → null
assert.equal(sdDefault[0], null)
// Índice 1: janela=[1,2] (n=2) → variance = (0.25+0.25)/1 = 0.5, SD = sqrt(0.5) ≈ 0.707
assert.ok(sdDefault[1] !== null && Math.abs(sdDefault[1]! - Math.sqrt(0.5)) < 0.01)

// Janela maior que array: pega tudo até i
const sdShortArray = rollingStandardDeviation([1, 2, 3], 100, 2)
assert.equal(sdShortArray[0], null) // n=1 < minPoints=2
assert.ok(sdShortArray[1] !== null) // n=2
assert.ok(sdShortArray[2] !== null) // n=3

// Array vazio
const sdEmpty = rollingStandardDeviation([], 7)
assert.equal(sdEmpty.length, 0)
