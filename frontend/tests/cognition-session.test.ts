import assert from 'node:assert/strict'

import type { CognitiveSessionChartRow } from '../src/types/cognition'
import {
  buildBalancedFlankerTrials,
  buildCorsiSequence,
  buildDigitSequence,
  filterCognitionTimeline,
} from '../src/utils/cognition-session'

const fixedRng = (() => {
  const values = [0.1, 0.4, 0.7, 0.2, 0.8, 0.3, 0.6, 0.9, 0.05]
  let index = 0
  return () => {
    const value = values[index % values.length]
    index += 1
    return value
  }
})()

{
  const digits = buildDigitSequence(6, fixedRng)
  assert.equal(digits.length, 6)
  digits.forEach((digit) => assert.ok(digit >= 1 && digit <= 9))
  digits.slice(1).forEach((digit, index) => assert.notEqual(digit, digits[index]))
}

{
  const corsi = buildCorsiSequence(5, fixedRng)
  assert.equal(corsi.length, 5)
  assert.equal(new Set(corsi).size, 5)
  corsi.forEach((index) => assert.ok(index >= 0 && index <= 8))
}

{
  const trials = buildBalancedFlankerTrials(40, fixedRng)
  const congruent = trials.filter((trial) => trial.congruent).length
  const incongruent = trials.filter((trial) => !trial.congruent).length
  assert.equal(trials.length, 40)
  assert.equal(congruent, 20)
  assert.equal(incongruent, 20)
}

{
  const makeRow = (id: string, date: string): CognitiveSessionChartRow => ({
    id,
    date,
    started_at: `${date}T12:30:00Z`,
    rotating_type: 'A',
    mood: 50,
    energy: 50,
    anxiety: 20,
    pvt_lapses: 2,
    pvt_response_speed: 2.3,
    pvt_median_rt_ms: 310,
    span_primary: 4,
    venvanse_ng_ml: null,
    hours_since_dose: null,
    slot_label: 'Fluência',
    slot_primary: 10,
    slot_exploratory: false,
    baseline_phase: false,
  })
  const rows = [
    makeRow('1', '2026-06-10'),
    makeRow('2', '2026-06-14'),
    makeRow('3', '2026-06-15'),
  ]
  const filtered = filterCognitionTimeline(rows, '7d')
  assert.ok(filtered.length >= 1)
}
