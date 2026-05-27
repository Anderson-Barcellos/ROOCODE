import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  MIN_PAIRED_DAYS_FOR_RANKING,
  TOP_N,
  rankDrivers,
} from '../src/utils/driver-ranking'

interface FixtureOptions {
  date: string
  sleep?: number | null
  hrv?: number | null
  steps?: number | null
  daylight?: number | null
  mood?: number | null
  forecasted?: boolean
  interpolated?: boolean
  doseCount?: number
}

function makeSnapshot(opts: FixtureOptions): DailySnapshot {
  const moodValence = opts.mood ?? null
  return {
    date: opts.date,
    health: {
      date: opts.date,
      sleepStartAt: null,
      sleepEndAt: null,
      sleepTotalHours: opts.sleep ?? null,
      sleepAsleepHours: null,
      sleepInBedHours: null,
      sleepCoreHours: null,
      sleepDeepHours: null,
      sleepRemHours: null,
      sleepAwakeHours: null,
      sleepEfficiencyPct: null,
      respiratoryDisturbances: null,
      activeEnergyKcal: null,
      restingEnergyKcal: null,
      heartRateMin: null,
      heartRateMax: null,
      heartRateMean: null,
      restingHeartRate: null,
      spo2: null,
      respiratoryRate: null,
      pulseTemperatureC: null,
      exerciseMinutes: null,
      standingMinutes: null,
      daylightMinutes: opts.daylight ?? null,
      hrvSdnn: opts.hrv ?? null,
      steps: opts.steps ?? null,
      distanceKm: null,
      physicalEffort: null,
      walkingHeartRateAvg: null,
      walkingAsymmetryPct: null,
      walkingSpeedKmh: null,
      walkingStepLengthCm: null,
      runningSpeedKmh: null,
      vo2Max: null,
      sixMinuteWalkMeters: null,
      cardioRecoveryBpm: null,
      recordCount: 1,
      placeholderRestingEnergyRows: 0,
    },
    mood:
      moodValence == null
        ? null
        : {
            date: opts.date,
            valence: moodValence,
            valenceClass: null,
            entryCount: 1,
            labels: [],
            associations: [],
          },
    medications:
      opts.doseCount == null
        ? null
        : {
            date: opts.date,
            count: opts.doseCount,
            medications: [],
          },
    forecasted: opts.forecasted ?? false,
    interpolated: opts.interpolated ?? false,
  }
}

// CASO 1: dados suficientes (12 dias com humor pareado em todos)
const days12: DailySnapshot[] = Array.from({ length: 12 }, (_, i) =>
  makeSnapshot({
    date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    sleep: 6 + (i % 3) * 0.5,
    hrv: 30 + i,
    steps: 5000 + i * 200,
    daylight: 200 + i * 5,
    mood: ((i % 5) - 2) * 0.3,
  }),
)

const result = rankDrivers(days12)
assert.ok(result.top3.length <= TOP_N, `top3 ≤ ${TOP_N}`)
result.top3.forEach((d) => assert.equal(d.state, 'qualified', 'top3 são qualified'))
assert.ok(result.pairedDays >= MIN_PAIRED_DAYS_FOR_RANKING, 'pairedDays ≥ 10')
assert.equal(typeof result.coveragePct, 'number', 'coveragePct é número')
assert.equal(result.coveragePct, 100, 'cobertura 100% com humor em todos os dias')

// CASO 2: dados insuficientes (5 dias) — todos dim, top3 vazio
const days5 = days12.slice(0, 5)
const insufficient = rankDrivers(days5)
assert.equal(insufficient.top3.length, 0, 'sem qualificados, top3 vazio')
assert.equal(insufficient.others.length, 4, '4 drivers dim em others')
insufficient.others.forEach((d) =>
  assert.equal(d.state, 'dim', 'todos dim quando n<10'),
)

// CASO 3: medicação NUNCA aparece no resultado
const allIds = [...result.top3, ...result.others].map((d) => d.id)
assert.ok(!allIds.includes('medication'), 'medicação fora do ranking')
assert.deepEqual(
  [...allIds].sort(),
  ['activity', 'autonomic', 'circadian', 'sleep'],
  'apenas 4 drivers não-context',
)

// CASO 4: forecasted/interpolated não contam no pareamento
const polluted = [
  ...days12,
  makeSnapshot({
    date: '2026-05-13',
    sleep: 99,
    mood: 1,
    forecasted: true,
  }),
  makeSnapshot({
    date: '2026-05-14',
    sleep: 99,
    mood: -1,
    interpolated: true,
  }),
]
const ranked = rankDrivers(polluted)
const sleep =
  ranked.top3.find((d) => d.id === 'sleep') ?? ranked.others.find((d) => d.id === 'sleep')
assert.ok(sleep != null, 'sleep driver presente')
assert.equal(sleep.pairCount, 12, 'forecasted/interpolated não contam')

// CASO 5: robustCount conta apenas top3 com |r|≥0.3
assert.ok(typeof result.robustCount === 'number', 'robustCount é número')
assert.ok(result.robustCount <= result.top3.length, 'robustCount ≤ top3.length')

// CASO 6: ordenação por |r| descendente no top3
if (result.top3.length >= 2) {
  for (let i = 0; i < result.top3.length - 1; i++) {
    const current = Math.abs(result.top3[i].pearson!.r)
    const next = Math.abs(result.top3[i + 1].pearson!.r)
    assert.ok(current >= next, `top3 ordenado por |r| desc (idx ${i}: ${current} ≥ ${next})`)
  }
}

console.log('driver-ranking.test.ts OK')
