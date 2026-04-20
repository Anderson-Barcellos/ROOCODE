import {
  format,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from 'date-fns'

interface DatePattern {
  pattern: string
  matcher: RegExp
}

const DATE_PATTERNS: DatePattern[] = [
  { pattern: 'dd/MM/yyyy HH:mm:ss XXX', matcher: /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{2}:\d{2}$/ },
  { pattern: 'dd/MM/yyyy HH:mm:ss xx', matcher: /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4}$/ },
  { pattern: 'dd/MM/yyyy HH:mm:ss', matcher: /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/ },
  { pattern: 'dd/MM/yyyy', matcher: /^\d{2}\/\d{2}\/\d{4}$/ },
  { pattern: 'dd-MM-yy', matcher: /^\d{2}-\d{2}-\d{2}$/ },
  { pattern: 'yyyy-MM-dd HH:mm:ss XXX', matcher: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{2}:\d{2}$/ },
  { pattern: 'yyyy-MM-dd HH:mm:ss xx', matcher: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4}$/ },
  { pattern: 'yyyy-MM-dd HH:mm:ss', matcher: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/ },
  { pattern: 'yyyy-MM-dd HH:mm', matcher: /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/ },
  { pattern: "yyyy-MM-dd'T'HH:mm:ssXXX", matcher: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/ },
  { pattern: "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", matcher: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/ },
  { pattern: 'yyyy-MM-dd', matcher: /^\d{4}-\d{2}-\d{2}$/ },
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

  for (const { pattern, matcher } of DATE_PATTERNS) {
    if (!matcher.test(text)) {
      continue
    }

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
