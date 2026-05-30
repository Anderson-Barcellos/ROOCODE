import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

function readSource(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), 'utf-8')
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function runAssertions(): void {
  const scatter = readSource('components/charts/pk-mood-scatter-chart.tsx')
  const lag = readSource('components/charts/lag-correlation-chart.tsx')
  const correlationHeatmap = readSource('components/charts/correlation-heatmap.tsx')
  const forecastModal = readSource('components/charts/ForecastReportModal.tsx')
  const heatmapCell = readSource('components/charts/shared/heatmap-cell.tsx')
  const app = readSource('App.tsx')
  const activityReadinessCard = readSource('components/cards/activity-readiness-card.tsx')
  const activityReadinessUtil = readSource('utils/activity-readiness.ts')
  const nightQualityCard = readSource('components/cards/night-quality-card.tsx')
  const farmacoTimeline = readSource('components/charts/pk-mood-concentration-chart.tsx')
  const recoveryScoreChart = readSource('components/charts/recovery-score-chart.tsx')
  const pkHumor = readSource('components/charts/pk-humor-correlation.tsx')
  const tempHumor = readSource('components/charts/temp-humor-correlation.tsx')
  const variabilityHeatmap = readSource('components/charts/pk-variability-heatmap.tsx')
  const variabilityLab = readSource('components/charts/pk-variability-humor-lab.tsx')

  assert(
    scatter.includes('DEFAULT_PK_BODY_WEIGHT_KG') && !scatter.includes('buildPKMoodPairs(events, med, pkDoses, 91'),
    'PKMoodScatterChart deve usar DEFAULT_PK_BODY_WEIGHT_KG em vez de peso literal 91.',
  )
  assert(
    lag.includes('DEFAULT_PK_BODY_WEIGHT_KG') && !lag.includes('computeLagCorrelation(events, med, pkDoses, LAGS, 91'),
    'LagCorrelationChart deve usar DEFAULT_PK_BODY_WEIGHT_KG em vez de peso literal 91.',
  )
  assert(
    scatter.includes('initialDimension={{ width: 1, height: 1 }}') &&
      lag.includes('initialDimension={{ width: 1, height: 1 }}') &&
      recoveryScoreChart.includes('initialDimension={{ width: 1, height: 1 }}'),
    'Graficos intraday de Insights devem proteger ResponsiveContainer contra dimensoes negativas na montagem.',
  )
  assert(
    forecastModal.includes('overflow-x-auto') && forecastModal.includes('min-w-['),
    'ForecastReportModal deve permitir scroll horizontal na tabela de forecast.',
  )
  assert(
    variabilityLab.includes('overflow-x-auto') && variabilityLab.includes('min-w-['),
    'PKVariabilityHumorLab deve proteger a matriz contra corte/compressao em viewport estreita.',
  )
  assert(
    heatmapCell.includes('onSelect') && heatmapCell.includes('aria-label') && heatmapCell.includes('<button'),
    'HeatmapCell deve suportar seleção clicável/touch-friendly com aria-label.',
  )
  for (const [name, source] of [
    ['PKHumorCorrelation', pkHumor],
    ['PKVariabilityHeatmap', variabilityHeatmap],
    ['PKVariabilityHumorLab', variabilityLab],
  ] as const) {
    assert(
      source.includes('selectedHeatmapCell') && source.includes('onSelect=') && source.includes('Detalhe selecionado'),
      `${name} deve expor detalhe persistente ao selecionar uma célula de heatmap.`,
    )
  }
  for (const [name, source] of [
    ['CorrelationHeatmap', correlationHeatmap],
    ['TempHumorCorrelation', tempHumor],
  ] as const) {
    assert(
      source.includes('selectedHeatmapCell') &&
        source.includes('onClick') &&
        source.includes('aria-label') &&
        source.includes('Detalhe selecionado'),
      `${name} deve permitir selecao persistente de celulas sem depender de hover/title.`,
    )
  }
  assert(
    app.includes('<NightQualityCard snapshots={ranged} windowLabel={range} />'),
    'A aba Sono deve enviar apenas snapshots da janela selecionada ao NightQualityCard.',
  )
  assert(
    app.includes('<ActivityReadinessCard snapshots={ranged} baselineSnapshots={data.snapshots} windowLabel={range} />'),
    'ActivityReadinessCard deve separar janela visual (ranged) de baseline historico (data.snapshots).',
  )
  assert(
    activityReadinessCard.includes('baselineSnapshots') &&
      activityReadinessCard.includes('windowLabel') &&
      activityReadinessCard.includes('Baseline: ultimos 30 dias'),
    'ActivityReadinessCard deve exibir a janela e usar baseline historico separado.',
  )
  assert(
    activityReadinessUtil.includes('baselineSnapshots: DailySnapshot[] = snapshots') &&
      activityReadinessUtil.includes('buildBaseline(baselineSnapshots, latest.date)'),
    'computeActivityReadiness deve aceitar baselineSnapshots separado da janela visual.',
  )
  assert(
    nightQualityCard.includes('windowLabel') && nightQualityCard.includes('janela ${windowLabel}'),
    'NightQualityCard deve deixar explicita a janela quando receber snapshots filtrados.',
  )
  assert(
    farmacoTimeline.includes('computeCoverageStatus') && farmacoTimeline.includes('escala real'),
    'Card unificado da Farmaco deve fundir o status de cobertura e usar escala real de concentração por droga.',
  )
  assert(
    farmacoTimeline.includes('MOOD_KEY') && farmacoTimeline.includes('Humor'),
    'Card unificado deve oferecer o modo Humor além das drogas no mesmo seletor.',
  )
  assert(
    app.includes('<PKMoodConcentrationChart') &&
      !app.includes('PKMedicationGrid') &&
      !app.includes('MoodTimeline') &&
      !app.includes('PKCoverageCard'),
    'Farmaco deve usar somente o card unificado (sem grade, sem MoodTimeline e sem card de cobertura standalone).',
  )
  assert(
    lag.includes('menos negativa') &&
      lag.includes('futureImprovements') &&
      lag.includes('Melhoras de valência detectadas'),
    'LagCorrelationChart deve explicitar melhoras de valencia, inclusive quando continuam negativas.',
  )
  assert(
    correlationHeatmap.includes('Leitura clínica rápida') &&
      correlationHeatmap.includes('strongestPositive') &&
      correlationHeatmap.includes('strongestNegative'),
    'CorrelationHeatmap deve ter secao descritiva para orientar Humor vs fisiologia.',
  )
}

runAssertions()
console.log('frontend-audit-contracts.test.ts — viewport, PK profile, heatmap, driver, window and insights contracts ok')
