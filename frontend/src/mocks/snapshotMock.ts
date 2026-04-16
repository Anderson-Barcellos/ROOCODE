import type { DailySnapshot } from '@/types/apple-health'
import { classifyValence } from '@/utils/aggregation'

/**
 * Gerador determinístico — seeded PRNG (mulberry32) pra manter snapshots
 * estáveis entre reloads. Sem dependência de Math.random.
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Valence sintético correlacionado com HRV (R ≈ 0.45)
 * + ciclo semanal (fim de semana mais alto) + ruído gaussiano pequeno.
 */
function synthValence(hrv: number, dayOfWeek: number, noise: number): number {
  const hrvNormalized = (hrv - 35) / 25   // HRV 35-60 → -0 a +1
  const weekendBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 0.2 : 0
  const raw = 0.45 * hrvNormalized + weekendBoost + noise * 0.25
  return Math.max(-1, Math.min(1, raw))
}

/**
 * Constrói 14 dias de DailySnapshot plausíveis. Fonte primária
 * enquanto Anders não tiver 30+ pontos reais.
 */
export function buildMockSnapshots(days = 14, startOffsetDays = 1): DailySnapshot[] {
  const rand = mulberry32(42)
  const snapshots: DailySnapshot[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1 + startOffsetDays; i >= startOffsetDays; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dateKey = date.toISOString().slice(0, 10)
    const dow = date.getDay()

    // Physiology (plausível pra homem 39a, atlético)
    const hrv = 35 + rand() * 25                     // 35-60 ms
    const rhr = 55 + rand() * 10                     // 55-65 bpm
    const spo2 = 96 + rand() * 2                     // 96-98%
    const respRate = 14 + rand() * 4                 // 14-18 rpm
    const pulseTemp = -0.5 + rand() * 1.5            // -0.5 a +1.0°C vs baseline

    // Sono (7h ± 1.5h, distribuição Apple Health típica)
    const totalSleep = 6 + rand() * 2                // 6-8h
    const deepRatio = 0.14 + rand() * 0.06           // 14-20%
    const remRatio = 0.20 + rand() * 0.06            // 20-26%
    const awakeRatio = 0.04 + rand() * 0.03          // 4-7%
    const coreRatio = 1 - deepRatio - remRatio - awakeRatio

    // Atividade
    const activeEnergy = 350 + rand() * 200          // 350-550 kcal
    const exerciseMin = 20 + rand() * 40             // 20-60 min
    const movementMin = 40 + rand() * 40             // 40-80 min
    const standingMin = 10 + rand() * 4              // 10-14 horas (standing hours)
    const daylightMin = 30 + rand() * 60             // 30-90 min

    // Mood (correlacionado com HRV + fim de semana)
    const noise = (rand() - 0.5) * 2
    const valence = synthValence(hrv, dow, noise)
    const valenceClass = classifyValence(valence)

    snapshots.push({
      date: dateKey,
      health: {
        date: dateKey,
        sleepTotalHours: +totalSleep.toFixed(2),
        sleepAsleepHours: +(totalSleep * (1 - awakeRatio)).toFixed(2),
        sleepInBedHours: +(totalSleep + 0.4).toFixed(2),
        sleepCoreHours: +(totalSleep * coreRatio).toFixed(2),
        sleepDeepHours: +(totalSleep * deepRatio).toFixed(2),
        sleepRemHours: +(totalSleep * remRatio).toFixed(2),
        sleepAwakeHours: +(totalSleep * awakeRatio).toFixed(2),
        sleepEfficiencyPct: +((1 - awakeRatio) * 100).toFixed(1),
        respiratoryDisturbances: rand() < 0.2 ? +(rand() * 3).toFixed(1) : 0,
        activeEnergyKcal: +activeEnergy.toFixed(0),
        restingEnergyKcal: 1700 + rand() * 200,
        heartRateMin: rhr - 5,
        heartRateMax: rhr + 35,
        heartRateMean: rhr + 10,
        restingHeartRate: +rhr.toFixed(1),
        spo2: +spo2.toFixed(1),
        respiratoryRate: +respRate.toFixed(1),
        pulseTemperatureC: +pulseTemp.toFixed(2),
        exerciseMinutes: +exerciseMin.toFixed(0),
        movementMinutes: +movementMin.toFixed(0),
        standingMinutes: +standingMin.toFixed(0),
        daylightMinutes: +daylightMin.toFixed(0),
        hrvSdnn: +hrv.toFixed(1),
        recordCount: 1,
        placeholderRestingEnergyRows: 0,
      },
      mood: {
        date: dateKey,
        valence: +valence.toFixed(3),
        valenceClass,
        entryCount: 1 + Math.floor(rand() * 3),
        labels: pickLabels(valence, rand),
        associations: pickAssociations(rand),
      },
      medications: null, // doseMock preenche isso na hora de alimentar medication-bridge
    })
  }

  return snapshots
}

function pickLabels(valence: number, rand: () => number): string[] {
  if (valence > 0.3) {
    return rand() > 0.5 ? ['feliz', 'calmo'] : ['focado', 'motivado']
  }
  if (valence < -0.3) {
    return rand() > 0.5 ? ['ansioso', 'cansado'] : ['irritado']
  }
  return ['neutro']
}

function pickAssociations(rand: () => number): string[] {
  const pool = ['trabalho', 'família', 'saúde', 'exercício', 'alimentação', 'leitura']
  const count = 1 + Math.floor(rand() * 2)
  const shuffled = [...pool].sort(() => rand() - 0.5)
  return shuffled.slice(0, count)
}

export const MOCK_SNAPSHOTS: DailySnapshot[] = buildMockSnapshots()
