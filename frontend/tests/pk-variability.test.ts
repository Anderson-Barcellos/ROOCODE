import assert from 'node:assert/strict'

import type { ConcentrationSeriesPoint } from '../src/lib/api'
import type { PKDose, PKMedication } from '../src/utils/pharmacokinetics'
import type { DailyHealthMetrics, DailySnapshot } from '../src/types/apple-health'
import {
  analyzePkVariabilityVsMood,
  buildPkVariabilitySeries,
  buildSwingTirCrossTab,
  computeDailyRangeExposureSeries,
  computeQuartileMoodDelta,
  computeRollingCv,
  computeSwingSeries,
  computeTirSeries,
  getPkVariabilityAnalysisWindow,
  hasStrongVariabilitySignal,
  PK_VARIABILITY_LAG_DAYS,
  PK_VARIABILITY_METRICS,
  summarizePkCensorship,
  PK_VARIABILITY_WINDOW_DAYS,
} from '../src/utils/pk-variability'

// ─── Fixtures compartilhadas ──────────────────────────────────────────────────

const BASE_HEALTH: Omit<DailyHealthMetrics, 'date'> = {
  interpolated: false,
  sleepStartAt: null,
  sleepEndAt: null,
  sleepTotalHours: null,
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

function isoDate(day: number): string {
  const base = new Date('2026-04-01T00:00:00Z').getTime()
  const t = base + day * 24 * 3600 * 1000
  return new Date(t).toISOString().slice(0, 10)
}

function snapshot(day: number, valence: number | null): DailySnapshot {
  const date = isoDate(day)
  return {
    date,
    health: { ...BASE_HEALTH, date },
    mood: valence == null
      ? null
      : { date, valence, valenceClass: null, entryCount: 1, labels: [], associations: [] },
    medications: null,
  }
}

function point(day: number, cmax: number, cmin: number): ConcentrationSeriesPoint {
  return { date: isoDate(day), cmax_est: cmax, cmin_est: cmin, auc_est: (cmax + cmin) * 12 }
}

const STUB_MED: PKMedication = {
  id: 'stub',
  name: 'Stub',
  category: 'SSRI',
  halfLife: 30,
  volumeOfDistribution: 20,
  bioavailability: 0.8,
  absorptionRate: 1.0,
}

// ─── getPkVariabilityAnalysisWindow ───────────────────────────────────────────

{
  const snapshots: DailySnapshot[] = [
    snapshot(0, 0.1),
    { ...snapshot(5, 0.2), interpolated: true },
    { ...snapshot(10, 0.3), forecasted: true },
    snapshot(20, 0.4),
  ]
  const now = new Date('2026-05-01T12:00:00Z')
  const window = getPkVariabilityAnalysisWindow(snapshots, now)
  assert.equal(window.fromIso, '2026-04-01')
  assert.equal(window.toIso, '2026-04-21')
  assert.equal(window.spanDays, 21)
  assert.equal(window.usesFallback, false)
  assert.ok(window.doseHours > 24 * 30, 'dose lookback inclui histórico + warm-up')
}

// ─── computeRollingCv ─────────────────────────────────────────────────────────

// 1. Série constante → CV ≈ 0
{
  const flat = Array.from({ length: 30 }, () => 50)
  const cv = computeRollingCv(flat, 14)
  // Primeiros (windowDays/2 - 1) entries são null por janela insuficiente
  assert.equal(cv[0], null, 'janela=1 < min=7 → null')
  // A partir de window/2 deve calcular e ser ≈ 0
  assert.ok(cv[15] != null, 'janela cheia deve dar valor')
  assert.ok(Math.abs(cv[15] as number) < 1e-6, `CV de série constante deve ser ≈ 0, foi ${cv[15]}`)
}

// 2. Série com 2 valores alternados → CV positivo
{
  const swing = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 80 : 20))
  const cv = computeRollingCv(swing, 14)
  const v = cv[20] as number
  // 50% std, 50% mean → CV ≈ 60% (50/50)
  assert.ok(v > 30 && v < 100, `CV de alternância 80/20 esperado ~60%, foi ${v}`)
}

// 3. Série com nulls → ignora nulls
{
  const mixed: Array<number | null> = Array.from({ length: 30 }, (_, i) =>
    i < 7 ? null : 50 + (i % 2 === 0 ? 10 : -10),
  )
  const cv = computeRollingCv(mixed, 14)
  // Dias 0-6 são null por dados — devem retornar null
  assert.equal(cv[3], null, 'sem dado suficiente → null')
  // Janela final tem valores válidos
  assert.ok(cv[29] != null, 'janela com dados → calcula')
  assert.ok((cv[29] as number) > 10, 'oscilação 60/40 deve dar CV detectável')
}

// ─── computeSwingSeries ───────────────────────────────────────────────────────

{
  const series: ConcentrationSeriesPoint[] = [
    point(0, 100, 100), // sem swing
    point(1, 200, 100), // swing = 100/150 * 100 = 66.67
    point(2, 80, 20),   // swing = 60/50 * 100 = 120
  ]
  const swings = computeSwingSeries(series)
  assert.ok(Math.abs((swings[0] as number) - 0) < 1e-6, `cmax=cmin → swing 0, foi ${swings[0]}`)
  assert.ok(Math.abs((swings[1] as number) - 66.6667) < 0.01, `swing 100/150 esperado 66.67, foi ${swings[1]}`)
  assert.ok(Math.abs((swings[2] as number) - 120) < 0.01, `swing 60/50 esperado 120, foi ${swings[2]}`)
}

// avg <= 0 → null (defensivo)
{
  const series: ConcentrationSeriesPoint[] = [point(0, 0, 0)]
  const swings = computeSwingSeries(series)
  assert.equal(swings[0], null, 'avg=0 deve dar null')
}

// ─── computeTirSeries ─────────────────────────────────────────────────────────

// Med sem therapeutic range → todos null
{
  const medNoRange: PKMedication = { ...STUB_MED }
  const dates = [isoDate(0), isoDate(1)]
  const tir = computeTirSeries(medNoRange, [], dates, 91)
  assert.deepEqual(tir, [null, null], 'sem range → todos null')
}

// Med com range mas sem doses → concentração 0 → fora do range → TIR=0
{
  const medWithRange: PKMedication = {
    ...STUB_MED,
    therapeuticRange: { min: 10, max: 100, unit: 'ng/mL' },
  }
  const dates = [isoDate(0)]
  const tir = computeTirSeries(medWithRange, [], dates, 91)
  assert.equal(tir[0], 0, 'sem dose → conc=0 → TIR=0')
}

// Med com dose recente colocando conc no range → TIR > 0
{
  const medWithRange: PKMedication = {
    ...STUB_MED,
    halfLife: 30,
    volumeOfDistribution: 20,
    bioavailability: 0.8,
    absorptionRate: 1.0,
    therapeuticRange: { min: 1, max: 10000, unit: 'ng/mL' }, // range largo → quase tudo conta
  }
  const dose: PKDose = {
    medicationId: STUB_MED.id,
    timestamp: new Date(isoDate(0) + 'T00:00:00Z').getTime() - 6 * 3600 * 1000,
    doseAmount: 40,
  }
  const dates = [isoDate(0)]
  const tir = computeTirSeries(medWithRange, [dose], dates, 91)
  assert.ok((tir[0] as number) >= 0 && (tir[0] as number) <= 24, 'TIR deve estar em [0, 24]')
  assert.ok((tir[0] as number) > 0, 'dose recente + range largo → TIR > 0')
}

// Exposição diária classifica vale_breve / plateau_baixo
{
  const medWithRange: PKMedication = {
    ...STUB_MED,
    therapeuticRange: { min: 1000, max: 10000, unit: 'ng/mL' },
  }
  const dates = [isoDate(0), isoDate(1)]
  const exposure = computeDailyRangeExposureSeries(medWithRange, [], dates, 91)
  assert.equal(exposure.length, 2)
  assert.equal(exposure[0].lowExitClass, 'plateau_baixo', 'sem dose e piso alto → plateau baixo')
  const censorship = summarizePkCensorship(exposure)
  assert.ok(censorship.censoredForPlateau, 'n_plateau_baixo baixo deve censurar análise transgressora')
}

// ─── computeQuartileMoodDelta ─────────────────────────────────────────────────

// Pares insuficientes → null
{
  const q = computeQuartileMoodDelta([{ metric: 1, mood: 0.5 }])
  assert.equal(q.q1q4Delta, null, 'n=1 < 8 → null')
}

// Métrica alta = humor alto → delta positivo
{
  const pairs = Array.from({ length: 16 }, (_, i) => ({ metric: i, mood: i * 0.05 }))
  const q = computeQuartileMoodDelta(pairs)
  assert.ok(q.q1q4Delta != null && q.q1q4Delta > 0.3, `delta esperado >0.3, foi ${q.q1q4Delta}`)
  assert.equal(q.q1n, 4, 'quartil de 16 = 4')
  assert.equal(q.q4n, 4, 'quartil de 16 = 4')
}

// Métrica alta = humor baixo → delta negativo
{
  const pairs = Array.from({ length: 16 }, (_, i) => ({ metric: i, mood: -i * 0.05 }))
  const q = computeQuartileMoodDelta(pairs)
  assert.ok(q.q1q4Delta != null && q.q1q4Delta < -0.3, `delta esperado <-0.3, foi ${q.q1q4Delta}`)
}

// Sweet spot em U: extremos têm humor baixo, meio tem humor alto
{
  // 16 pontos: bordas humor=-0.5, meio humor=+0.5
  const pairs = Array.from({ length: 16 }, (_, i) => {
    const dist = Math.abs(i - 7.5) / 7.5
    return { metric: i, mood: 0.5 - dist }
  })
  const q = computeQuartileMoodDelta(pairs)
  // Q1 (baixo metric) e Q4 (alto metric) ambos com mood baixo → delta ≈ 0
  // Pearson seria ≈ 0 também (sweet spot perdido), mas o delta também ≈ 0 — limitação conhecida.
  assert.ok(q.q1q4Delta != null, 'quartile calculado com 16 pares')
  assert.ok(Math.abs(q.q1q4Delta) < 0.2, `sweet-spot simétrico → delta perto de zero, foi ${q.q1q4Delta}`)
}

// ─── analyzePkVariabilityVsMood ───────────────────────────────────────────────

// Cenário 1: estável — cmax constante, mood constante → r ≈ 0, delta ≈ 0
{
  const days = 35
  const series: ConcentrationSeriesPoint[] = Array.from({ length: days }, (_, i) =>
    point(i, 100, 80),
  )
  const snapshots: DailySnapshot[] = Array.from({ length: days }, (_, i) => snapshot(i, 0.3))

  const result = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'cv',
    snapshots,
    series,
    STUB_MED,
    [],
    91,
  )
  assert.equal(result.metric, 'cv')
  assert.ok(result.hasMetricData, 'CV computa em série constante (todos zeros)')
  assert.ok(result.hasMoodData, '35 dias de mood → suficiente')
  // Pearson com xs constantes → NaN → result null. Aceitável.
  const lag0 = result.rows.find((r) => r.lagDays === 0)
  assert.equal(lag0?.result, null, 'série constante → pearson NaN → result null')
  assert.equal(result.bestResult, null, 'sem correlação computável em série constante')
}

// Cenário 2: irregular ruim — CV alto = mood baixo. Aplicação prática:
// metade dias estáveis (cmax constante) + metade oscilantes (cmax alterna).
// Mood: alto nos estáveis, baixo nos oscilantes.
{
  const days = 40
  const series: ConcentrationSeriesPoint[] = Array.from({ length: days }, (_, i) => {
    // Primeira metade: cmax constante (CV vai pra 0 nessa janela)
    // Segunda metade: cmax oscila ±50% (CV alto)
    const cmax = i < 20 ? 100 : (i % 2 === 0 ? 150 : 50)
    return point(i, cmax, cmax * 0.7)
  })
  const snapshots: DailySnapshot[] = Array.from({ length: days }, (_, i) => {
    // Mood alto na metade estável, baixo na metade oscilante
    const valence = i < 20 ? 0.6 : -0.6
    return snapshot(i, valence)
  })

  const result = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'cv',
    snapshots,
    series,
    STUB_MED,
    [],
    91,
  )
  const lag0 = result.rows.find((r) => r.lagDays === 0)
  assert.ok(lag0?.result, 'cenário irregular-ruim deve produzir pearson válido')
  assert.ok(
    lag0!.result!.r < -0.3,
    `cenário irregular-ruim esperado r < -0.3, foi ${lag0!.result!.r}`,
  )
  assert.ok(
    lag0!.q1q4Delta != null && lag0!.q1q4Delta < -0.3,
    `Q4-Q1 esperado < -0.3 (Q4 CV alto = mood baixo), foi ${lag0!.q1q4Delta}`,
  )
  assert.equal(result.bestLagDays, 0, 'pico esperado em lag 0 (efeito contemporâneo)')
}

// Cenário 3: irregular bom — CV alto = mood alto (contra-intuitivo mas testa simetria)
{
  const days = 40
  const series: ConcentrationSeriesPoint[] = Array.from({ length: days }, (_, i) => {
    const cmax = i < 20 ? 100 : (i % 2 === 0 ? 150 : 50)
    return point(i, cmax, cmax * 0.7)
  })
  const snapshots: DailySnapshot[] = Array.from({ length: days }, (_, i) => {
    const valence = i < 20 ? -0.6 : 0.6
    return snapshot(i, valence)
  })

  const result = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'cv',
    snapshots,
    series,
    STUB_MED,
    [],
    91,
  )
  const lag0 = result.rows.find((r) => r.lagDays === 0)
  assert.ok(lag0?.result, 'cenário irregular-bom deve produzir pearson válido')
  assert.ok(
    lag0!.result!.r > 0.3,
    `cenário irregular-bom esperado r > 0.3, foi ${lag0!.result!.r}`,
  )
  assert.ok(
    lag0!.q1q4Delta != null && lag0!.q1q4Delta > 0.3,
    `Q4-Q1 esperado > 0.3, foi ${lag0!.q1q4Delta}`,
  )
}

// Cenário 4: snapshots forecasted/interpolated devem ser excluídos
{
  const days = 30
  const series: ConcentrationSeriesPoint[] = Array.from({ length: days }, (_, i) => point(i, 100, 80))
  const snapshots: DailySnapshot[] = Array.from({ length: days }, (_, i) => {
    const s = snapshot(i, 0.5)
    if (i >= 25) s.forecasted = true
    if (i >= 22 && i < 25) s.interpolated = true
    return s
  })
  const result = analyzePkVariabilityVsMood(
    'lexapro',
    'Lexapro',
    'cv',
    snapshots,
    series,
    STUB_MED,
    [],
    91,
  )
  assert.equal(result.realMoodDays, 22, 'apenas 22 dias reais (não-forecasted, não-interpolated)')
}

// ─── buildPkVariabilitySeries dispatch ────────────────────────────────────────

{
  const series: ConcentrationSeriesPoint[] = Array.from({ length: 30 }, (_, i) => point(i, 100, 50))
  const swings = buildPkVariabilitySeries('swing', STUB_MED, [], series, 91)
  assert.equal(swings.length, 30)
  assert.ok(Math.abs((swings[0] as number) - 66.67) < 0.5)

  const cvs = buildPkVariabilitySeries('cv', STUB_MED, [], series, 91)
  assert.equal(cvs.length, 30)
  // cmax constante (100) → CV ≈ 0 nas janelas cheias
  assert.ok(Math.abs((cvs[20] as number) - 0) < 1e-6)

  const swingInRange = buildPkVariabilitySeries(
    'swing_in_range',
    { ...STUB_MED, therapeuticRange: { min: 1, max: 10000, unit: 'ng/mL' } },
    [{ medicationId: STUB_MED.id, timestamp: new Date(isoDate(0) + 'T00:00:00Z').getTime(), doseAmount: 40 }],
    series,
    91,
  )
  assert.equal(swingInRange.length, 30)
}

// Cross-tab swing×TIR retorna células e teste da hipótese
{
  const swing = [10, 20, 30, 40, 50, 60, 70, 80, 90]
  const tir = [24, 24, 20, 18, 16, 12, 10, 8, 6]
  const mood = [0.6, 0.7, 0.5, 0.4, 0.45, 0.2, 0.1, -0.1, -0.2]
  const cross = buildSwingTirCrossTab(swing, tir, mood, 3)
  assert.equal(cross.bins, 3)
  assert.equal(cross.cells.length, 9)
  assert.ok(cross.hypothesisCheck.supportsRefinedHypothesis !== undefined)
}

// ─── hasStrongVariabilitySignal ───────────────────────────────────────────────

{
  // Sinal forte: r alto, n alto, p baixo
  const strong = {
    lagDays: 0,
    n: 25,
    quality: 'partial' as const,
    result: { r: 0.4, n: 25, pValue: 0.02, strength: 'moderate' as const, direction: 'positive' as const, significant: true },
    q1Mood: 0,
    q4Mood: 0.5,
    q1q4Delta: 0.5,
    q1n: 6,
    q4n: 6,
    windowEstimates: [],
    replication: {
      replicates: true,
      direction: 'positive' as const,
      magnitudeSpread: 0.04,
      signInversion: false,
      replicatedWindows: [30, 60, 90],
      fragileReason: 'none' as const,
    },
    censored: false,
    censorReason: null,
  }
  assert.ok(hasStrongVariabilitySignal(strong), 'r=0.4, n=25, p=0.02 → sinal forte')

  // Sinal fraco: r baixo
  const weakR = { ...strong, result: { ...strong.result, r: 0.15 } }
  assert.equal(hasStrongVariabilitySignal(weakR), false, 'r<0.3 → não é forte')

  // Sinal fraco: n baixo
  const lowN = { ...strong, n: 12 }
  assert.equal(hasStrongVariabilitySignal(lowN), false, 'n<20 → não é forte')

  // Sinal fraco: p alto
  const highP = { ...strong, result: { ...strong.result, pValue: 0.08 } }
  assert.equal(hasStrongVariabilitySignal(highP), false, 'p>=0.05 → não é forte')

  // Sem result
  assert.equal(hasStrongVariabilitySignal({ ...strong, result: null }), false)
  assert.equal(hasStrongVariabilitySignal(null), false)
  assert.equal(hasStrongVariabilitySignal(undefined), false)
}

// ─── Smoke: constantes exportadas ─────────────────────────────────────────────

assert.equal(PK_VARIABILITY_WINDOW_DAYS, 14)
assert.deepEqual([...PK_VARIABILITY_LAG_DAYS], [0, 1, 2, 3])
assert.deepEqual(PK_VARIABILITY_METRICS, ['cv', 'swing', 'tir', 'swing_in_range', 'swing_transgressor'])

console.log('✓ pk-variability.test passed')
