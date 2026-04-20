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
