import type { DailySnapshot } from '../types/apple-health'

const TEMP_LIGHT_INTERP_MAX_GAP_DAYS = 3
const TEMP_LIGHT_INTERP_MAX_DAILY_DELTA_C = 0.25
const TEMP_TRAILING_TREND_MAX_GAP_DAYS = 2
const TEMP_TRAILING_TREND_MAX_DAILY_DELTA_C = 0.15

export interface PulseTemperatureProxySeries {
  values: Array<number | null>
  interpolatedCount: number
  trendedCount: number
}

function dayDiff(leftIso: string, rightIso: string): number {
  const left = new Date(`${leftIso}T00:00:00Z`).getTime()
  const right = new Date(`${rightIso}T00:00:00Z`).getTime()
  return Math.round((right - left) / 86_400_000)
}

function rawPulseTemperature(snapshot: DailySnapshot): number | null {
  if (snapshot.interpolated || snapshot.forecasted) return null
  return snapshot.health?.pulseTemperatureC ?? null
}

export function buildPulseTemperatureProxySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): PulseTemperatureProxySeries {
  const raw = snapshots.map(rawPulseTemperature)
  const values = [...raw]
  let interpolatedCount = 0
  let trendedCount = 0

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] != null) continue

    let prevIndex = index - 1
    while (prevIndex >= 0 && raw[prevIndex] == null) prevIndex -= 1

    let nextIndex = index + 1
    while (nextIndex < raw.length && raw[nextIndex] == null) nextIndex += 1

    const prev = prevIndex >= 0 ? raw[prevIndex] : null
    const next = nextIndex < raw.length ? raw[nextIndex] : null
    if (prev == null || next == null) continue

    const gapDays = dayDiff(snapshots[prevIndex].date, snapshots[nextIndex].date)
    if (gapDays <= 1 || gapDays > TEMP_LIGHT_INTERP_MAX_GAP_DAYS + 1) continue
    if (Math.abs(next - prev) / gapDays > TEMP_LIGHT_INTERP_MAX_DAILY_DELTA_C) continue

    const offsetDays = dayDiff(snapshots[prevIndex].date, snapshots[index].date)
    values[index] = prev + ((next - prev) * offsetDays) / gapDays
    interpolatedCount += 1
  }

  let lastValidIndex = -1
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] != null) {
      lastValidIndex = index
      break
    }
  }

  if (lastValidIndex >= 0 && lastValidIndex < values.length - 1) {
    const trailingGapDays = dayDiff(snapshots[lastValidIndex].date, snapshots[values.length - 1].date)
    if (trailingGapDays <= TEMP_TRAILING_TREND_MAX_GAP_DAYS) {
      const history: Array<{ index: number; value: number }> = []
      for (let index = lastValidIndex; index >= 0 && history.length < 3; index -= 1) {
        const value = values[index]
        if (value != null) history.push({ index, value })
      }
      if (history.length >= 2) {
        const newest = history[0]
        const oldest = history[history.length - 1]
        const spanDays = Math.max(1, dayDiff(snapshots[oldest.index].date, snapshots[newest.index].date))
        const rawSlope = (newest.value - oldest.value) / spanDays
        const slope = Math.max(-TEMP_TRAILING_TREND_MAX_DAILY_DELTA_C, Math.min(TEMP_TRAILING_TREND_MAX_DAILY_DELTA_C, rawSlope))

        for (let index = lastValidIndex + 1; index < values.length; index += 1) {
          const daysAhead = dayDiff(snapshots[lastValidIndex].date, snapshots[index].date)
          values[index] = newest.value + slope * daysAhead
          trendedCount += 1
        }
      }
    }
  }

  return { values, interpolatedCount, trendedCount }
}
