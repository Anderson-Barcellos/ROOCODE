import assert from 'node:assert/strict'

import {
  ANDERS_HRMAX_BPM,
  estimateVo2MaxUthSorensen,
} from '../src/utils/health-policies'

// Sanity da fórmula Uth-Sørensen: VO2max ≈ 15 × (HRmax / RHR).
// HRmax pro Anders: 220 - 38 = 182 bpm.

const baseline = estimateVo2MaxUthSorensen(60, ANDERS_HRMAX_BPM)
assert.ok(baseline)
assert.equal(Math.round(baseline * 10) / 10, 45.5) // 15 * 182/60 = 45.5

const recovered = estimateVo2MaxUthSorensen(50, ANDERS_HRMAX_BPM)
assert.ok(recovered)
assert.ok(recovered > baseline) // RHR baixo ⇒ VO2 maior

const fatigued = estimateVo2MaxUthSorensen(70, ANDERS_HRMAX_BPM)
assert.ok(fatigued)
assert.ok(fatigued < baseline) // RHR alto ⇒ VO2 menor

// Default param usa ANDERS_HRMAX_BPM
const defaulted = estimateVo2MaxUthSorensen(60)
assert.equal(defaulted, baseline)

// Inputs inválidos
assert.equal(estimateVo2MaxUthSorensen(null), null)
assert.equal(estimateVo2MaxUthSorensen(0), null)
assert.equal(estimateVo2MaxUthSorensen(-10), null)
assert.equal(estimateVo2MaxUthSorensen(NaN), null)
assert.equal(estimateVo2MaxUthSorensen(60, NaN), null)
assert.equal(estimateVo2MaxUthSorensen(60, 0), null)

// HRmax ≤ RHR é fisiologicamente impossível ⇒ null
assert.equal(estimateVo2MaxUthSorensen(200, 180), null)
assert.equal(estimateVo2MaxUthSorensen(180, 180), null)

// HRmax customizado funciona
const customMax = estimateVo2MaxUthSorensen(60, 200)
assert.ok(customMax)
assert.equal(Math.round(customMax * 10) / 10, 50.0) // 15 * 200/60 = 50

// Range fisiológico esperado pra Anders (RHR 55-65, HRmax 182):
// Min: 15 * 182/65 ≈ 42.0; Max: 15 * 182/55 ≈ 49.6
const lowEnd = estimateVo2MaxUthSorensen(65, ANDERS_HRMAX_BPM)
const highEnd = estimateVo2MaxUthSorensen(55, ANDERS_HRMAX_BPM)
assert.ok(lowEnd && lowEnd >= 41 && lowEnd <= 43)
assert.ok(highEnd && highEnd >= 49 && highEnd <= 51)

// Constante exposta corretamente
assert.equal(ANDERS_HRMAX_BPM, 182)
