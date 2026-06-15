/**
 * Defaults compartilhados pro <Tooltip> do Recharts em todos os charts.
 * `position={{ y: 8 }}` ancora o tooltip no topo da área de plotagem (o x segue
 * o cursor), então ele nunca se sobrepõe às linhas. `allowEscapeViewBox.y` deixa
 * escapar pra cima quando necessário; `zIndex` garante que fique acima do SVG.
 */
export const TOOLTIP_DEFAULTS = {
  position: { y: 8 },
  allowEscapeViewBox: { x: false, y: true },
  wrapperStyle: { zIndex: 30, pointerEvents: 'none' as const },
} as const

type TooltipItemLike = {
  payload?: unknown
} | undefined

export function getInterpolatedFlag(item: TooltipItemLike): boolean {
  return (item?.payload as { interpolated?: boolean } | undefined)?.interpolated === true
}

export function getInterpolationSuffix(item: TooltipItemLike): string {
  return getInterpolatedFlag(item) ? ' ⚠ estimado' : ''
}

export function getForecastedFlag(item: TooltipItemLike): boolean {
  return (item?.payload as { forecasted?: boolean } | undefined)?.forecasted === true
}

export function getForecastSuffix(item: TooltipItemLike): string {
  if (!getForecastedFlag(item)) return ''
  const conf = (item?.payload as { forecastConfidence?: number } | undefined)?.forecastConfidence
  const confStr = conf != null ? ` · conf ${conf.toFixed(2)}` : ''
  return ` 🔮 projetado${confStr}`
}

export function getDataSuffix(item: TooltipItemLike): string {
  if (getForecastedFlag(item)) return getForecastSuffix(item)
  if (getInterpolatedFlag(item)) return ' ⚠ estimado'
  return ''
}
