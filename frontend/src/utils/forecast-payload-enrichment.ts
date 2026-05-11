/**
 * Forecast payload enrichment (Sprint M6.2.d).
 *
 * Reúne as 3 derivações compostas (RecoveryScore, ABI, WristTempDeviation)
 * por dia pra serem enviadas no payload do `/forecast`.
 *
 * Reusa funções existentes:
 *   - computeRecoveryScoreSeries (M4)
 *   - computeAbiSeries (M5)
 *   - computeRollingBaseline (M3) pra wrist temp baseline
 *
 * Wrist Temp Deviation não tem função pura compartilhada (cálculo vive inline
 * em vital-signs-timeline.tsx), então é computado localmente aqui mantendo
 * o mesmo padrão: baseline única sobre dias reais (windowSize 30 / minPoints 14),
 * delta = pulseTemperatureC - baseline.mean.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { computeRecoveryScoreSeries } from './recovery-score'
import { computeAbiSeries } from './autonomic-balance'
import { computeRollingBaseline } from './personal-baselines'

const WRIST_TEMP_BASELINE_WINDOW = 30
const WRIST_TEMP_BASELINE_MIN_POINTS = 14

export interface SnapshotDerivations {
  recoveryScore: number | null
  abi: number | null
  wristTempDeviation: number | null
  derivedFromInterpolated: boolean
}

function computeWristTempDeviationByDate(
  snapshots: DailySnapshot[],
): Map<string, number | null> {
  // Baseline única do dataset, calculada só sobre dias reais (mesmo padrão M3).
  const realTemps = snapshots
    .filter((s) => !s.interpolated && !s.forecasted)
    .map((s) => s.health?.pulseTemperatureC)
    .filter((v): v is number => typeof v === 'number')

  const baseline = computeRollingBaseline(realTemps, {
    windowSize: WRIST_TEMP_BASELINE_WINDOW,
    minPoints: WRIST_TEMP_BASELINE_MIN_POINTS,
  })

  const result = new Map<string, number | null>()
  if (!baseline) {
    for (const s of snapshots) result.set(s.date, null)
    return result
  }

  for (const s of snapshots) {
    const temp = s.health?.pulseTemperatureC
    if (typeof temp !== 'number') {
      result.set(s.date, null)
      continue
    }
    result.set(s.date, temp - baseline.mean)
  }
  return result
}

/**
 * Recebe snapshots crus, devolve Map por data com as 3 derivações compostas.
 *
 * Usar:
 *   const deriv = enrichSnapshotsWithDerivations(snapshots)
 *   const day = deriv.get('2026-04-15')  // { recoveryScore, abi, wristTempDeviation, derivedFromInterpolated }
 */
export function enrichSnapshotsWithDerivations(
  snapshots: DailySnapshot[],
): Map<string, SnapshotDerivations> {
  const recoveryByDate = new Map(
    computeRecoveryScoreSeries(snapshots).map((p) => [p.date, p]),
  )
  const abiByDate = new Map(
    computeAbiSeries(snapshots).map((p) => [p.date, p]),
  )
  const wristByDate = computeWristTempDeviationByDate(snapshots)

  const result = new Map<string, SnapshotDerivations>()
  for (const s of snapshots) {
    const recovery = recoveryByDate.get(s.date)
    const abi = abiByDate.get(s.date)
    const wrist = wristByDate.get(s.date) ?? null
    const derivedFromInterpolated =
      recovery?.derivedFromInterpolated ??
      abi?.derivedFromInterpolated ??
      Boolean(s.interpolated || s.forecasted)
    result.set(s.date, {
      recoveryScore: recovery?.score ?? null,
      abi: abi?.abi ?? null,
      wristTempDeviation: wrist,
      derivedFromInterpolated,
    })
  }
  return result
}
