type TooltipItemLike = {
  payload?: unknown
} | undefined

export function getInterpolatedFlag(item: TooltipItemLike): boolean {
  return (item?.payload as { interpolated?: boolean } | undefined)?.interpolated === true
}

export function getInterpolationSuffix(item: TooltipItemLike): string {
  return getInterpolatedFlag(item) ? ' ⚠ estimado' : ''
}
