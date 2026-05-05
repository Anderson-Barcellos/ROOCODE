import assert from 'node:assert/strict'

import { buildPKMoodPairs, type MoodEvent } from '../src/utils/intraday-correlation'
import {
  buildPKMedication,
  PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML,
  type PKDose,
} from '../src/utils/pharmacokinetics'

const med = buildPKMedication('lexapro')
assert.ok(med)

const doseTime = Date.parse('2026-04-20T12:00:00Z')
const doses: PKDose[] = [
  {
    medicationId: med.id,
    timestamp: doseTime,
    doseAmount: 40,
  },
]

const events: MoodEvent[] = [
  {
    timestamp: doseTime - 2 * 60 * 60 * 1000,
    valence: 0.1,
    valenceClass: null,
  },
  {
    timestamp: doseTime + 3 * 60 * 60 * 1000,
    valence: 0.6,
    valenceClass: null,
  },
]

const pairs = buildPKMoodPairs(events, med, doses, 70, 0)
assert.equal(pairs.length, 1)
assert.equal(pairs[0].timestamp, events[1].timestamp)
assert.ok(pairs[0].concentration > PK_MIN_ANALYTICAL_CONCENTRATION_NG_ML)

const laggedPairs = buildPKMoodPairs([events[1]], med, doses, 70, 4)
assert.equal(laggedPairs.length, 0)
