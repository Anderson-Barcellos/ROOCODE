/**
 * Interpolação linear de DailySnapshot[] para preencher lacunas temporais.
 *
 * Uso: `interpolateLinear(snapshots)` retorna novo array com dias ausentes
 * preenchidos via média ponderada entre vizinhos reais. Gap > 3 dias fica null.
 *
 * Rodado no frontend (puro, determinístico, sync). Alternativa à estratégia
 * 'claude' que usa Gemini via POST /health/api/interpolate.
 */
import type {
  DailyHealthMetrics,
  DailyMoodMetrics,
  DailySnapshot,
} from '@/types/apple-health'

// ─── Policy por campo ─────────────────────────────────────────────────────────
// TODO(Anders): revisar se esta política fisiológica faz sentido.
//
// 'interpolate' = média ponderada entre vizinhos (linear).
// 'skip'        = fica null no dia sintético, não tenta estimar.
//
// Decisão tua: o que faz sentido interpolar linearmente pra dados diários
// de saúde pessoal? Campos de duração (sleepHours, exerciseMin) são trend-like
// e toleram interpolação. Campos de métrica instantânea (HRV, RHR, SpO₂)
// seguem padrões circadianos e também toleram. Métricas metadata (recordCount)
// nunca devem ser interpoladas.
//
// Dúvidas clínicas que tu consegue responder melhor que eu:
//   - `pulseTemperatureC` é confiável demais pra interpolar ou varia muito dia-a-dia?
//   - `valenceClass` deriva de valence numérico — interpolar ambos ou só o numérico?
//   - `respiratoryDisturbances` pode indicar apneia — silenciar lacunas é risco clínico?

type FieldPolicy = 'interpolate' | 'skip'

const HEALTH_POLICIES: Record<keyof DailyHealthMetrics, FieldPolicy> = {
  date: 'skip',
  interpolated: 'skip',
  // Sono (durações)
  sleepTotalHours: 'interpolate',
  sleepAsleepHours: 'interpolate',
  sleepInBedHours: 'interpolate',
  sleepCoreHours: 'interpolate',
  sleepDeepHours: 'interpolate',
  sleepRemHours: 'interpolate',
  sleepAwakeHours: 'interpolate',
  sleepEfficiencyPct: 'interpolate',
  respiratoryDisturbances: 'skip', // sinal clínico — não inventar
  // Energia (agregados)
  activeEnergyKcal: 'interpolate',
  restingEnergyKcal: 'interpolate',
  // Cardio (instantâneas)
  heartRateMin: 'interpolate',
  heartRateMax: 'interpolate',
  heartRateMean: 'interpolate',
  restingHeartRate: 'interpolate',
  hrvSdnn: 'interpolate',
  // Respiratório
  spo2: 'interpolate',
  respiratoryRate: 'interpolate',
  pulseTemperatureC: 'interpolate',
  // Movimento
  exerciseMinutes: 'interpolate',
  movementMinutes: 'interpolate',
  standingMinutes: 'interpolate',
  daylightMinutes: 'interpolate',
  // Metadata — NUNCA interpolar
  recordCount: 'skip',
  placeholderRestingEnergyRows: 'skip',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86_400_000)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Interpola linearmente um campo numérico entre dois snapshots vizinhos. */
function interpolateNumeric(
  prev: number | null | undefined,
  next: number | null | undefined,
  t: number,
): number | null {
  if (prev == null || next == null) return null
  return lerp(prev, next, t)
}

// ─── Core ─────────────────────────────────────────────────────────────────────

const MAX_GAP_DAYS = 3

/**
 * Preenche lacunas em snapshots via interpolação linear entre vizinhos reais.
 *
 * Regras:
 * - Precisa ≥2 dias reais (caso contrário retorna array original)
 * - Gaps de até MAX_GAP_DAYS consecutivos são preenchidos
 * - Gaps maiores ficam null (charts mostram break)
 * - `recordCount`/`placeholderRestingEnergyRows` sempre 0 em dia sintético
 * - Medicações nunca interpoladas (mantém `medications: null`)
 */
export function interpolateLinear(snapshots: DailySnapshot[]): DailySnapshot[] {
  if (snapshots.length < 2) return snapshots

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const byDate = new Map<string, DailySnapshot>()
  for (const s of sorted) byDate.set(s.date, s)

  const result: DailySnapshot[] = []
  const startDate = sorted[0].date
  const endDate = sorted[sorted.length - 1].date
  const total = diffDays(startDate, endDate)

  for (let i = 0; i <= total; i++) {
    const cursor = addDays(startDate, i)
    const existing = byDate.get(cursor)
    if (existing) {
      result.push(existing)
      continue
    }

    // Encontra vizinhos reais imediatos
    const prev = findPreviousReal(sorted, cursor)
    const next = findNextReal(sorted, cursor)
    if (!prev || !next) {
      result.push(emptyDay(cursor))
      continue
    }
    const gap = diffDays(prev.date, next.date)
    if (gap > MAX_GAP_DAYS) {
      result.push(emptyDay(cursor))
      continue
    }

    const t = diffDays(prev.date, cursor) / gap
    result.push(buildInterpolatedSnapshot(cursor, prev, next, t))
  }

  return result
}

function findPreviousReal(sorted: DailySnapshot[], date: string): DailySnapshot | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].date < date) return sorted[i]
  }
  return null
}

function findNextReal(sorted: DailySnapshot[], date: string): DailySnapshot | null {
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].date > date) return sorted[i]
  }
  return null
}

function emptyDay(date: string): DailySnapshot {
  return { date, health: null, mood: null, medications: null }
}

function buildInterpolatedSnapshot(
  date: string,
  prev: DailySnapshot,
  next: DailySnapshot,
  t: number,
): DailySnapshot {
  const health = interpolateHealth(date, prev.health, next.health, t)
  const mood = interpolateMood(date, prev.mood, next.mood, t)
  return {
    date,
    health,
    mood,
    medications: null,
    interpolated: true,
    confidence: 0.5,
  }
}

function interpolateHealth(
  date: string,
  prev: DailyHealthMetrics | null,
  next: DailyHealthMetrics | null,
  t: number,
): DailyHealthMetrics | null {
  if (!prev || !next) return null
  const out: DailyHealthMetrics = {
    date,
    interpolated: true,
    // Sono
    sleepTotalHours: null,
    sleepAsleepHours: null,
    sleepInBedHours: null,
    sleepCoreHours: null,
    sleepDeepHours: null,
    sleepRemHours: null,
    sleepAwakeHours: null,
    sleepEfficiencyPct: null,
    respiratoryDisturbances: null,
    // Energia
    activeEnergyKcal: null,
    restingEnergyKcal: null,
    // Cardio
    heartRateMin: null,
    heartRateMax: null,
    heartRateMean: null,
    restingHeartRate: null,
    hrvSdnn: null,
    spo2: null,
    respiratoryRate: null,
    pulseTemperatureC: null,
    exerciseMinutes: null,
    movementMinutes: null,
    standingMinutes: null,
    daylightMinutes: null,
    // Metadata: sempre 0 em dia sintético
    recordCount: 0,
    placeholderRestingEnergyRows: 0,
  }

  for (const [field, policy] of Object.entries(HEALTH_POLICIES) as [keyof DailyHealthMetrics, FieldPolicy][]) {
    if (policy !== 'interpolate') continue
    const pv = prev[field]
    const nv = next[field]
    const interp = interpolateNumeric(
      typeof pv === 'number' ? pv : null,
      typeof nv === 'number' ? nv : null,
      t,
    )
    // Assign only if field type is number | null (policy garante)
    ;(out as unknown as Record<string, unknown>)[field] = interp
  }

  return out
}

function interpolateMood(
  date: string,
  prev: DailyMoodMetrics | null,
  next: DailyMoodMetrics | null,
  t: number,
): DailyMoodMetrics | null {
  if (!prev || !next) return null
  const valence = interpolateNumeric(prev.valence, next.valence, t)
  if (valence == null) return null
  return {
    date,
    interpolated: true,
    valence,
    valenceClass: null, // derivação deixada fora (TODO Anders: quer classificar estimado?)
    entryCount: 0,
    labels: [],
    associations: [],
  }
}

// ─── Helpers públicos (usados pelo demo/debug) ────────────────────────────────

/**
 * Conta quantos dias foram interpolados num array. Útil pra banner + R² demo.
 */
export function countInterpolated(snapshots: DailySnapshot[]): number {
  return snapshots.filter((s) => s.interpolated === true).length
}

/**
 * Conta os dias reais (não-interpolados) num intervalo.
 */
export function countReal(snapshots: DailySnapshot[]): number {
  return snapshots.filter((s) => !s.interpolated).length
}
