import type { DailySnapshot } from '@/types/apple-health'

export interface SleepDebtPoint {
  date: string
  sleep_h: number | null
  debt_h: number | null
  debt_cumulative_7d: number | null
  debt_cumulative_30d: number | null
}

export function computeSleepDebt(
  snapshots: DailySnapshot[],
  target = 7.5,
): SleepDebtPoint[] {
  const withDebt = snapshots.map((s) => {
    const sleep_h = s.health?.sleepTotalHours ?? null
    const debt_h = sleep_h != null ? target - sleep_h : null
    return { date: s.date, sleep_h, debt_h }
  })

  return withDebt.map((point, i) => ({
    ...point,
    debt_cumulative_7d: sumDebt(withDebt.slice(Math.max(0, i - 6), i + 1)),
    debt_cumulative_30d: sumDebt(withDebt.slice(Math.max(0, i - 29), i + 1)),
  }))
}

function sumDebt(window: ReadonlyArray<{ debt_h: number | null }>): number | null {
  const valid = window.filter((p): p is { debt_h: number } => p.debt_h != null)
  if (valid.length === 0) return null
  return valid.reduce((sum, p) => sum + p.debt_h, 0)
}
