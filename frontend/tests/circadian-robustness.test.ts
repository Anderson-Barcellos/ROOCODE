import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import { computeCircadianRobustness } from '../src/utils/circadian-robustness'

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-11T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function fixture(daysBack: number, health: Partial<DailyHealthMetrics>): DailySnapshot {
  const date = isoDate(daysBack)
  const wake = new Date(`${date}T07:00:00.000Z`)
  const sleep = new Date(wake.getTime() - 7.5 * 3_600_000)
  return {
    date,
    health: {
      date,
      sleepStartAt: sleep.toISOString(),
      sleepEndAt: wake.toISOString(),
      daylightMinutes: 75,
      heartRateMean: 72,
      restingHeartRate: 58,
      pulseTemperatureC: 0.05,
      ...health,
    } as DailyHealthMetrics,
    mood: null,
    medications: null,
  }
}

const collecting = computeCircadianRobustness(Array.from({ length: 6 }, (_, index) => fixture(5 - index, {})))
assert.equal(collecting.readiness, 'collecting')
assert.equal(collecting.amplitudeAvailable, false)

const exploratory = computeCircadianRobustness(Array.from({ length: 20 }, (_, index) => fixture(19 - index, {})))
assert.equal(exploratory.readiness, 'exploratory')
assert.ok(exploratory.score != null)
assert.ok(exploratory.components.find((c) => c.key === 'temperatureAmplitude')?.score != null)
assert.equal(exploratory.amplitudeAvailable, true)

const withLightGap = computeCircadianRobustness(
  Array.from({ length: 20 }, (_, index) =>
    fixture(19 - index, {
      pulseTemperatureC: index === 10 ? null : 0.05 + (index % 3) * 0.02,
    }),
  ),
)

assert.ok(withLightGap.components.find((c) => c.key === 'temperatureAmplitude')?.score != null)
assert.match(
  withLightGap.components.find((c) => c.key === 'temperatureAmplitude')?.note ?? '',
  /interpolações leves/,
)

const longGap = computeCircadianRobustness(
  Array.from({ length: 20 }, (_, index) =>
    fixture(19 - index, {
      pulseTemperatureC: index >= 8 && index <= 12 ? null : 0.05,
    }),
  ),
)

assert.ok(longGap.score != null)

console.log('circadian-robustness.test.ts — all assertions passed')
