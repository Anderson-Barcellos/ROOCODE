import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { computeFunctionalCapacity } from '../src/utils/functional-capacity'

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-11T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function fixture(daysBack: number, health: Partial<DailyHealthMetrics>): DailySnapshot {
  const date = isoDate(daysBack)
  return {
    date,
    health: {
      date,
      restingHeartRate: 60,
      walkingHeartRateAvg: 92,
      vo2Max: 38,
      cardioRecoveryBpm: null,
      sixMinuteWalkMeters: null,
      ...health,
    } as DailyHealthMetrics,
    mood: null,
    medications: null,
  }
}

const baseline = Array.from({ length: 30 }, (_, index) =>
  fixture(30 - index, {
    restingHeartRate: 58 + (index % 4),
    walkingHeartRateAvg: 90 + (index % 5),
    vo2Max: 38 + (index % 3),
  }),
)

const withoutOptionalInputs = computeFunctionalCapacity([
  ...baseline,
  fixture(0, { vo2Max: 39, cardioRecoveryBpm: null, sixMinuteWalkMeters: null }),
])

assert.ok(withoutOptionalInputs.score != null)
assert.equal(withoutOptionalInputs.components.find((c) => c.key === 'vo2SixMinuteWalk')?.activeWeight, 0)
assert.equal(withoutOptionalInputs.components.find((c) => c.key === 'heartRateRecovery')?.activeWeight, 0)
assert.ok(withoutOptionalInputs.confidence < 1)

const withSixMinuteWalk = computeFunctionalCapacity([
  ...baseline,
  fixture(0, { vo2Max: 40, sixMinuteWalkMeters: 620, cardioRecoveryBpm: 18 }),
])

assert.ok(withSixMinuteWalk.vo2SixMinuteWalk != null)
assert.ok(withSixMinuteWalk.vo2Divergence != null && Math.abs(withSixMinuteWalk.vo2Divergence) >= 5)
assert.ok(withSixMinuteWalk.inputsUsed >= withoutOptionalInputs.inputsUsed)

const latestDayPartial = computeFunctionalCapacity([
  ...baseline,
  fixture(0, {
    restingHeartRate: null,
    walkingHeartRateAvg: null,
    vo2Max: null,
    sixMinuteWalkMeters: 500,
  }),
])

assert.ok(latestDayPartial.vo2Estimated != null, 'VO2 predito deve usar FC repouso válida de dia anterior no recorte')
assert.ok(latestDayPartial.components.find((c) => c.key === 'heartRateReserve')?.value != null)
assert.ok(latestDayPartial.components.find((c) => c.key === 'chronotropic')?.value != null)

console.log('functional-capacity.test.ts — all assertions passed')
