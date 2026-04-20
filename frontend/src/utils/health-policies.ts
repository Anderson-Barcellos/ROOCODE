/**
 * Políticas clínicas para interpretação de sinais fisiológicos.
 *
 * Este módulo centraliza **thresholds e categorias** usados em vários charts.
 * Mudou um cutoff? Edita aqui — propaga pra VO2Chart, WalkingVitality, KPIs.
 *
 * Fase 8A — 2026-04-20.
 */

export type ClinicalTone = 'positive' | 'neutral' | 'watch' | 'negative'

// ─── VO2 Máx ──────────────────────────────────────────────────────────────────
// Biomarcador crônico de capacidade cardiorrespiratória.
// Responde a exercício aeróbico regular, sedentarismo, e tem efeito modulado
// por ISRS/antipsicóticos (via sedação, efeito anticolinérgico, ganho de peso).
//
// TODO(Anders, 5-10 linhas): Define as bands pra homem 35-44 anos (tuas bands,
// tu é o médico). Como referência, Cooper Institute publica:
//   Very Low: <30  ·  Fair: 30-37  ·  Good: 37-45  ·  Excellent: 45-53  ·  Superior: >53
// Apple Health categoriza como "Low <30 · Below Avg 30-35 · Above Avg 35-44 · High 44+"
// Escolhe uma das duas ou adapta — por ora o chart usa estes cutoffs.

export interface Vo2Band {
  label: string
  min: number
  max: number
  tone: ClinicalTone
  color: string // hex pra band fill no chart
}

export const VO2_BANDS_MALE_35_44: Vo2Band[] = [
  { label: 'Baixo', min: 0, max: 30, tone: 'negative', color: '#fecaca' },
  { label: 'Médio-Baixo', min: 30, max: 37, tone: 'watch', color: '#fed7aa' },
  { label: 'Bom', min: 37, max: 45, tone: 'neutral', color: '#bbf7d0' },
  { label: 'Excelente', min: 45, max: 53, tone: 'positive', color: '#86efac' },
  { label: 'Superior', min: 53, max: 70, tone: 'positive', color: '#4ade80' },
]

export function getVo2Category(value: number | null, bands = VO2_BANDS_MALE_35_44): Vo2Band | null {
  if (value == null) return null
  return bands.find((b) => value >= b.min && value < b.max) ?? bands[bands.length - 1]
}

// ─── Walking Asymmetry ────────────────────────────────────────────────────────
// Percentual de tempo em que a marcha mostra diferença de cadência entre lados.
// Marcador de marcha alterada — sedação (clonazepam), neuropatia, claudicação.
//
// Referência Apple Health:
//   <3% = típico · 3-5% = atenção · >5% = procurar avaliação

export function getWalkingAsymmetryTone(pct: number | null): ClinicalTone {
  if (pct == null) return 'neutral'
  if (pct < 3) return 'positive'
  if (pct < 5) return 'watch'
  return 'negative'
}

export function getWalkingAsymmetryLabel(pct: number | null): string {
  if (pct == null) return 'Sem dados'
  if (pct < 3) return 'Marcha simétrica'
  if (pct < 5) return 'Leve assimetria'
  return 'Assimetria significativa'
}

// ─── Walking Speed ────────────────────────────────────────────────────────────
// Velocidade de marcha = biomarcador de vitalidade, fragilidade, depressão.
// Referência (homem 35-45a, não-idoso):
//   >5.5 km/h = saudável · 4.5-5.5 = típico · <4.5 = slowing (investigar)

export function getWalkingSpeedTone(kmh: number | null): ClinicalTone {
  if (kmh == null) return 'neutral'
  if (kmh >= 5.5) return 'positive'
  if (kmh >= 4.5) return 'neutral'
  if (kmh >= 3.5) return 'watch'
  return 'negative'
}

// ─── Steps ────────────────────────────────────────────────────────────────────
// Proxy de atividade psicomotora. Slowing depressivo e ativação por lisdex
// aparecem aqui. Referência Tudor-Locke:
//   <5000 = sedentário · 5000-7499 = pouco ativo · 7500-9999 = moderado · >=10000 = ativo

export function getStepsTone(steps: number | null): ClinicalTone {
  if (steps == null) return 'neutral'
  if (steps >= 10000) return 'positive'
  if (steps >= 7500) return 'neutral'
  if (steps >= 5000) return 'watch'
  return 'negative'
}

export function getStepsLabel(steps: number | null): string {
  if (steps == null) return 'Sem dados'
  if (steps >= 10000) return 'Ativo'
  if (steps >= 7500) return 'Moderadamente ativo'
  if (steps >= 5000) return 'Pouco ativo'
  return 'Sedentário'
}
