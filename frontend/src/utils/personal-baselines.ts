/**
 * Baselines pessoais — utility cross-sprint pra derivações estatísticas.
 *
 * Sprint M3 (2026-05-09): criada pra Wrist Temp Deviation. Reusada em
 * M4 (Recovery Score) e M5 (Autonomic Balance Index).
 *
 * Princípio: a função é pura. O chamador é responsável por filtrar
 * `interpolated`/`forecasted` antes de passar valores — coerente com a
 * regra interim conservadora da Sprint M6 (não inflar correlações por
 * autocorrelação serial introduzida pela interpolação linear).
 */

export interface PersonalBaseline {
  mean: number
  sd: number
  n: number
}

export interface RollingBaselineOptions {
  /** Mínimo de pontos válidos pra retornar baseline. Default 14. */
  minPoints?: number
  /** Tamanho da janela mais recente. Default 30. */
  windowSize?: number
}

/**
 * Computa baseline pessoal (mean + sd amostral) sobre uma janela rolante
 * dos valores válidos mais recentes. Retorna null se houver menos de
 * `minPoints` valores não-nulos disponíveis.
 *
 * SD amostral usa Bessel correction (n-1) — mais conservador pra n pequeno.
 */
export function computeRollingBaseline(
  values: ReadonlyArray<number | null>,
  options: RollingBaselineOptions = {},
): PersonalBaseline | null {
  const { minPoints = 14, windowSize = 30 } = options

  const valid = values.filter((v): v is number => v != null && Number.isFinite(v))
  const window = valid.slice(-windowSize)

  if (window.length < minPoints) return null
  if (window.length < 2) return null

  const n = window.length
  const mean = window.reduce((acc, v) => acc + v, 0) / n
  const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1)
  if (!Number.isFinite(variance) || variance < 0) return null

  return { mean, sd: Math.sqrt(variance), n }
}

/**
 * Rolling SD amostral por dia: pra cada índice i, computa SD dos valores
 * em [i - windowSize + 1, i] após filtrar nulls/NaN. Retorna null se a
 * janela tiver menos de `minPoints` valores válidos.
 *
 * Sprint M3: usado pra FR variability (windowSize=7, minPoints=4).
 */
export function rollingStandardDeviation(
  values: ReadonlyArray<number | null>,
  windowSize: number,
  minPoints: number = Math.ceil(windowSize / 2),
): Array<number | null> {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1)
    const window = values
      .slice(start, i + 1)
      .filter((v): v is number => v != null && Number.isFinite(v))

    if (window.length < minPoints || window.length < 2) return null
    const mean = window.reduce((acc, v) => acc + v, 0) / window.length
    const variance =
      window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (window.length - 1)
    if (!Number.isFinite(variance) || variance < 0) return null
    return Math.sqrt(variance)
  })
}
