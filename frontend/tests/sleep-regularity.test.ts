import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  computeLatestSocialJetLag,
  computeSleepRegularitySeries,
  extractSleepTimingPoints,
} from '../src/utils/sleep-regularity'

function isoDate(dayOffset: number): string {
  const base = new Date('2026-05-18T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - dayOffset)
  return base.toISOString().slice(0, 10)
}

function previousDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() - 1)
  return parsed.toISOString().slice(0, 10)
}

function snapshot(dayOffset: number, start: string, end: string): DailySnapshot {
  const date = isoDate(dayOffset)
  return {
    date,
    health: {
      date,
      sleepStartAt: start,
      sleepEndAt: end,
      sleepTotalHours: 7.5,
      sleepAsleepHours: 7.0,
      sleepInBedHours: 8.0,
      sleepCoreHours: 4.0,
      sleepDeepHours: 1.4,
      sleepRemHours: 1.6,
      sleepAwakeHours: 0.5,
      sleepEfficiencyPct: 88,
      respiratoryDisturbances: 0,
      activeEnergyKcal: null,
      restingEnergyKcal: null,
      heartRateMin: null,
      heartRateMax: null,
      heartRateMean: null,
      restingHeartRate: 58,
      spo2: 97,
      respiratoryRate: 15,
      pulseTemperatureC: 34.2,
      exerciseMinutes: null,
      standingMinutes: null,
      daylightMinutes: null,
      hrvSdnn: 52,
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

const regularSnapshots = Array.from({ length: 14 }, (_, index) => {
  const dayOffset = 13 - index
  const date = isoDate(dayOffset)
  return snapshot(dayOffset, `${previousDate(date)}T23:10:00-03:00`, `${date}T07:05:00-03:00`)
})

const timingPoints = extractSleepTimingPoints(regularSnapshots)
assert.equal(timingPoints.length, 14)
assert.ok(timingPoints[0].durationHours > 7)

const regularitySeries = computeSleepRegularitySeries(regularSnapshots)
const regularityLast = regularitySeries.at(-1)!
assert.ok(regularityLast.score != null)
assert.ok((regularityLast.score as number) > 80, `SRI regular esperado >80, veio ${regularityLast.score}`)

const irregularSnapshots = regularSnapshots.map((item, index) => {
  if (index % 2 === 0) return item
  const date = item.date
  return snapshot(13 - index, `${date}T01:30:00-03:00`, `${date}T10:00:00-03:00`)
})
const irregularityLast = computeSleepRegularitySeries(irregularSnapshots).at(-1)!
assert.ok(irregularityLast.score != null)
assert.ok((irregularityLast.score as number) < (regularityLast.score as number), 'padrão irregular deve pontuar pior')

const socialJetLagSnapshots = Array.from({ length: 21 }, (_, index) => {
  const dayOffset = 20 - index
  const date = isoDate(dayOffset)
  const weekday = new Date(`${date}T12:00:00`).getDay()
  if (weekday === 0 || weekday === 6) {
    return snapshot(dayOffset, `${date}T02:00:00-03:00`, `${date}T11:00:00-03:00`)
  }
  return snapshot(dayOffset, `${previousDate(date)}T23:00:00-03:00`, `${date}T07:00:00-03:00`)
})
const socialJetLag = computeLatestSocialJetLag(socialJetLagSnapshots)
assert.ok(socialJetLag.hours != null)
assert.ok((socialJetLag.hours as number) >= 2, `jet lag social esperado >=2h, veio ${socialJetLag.hours}`)

console.log('sleep-regularity.test.ts — all assertions passed')
