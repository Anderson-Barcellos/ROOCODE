import type { RankedDriver, RankingResult } from './driver-ranking'

function fmtNum(value: number, precision: number, unit: string): string {
  const num = value.toLocaleString('pt-BR', {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
  })
  return unit ? `${num} ${unit}` : num
}

function directionWord(driver: RankedDriver): string {
  if (driver.delta == null) return 'igual ao'
  return driver.delta > 0 ? 'acima do' : driver.delta < 0 ? 'abaixo do' : 'igual ao'
}

export function buildCockpitHeadline(ranking: RankingResult): string {
  if (ranking.top3.length === 0) {
    return 'Janela com dados insuficientes pra ranking de drivers — n mínimo é 10 dias pareados com humor. Aumenta a janela ou aguarda mais logs.'
  }
  const names = ranking.top3.map((d) => d.label).join(', ')
  const robustNote =
    ranking.robustCount === 0
      ? 'nenhum atingiu o critério de robustez (|r|≥0.3)'
      : `${ranking.robustCount} ${ranking.robustCount === 1 ? 'driver robusto' : 'drivers robustos'} (|r|≥0.3)`
  return `Essa janela, ${names} aparecem como drivers principais do humor — ${robustNote}. Cobertura pareada: ${ranking.coveragePct}% (${ranking.pairedDays} dias).`
}

export function buildInvestigativePrompt(driver: RankedDriver): string {
  if (driver.state === 'dim' || driver.recentValue == null || driver.baselineValue == null) {
    return `Driver ${driver.label} ainda não tem pareamento suficiente nesta janela (n=${driver.pairCount}, mínimo 10). Aumentar a janela pode revelar relação com humor?`
  }
  const recent = fmtNum(driver.recentValue, driver.precision, driver.unit)
  const base = fmtNum(driver.baselineValue, driver.precision, driver.unit)
  const dir = directionWord(driver)
  const deltaAbs = fmtNum(Math.abs(driver.delta ?? 0), driver.precision, driver.unit)
  return `Tu teve ${driver.label} médio de ${recent} essa janela — ${deltaAbs} ${dir} baseline (${base}). Quer ver ${driver.chartHint}?`
}
