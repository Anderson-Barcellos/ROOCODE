/**
 * Constantes de cor centralizadas dos charts. Espelham os CSS vars de `index.css`
 * para evitar drift quando charts são editados isoladamente. Charts existentes
 * podem ser migrados gradualmente; novos charts devem importar daqui.
 */

export const CHART_TOKENS = {
  series: {
    composite: '#0f766e',      // --accent (teal-700)
    recovery: '#0f766e',
    capacity: '#0284c7',       // sky-600
    chronobiology: '#d97706',  // --warm (amber-600)
    mood: '#059669',           // emerald-600
    lexapro: '#7c3aed',        // --accent-violet
    venvanse: '#0284c7',       // sky-600
    lamictal: '#b45309',       // --rose
    forecast: '#94a3b8',       // slate-400
  },
  fill: {
    optimal: 'rgba(16,185,129,0.08)',   // emerald
    attention: 'rgba(245,158,11,0.08)', // amber
    critical: 'rgba(239,68,68,0.08)',   // rose
    chartArea: 'rgba(15,118,110,0.15)', // teal área principal (≥ 0.08 antigo)
  },
  reference: {
    optimalText: '#0f766e',    // teal-700 (label de zona ótima)
    attentionText: '#b45309',  // amber-700 (label de atenção)
    criticalText: '#b91c1c',   // red-700
    meanText: '#64748b',       // slate-500 (label de média 30d)
  },
  ui: {
    grid: 'rgba(100,116,139,0.08)',     // slate/8% horizontal grid
    axis: '#64748b',                    // slate-500
    border: 'rgba(17,35,30,0.12)',      // --border
    foreground: '#11231e',              // --foreground
    muted: '#48635a',                   // --muted
    cardBg: 'rgba(255,252,246,0.96)',   // --card-strong (tooltip bg)
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
