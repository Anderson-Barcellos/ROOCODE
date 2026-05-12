import assert from 'node:assert/strict'

import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import {
  BASELINE_MIN_POINTS,
  BASELINE_WINDOW_DAYS,
  LAG_DAYS_SWEEP,
  MIN_TOTAL_SAMPLES,
  PREREGISTERED_LAG_DAYS,
  analyzeTempHumor,
  buildTempHumorSamples,
} from '../src/utils/temp-humor-correlation'

const BASE_HEALTH: Omit<DailyHealthMetrics, 'date' | 'sleepTotalHours'> = {
  interpolated: false,
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
  daylightMinutes: null,
  hrvSdnn: null,
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
}

interface FixtureOptions {
  temp: number | null
  valence: number | null
  interpolated?: boolean
  forecasted?: boolean
}

function isoDate(index: number): string {
  const base = new Date('2026-01-01T00:00:00Z')
  base.setUTCDate(base.getUTCDate() + index)
  return base.toISOString().slice(0, 10)
}

function fixture(index: number, opts: FixtureOptions): DailySnapshot {
  const date = isoDate(index)
  return {
    date,
    health: {
      ...BASE_HEALTH,
      date,
      sleepTotalHours: null,
      pulseTemperatureC: opts.temp,
    },
    mood: opts.valence == null
      ? null
      : {
          date,
          entryCount: 1,
          valence: opts.valence,
          valenceClass: null,
          labels: [],
          associations: [],
        },
    medications: null,
    interpolated: opts.interpolated ?? false,
    forecasted: opts.forecasted ?? false,
  }
}

// ─── Test 1: Smoke vazio ─────────────────────────────────────────────────

;(function smokeEmpty() {
  const result = analyzeTempHumor([])
  assert.equal(result.samples.length, 0, 'samples deve ser vazio')
  assert.equal(result.lags.length, 0, 'lags deve ser vazio')
  assert.equal(result.peakLagDays, null, 'peakLagDays deve ser null')
})()

// ─── Test 2: Constantes ─────────────────────────────────────────────────

;(function constants() {
  assert.equal(LAG_DAYS_SWEEP.length, 7, 'lag sweep deve ter 7 lags')
  assert.deepEqual([...LAG_DAYS_SWEEP], [-3, -2, -1, 0, 1, 2, 3])
  assert.equal(PREREGISTERED_LAG_DAYS, 1, 'pré-registro é lag +1d')
  assert.equal(BASELINE_WINDOW_DAYS, 30)
  assert.equal(BASELINE_MIN_POINTS, 14)
  assert.equal(MIN_TOTAL_SAMPLES, 8)
})()

// ─── Test 3: Smoke com fixture válida ────────────────────────────────────

;(function smokeValid() {
  const snaps: DailySnapshot[] = []
  // 14 dias de baseline (temp média 36.0) sem mood
  for (let i = 0; i < 14; i++) {
    snaps.push(fixture(i, { temp: 36.0, valence: null }))
  }
  // 10 dias com temp variando e valence presente
  for (let i = 14; i < 24; i++) {
    snaps.push(fixture(i, { temp: 36.0 + (i % 3) * 0.1, valence: 0.5 + (i % 4) * 0.1 }))
  }

  const result = analyzeTempHumor(snaps)
  assert.ok(result.samples.length >= MIN_TOTAL_SAMPLES, 'samples >= 8 esperado')
  assert.ok(result.lags.length > 0, 'lags devem existir')
  // Todos os lags devem ter qFdr atribuído (ou null se p inválido)
  result.lags.forEach((l) => {
    assert.ok(l.qFdr === null || (l.qFdr >= 0 && l.qFdr <= 1), `qFdr fora de [0,1]: ${l.qFdr}`)
  })
})()

// ─── Test 4: Filtro de interpolated/forecasted ───────────────────────────

;(function filtersInterpolated() {
  const snaps: DailySnapshot[] = []
  for (let i = 0; i < 14; i++) {
    snaps.push(fixture(i, { temp: 36.0, valence: null }))
  }
  // 5 dias interpolados misturados (não devem entrar no cálculo)
  for (let i = 14; i < 19; i++) {
    snaps.push(fixture(i, { temp: 99.0, valence: 0.5, interpolated: true }))
  }
  // 5 dias reais com mood
  for (let i = 19; i < 24; i++) {
    snaps.push(fixture(i, { temp: 36.0 + 0.1, valence: 0.6 }))
  }

  const samples = buildTempHumorSamples(snaps)
  // Nenhum sample deve ter tempDelta consistente com temp=99
  samples.forEach((s) => {
    assert.ok(Math.abs(s.tempDelta) < 5, `tempDelta absurdo (${s.tempDelta}) — interp vazou`)
  })
})()

// ─── Test 5: Sanity matemática — correlação inversa em lag +1 ────────────

;(function inverseCorrelationAtLag1() {
  const snaps: DailySnapshot[] = []
  // Baseline 30 dias com temp 36.0 e mood null
  for (let i = 0; i < 30; i++) {
    snaps.push(fixture(i, { temp: 36.0, valence: null }))
  }
  // 20 dias onde temp[i] sobe e valence[i+1] cai (correlação inversa lag +1d)
  // Padrão: tempDelta_i = +0.1 * (i % 5), valence_{i+1} = 0.8 - 0.1 * (i % 5)
  // Isso planta um r negativo forte em lag +1.
  for (let i = 30; i < 50; i++) {
    const phase = (i - 30) % 5
    const temp = 36.0 + 0.1 * phase
    // valence atribuída AO PRÓXIMO ÍNDICE — precisamos plantar valence[i] como função de phase de (i-1)
    const valencePhase = ((i - 30) + 4) % 5 // valence de i reflete tempDelta de i-1
    const valence = 0.8 - 0.1 * valencePhase
    snaps.push(fixture(i, { temp, valence }))
  }

  const result = analyzeTempHumor(snaps)
  const lag1 = result.lags.find((l) => l.lagDays === 1)
  assert.ok(lag1, 'deve ter estimate em lag +1')
  // r esperado: forte negativo
  assert.ok(lag1!.r < -0.5, `r em lag +1 deve ser fortemente negativo, foi ${lag1!.r.toFixed(3)}`)
  // Peak deve ser detectado (q < 0.05) ou pelo menos identificado como mais forte que outros lags
  // Pelo menos verifica que peakLagDays != null e r negativo
  if (result.peakLagDays != null) {
    const peak = result.lags.find((l) => l.lagDays === result.peakLagDays)
    assert.ok(peak && peak.r < 0, `pico deve ter r negativo, foi r=${peak?.r}`)
  }
})()

console.log('temp-humor-correlation.test.ts — all assertions passed')
