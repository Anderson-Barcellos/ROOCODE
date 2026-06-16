import type {
  CognitiveFlankerTrial,
  CognitiveSessionChartRow,
  FlankerResponse,
  SpanKind,
} from '@/types/cognition'

export function buildDigitSequence(length: number, rng: () => number = Math.random): number[] {
  const result: number[] = []
  while (result.length < length) {
    const next = 1 + Math.floor(rng() * 9)
    if (result[result.length - 1] === next) continue
    result.push(next)
  }
  return result
}

export function buildCorsiSequence(length: number, rng: () => number = Math.random): number[] {
  const result: number[] = []
  const pool = Array.from({ length: 9 }, (_, index) => index)
  while (result.length < length) {
    const next = pool[Math.floor(rng() * pool.length)]
    if (result.includes(next)) continue
    result.push(next)
  }
  return result
}

export function buildBalancedFlankerTrials(count: number, rng: () => number = Math.random): CognitiveFlankerTrial[] {
  const half = Math.max(2, Math.floor(count / 2))
  const raw: Array<{ congruent: boolean; expected_response: FlankerResponse }> = []
  for (let index = 0; index < count; index += 1) {
    const congruent = index < half
    const expected_response: FlankerResponse = index % 2 === 0 ? 'left' : 'right'
    raw.push({ congruent, expected_response })
  }
  for (let index = raw.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[raw[index], raw[swapIndex]] = [raw[swapIndex], raw[index]]
  }
  return raw.map((trial) => ({
    ...trial,
    response: null,
    reaction_time_ms: null,
    correct: false,
  }))
}

export function spanLabel(kind: SpanKind): string {
  return kind === 'digit' ? 'Digit span' : 'Corsi'
}

export function rangeToDays(range: '7d' | '30d' | '90d' | '1y' | 'all'): number | null {
  switch (range) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    case '1y':
      return 365
    case 'all':
    default:
      return null
  }
}

export function filterCognitionTimeline(rows: CognitiveSessionChartRow[], range: '7d' | '30d' | '90d' | '1y' | 'all'): CognitiveSessionChartRow[] {
  const days = rangeToDays(range)
  if (days == null) return rows
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return rows.filter((row) => new Date(`${row.date}T00:00:00`).getTime() >= cutoff.getTime())
}
