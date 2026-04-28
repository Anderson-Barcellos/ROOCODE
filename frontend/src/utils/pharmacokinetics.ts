/**
 * Pharmacokinetics engine — adaptado do mood-pharma-tracker.
 * Modelos de 1 e 2 compartimentos, efeito biofásico, autoinduçao da lamotrigina.
 */

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
export const DEFAULT_PK_BODY_WEIGHT_KG = 91

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
  const useTwoCompartment = med.volumeOfDistribution > 10
  let concentration = 0

  if (useTwoCompartment) {
    const alpha = Math.min(Ka, 3 * Ke)
    const beta = Ke
    const periph = Math.min(med.volumeOfDistribution / 20, 0.7)
    const A = (F * doseAmount * Ka) / (Vd * (Ka - alpha)) * (1 - periph)
    const B = (F * doseAmount * Ka) / (Vd * (Ka - beta)) * periph
    concentration =
      A * (Math.exp(-alpha * ageHours) - Math.exp(-Ka * ageHours)) +
      B * (Math.exp(-beta * ageHours) - Math.exp(-Ka * ageHours))
  } else {
    const denom = Vd * (Ka - Ke)
    if (!Number.isFinite(denom) || denom === 0) return 0
    concentration =
      ((F * doseAmount * Ka) / denom) *
      (Math.exp(-Ke * ageHours) - Math.exp(-Ka * ageHours))
  }

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

export function isChronicMedication(med: PKMedication): boolean {
  return CHRONIC_CATEGORIES.has(med.category)
}

export function getTrendWindowMs(med: PKMedication): number {
  const hours = isChronicMedication(med) ? 48 : Math.max(6, 3.5 * med.halfLife)
  return Math.round(hours * 60 * 60 * 1000)
}

// Janela 4×t½ — observação clínica de Anders: quedas na concentração refletem
// no humor com magnitude similar ao atraso da SMA dessa janela. Janela uniforme
// pra todas as substâncias (não diferencia crônica/aguda como getTrendWindowMs).
export function getMoodCorrelationWindowMs(med: PKMedication): number {
  return Math.round(4 * med.halfLife * 60 * 60 * 1000)
}

export function computeTrendFromSamples(
  timestamps: number[],
  values: Array<number | null>,
  windowMs: number,
  minPoints = 3,
): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null)
  const window: Array<{ t: number; v: number }> = []
  let sum = 0

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i]
    const v = values[i]

    if (typeof v === 'number' && Number.isFinite(v)) {
      window.push({ t, v })
      sum += v
    }

    const cutoff = t - windowMs
    while (window.length > 0 && window[0].t < cutoff) {
      const removed = window.shift()!
      sum -= removed.v
    }

    if (window.length >= minPoints) {
      result[i] = sum / window.length
    }
  }

  return result
}

// ─── Presets para os medicamentos do Anders ───────────────────────────────────

export const PK_PRESETS: Record<string, Omit<PKMedication, 'id'>> = {
  escitalopram: {
    name: 'Escitalopram',
    brandName: 'Lexapro',
    category: 'SSRI',
    halfLife: 30,
    volumeOfDistribution: 20,
    bioavailability: 0.80,
    absorptionRate: 1.0,
    therapeuticRange: { min: 15, max: 80, unit: 'ng/mL' },
  },
  lisdexamfetamine: {
    name: 'Lisdexamfetamina',
    brandName: 'Venvanse',
    category: 'Stimulant',
    halfLife: 11,
    volumeOfDistribution: 3.5,
    bioavailability: 0.96,
    absorptionRate: 1.5,
    therapeuticRange: { min: 50, max: 150, unit: 'ng/mL' },
  },
  lamotrigine: {
    name: 'Lamotrigina',
    brandName: 'Lamictal',
    category: 'Mood Stabilizer',
    halfLife: 29,
    volumeOfDistribution: 1.1,
    bioavailability: 0.98,
    absorptionRate: 1.2,
    therapeuticRange: { min: 3000, max: 14000, unit: 'ng/mL' },
  },
  clonazepam: {
    name: 'Clonazepam',
    brandName: 'Rivotril',
    category: 'Benzodiazepine',
    halfLife: 35,
    volumeOfDistribution: 3.0,
    bioavailability: 0.90,
    absorptionRate: 2.0,
    therapeuticRange: { min: 20, max: 80, unit: 'ng/mL' },
  },
  bacopa: {
    name: 'Bacopa Monnieri',
    category: 'Adaptogen',
    halfLife: 4,
    volumeOfDistribution: 2.0,
    bioavailability: 0.85,
    absorptionRate: 1.2,
  },
  magnesium: {
    name: 'Magnésio L-Treonato',
    category: 'Mineral',
    halfLife: 14,
    volumeOfDistribution: 0.5,
    bioavailability: 0.30,
    absorptionRate: 0.4,
  },
  omega3: {
    name: 'Omega-3 (EPA/DHA)',
    category: 'Fatty Acid',
    halfLife: 60,
    volumeOfDistribution: 0.5,
    bioavailability: 0.85,
    absorptionRate: 0.3,
  },
  vitamind3: {
    name: 'Vitamina D3',
    category: 'Vitamin',
    halfLife: 360,
    volumeOfDistribution: 0.1,
    bioavailability: 0.70,
    absorptionRate: 0.2,
  },
  piracetam: {
    name: 'Piracetam',
    brandName: 'Nootropil',
    category: 'Nootropic',
    halfLife: 5,
    volumeOfDistribution: 0.6,
    bioavailability: 1.0,
    absorptionRate: 2.5,
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
  const Cmin_ss = Cmax_ss * Math.exp(-Ke * tau)
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
