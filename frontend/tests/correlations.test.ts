import assert from 'node:assert/strict'

import type { DailySnapshot } from '../src/types/apple-health'
import { MIN_CORRELATION_PAIRS, applyFdrToCorrelations, correlate } from '../src/utils/correlations'
import type { CorrelationResult } from '../src/utils/statistics'

function buildSnapshot(index: number, mood: number, medicationCount: number): DailySnapshot {
  const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
  return {
    date,
    health: null,
    mood: {
      date,
      valence: mood,
      valenceClass: null,
      entryCount: 1,
      labels: [],
      associations: [],
    },
    medications: {
      date,
      count: medicationCount,
      medications: [],
    },
  }
}

// lag>0 deve respeitar mínimo de pares
{
  const shortSeries = Array.from({ length: MIN_CORRELATION_PAIRS - 1 }, (_, i) =>
    buildSnapshot(i, i * 0.1, i),
  )
  assert.equal(
    correlate(shortSeries, 'medicationCount', 'valence', 1),
    null,
    'lag +1 com pares insuficientes deve retornar null',
  )
}

// série suficiente deve retornar correlação
{
  const longSeries = Array.from({ length: MIN_CORRELATION_PAIRS + 2 }, (_, i) =>
    buildSnapshot(i, i * 0.1, i),
  )
  const result = correlate(longSeries, 'medicationCount', 'valence', 1)
  assert.ok(result != null, 'lag +1 com pares suficientes deve calcular correlação')
}

// FDR precisa preencher q-values em results mutáveis
{
  const r1: CorrelationResult = { r: 0.5, pValue: 0.01, n: 30, strength: 'moderate', direction: 'positive', significant: true }
  const r2: CorrelationResult = { r: 0.4, pValue: 0.04, n: 30, strength: 'weak', direction: 'positive', significant: true }
  applyFdrToCorrelations([r1, r2])
  assert.ok(r1.qValueFdr != null && r1.qValueFdr >= 0 && r1.qValueFdr <= 1)
  assert.ok(r2.qValueFdr != null && r2.qValueFdr >= 0 && r2.qValueFdr <= 1)
}

console.log('✓ correlations.test passed')
