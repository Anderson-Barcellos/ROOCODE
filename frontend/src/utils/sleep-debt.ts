import type { DailySnapshot } from '@/types/apple-health'

export interface SleepDebtPoint {
  date: string
  sleep_h: number | null
  debt_h: number | null
  debt_cumulative_7d: number | null
  debt_cumulative_30d: number | null
}

const MS_PER_DAY = 86_400_000

function parseDate(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime()
}

/**
 * Computa débito de sono usando janela TEMPORAL (datas reais), não posicional.
 *
 * Antes da auditoria 2026-05-15: janela usava slice(i-6, i+1) — 7 entradas no
 * array. Se houvesse gaps de dias na série (dias ausentes), a "janela de 7
 * posições" cobria período real maior que 7 dias, subestimando débito.
 * Especialmente relevante quando a interpolação não preenche todos os dias.
 *
 * Agora: somamos déficit dos pontos cuja `date` está dentro de `windowDays - 1`
 * dias antes do ponto atual (inclui o próprio).
 */
export function computeSleepDebt(
  snapshots: DailySnapshot[],
  target = 7.5,
): SleepDebtPoint[] {
  const withDebt = snapshots.map((s) => {
    const sleep_h = s.health?.sleepTotalHours ?? null
    const debt_h = sleep_h != null ? target - sleep_h : null
    return { date: s.date, sleep_h, debt_h, ts: parseDate(s.date) }
  })

  return withDebt.map((point) => {
    const sevenDaysAgo = point.ts - 6 * MS_PER_DAY
    const thirtyDaysAgo = point.ts - 29 * MS_PER_DAY

    return {
      date: point.date,
      sleep_h: point.sleep_h,
      debt_h: point.debt_h,
      debt_cumulative_7d: sumDebt(withDebt.filter((p) => p.ts >= sevenDaysAgo && p.ts <= point.ts)),
      debt_cumulative_30d: sumDebt(withDebt.filter((p) => p.ts >= thirtyDaysAgo && p.ts <= point.ts)),
    }
  })
}

function sumDebt(window: ReadonlyArray<{ debt_h: number | null }>): number | null {
  const valid = window.filter((p): p is { debt_h: number } => p.debt_h != null)
  if (valid.length === 0) return null
  return valid.reduce((sum, p) => sum + p.debt_h, 0)
}
