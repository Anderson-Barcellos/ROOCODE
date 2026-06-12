/**
 * Sleep Onset Delay — quão tarde o sono começou numa noite vs. o baseline
 * pessoal recente (média circular do onset numa janela rolante).
 *
 * NÃO é latência de sono (deitar→adormecer, exige "In Bed" que quase nunca
 * vem do Apple). É o desvio do HORÁRIO de adormecer. Cálculo interno usado
 * pelo gráfico Venvanse×sono; não tem card próprio.
 */
import type { DailySnapshot } from '@/types/apple-health'
import {
  circularMeanMinutes,
  extractSleepTimingPoints,
  localMinutesSinceMidnight,
  signedCircularDeltaMinutes,
} from './sleep-regularity'

const ONSET_WINDOW_DAYS = 14
const ONSET_MIN_NIGHTS = 5

export interface SleepOnsetDelayPoint {
  date: string
  sleepStartAt: string
  onsetMinutes: number | null
  baselineOnsetMinutes: number | null
  /** signed: positivo = adormeceu mais tarde que o baseline pessoal. */
  delayMinutes: number | null
}

export function computeSleepOnsetDelaySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepOnsetDelayPoint[] {
  const sorted = [...extractSleepTimingPoints(snapshots)].sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  return sorted.map((point, index) => {
    const onset = localMinutesSinceMidnight(point.sleepStartAt)
    if (onset == null) {
      return {
        date: point.date,
        sleepStartAt: point.sleepStartAt,
        onsetMinutes: null,
        baselineOnsetMinutes: null,
        delayMinutes: null,
      }
    }

    const windowOnsets = sorted
      .slice(Math.max(0, index - ONSET_WINDOW_DAYS + 1), index + 1)
      .map((p) => localMinutesSinceMidnight(p.sleepStartAt))
      .filter((value): value is number => value != null)

    if (windowOnsets.length < ONSET_MIN_NIGHTS) {
      return {
        date: point.date,
        sleepStartAt: point.sleepStartAt,
        onsetMinutes: onset,
        baselineOnsetMinutes: null,
        delayMinutes: null,
      }
    }

    const baseline = circularMeanMinutes(windowOnsets)
    return {
      date: point.date,
      sleepStartAt: point.sleepStartAt,
      onsetMinutes: onset,
      baselineOnsetMinutes: baseline,
      delayMinutes: signedCircularDeltaMinutes(baseline, onset),
    }
  })
}
