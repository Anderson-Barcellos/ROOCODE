import assert from 'node:assert/strict'

import type { CognitiveSessionChartRow } from '../src/types/cognition'
import {
  classifyChange,
  computeBaselineStats,
  detectDecoupling,
  reliableChangeIndex,
  spcBands,
} from '../src/utils/cognition-reliable-change'
import type { PersonalBaseline } from '../src/utils/personal-baselines'

function makeRow(
  overrides: Partial<CognitiveSessionChartRow> & { id: string },
): CognitiveSessionChartRow {
  return {
    date: '2026-06-01',
    started_at: '2026-06-01T12:30:00Z',
    rotating_type: 'A',
    mood: 50,
    energy: 50,
    anxiety: 20,
    pvt_lapses: 2,
    pvt_response_speed: 2.3,
    pvt_median_rt_ms: 310,
    span_primary: 4,
    venvanse_ng_ml: null,
    hours_since_dose: null,
    slot_label: 'Fluência',
    slot_primary: 10,
    slot_exploratory: false,
    baseline_phase: true,
    ...overrides,
  }
}

// --- spcBands: 2σ / 3σ exatos ---
{
  const stats: PersonalBaseline = { mean: 10, sd: 2, n: 14 }
  const bands = spcBands(stats)
  assert.equal(bands.warnLow, 6)
  assert.equal(bands.warnHigh, 14)
  assert.equal(bands.signalLow, 4)
  assert.equal(bands.signalHigh, 16)
}

// --- reliableChangeIndex: (x-μ)/(σ·√(2(1-rxx))) ---
{
  const stats: PersonalBaseline = { mean: 10, sd: 2, n: 14 }
  // rxx=0.5 → seDiff = 2·√(2·0.5) = 2·1 = 2 → rci = (16-10)/2 = 3
  assert.equal(reliableChangeIndex(16, stats, 0.5), 3)
  // sd=1, rxx=0.5 → seDiff=1 → rci=1.96 exatamente no limiar
  const sharp = reliableChangeIndex(11.96, { mean: 10, sd: 1, n: 14 }, 0.5)
  assert.ok(Math.abs(sharp - 1.96) < 1e-9)
  // sd=0 degenera com segurança (sem divisão por zero)
  assert.equal(reliableChangeIndex(5, { mean: 10, sd: 0, n: 14 }, 0.5), 0)
}

// --- classifyChange: polaridade resolve direction ---
{
  const stats: PersonalBaseline = { mean: 10, sd: 2, n: 14 }
  // lapses (lower-is-better) abaixo da banda 3σ → melhora
  const improved = classifyChange(4, stats, 0.5, 'lower-is-better')
  assert.ok(improved)
  assert.equal(improved!.band, 'signal')
  assert.equal(improved!.direction, 'improve')
  // lapses acima da banda → piora
  const worse = classifyChange(16, stats, 0.5, 'lower-is-better')
  assert.equal(worse!.band, 'signal')
  assert.equal(worse!.direction, 'worsen')
  // valor na média → within, sem direção
  const flat = classifyChange(10, stats, 0.5, 'higher-is-better')
  assert.equal(flat!.band, 'within')
  assert.equal(flat!.direction, 'none')
  // 2σ ≤ |x| < 3σ → warn
  const warn = classifyChange(14.5, stats, 0.5, 'higher-is-better')
  assert.equal(warn!.band, 'warn')
  assert.equal(warn!.direction, 'improve')
  // valor nulo → null
  assert.equal(classifyChange(null, stats, 0.5, 'higher-is-better'), null)
  // reliable quando |rci| ≥ 1.96
  assert.equal(classifyChange(16, stats, 0.5, 'lower-is-better')!.reliable, true)
}

// --- computeBaselineStats: usa só baseline_phase, ignora pós-baseline ---
{
  const baseline: CognitiveSessionChartRow[] = []
  for (let i = 0; i < 14; i += 1) {
    baseline.push(makeRow({ id: `b${i}`, pvt_lapses: i % 2 === 0 ? 1 : 3, baseline_phase: true }))
  }
  // ruído pós-baseline que NÃO deve entrar no cálculo
  const post = makeRow({ id: 'p0', pvt_lapses: 999, baseline_phase: false })
  const stats = computeBaselineStats([...baseline, post], 'pvt_lapses')
  assert.ok(stats)
  assert.equal(stats!.n, 14)
  assert.ok(Math.abs(stats!.mean - 2) < 1e-9) // sete 1s + sete 3s → média 2
  assert.ok(stats!.sd > 0)

  // baseline insuficiente (<14) → null
  const short = computeBaselineStats(baseline.slice(0, 13), 'pvt_lapses')
  assert.equal(short, null)
}

// --- detectDecoupling: cognição move sem humor acompanhar ---
{
  const rows: CognitiveSessionChartRow[] = []
  for (let i = 0; i < 14; i += 1) {
    rows.push(
      makeRow({
        id: `b${i}`,
        baseline_phase: true,
        pvt_lapses: i % 2 === 0 ? 1 : 3, // mean 2, sd>0
        pvt_response_speed: 2.3,
        span_primary: i % 2 === 0 ? 3 : 5, // mean 4, sd>0
        mood: i % 2 === 0 ? 48 : 52, // mean 50, sd>0
        energy: i % 2 === 0 ? 48 : 52,
        anxiety: i % 2 === 0 ? 18 : 22, // mean 20, sd>0
      }),
    )
  }
  // sessão desacoplada: cognição dispara (lapses 20), humor no baseline
  rows.push(makeRow({ id: 'decoupled', baseline_phase: false, pvt_lapses: 20, mood: 50, energy: 50, anxiety: 20, span_primary: 4, pvt_response_speed: 2.3 }))
  // sessão acoplada: ambos disparam
  rows.push(makeRow({ id: 'coupled', baseline_phase: false, pvt_lapses: 20, mood: 95, energy: 95, anxiety: 80, span_primary: 4, pvt_response_speed: 2.3 }))
  // sessão estável: nada move
  rows.push(makeRow({ id: 'stable', baseline_phase: false, pvt_lapses: 2, mood: 50, energy: 50, anxiety: 20, span_primary: 4, pvt_response_speed: 2.3 }))

  const result = detectDecoupling(rows)
  assert.equal(result.evaluatedCount, 3)
  assert.equal(result.decoupledCount, 1)
  const flags = Object.fromEntries(result.perSession.map((s) => [s.id, s.decoupled]))
  assert.equal(flags.decoupled, true)
  assert.equal(flags.coupled, false)
  assert.equal(flags.stable, false)
}

console.log('cognition-reliable-change.test.ts OK')
