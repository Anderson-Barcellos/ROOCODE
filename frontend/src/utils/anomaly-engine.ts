import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DailySnapshot } from '../types/apple-health'
import { detectAnomalies } from './statistics'

export interface NarrativeAnomaly {
  date: string
  metric: string
  value: number
  deviations: number
  severity: 'mild' | 'moderate' | 'severe'
  direction: 'high' | 'low'
  narrative: string
}

const SEVERITY_ORDER = { severe: 0, moderate: 1, mild: 2 }

function fmt(date: string): string {
  try {
    return format(parseISO(date), "d 'de' MMM", { locale: ptBR })
  } catch {
    return date
  }
}

function buildHrvNarrative(
  snapshot: DailySnapshot,
  value: number,
  deviations: number,
  direction: 'high' | 'low',
  snapshots: DailySnapshot[],
  index: number,
): string {
  const prevSleep = index > 0 ? (snapshots[index - 1].health?.sleepTotalHours ?? null) : null
  const mood = snapshot.mood?.valence ?? null
  const date = fmt(snapshot.date)

  let text = `HRV ${direction === 'low' ? 'caiu' : 'subiu'} para ${value.toFixed(0)} ms em ${date} (${deviations.toFixed(1)} DP ${direction === 'low' ? 'abaixo' : 'acima'} da média).`

  if (direction === 'low') {
    if (prevSleep != null && prevSleep < 6) {
      text += ` Na noite anterior você dormiu apenas ${prevSleep.toFixed(1)}h.`
    } else if (prevSleep != null) {
      text += ` Sono anterior: ${prevSleep.toFixed(1)}h.`
    }
    if (mood != null && mood < -0.1) {
      text += ` Humor do dia: ${mood.toFixed(2)} (valência negativa).`
    }
  }

  return text
}

function buildSleepNarrative(
  snapshot: DailySnapshot,
  value: number,
  deviations: number,
  direction: 'high' | 'low',
  snapshots: DailySnapshot[],
  index: number,
): string {
  const nextHrv = index < snapshots.length - 1 ? (snapshots[index + 1].health?.hrvSdnn ?? null) : null
  const nextMood = index < snapshots.length - 1 ? (snapshots[index + 1].mood?.valence ?? null) : null
  const date = fmt(snapshot.date)

  let text = `Sono ${direction === 'low' ? 'curto' : 'longo'} em ${date}: ${value.toFixed(1)}h (${deviations.toFixed(1)} DP ${direction === 'low' ? 'abaixo' : 'acima'}).`

  if (direction === 'low') {
    if (nextHrv != null) {
      text += ` HRV do dia seguinte: ${nextHrv.toFixed(0)} ms.`
    }
    if (nextMood != null) {
      text += ` Humor seguinte: ${nextMood.toFixed(2)}.`
    }
  }

  return text
}

function buildSpo2Narrative(snapshot: DailySnapshot, value: number): string {
  const date = fmt(snapshot.date)
  const sleep = snapshot.health?.sleepTotalHours ?? null
  let text = `SpO2 abaixo do limiar em ${date}: ${value.toFixed(1)}%.`
  if (value < 93) text += ' Valor noturno < 93% sugere apneia/UARS — considera avaliação.'
  if (sleep != null && sleep < 6) text += ` Noite com apenas ${sleep.toFixed(1)}h de sono registrado.`
  return text
}

function buildRhrNarrative(
  snapshot: DailySnapshot,
  value: number,
  deviations: number,
  direction: 'high' | 'low',
): string {
  const date = fmt(snapshot.date)
  const mood = snapshot.mood?.valence ?? null
  const exercise = snapshot.health?.exerciseMinutes ?? null

  let text = `FC repouso ${direction === 'high' ? 'elevada' : 'baixa'} em ${date}: ${value.toFixed(0)} bpm (${deviations.toFixed(1)} DP ${direction === 'high' ? 'acima' : 'abaixo'}).`

  if (direction === 'high') {
    if (mood != null && mood < -0.1) text += ` Humor negativo no dia (${mood.toFixed(2)}).`
    if (exercise != null && exercise < 10) text += ' Baixa atividade no dia.'
  }

  return text
}

function buildValenceNarrative(
  snapshot: DailySnapshot,
  value: number,
  deviations: number,
  snapshots: DailySnapshot[],
  index: number,
): string {
  const date = fmt(snapshot.date)
  const prevHrv = index > 0 ? (snapshots[index - 1].health?.hrvSdnn ?? null) : null
  const prevSleep = index > 0 ? (snapshots[index - 1].health?.sleepTotalHours ?? null) : null

  let text = `Valência muito negativa em ${date}: ${value.toFixed(2)} (${deviations.toFixed(1)} DP abaixo).`

  if (prevHrv != null) text += ` HRV anterior: ${prevHrv.toFixed(0)} ms.`
  if (prevSleep != null && prevSleep < 6) text += ` Dormiste ${prevSleep.toFixed(1)}h na noite anterior.`

  return text
}

export function buildAnomalyNarratives(snapshots: DailySnapshot[]): NarrativeAnomaly[] {
  if (snapshots.length < 35) return []

  const dates = snapshots.map((s) => s.date)
  const results: NarrativeAnomaly[] = []

  // HRV
  const hrvValues = snapshots.map((s) => s.health?.hrvSdnn ?? null)
  const hrvAnomalies = detectAnomalies(hrvValues, dates)
  for (const a of hrvAnomalies) {
    const idx = snapshots.findIndex((s) => s.date === a.date)
    if (idx < 0) continue
    const direction: 'high' | 'low' = a.value < a.expectedMean ? 'low' : 'high'
    results.push({
      date: a.date,
      metric: 'HRV',
      value: a.value,
      deviations: a.deviations,
      severity: a.severity,
      direction,
      narrative: buildHrvNarrative(snapshots[idx], a.value, a.deviations, direction, snapshots, idx),
    })
  }

  // Sono total
  const sleepValues = snapshots.map((s) => s.health?.sleepTotalHours ?? null)
  const sleepAnomalies = detectAnomalies(sleepValues, dates)
  for (const a of sleepAnomalies) {
    const idx = snapshots.findIndex((s) => s.date === a.date)
    if (idx < 0) continue
    const direction: 'high' | 'low' = a.value < a.expectedMean ? 'low' : 'high'
    if (direction === 'high') continue // sono longo raramente é preocupante
    results.push({
      date: a.date,
      metric: 'Sono',
      value: a.value,
      deviations: a.deviations,
      severity: a.severity,
      direction,
      narrative: buildSleepNarrative(snapshots[idx], a.value, a.deviations, direction, snapshots, idx),
    })
  }

  // SpO2 — qualquer valor < 94 é alerta, independente de DP
  for (let i = 0; i < snapshots.length; i++) {
    const spo2 = snapshots[i].health?.spo2 ?? null
    if (spo2 == null || spo2 >= 94) continue
    const severity = spo2 < 92 ? 'severe' : spo2 < 93 ? 'moderate' : 'mild'
    results.push({
      date: snapshots[i].date,
      metric: 'SpO2',
      value: spo2,
      deviations: (94 - spo2) / 1.5,
      severity,
      direction: 'low',
      narrative: buildSpo2Narrative(snapshots[i], spo2),
    })
  }

  // FC Repouso elevada
  const rhrValues = snapshots.map((s) => s.health?.restingHeartRate ?? null)
  const rhrAnomalies = detectAnomalies(rhrValues, dates)
  for (const a of rhrAnomalies) {
    const idx = snapshots.findIndex((s) => s.date === a.date)
    if (idx < 0) continue
    const direction: 'high' | 'low' = a.value > a.expectedMean ? 'high' : 'low'
    if (direction !== 'high') continue
    results.push({
      date: a.date,
      metric: 'FC Repouso',
      value: a.value,
      deviations: a.deviations,
      severity: a.severity,
      direction,
      narrative: buildRhrNarrative(snapshots[idx], a.value, a.deviations, direction),
    })
  }

  // Valência negativa
  const valenceValues = snapshots.map((s) => s.mood?.valence ?? null)
  const valenceAnomalies = detectAnomalies(valenceValues, dates)
  for (const a of valenceAnomalies) {
    const idx = snapshots.findIndex((s) => s.date === a.date)
    if (idx < 0) continue
    if (a.value >= a.expectedMean) continue // só anomalias negativas
    results.push({
      date: a.date,
      metric: 'Humor',
      value: a.value,
      deviations: a.deviations,
      severity: a.severity,
      direction: 'low',
      narrative: buildValenceNarrative(snapshots[idx], a.value, a.deviations, snapshots, idx),
    })
  }

  // Deduplicar por data+métrica, ordenar por severidade e data recente
  const seen = new Set<string>()
  const deduped = results.filter((r) => {
    const key = `${r.date}-${r.metric}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return deduped.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return b.date.localeCompare(a.date)
  })
}
