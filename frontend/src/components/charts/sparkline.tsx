interface SparklineProps {
  data: Array<number | null>
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 80, height = 28, color = 'currentColor' }: SparklineProps) {
  const valid = data.filter((v): v is number => v != null && Number.isFinite(v))
  if (valid.length < 2) return null

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1
  const pad = 2

  let d = ''
  let lastWasNull = true

  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    const x = (i / (data.length - 1)) * width

    if (v == null || !Number.isFinite(v)) {
      lastWasNull = true
      continue
    }

    const y = height - pad - ((v - min) / range) * (height - pad * 2)

    if (lastWasNull) {
      d += `M ${x.toFixed(1)} ${y.toFixed(1)} `
      lastWasNull = false
    } else {
      d += `L ${x.toFixed(1)} ${y.toFixed(1)} `
    }
  }

  if (!d) return null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
