import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  RECOVERY_INDEX_WEIGHTS,
  computeRecoveryIndexBaselines,
  computeRecoveryIndexSeries,
} from '../src/utils/recovery-index'

const totalWeight =
  RECOVERY_INDEX_WEIGHTS.sleep +
  RECOVERY_INDEX_WEIGHTS.sleepDebt +
  RECOVERY_INDEX_WEIGHTS.hrv +
  RECOVERY_INDEX_WEIGHTS.rhr +
  RECOVERY_INDEX_WEIGHTS.pulseTemp
assert.ok(Math.abs(totalWeight - 1) < 1e-9, `Pesos devem somar 1, somam ${totalWeight}`)

interface FixtureOptions {
  hrv?: number | null
  rhr?: number | null
  pulseTemp?: number | null
  sleepEff?: number | null
  sleepDeep?: number | null
  sleepRem?: number | null
  sleepAwake?: number | null
  sleepTotal?: number | null
  sleepStartAt?: string | null
  sleepEndAt?: string | null
  interpolated?: boolean
  forecasted?: boolean
}

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function fixture(daysBack: number, opts: FixtureOptions = {}): DailySnapshot {
  const date = isoDate(daysBack)
  const startAt = opts.sleepStartAt ?? `${date}T23:15:00-03:00`
  const endDate = new Date(`${date}T07:05:00-03:00`)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  const endAt = opts.sleepEndAt ?? endDate.toISOString()
  return {
    date,
    interpolated: opts.interpolated,
    forecasted: opts.forecasted,
    health: {
      date,
      sleepStartAt: startAt,
      sleepEndAt: endAt,
      sleepTotalHours: opts.sleepTotal === undefined ? 7.8 : opts.sleepTotal,
      sleepAsleepHours: 7.1,
      sleepInBedHours: 8.0,
      sleepCoreHours: 4.1,
      sleepDeepHours: opts.sleepDeep === undefined ? 1.5 : opts.sleepDeep,
      sleepRemHours: opts.sleepRem === undefined ? 1.6 : opts.sleepRem,
      sleepAwakeHours: opts.sleepAwake === undefined ? 0.45 : opts.sleepAwake,
      sleepEfficiencyPct: opts.sleepEff === undefined ? 89 : opts.sleepEff,
      respiratoryDisturbances: 0,
      activeEnergyKcal: null,
      restingEnergyKcal: null,
      heartRateMin: null,
      heartRateMax: null,
      heartRateMean: null,
      restingHeartRate: opts.rhr === undefined ? 59 : opts.rhr,
      spo2: 97,
      respiratoryRate: 15,
      pulseTemperatureC: opts.pulseTemp === undefined ? 34.2 : opts.pulseTemp,
      exerciseMinutes: null,
      standingMinutes: null,
      daylightMinutes: null,
      hrvSdnn: opts.hrv === undefined ? 52 : opts.hrv,
      steps: null,
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
    mood: null,
    medications: null,
  }
}

function buildDataset(length: number, target: FixtureOptions = {}): DailySnapshot[] {
  const snapshots: DailySnapshot[] = []
  for (let day = length - 1; day >= 1; day -= 1) {
    snapshots.push(
      fixture(day, {
        hrv: 50 + ((day % 5) - 2),
        rhr: 59 + ((day % 3) - 1),
        pulseTemp: 34.1 + ((day % 4) - 1.5) * 0.07,
        sleepEff: 87 + (day % 3),
        sleepDeep: 1.35 + (day % 2) * 0.1,
        sleepRem: 1.45 + (day % 3) * 0.05,
        sleepAwake: 0.35 + (day % 3) * 0.05,
        sleepTotal: 7.6,
      }),
    )
  }
  snapshots.push(fixture(0, target))
  return snapshots
}

const baselineDataset = buildDataset(20)
const baselines = computeRecoveryIndexBaselines(baselineDataset)
assert.ok(baselines.hrv, 'HRV baseline deve existir com 14+ dias')
assert.ok(baselines.rhr, 'RHR baseline deve existir com 14+ dias')
assert.ok(baselines.pulseTemp, 'temperatura baseline deve existir com 14+ dias')

const healthySeries = computeRecoveryIndexSeries(
  buildDataset(20, {
    hrv: 60,
    rhr: 55,
    pulseTemp: 34.1,
    sleepEff: 93,
    sleepDeep: 1.7,
    sleepRem: 1.8,
    sleepAwake: 0.2,
    sleepTotal: 8.2,
  }),
)
const healthyDay = healthySeries.at(-1)!
assert.ok(healthyDay.score != null, 'dia saudável deve gerar índice')
assert.ok((healthyDay.score as number) >= 75, `índice saudável esperado >=75, veio ${healthyDay.score}`)
assert.equal(healthyDay.inputsUsed.length, 5)
assert.equal(healthyDay.exploratory, true, 'baseline <30 dias ainda deve marcar exploratório')

const poorSeries = computeRecoveryIndexSeries(
  buildDataset(20, {
    hrv: 40,
    rhr: 68,
    pulseTemp: 35.1,
    sleepEff: 68,
    sleepDeep: 0.6,
    sleepRem: 0.8,
    sleepAwake: 1.3,
    sleepTotal: 4.2,
  }),
)
const poorDay = poorSeries.at(-1)!
assert.ok(poorDay.score != null, 'dia ruim ainda deve gerar índice')
assert.ok((poorDay.score as number) < 45, `índice ruim esperado <45, veio ${poorDay.score}`)

const insufficientSeries = computeRecoveryIndexSeries([
  fixture(1, { hrv: null, rhr: null, pulseTemp: null, sleepEff: null, sleepDeep: null, sleepRem: null, sleepAwake: null, sleepTotal: null }),
  fixture(0, { hrv: null, rhr: null, pulseTemp: null, sleepEff: 90, sleepDeep: null, sleepRem: null, sleepAwake: null, sleepTotal: 8 }),
])
const insufficientDay = insufficientSeries.at(-1)!
assert.equal(insufficientDay.score, null)
assert.equal(insufficientDay.reason, 'baseline_missing')

const pulseTempProxySeries = computeRecoveryIndexSeries(
  buildDataset(20, {
    hrv: 55,
    rhr: 57,
    pulseTemp: null,
    sleepEff: 91,
    sleepDeep: 1.5,
    sleepRem: 1.6,
    sleepAwake: 0.35,
    sleepTotal: 7.9,
  }),
)
const pulseTempProxyDay = pulseTempProxySeries.at(-1)!
assert.ok(pulseTempProxyDay.score != null, 'proxy térmica curta deve manter índice calculável')
assert.ok(pulseTempProxyDay.inputsUsed.includes('pulseTemp'), 'temperatura deve entrar no ranking via proxy curta')
assert.ok(pulseTempProxyDay.confidence < pulseTempProxyDay.completeness + 1e-9, 'proxy térmica deve reduzir um pouco a confiança')

console.log('recovery-index.test.ts — all assertions passed')
