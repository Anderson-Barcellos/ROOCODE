/**
 * Pharmacokinetics engine — adaptado do mood-pharma-tracker.
 * Modelos de 1 e 2 compartimentos, efeito biofásico, autoinduçao da lamotrigina.
 */

import { USER_PROFILE } from './user-profile'

export interface PKMedication {
  id: string
  name: string
  brandName?: string
  category: string
  halfLife: number
  volumeOfDistribution: number
  bioavailability: number
  absorptionRate: number
  therapeuticRange?: { min: number; max: number; unit: string }
}

export interface PKDose {
  medicationId: string
  timestamp: number
  doseAmount: number
}

const KA_BY_CLASS: Record<string, number> = {
  SSRI: 0.7,
  Stimulant: 2.0,
  Benzodiazepine: 1.5,
  'Mood Stabilizer': 0.6,
  Adaptogen: 1.2,
  Mineral: 0.4,
  'Fatty Acid': 0.3,
  Vitamin: 0.2,
  Nootropic: 1.0,
  Other: 1.0,
}

const KE0_BY_CLASS: Record<string, number> = {
  Stimulant: 2.0,
  Benzodiazepine: 0.8,
  SSRI: 0.15,
  'Mood Stabilizer': 0.2,
  Adaptogen: 0.8,
  Mineral: 0.3,
  'Fatty Acid': 0.1,
  Vitamin: 0.05,
  Nootropic: 1.0,
  Other: 0.5,
}

const EFFECT_LAG_BY_CLASS: Record<string, number> = {
  Stimulant: 0.25,
  Benzodiazepine: 0.25,
  SSRI: 0.5,
  'Mood Stabilizer': 1.0,
  Nootropic: 0.5,
  Other: 0.25,
}

const AUTOINDUCTION_DRUGS = ['lamotrigine', 'lamictal', 'lamotrigina', 'lamictal']
const AUTOINDUCTION_DAYS = 21
const AUTOINDUCTION_HL_REDUCTION = 0.2
export const DEFAULT_PK_BODY_WEIGHT_KG: number = USER_PROFILE.weightKg
export const PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML = 0.01

function getKa(med: PKMedication): number {
  if (Number.isFinite(med.absorptionRate) && med.absorptionRate > 0) return med.absorptionRate
  const Ke = Math.LN2 / med.halfLife
  return KA_BY_CLASS[med.category] ?? Math.max(Ke * 3, 0.5)
}

function getKe0(med: PKMedication): number {
  return KE0_BY_CLASS[med.category] ?? 0.5
}

function getAdjustedHalfLife(med: PKMedication, doses: PKDose[]): number {
  const name = med.name.toLowerCase()
  const isAutoInducer = AUTOINDUCTION_DRUGS.some((d) => name.includes(d))
  if (!isAutoInducer) return med.halfLife

  const medDoses = doses.filter((d) => d.medicationId === med.id)
  if (!medDoses.length) return med.halfLife

  const firstDose = Math.min(...medDoses.map((d) => d.timestamp))
  const daysSince = (Date.now() - firstDose) / (1000 * 60 * 60 * 24)
  if (daysSince < 7) return med.halfLife

  const progress = Math.min(1, daysSince / AUTOINDUCTION_DAYS)
  return med.halfLife * (1 - AUTOINDUCTION_HL_REDUCTION * progress)
}

function concentrationForSingleDoseWithHalfLife(
  med: PKMedication,
  doseAmount: number,
  ageHours: number,
  bodyWeight: number,
  halfLife: number,
): number {
  if (ageHours < 0) return 0
  if (!Number.isFinite(doseAmount) || doseAmount <= 0) return 0
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 0
  if (!Number.isFinite(med.volumeOfDistribution) || med.volumeOfDistribution <= 0) return 0
  if (!Number.isFinite(med.bioavailability) || med.bioavailability <= 0) return 0

  const Ke = Math.LN2 / halfLife
  let Ka = getKa(med)
  if (Math.abs(Ka - Ke) < 1e-6) Ka = Ke + 1e-3

  const Vd = med.volumeOfDistribution * bodyWeight
  const F = med.bioavailability

  // Modelo Bateman 1-compartimento com absorção e eliminação de primeira ordem.
  // Espelha Farma/math.py:113 (backend). Antes existia um ramo 2-compartimentos
  // heurístico (Vd > 10) com parâmetros ad-hoc — removido na auditoria 2026-05-15
  // porque divergia até ~40% do backend para Lexapro/Venvanse sem base farmacológica.
  const denom = Vd * (Ka - Ke)
  if (!Number.isFinite(denom) || denom === 0) return 0
  const concentration =
    ((F * doseAmount * Ka) / denom) *
    (Math.exp(-Ke * ageHours) - Math.exp(-Ka * ageHours))

  return Math.max(0, concentration) * 1000
}

export function singleDoseConcentrationAtHours(
  med: PKMedication,
  doseAmount: number,
  ageHours: number,
  bodyWeight = DEFAULT_PK_BODY_WEIGHT_KG,
): number {
  return concentrationForSingleDoseWithHalfLife(
    med,
    doseAmount,
    ageHours,
    bodyWeight,
    med.halfLife,
  )
}

export function calculateConcentration(
  med: PKMedication,
  doses: PKDose[],
  targetTime: number,
  bodyWeight = 70,
): number {
  const halfLife = getAdjustedHalfLife(med, doses)

  if (!Number.isFinite(halfLife) || halfLife <= 0) return 0

  let total = 0

  for (const dose of doses) {
    if (dose.medicationId !== med.id) continue
    if (dose.timestamp > targetTime) continue

    const t = (targetTime - dose.timestamp) / (1000 * 3600)
    if (t < 0) continue

    total += concentrationForSingleDoseWithHalfLife(
      med,
      dose.doseAmount,
      t,
      bodyWeight,
      halfLife,
    )
  }

  return total
}

export function calculateEffectConcentration(
  med: PKMedication,
  doses: PKDose[],
  targetTime: number,
  bodyWeight = 70,
): number {
  const halfLife = getAdjustedHalfLife(med, doses)
  if (!Number.isFinite(halfLife) || halfLife <= 0) return 0
  if (!Number.isFinite(med.volumeOfDistribution) || med.volumeOfDistribution <= 0) return 0
  if (!Number.isFinite(med.bioavailability) || med.bioavailability <= 0) return 0

  const ke0 = getKe0(med)
  const Ke = Math.LN2 / halfLife
  let Ka = getKa(med)
  if (Math.abs(Ka - Ke) < 1e-6) Ka = Ke + 1e-3

  const Vd = med.volumeOfDistribution * bodyWeight
  const F = med.bioavailability
  let totalEffect = 0

  for (const dose of doses) {
    if (dose.medicationId !== med.id) continue
    if (dose.timestamp > targetTime) continue

    const t = (targetTime - dose.timestamp) / (1000 * 3600)
    if (t <= 0) continue

    const D = dose.doseAmount
    const denom = Vd * (Ka - Ke)
    if (!Number.isFinite(denom) || denom === 0) continue

    const ke0MinusKe = ke0 - Ke
    const ke0MinusKa = ke0 - Ka
    const KaMinusKe = Ka - Ke

    if (Math.abs(ke0MinusKe) < 1e-6 || Math.abs(ke0MinusKa) < 1e-6) {
      const Cp = ((F * D * Ka) / denom) * (Math.exp(-Ke * t) - Math.exp(-Ka * t))
      const eq = 1 - Math.exp(-ke0 * t)
      totalEffect += Math.max(0, Cp * eq)
    } else {
      const coeff = (F * D * Ka * ke0) / (Vd * KaMinusKe)
      const t1 = Math.exp(-Ke * t) / ke0MinusKe
      const t2 = Math.exp(-Ka * t) / ke0MinusKa
      const t3 = Math.exp(-ke0 * t) * (KaMinusKe / (ke0MinusKe * ke0MinusKa))
      totalEffect += Math.max(0, coeff * (t1 - t2 - t3))
    }
  }

  return totalEffect * 1000
}

export function generateConcentrationCurve(
  med: PKMedication,
  doses: PKDose[],
  startTime: number,
  endTime: number,
  points = 120,
  bodyWeight = 70,
): Array<{ time: number; plasma: number; effect: number }> {
  const result = []
  const interval = (endTime - startTime) / points

  for (let i = 0; i <= points; i++) {
    const time = startTime + i * interval
    result.push({
      time,
      plasma: calculateConcentration(med, doses, time, bodyWeight),
      effect: calculateEffectConcentration(med, doses, time, bodyWeight),
    })
  }

  return result
}

const CHRONIC_CATEGORIES = new Set([
  'SSRI',
  'Mood Stabilizer',
  'Vitamin',
  'Mineral',
  'Fatty Acid',
  'Adaptogen',
])

const HOUR_MS = 60 * 60 * 1000

const MOOD_CORRELATION_WINDOW_HOURS_BY_KEY: Record<string, number> = {
  escitalopram: 48,
  lexapro: 48,
  lamotrigine: 48,
  lamictal: 48,
  clonazepam: 72,
  rivotril: 72,
}

export function isChronicMedication(med: PKMedication): boolean {
  return CHRONIC_CATEGORIES.has(med.category)
}

function normalizeMedicationWindowCandidates(med: PKMedication): string[] {
  return [med.id, med.name, med.brandName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
}

function getMedicationSpecificMoodWindowHours(med: PKMedication): number | null {
  for (const key of normalizeMedicationWindowCandidates(med)) {
    const specific = MOOD_CORRELATION_WINDOW_HOURS_BY_KEY[key]
    if (specific != null) return specific
  }
  return null
}

export function getTrendWindowMs(med: PKMedication): number {
  const specificHours = getMedicationSpecificMoodWindowHours(med)
  if (specificHours != null) return specificHours * HOUR_MS

  const hours = isChronicMedication(med) ? 48 : Math.max(6, 3.5 * med.halfLife)
  return Math.round(hours * HOUR_MS)
}

/**
 * Janela de correlação PK×humor pré-registrada por substância/classe.
 *
 * Decisão clínica atual:
 * - escitalopram / lamotrigina: 48h
 * - clonazepam: 72h
 * - fallback: 48h para crônicas; 3.5×t½ para não crônicas
 *
 * A regra NÃO procura “janela ótima” nos dados observados — isso evitaria
 * circularidade/p-hacking implícito. A robustez continua sendo testada por
 * lag sweep [-3d..+3d] nos componentes analíticos, não por tuning oportunista
 * da própria janela.
 */
export function getMoodCorrelationWindowMs(med: PKMedication): number {
  return getTrendWindowMs(med)
}

export function getMoodCorrelationWindowHours(med: PKMedication): number {
  return Math.round(getMoodCorrelationWindowMs(med) / HOUR_MS)
}

export function formatMoodCorrelationWindowLabel(med: PKMedication): string {
  return `EMA-${getMoodCorrelationWindowHours(med)}h`
}

export function computeTrendFromSamples(
  timestamps: number[],
  values: Array<number | null>,
  windowMs: number,
  minPoints = 3,
): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null)
  let ema: number | null = null
  let validCount = 0
  let lastTimestamp: number | null = null
  const effectiveWindowMs = Math.max(windowMs, 1)

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i]
    const v = values[i]

    if (typeof v === 'number' && Number.isFinite(v)) {
      if (ema == null) {
        ema = v
      } else {
        const dt = lastTimestamp == null ? effectiveWindowMs : Math.max(1, t - lastTimestamp)
        const alpha = 1 - Math.exp(-dt / effectiveWindowMs)
        ema = alpha * v + (1 - alpha) * ema
      }
      validCount += 1
      lastTimestamp = t
    }

    if (validCount >= minPoints && ema != null) {
      result[i] = ema
    }
  }

  return result
}

// ─── Presets para os medicamentos do Anders ───────────────────────────────────
//
// FONTE DE VERDADE: Farma/medDataBase.json (backend).
// Estes presets DEVEM espelhar os campos farmacocinéticos do backend.
// O teste tests/pk-presets-sync.test.ts valida sincronia automaticamente —
// se backend e frontend divergirem, a CI quebra.
//
// Convenção de Vd: `volumeOfDistribution` aqui é SEMPRE em L/kg (multiplicado por
// bodyWeight em concentrationForSingleDoseWithHalfLife). Quando o backend usa
// vd_l (absoluto), convertemos dividindo por 91kg (peso de referência do Anders).
// Limitação aceita: cálculo só fica exato para weight ≈ 91kg nesses casos.
// Auditoria 2026-05-15: alinhamento Lexapro/Lamictal/Clonazepam + outros 5.

export const PK_PRESETS: Record<string, Omit<PKMedication, 'id'>> = {
  escitalopram: {
    name: 'Escitalopram',
    brandName: 'Lexapro',
    category: 'SSRI',
    halfLife: 30,
    volumeOfDistribution: 12,        // ← era 20 (drift)
    bioavailability: 0.80,
    absorptionRate: 0.707421,        // ← era 1.0 (drift)
    therapeuticRange: { min: 15, max: 80, unit: 'ng/mL' },
  },
  lisdexamfetamine: {
    name: 'Lisdexamfetamina',
    brandName: 'Venvanse',
    category: 'Stimulant',
    // Analito modelado: dextroanfetamina (formada após administração da pró-droga).
    // Vd/F aparente oral; F=1.0 evita dupla correção. Sources: DailyMed + PMC3689918.
    halfLife: 11.2,
    volumeOfDistribution: 15.58,
    bioavailability: 1.0,
    absorptionRate: 0.604541,
    therapeuticRange: { min: 10, max: 30, unit: 'ng/mL' },
  },
  lamotrigine: {
    name: 'Lamotrigina',
    brandName: 'Lamictal',
    category: 'Mood Stabilizer',
    halfLife: 32.8,                  // ← era 29 (drift)
    volumeOfDistribution: 1.08,      // ← era 1.1
    bioavailability: 0.98,
    absorptionRate: 2.114703,        // ← era 1.2 (drift; tmax 2.2h conforme bula Lamictal IR)
    therapeuticRange: { min: 2000, max: 10000, unit: 'ng/mL' },
  },
  clonazepam: {
    name: 'Clonazepam',
    brandName: 'Rivotril',
    category: 'Benzodiazepine',
    halfLife: 33,                    // ← era 35 (drift)
    volumeOfDistribution: 3.2,       // ← era 3.0 (drift)
    bioavailability: 0.90,
    absorptionRate: 2.3,             // ← era 2.0 (drift)
    therapeuticRange: { min: 5, max: 70, unit: 'ng/mL' },
  },
  bacopa: {
    name: 'Bacopa Monnieri',
    category: 'Adaptogen',
    halfLife: 4,
    volumeOfDistribution: 1.0,       // ← era 2.0 (drift; confidence=low no backend)
    bioavailability: 0.1,            // ← era 0.85 (drift grosso)
    absorptionRate: 1.692714,        // ← era 1.2
  },
  magnesium: {
    name: 'Magnésio L-Treonato',
    category: 'Mineral',
    halfLife: 8.3,                   // ← era 14 (drift; backend confidence=low)
    volumeOfDistribution: 0.86,      // ← era 0.5
    bioavailability: 0.15,           // ← era 0.30 (drift)
    absorptionRate: 1.541165,        // ← era 0.4
  },
  omega3: {
    name: 'Omega-3 (EPA/DHA)',
    category: 'Fatty Acid',
    halfLife: 40,                    // ← era 60 (drift)
    // Backend usa vd_l=82L absoluto; 82/91kg ≈ 0.9 L/kg para Anders.
    volumeOfDistribution: 0.9,       // ← era 0.5
    bioavailability: 0.9,            // ← era 0.85
    absorptionRate: 0.611162,        // ← era 0.3
  },
  vitamind3: {
    name: 'Vitamina D3',
    category: 'Vitamin',
    halfLife: 24,                    // ← era 360 (drift grosso)
    // Backend usa vd_l=28L absoluto; 28/91kg ≈ 0.31 L/kg para Anders.
    volumeOfDistribution: 0.31,      // ← era 0.1
    bioavailability: 0.7,
    absorptionRate: 0.220755,        // ← era 0.2
  },
  piracetam: {
    name: 'Piracetam',
    brandName: 'Nootropil',
    category: 'Nootropic',
    halfLife: 5,
    volumeOfDistribution: 0.7,       // ← era 0.6
    bioavailability: 1.0,
    absorptionRate: 1.875004,        // ← era 2.5 (drift)
  },
}

// Mapeamento nome de marca/genérico → chave do preset
const NAME_MAP: Record<string, string> = {
  lexapro: 'escitalopram',
  escitalopram: 'escitalopram',
  cipralex: 'escitalopram',
  venvanse: 'lisdexamfetamine',
  vyvanse: 'lisdexamfetamine',
  lisdexamfetamina: 'lisdexamfetamine',
  lisdexamfetamine: 'lisdexamfetamine',
  lamictal: 'lamotrigine',
  lamotrigina: 'lamotrigine',
  lamotrigine: 'lamotrigine',
  rivotril: 'clonazepam',
  clonazepam: 'clonazepam',
  klonopin: 'clonazepam',
  bacopa: 'bacopa',
  bacopa_monnieri: 'bacopa',
  'bacopa monnieri': 'bacopa',
  magnesium: 'magnesium',
  magnesio_treonato: 'magnesium',
  'magnésio': 'magnesium',
  'magnesio': 'magnesium',
  'magnésio l-treonato': 'magnesium',
  omega3: 'omega3',
  omega_3: 'omega3',
  'omega-3': 'omega3',
  'ômega-3': 'omega3',
  'epa/dha': 'omega3',
  vitamind3: 'vitamind3',
  vitamina_d3_10000_ui: 'vitamind3',
  'vitamina d': 'vitamind3',
  'vitamina d3': 'vitamind3',
  'vitamina d k2': 'vitamind3',
  'd3': 'vitamind3',
  piracetam: 'piracetam',
  nootropil: 'piracetam',
  'bacopa moniere': 'bacopa',
  'omega 3': 'omega3',
  'magnésio l treonato': 'magnesium',
  'magnesio l treonato': 'magnesium',
}

// Dosagem padrão em mg por unidade "count" de cada medicamento do Anders
export const DEFAULT_MG_PER_COUNT: Record<string, number> = {
  escitalopram: 40,
  lisdexamfetamine: 200,
  lamotrigine: 200,
  clonazepam: 1,
  bacopa: 300,
  magnesium: 300,
  omega3: 1000,
  vitamind3: 10000,
  piracetam: 800,
}

export function findPresetKey(name: string): string | null {
  const key = name.toLowerCase().trim()
  return NAME_MAP[key] ?? null
}

export function buildPKMedication(name: string): PKMedication | null {
  const key = findPresetKey(name)
  if (!key) return null
  const preset = PK_PRESETS[key]
  if (!preset) return null
  return { id: key, ...preset }
}

export function mgFromCount(presetKey: string, count: number): number {
  return (DEFAULT_MG_PER_COUNT[presetKey] ?? 1) * count
}

// ─── Steady-state & efeito farmacodinâmico ────────────────────────────────────

function calculateAccumulationFactor(Ke: number, tau: number): number {
  const term = Math.exp(-Ke * tau)
  if (term >= 1) return 1
  return 1 / (1 - term)
}

export function estimateDosingInterval(doses: PKDose[]): number {
  if (doses.length < 2) return 24
  const sorted = [...doses].sort((a, b) => a.timestamp - b.timestamp)
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const hrs = (sorted[i].timestamp - sorted[i - 1].timestamp) / (1000 * 3600)
    if (hrs > 4 && hrs < 72) intervals.push(hrs)
  }
  if (!intervals.length) return 24
  const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
  if (median < 16) return 12
  if (median < 30) return 24
  if (median < 60) return 48
  return 24
}

export interface SteadyStateMetrics {
  Css_avg: number
  Cmax_ss: number
  Cmin_ss: number
  fluctuation: number
  tau: number
  accumulationFactor: number
  timeToSteadyState: number
  atSteadyState: boolean
}

export function calculateSteadyStateMetrics(
  med: PKMedication,
  doses: PKDose[],
  bodyWeight = 70,
): SteadyStateMetrics | null {
  const { volumeOfDistribution, bioavailability } = med
  const halfLife = getAdjustedHalfLife(med, doses)

  if (!Number.isFinite(halfLife) || halfLife <= 0) return null
  if (!Number.isFinite(volumeOfDistribution) || volumeOfDistribution <= 0) return null
  if (!Number.isFinite(bioavailability) || bioavailability <= 0) return null

  const medDoses = doses.filter((d) => d.medicationId === med.id)
  if (medDoses.length < 2) return null

  const tau = estimateDosingInterval(medDoses)
  const avgDose = medDoses.reduce((sum, d) => sum + d.doseAmount, 0) / medDoses.length

  const Ke = Math.LN2 / halfLife
  const Vd = volumeOfDistribution * bodyWeight
  const F = bioavailability
  const CL = Ke * Vd

  const Css_avg = (F * avgDose) / (CL * tau) * 1000
  const R = calculateAccumulationFactor(Ke, tau)
  const Ka = getKa(med)
  const Tmax = Ka <= Ke ? 1 : Math.log(Ka / Ke) / (Ka - Ke)

  const singleCmax_mgL = (F * avgDose * Ka) / (Vd * (Ka - Ke)) *
    (Math.exp(-Ke * Tmax) - Math.exp(-Ka * Tmax))
  const Cmax_ss = Math.max(0, singleCmax_mgL * R * 1000)
  // Cmin SS oral: decaimento por (tau - Tmax), não por tau inteiro. Usar tau puro
  // (como bolus IV) subestima -11% (Lexapro) a -23% (Venvanse). Auditoria 2026-05-15.
  const tauEliminationOnly = Math.max(0, tau - Tmax)
  const Cmin_ss = Cmax_ss * Math.exp(-Ke * tauEliminationOnly)
  const fluctuation = Cmax_ss > 0 ? ((Cmax_ss - Cmin_ss) / Css_avg) * 100 : 0
  const timeToSteadyState = 5 * halfLife
  const firstDose = Math.min(...medDoses.map((d) => d.timestamp))
  const hoursSinceFirst = (Date.now() - firstDose) / (1000 * 3600)

  return {
    Css_avg,
    Cmax_ss,
    Cmin_ss,
    fluctuation,
    tau,
    accumulationFactor: R,
    timeToSteadyState,
    atSteadyState: hoursSinceFirst >= timeToSteadyState,
  }
}

export interface EffectMetrics {
  ke0: number
  effectLag: number
  t50Effect: number
  tMaxEffect: number
}

export function getEffectMetrics(med: PKMedication): EffectMetrics {
  const ke0 = KE0_BY_CLASS[med.category] ?? 0.5
  const effectLag = EFFECT_LAG_BY_CLASS[med.category] ?? 0.25
  const Ke = Math.LN2 / med.halfLife
  const Ka = getKa(med)
  const Tmax = Ka <= Ke ? 1 : Math.log(Ka / Ke) / (Ka - Ke)
  const t50Effect = Math.LN2 / ke0
  return { ke0, effectLag, t50Effect, tMaxEffect: Tmax + t50Effect + effectLag }
}

export interface AdherenceEffectMetrics {
  adherenceLagDays: number
  description: string
}

export function calculateAdherenceEffectLag(med: PKMedication): AdherenceEffectMetrics {
  if (!isChronicMedication(med)) {
    return {
      adherenceLagDays: Math.ceil(med.halfLife / 24),
      description: 'Medicamento de uso agudo: efeito proporcional à concentração plasmática',
    }
  }
  if (med.halfLife < 12) {
    return { adherenceLagDays: 2, description: 'Efeito sensível: variações perceptíveis em 1-2 dias após mudança na adesão' }
  }
  if (med.halfLife < 30) {
    return { adherenceLagDays: 3, description: 'Delay moderado: 2-4 dias entre variação na adesão e impacto no humor' }
  }
  if (med.halfLife < 72) {
    return { adherenceLagDays: 5, description: 'Delay longo: 4-6 dias para perceber efeito de doses perdidas' }
  }
  return { adherenceLagDays: 7, description: 'Buffer natural: meias-vidas longas têm "reserva" de 5-7 dias' }
}
