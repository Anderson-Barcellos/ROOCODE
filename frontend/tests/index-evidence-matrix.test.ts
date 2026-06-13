import assert from 'node:assert/strict'

import { CHART_REQUIREMENTS } from '../src/utils/data-readiness'
import { INDEX_EVIDENCE_MATRIX, type IndexEvidenceId } from '../src/utils/index-evidence'

const expectedIds: IndexEvidenceId[] = [
  'NightQuality',
  'RecoveryIndex',
  'SleepRegularity',
  'SleepArchitecture',
  'RespiratoryLoad',
  'SleepContinuity',
  'AutonomicBalance',
  'HRVVariability',
  'HRRange',
  'CardiovascularAge',
  'ActivityReadiness',
  'FunctionalCapacityIndex',
  'CircadianRobustness',
  'MovementEfficiency',
  'RestingHeartRate',
  'BloodPressure',
]

for (const id of expectedIds) {
  assert.ok(INDEX_EVIDENCE_MATRIX[id], `spec ausente para ${id}`)
}

assert.equal(Object.keys(INDEX_EVIDENCE_MATRIX).length, expectedIds.length, 'matriz deve conter somente o escopo fechado')

assert.equal(INDEX_EVIDENCE_MATRIX.RecoveryIndex.interpolationPolicy, 'score_with_penalty')
assert.equal(INDEX_EVIDENCE_MATRIX.NightQuality.interpolationPolicy, 'score_with_penalty')
assert.equal(INDEX_EVIDENCE_MATRIX.CircadianRobustness.interpolationPolicy, 'score_with_penalty')

assert.equal(INDEX_EVIDENCE_MATRIX.FunctionalCapacityIndex.interpolationPolicy, 'visual_only')
assert.equal(INDEX_EVIDENCE_MATRIX.MovementEfficiency.interpolationPolicy, 'visual_only')
assert.equal(INDEX_EVIDENCE_MATRIX.ActivityReadiness.interpolationPolicy, 'visual_only')

assert.equal(INDEX_EVIDENCE_MATRIX.SleepRegularity.interpolationPolicy, 'none')

for (const spec of Object.values(INDEX_EVIDENCE_MATRIX)) {
  assert.ok(spec.minimumInputs > 0, `${spec.id} precisa de minimumInputs > 0`)
  assert.ok(spec.primarySources.length > 0, `${spec.id} precisa de ao menos uma fonte primaria`)
  assert.ok(spec.readinessKey.length > 0, `${spec.id} precisa de readinessKey`) 
  assert.ok(
    spec.readinessKey in CHART_REQUIREMENTS,
    `${spec.id} readinessKey inexistente em CHART_REQUIREMENTS: ${spec.readinessKey}`,
  )
}

console.log('index-evidence-matrix.test.ts — matrix contracts ok')
