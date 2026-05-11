import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  SLEEP_QUALITY_WEIGHTS,
  computeSleepQualityScoreSeries,
  type SleepQualityClass,
} from '../src/utils/sleep-quality-score'

// ─── Pesos somam 1 (sanity) ───────────────────────────────────────────────────

const totalWeight =
  SLEEP_QUALITY_WEIGHTS.sleepEff +
  SLEEP_QUALITY_WEIGHTS.deep +
  SLEEP_QUALITY_WEIGHTS.rem +
  SLEEP_QUALITY_WEIGHTS.awake +
  SLEEP_QUALITY_WEIGHTS.respiratory +
  SLEEP_QUALITY_WEIGHTS.spo2
assert.ok(Math.abs(totalWeight - 1) < 1e-9, `Pesos devem somar 1, somam ${totalWeight}`)

// ─── Fixture helpers ──────────────────────────────────────────────────────────

interface FixtureOptions {
  sleepEff?: number | null
  deep?: number | null
  rem?: number | null
  awake?: number | null
  respDist?: number | null
  spo2?: number | null
  tempC?: number | null
  rr?: number | null
}

function isoDate(daysBack: number): string {
  const base = new Date('2026-05-11T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function pick<T>(opts: FixtureOptions, key: keyof FixtureOptions, fallback: T | null): T | null {
  return key in opts ? (opts[key] as T | null) : fallback
}

function fixture(daysBack: number, opts: FixtureOptions = {}): DailySnapshot {
  const date = isoDate(daysBack)
  const health: Partial<DailyHealthMetrics> = {
    date,
    sleepEfficiencyPct: pick<number>(opts, 'sleepEff', 88),
    sleepDeepHours: pick<number>(opts, 'deep', 1.4),
    sleepRemHours: pick<number>(opts, 'rem', 1.5),
    sleepAwakeHours: pick<number>(opts, 'awake', 0.3),
    respiratoryDisturbances: pick<number>(opts, 'respDist', 3),
    spo2: pick<number>(opts, 'spo2', 96),
    pulseTemperatureC: pick<number>(opts, 'tempC', 35.4),
    respiratoryRate: pick<number>(opts, 'rr', 14),
  }
  return {
    date,
    health: health as DailyHealthMetrics,
    mood: null,
    medications: null,
  }
}

// ─── Test 1: Noite ótima → reparadora ─────────────────────────────────────────

const goodNight = [fixture(0, { sleepEff: 95, deep: 1.5, rem: 1.6, awake: 0.1, respDist: 0, spo2: 97 })]
const r1 = computeSleepQualityScoreSeries(goodNight)
assert.ok(r1[0].score != null && r1[0].score >= 90)
assert.equal(r1[0].klass, 'reparadora')

// ─── Test 2: Awake alto → fragmentada ─────────────────────────────────────────

const fragmented = [fixture(0, { awake: 1.4, sleepEff: 70 })]
const r2 = computeSleepQualityScoreSeries(fragmented)
assert.equal(r2[0].klass, 'fragmentada')
assert.ok(r2[0].flags.fragmentada)

// ─── Test 3: SpO2 baixo → respiratoria (prioridade clínica) ───────────────────

const breathy = [fixture(0, { spo2: 89, awake: 1.3 })] // ambos awake e spo2 flags, mas resp tem prioridade
const r3 = computeSleepQualityScoreSeries(breathy)
assert.equal(r3[0].klass, 'respiratoria')
assert.ok(r3[0].flags.respiratoria)
assert.ok(r3[0].flags.fragmentada) // ambos flags acesos

// ─── Test 4: respDist alto → respiratoria ─────────────────────────────────────

const respDist = [fixture(0, { respDist: 25 })]
const r4 = computeSleepQualityScoreSeries(respDist)
assert.equal(r4[0].klass, 'respiratoria')

// ─── Test 5: Input faltante → score=null + reason ─────────────────────────────

const missing = [fixture(0, { sleepEff: null })]
const r5 = computeSleepQualityScoreSeries(missing)
assert.equal(r5[0].score, null)
assert.equal(r5[0].klass, null)
assert.equal(r5[0].reason, 'inputs_missing')

// ─── Test 6: Mediana → regular ────────────────────────────────────────────────

const medium = [fixture(0, { sleepEff: 82, deep: 1.0, rem: 1.0, awake: 0.5, respDist: 5, spo2: 95 })]
const r6 = computeSleepQualityScoreSeries(medium)
const score6 = r6[0].score
assert.ok(score6 != null && score6 >= 50 && score6 < 75)
// flags fragmentada NÃO devem disparar (sleepEff=82 > 80; awake=0.5 < 1.0)
assert.ok(!r6[0].flags.fragmentada)
assert.equal(r6[0].klass, 'regular')

// ─── Test 7: Anomalia temp via baseline (14+ dias) → autonomica ───────────────

// Cria 20 dias normais + 1 dia com temp z > +1.5
const normals = Array.from({ length: 20 }, (_, i) => fixture(20 - i, { tempC: 35.0 }))
// Adiciona dia mais recente com temperatura muito acima (~36.5 deve ser ~1.5σ+ acima de média 35.0)
const anomalous = fixture(0, { tempC: 36.5, awake: 0.3, sleepEff: 90, respDist: 0, spo2: 97 })
const series7 = [...normals, anomalous]
const r7 = computeSleepQualityScoreSeries(series7)
const last7 = r7[r7.length - 1]
// Anomalia detectada → flag autonomica acesa; klass deve ser autonomica (sem outros flags concorrentes)
assert.ok(last7.flags.autonomica, 'Flag autonômica deveria acender pra temp z > 1.5')
assert.equal(last7.klass, 'autonomica')

// ─── Test 8: Confidence reduzida em interpolated ──────────────────────────────

const interp = [{ ...fixture(0), interpolated: true }]
const r8 = computeSleepQualityScoreSeries(interp)
assert.equal(r8[0].confidence, 0.7) // INTERP_CONFIDENCE_MULTIPLIER
assert.ok(r8[0].derivedFromInterpolated)

// ─── Test 9: Lista de classes válidas ─────────────────────────────────────────

const validClasses: SleepQualityClass[] = [
  'reparadora',
  'fragmentada',
  'respiratoria',
  'autonomica',
  'regular',
]
const allPoints = [...r1, ...r2, ...r3, ...r4, ...r6, ...r7]
allPoints.forEach((p) => {
  if (p.klass != null) {
    assert.ok(validClasses.includes(p.klass), `klass inesperada: ${p.klass}`)
  }
})

console.log('sleep-quality-score.test.ts — all assertions passed')
