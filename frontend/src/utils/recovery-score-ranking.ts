/**
 * Ranking do Recovery Score (Sprint D — Card "Limitante principal").
 *
 * Dado um conjunto de componentes do Recovery Score (cada um 0-100 já
 * ponderado pra escala comum), retorna a lista ordenada por quanto
 * cada componente "puxou o score pra baixo".
 *
 * Métrica: weightedShortfall = (100 − componentValue) × weight.
 *   • Representa o quanto cada componente custou ao score final em pontos.
 *   • Componente perfeito (=100) contribui 0 ao shortfall.
 *   • Componente zerado contribui (weight × 100) — o máximo possível.
 *
 * Função pura. Sem side effects, sem dependência de baselines (componentes
 * já vêm normalizados de `recovery-score.ts`).
 */

import { RECOVERY_WEIGHTS, type RecoveryComponents } from './recovery-score'

export type RecoveryComponentKey = keyof RecoveryComponents

export interface LimitingFactor {
  component: RecoveryComponentKey
  weight: number
  componentValue: number
  weightedShortfall: number
}

const COMPONENT_KEYS: ReadonlyArray<RecoveryComponentKey> = [
  'hrv',
  'sleepEff',
  'rhr',
  'sleepDebt',
  'mood',
]

export function rankLimitingFactors(components: RecoveryComponents): LimitingFactor[] {
  return COMPONENT_KEYS.map((key) => ({
    component: key,
    weight: RECOVERY_WEIGHTS[key],
    componentValue: components[key],
    weightedShortfall: (100 - components[key]) * RECOVERY_WEIGHTS[key],
  })).sort((a, b) => b.weightedShortfall - a.weightedShortfall)
}
