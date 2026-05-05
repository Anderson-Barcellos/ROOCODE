import assert from 'node:assert/strict'

import { pearson } from '../src/utils/statistics'

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
