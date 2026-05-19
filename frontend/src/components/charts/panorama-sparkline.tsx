interface PanoramaSparklineProps {
  values: number[]
  strokeClassName?: string
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function PanoramaSparkline({ values, strokeClassName = 'stroke-slate-700' }: PanoramaSparklineProps) {
  if (!values.length) {
    return <div className="h-7 rounded-md border border-dashed border-slate-200 bg-slate-50/70" />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const step = values.length > 1 ? 100 / (values.length - 1) : 100

  const points = values
    .map((value, index) => {
      const x = index * step
      const y = 100 - ((value - min) / range) * 100
      return `${x.toFixed(2)},${clamp(y, 0, 100).toFixed(2)}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-7 w-full overflow-visible">
      <polyline
        points={points}
        fill="none"
        className={`${strokeClassName} stroke-[8]`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
