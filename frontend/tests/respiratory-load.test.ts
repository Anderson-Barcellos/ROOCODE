import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  computeRespiratoryLoadSeries,
  computeRespiratoryLoadSummary,
} from '../src/utils/respiratory-load'

function isoDate(daysBack: number): string {
  const base = new Date('2026-06-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function health(date: string, over: Partial<DailyHealthMetrics> = {}): DailyHealthMetrics {
  return {
    date,
    sleepStartAt: null, sleepEndAt: null,
    sleepTotalHours: 7.5, sleepAsleepHours: 7.0, sleepInBedHours: 8.0,
    sleepCoreHours: 4.0, sleepDeepHours: 1.4, sleepRemHours: 1.5, sleepAwakeHours: 0.4,
    sleepEfficiencyPct: 88,
    respiratoryDisturbances: 0.4, spo2: 97, respiratoryRate: 15,
    activeEnergyKcal: null, restingEnergyKcal: null,
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: null,
    pulseTemperatureC: null, exerciseMinutes: null, standingMinutes: null, daylightMinutes: null,
    hrvSdnn: null, steps: null, distanceKm: null, physicalEffort: null,
    walkingHeartRateAvg: null, walkingAsymmetryPct: null, walkingSpeedKmh: null,
    walkingStepLengthCm: null, runningSpeedKmh: null, vo2Max: null,
    sixMinuteWalkMeters: null, cardioRecoveryBpm: null,
    recordCount: 1, placeholderRestingEnergyRows: 0,
    ...over,
  }
}

function snap(daysBack: number, over: Partial<DailyHealthMetrics> = {}, flags: { interpolated?: boolean; forecasted?: boolean } = {}): DailySnapshot {
  const date = isoDate(daysBack)
  return {
    date,
    interpolated: flags.interpolated,
    forecasted: flags.forecasted,
    health: health(date, over),
    mood: null,
    medications: null,
  }
}

// Baseline real: 16 noites tranquilas (distúrbios ~0.4, spo2 ~97), depois a noite-alvo.
function baseline(target: Partial<DailyHealthMetrics>, flags: { interpolated?: boolean; forecasted?: boolean } = {}): DailySnapshot[] {
  const out: DailySnapshot[] = []
  for (let d = 16; d >= 1; d -= 1) {
    out.push(snap(d, { respiratoryDisturbances: 0.3 + (d % 3) * 0.1, spo2: 96.5 + (d % 3) * 0.3 }))
  }
  out.push(snap(0, target, flags))
  return out
}

// 1) Banda AASM absoluta da última noite.
const normalNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 0.5 })).at(-1)!
assert.equal(normalNight.ahiBand, 'normal', 'distúrbios <5 = normal')
const moderateNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 18 })).at(-1)!
assert.equal(moderateNight.ahiBand, 'moderada', '15-30 = moderada')
// Boundary AASM: AHI exatamente 30 = grave (convenção clínica é severe = AHI >= 30).
const severeBoundary = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 30 })).at(-1)!
assert.equal(severeBoundary.ahiBand, 'grave', 'AHI 30 = grave (AASM >=30)')

// 2) Atípico pessoal: noite muito acima do p90 da distribuição tranquila.
const atypicalNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 3.0 })).at(-1)!
assert.ok(atypicalNight.personalP90 != null, 'p90 pessoal disponível com 16+ noites reais')
assert.equal(atypicalNight.atypical, true, 'noite >> p90 é atípica')

// 3) Dessaturação pessoal: spo2 abaixo do piso (p10).
const desatNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 3.0, spo2: 92 })).at(-1)!
assert.equal(desatNight.desaturationFlag, true, 'spo2 92 abaixo do piso pessoal')

// 4) Co-ocorrência = atípico + dessaturação na mesma noite.
assert.equal(desatNight.coOccurrenceFlag, true, 'distúrbios atípico + dessaturação = bandeira')
assert.equal(atypicalNight.coOccurrenceFlag, false, 'só atípico sem dessaturação não é bandeira')

// 5) Dia interpolado nunca dispara flag (visual_only).
const interpNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 3.0, spo2: 92 }, { interpolated: true })).at(-1)!
assert.equal(interpNight.atypical, false, 'interpolado não é atípico')
assert.equal(interpNight.desaturationFlag, false, 'interpolado não acende dessaturação')
assert.equal(interpNight.coOccurrenceFlag, false, 'interpolado não acende bandeira')
assert.ok(Math.abs(interpNight.confidence - 0.7) < 1e-9, 'interpolado tem confidence 0.7')

// 6) Noite sem distúrbios: ponto inelegível, sem crash.
const missingNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: null })).at(-1)!
assert.equal(missingNight.disturbances, null)
assert.equal(missingNight.ahiBand, null)
assert.equal(missingNight.confidence, 0)
assert.equal(missingNight.evidence.reason, 'inputs_missing')

// 7) Summary agrega janela recente real.
const summary = computeRespiratoryLoadSummary(baseline({ respiratoryDisturbances: 0.6 }))
assert.ok(summary.latest != null, 'summary tem latest')
assert.ok(summary.meanDisturbances != null && summary.meanDisturbances > 0, 'média positiva')
assert.equal(summary.currentBand, 'normal', 'média na zona normal')

console.log('respiratory-load.test.ts — all assertions passed')
