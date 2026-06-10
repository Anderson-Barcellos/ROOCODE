/**
 * Constantes de cor centralizadas dos charts. Espelham os CSS vars de `index.css`
 * para evitar drift quando charts são editados isoladamente. Charts existentes
 * podem ser migrados gradualmente; novos charts devem importar daqui.
 */

export const CHART_TOKENS = {
  series: {
    composite: 'var(--chart-series-composite)',
    recovery: 'var(--chart-series-recovery)',
    capacity: 'var(--chart-series-capacity)',
    chronobiology: 'var(--chart-series-chronobiology)',
    mood: 'var(--chart-series-mood)',
    lexapro: 'var(--chart-series-lexapro)',
    venvanse: 'var(--chart-series-venvanse)',
    lamictal: 'var(--chart-series-lamictal)',
    forecast: 'var(--chart-series-forecast)',
  },
  fill: {
    optimal: 'var(--chart-fill-optimal)',
    attention: 'var(--chart-fill-attention)',
    critical: 'var(--chart-fill-critical)',
    chartArea: 'var(--chart-fill-area)',
  },
  reference: {
    optimalText: 'var(--chart-reference-optimal)',
    attentionText: 'var(--chart-reference-attention)',
    criticalText: 'var(--chart-reference-critical)',
    meanText: 'var(--chart-reference-mean)',
  },
  ui: {
    grid: 'var(--chart-ui-grid)',
    axis: 'var(--chart-ui-axis)',
    border: 'var(--chart-ui-border)',
    foreground: 'var(--chart-ui-foreground)',
    muted: 'var(--chart-ui-muted)',
    cardBg: 'var(--chart-ui-card-bg)',
  },
  zones: {
    optimalThreshold: 70,
    attentionThreshold: 45,
  },
} as const

/**
 * Pattern SVG diagonal para áreas de forecast. Injetar via <defs> no chart.
 * Uso: <pattern id={CHART_PATTERNS.forecastDiagonalId} ...> e fill={`url(#${id})`}.
 */
export const CHART_PATTERNS = {
  forecastDiagonalId: 'chart-pattern-forecast-diagonal',
} as const

/**
 * Renderiza o <defs><pattern> de forecast como string SVG. Componentes Recharts
 * podem injetar via <svg><defs dangerouslySetInnerHTML={{__html: ...}}/></svg>
 * ou via <Customized component={ForecastPatternDefs} />.
 */
export function forecastPatternMarkup(): string {
  return `<pattern id="${CHART_PATTERNS.forecastDiagonalId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" stroke="${CHART_TOKENS.series.forecast}" stroke-width="1.2" opacity="0.55" />
  </pattern>`
}
