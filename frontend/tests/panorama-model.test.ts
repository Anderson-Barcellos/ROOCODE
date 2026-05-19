import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import {
  buildPanoramaModel,
  classifyDecisionStatus,
  selectPkModulation,
  summarizePkBridge,
} from '../src/utils/panorama-model'
import type { CoverageStatus } from '../src/utils/pk-coverage'

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-18T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function buildSnapshots(days = 45): DailySnapshot[] {
  const out: DailySnapshot[] = []
  for (let day = days - 1; day >= 0; day -= 1) {
    const date = isoDate(day)
    const endDate = new Date(`${date}T07:00:00-03:00`)
    endDate.setUTCDate(endDate.getUTCDate() + 1)
    const sleepStartAt = `${date}T23:10:00-03:00`
    const sleepEndAt = endDate.toISOString()
    const hrv = 49 + ((day % 7) - 3) * 1.7
    const rhr = 59 + ((day % 5) - 2) * 0.8
    const mood = -0.1 + ((day % 9) - 4) * 0.07
    out.push({
      date,
      health: {
        date,
        sleepStartAt,
        sleepEndAt,
        sleepTotalHours: 7.3 + ((day % 4) - 1.5) * 0.2,
        sleepAsleepHours: 6.8,
        sleepInBedHours: 7.9,
        sleepCoreHours: 4.2,
        sleepDeepHours: 1.3 + (day % 3) * 0.08,
        sleepRemHours: 1.4 + (day % 2) * 0.12,
        sleepAwakeHours: 0.42 + (day % 3) * 0.04,
        sleepEfficiencyPct: 88 + (day % 4),
        respiratoryDisturbances: 0,
        activeEnergyKcal: 430 + (day % 5) * 24,
        restingEnergyKcal: 1750,
        heartRateMin: 52,
        heartRateMax: 130,
        heartRateMean: 73 + (day % 3),
        restingHeartRate: rhr,
        spo2: 97,
        respiratoryRate: 15,
        pulseTemperatureC: 34.1 + ((day % 6) - 2.5) * 0.05,
        exerciseMinutes: 35 + (day % 4) * 8,
        standingMinutes: 12,
        daylightMinutes: 68 + (day % 6) * 9,
        hrvSdnn: hrv,
        steps: 7600 + (day % 7) * 480,
        distanceKm: 6.0 + (day % 5) * 0.4,
        physicalEffort: 2.8 + (day % 4) * 0.15,
        walkingHeartRateAvg: 101 + (day % 3),
        walkingAsymmetryPct: 1.9 + (day % 4) * 0.2,
        walkingDoubleSupportPct: 24 + (day % 4) * 0.4,
        walkingSpeedKmh: 5.4 + (day % 5) * 0.15,
        walkingStepLengthCm: 69 + (day % 5) * 0.8,
        runningSpeedKmh: null,
        runningGroundContactTimeMs: null,
        vo2Max: day % 6 === 0 ? 41 + (day % 3) * 0.5 : null,
        sixMinuteWalkMeters: day % 14 === 0 ? 610 + (day % 3) * 8 : null,
        cardioRecoveryBpm: 19 + (day % 4),
        recordCount: 1,
        placeholderRestingEnergyRows: 0,
      },
      mood: {
        date,
        valence: Math.max(-1, Math.min(1, mood)),
        valenceClass: mood > 0.2 ? 'positivo' : mood < -0.2 ? 'negativo' : 'neutro',
        entryCount: 1,
        labels: ['teste'],
        associations: ['rotina'],
      },
      medications: null,
    })
  }
  return out
}

function status(overrides: Partial<CoverageStatus>): CoverageStatus {
  return {
    presetKey: 'escitalopram',
    displayName: 'Escitalopram',
    brandName: 'Lexapro',
    klass: 'adequada',
    concentrationNow: 30,
    concentration24hAgo: 28,
    therapeuticMin: 15,
    therapeuticMax: 80,
    unit: 'ng/mL',
    trendPctPerDay: 2,
    expectedDosesLast48h: 2,
    loggedDosesLast48h: 2,
    missedDoses: 0,
    hoursUntilBelowMin: null,
    ...overrides,
  }
}

const snapshots = buildSnapshots(45)
const model = buildPanoramaModel({
  snapshots,
  doses: [],
  regimen: [],
})

assert.equal(model.triad.length, 3)
assert.equal(model.weeklyComparison.length, 3)
assert.equal(model.history.length, snapshots.length)
assert.ok(model.decision.score != null, 'score composto deveria existir com 45 dias de mock')
assert.ok(model.decision.actions.length >= 1, 'estado do dia deve gerar ao menos uma ação')

const chronobiologyMissing = snapshots.map((snapshot) => ({
  ...snapshot,
  health: snapshot.health
    ? {
        ...snapshot.health,
        sleepStartAt: null,
        sleepEndAt: null,
        daylightMinutes: null,
        pulseTemperatureC: null,
        heartRateMean: null,
      }
    : null,
}))

const modelWithoutChrono = buildPanoramaModel({
  snapshots: chronobiologyMissing,
  doses: [],
  regimen: [],
})

const chronoCard = modelWithoutChrono.triad.find((card) => card.key === 'chronobiology')
assert.ok(chronoCard)
assert.equal(chronoCard?.score, null, 'cronobiologia deve ficar ausente sem daylight')
assert.ok(
  modelWithoutChrono.decision.score != null,
  'score composto deve renormalizar e continuar disponível sem um pilar',
)

const pkHigh = selectPkModulation([status({ klass: 'acima_faixa' })])
assert.equal(pkHigh.level, 'high')
assert.equal(pkHigh.cap, 58)

const pkModerate = selectPkModulation([status({ klass: 'queda' })])
assert.equal(pkModerate.level, 'moderate')
assert.equal(pkModerate.cap, 72)

const pkMissingDose = selectPkModulation([
  status({
    klass: 'adequada',
    expectedDosesLast48h: 2,
    loggedDosesLast48h: 0,
    missedDoses: 2,
  }),
])
assert.equal(pkMissingDose.level, 'missing_dose')
assert.equal(pkMissingDose.cap, 68)

const pkNone = selectPkModulation([
  status({
    expectedDosesLast48h: 0,
    loggedDosesLast48h: 0,
  }),
])
assert.equal(pkNone.level, 'none')
assert.equal(pkNone.active, false)

assert.equal(classifyDecisionStatus(74, 'moderate'), 'yellow', 'moderação PK deve bloquear veredito verde')
assert.equal(classifyDecisionStatus(88, 'high'), 'red', 'PK crítica deve forçar recomendação conservadora')
assert.equal(classifyDecisionStatus(76, 'none'), 'green', 'sem modulação mantém regra padrão por score')

const bridgeItems = summarizePkBridge([
  status({ klass: 'adequada', expectedDosesLast48h: 2, loggedDosesLast48h: 0 }),
])
assert.equal(bridgeItems[0].tone, 'white')
assert.equal(bridgeItems[0].statusLabel, 'Sem dose registrada')

console.log('panorama-model.test.ts — all assertions passed')
