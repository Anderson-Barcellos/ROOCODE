import assert from 'node:assert/strict'

import type { MoodRecord } from '../src/lib/api'
import { detectMoodDataQuality } from '../src/utils/roocode-adapter'

assert.equal(detectMoodDataQuality(undefined), 'empty')
assert.equal(detectMoodDataQuality([]), 'empty')

const validNumericRows: MoodRecord[] = [
  {
    Iniciar: '2026-05-04T07:30:00',
    Fim: 'Emoção Momentânea',
    Associações: 64,
    Valência: 'Agradável',
  },
]
assert.equal(detectMoodDataQuality(validNumericRows), 'valid')

const validStringRows: MoodRecord[] = [
  {
    Iniciar: '2026-05-04T08:00:00',
    Fim: 'Humor Diário',
    Associações: '0,25',
    Valência: 'Levemente Agradável',
  },
]
assert.equal(detectMoodDataQuality(validStringRows), 'valid')

const sleepPayload = [
  {
    'Date/Time': '09-04-26',
    'Total Sleep (hr)': 7.2,
    'Core (hr)': 3.8,
    'Deep (hr)': 1.1,
    'REM (hr)': 2.3,
  },
] as unknown as MoodRecord[]
assert.equal(detectMoodDataQuality(sleepPayload), 'corrupted')

const mixedPayload = [
  validNumericRows[0],
  sleepPayload[0],
] as unknown as MoodRecord[]
assert.equal(detectMoodDataQuality(mixedPayload), 'valid')

const malformedMoodRows: MoodRecord[] = [
  {
    Iniciar: '2026-05-04T08:00:00',
    Fim: 'Emoção Momentânea',
    Associações: 'sem-escala',
  },
]
assert.equal(detectMoodDataQuality(malformedMoodRows), 'corrupted')
