import {
  format,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from 'date-fns'

const DATE_PATTERNS = [
  'yyyy-MM-dd HH:mm:ss XXX',
  'yyyy-MM-dd HH:mm:ss xx',
  'yyyy-MM-dd HH:mm:ss',
  'yyyy-MM-dd HH:mm',
  "yyyy-MM-dd'T'HH:mm:ssXXX",
  "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
  'yyyy-MM-dd',
]

export function parseLooseDateTime(input: string | null | undefined): Date | null {
  const text = input?.trim()
  if (!text) {
    return null
  }

  const direct = parseISO(text)
  if (isValid(direct)) {
    return direct
  }

  for (const pattern of DATE_PATTERNS) {
    const parsed = parse(text, pattern, new Date())
    if (isValid(parsed)) {
      return parsed
    }
  }

  const fallback = new Date(text)
  return isValid(fallback) ? fallback : null
}

export function toIsoDateTime(input: string | null | undefined): string | null {
  const parsed = parseLooseDateTime(input)
  return parsed ? parsed.toISOString() : null
}

export function toDayKey(input: string | Date | null | undefined): string | null {
  if (!input) {
    return null
  }

  const date = typeof input === 'string' ? parseLooseDateTime(input) : input
  if (!date) {
    return null
  }

  return format(startOfDay(date), 'yyyy-MM-dd')
}

export function mean(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  )
  if (!filtered.length) {
    return null
  }

  const total = filtered.reduce((sum, value) => sum + value, 0)
  return total / filtered.length
}

export function sum(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  )
  if (!filtered.length) {
    return null
  }

  return filtered.reduce((accumulator, value) => accumulator + value, 0)
}

export function roundTo(value: number | null, precision = 2): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null
  }

  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
