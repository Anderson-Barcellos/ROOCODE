import assert from 'node:assert/strict'

import type { DoseRecord } from '../src/lib/api'
import type { MedicationRegimenEntry } from '../src/types/pharmacology'
import { computeCoverageStatus, type CoverageClass } from '../src/utils/pk-coverage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-05-11T18:00:00Z').getTime()
const MS_HOUR = 60 * 60 * 1000

function dose(substance: string, hoursAgo: number, doseMg: number): DoseRecord {
  return {
    id: `${substance}-${hoursAgo}`,
    substance,
    dose_mg: doseMg,
    taken_at: new Date(NOW - hoursAgo * MS_HOUR).toISOString(),
    note: '',
    logged_at: new Date(NOW - hoursAgo * MS_HOUR).toISOString(),
  }
}

function regimenEntry(substance: string, doseMg: number, times: string[]): MedicationRegimenEntry {
  return {
    id: `r-${substance}`,
    substance,
    dose_mg: doseMg,
    times,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    start_date: null,
    end_date: null,
    color: null,
  }
}

// ─── Test 1: Regime cumprido com doses recentes → adequada ────────────────────

// Lexapro (escitalopram): therapeutic 15-80 ng/mL, half-life 30h
const doses1: DoseRecord[] = [
  dose('Escitalopram', 8, 40),
  dose('Escitalopram', 32, 40),
  dose('Escitalopram', 56, 40),
]
const regimen1 = [regimenEntry('Escitalopram', 40, ['08:00'])]
const r1 = computeCoverageStatus(doses1, regimen1, { now: NOW })
const lex1 = r1.find((s) => s.presetKey === 'escitalopram')!
assert.ok(lex1)
assert.ok(lex1.concentrationNow > 0, 'concentration should be positive after recent doses')
// Pode ser 'adequada' ou 'queda' dependendo de quão perto do min — só assertamos que NÃO é vulnerabilidade
assert.notEqual(lex1.klass, 'vulnerabilidade')

// ─── Test 2: Sem doses logadas + regime esperava → nao_registrada ─────────────

// Regime espera 1 dose/dia de Lexapro mas nenhuma logada nas últimas 48h.
const doses2: DoseRecord[] = []
const regimen2 = [regimenEntry('Escitalopram', 40, ['08:00'])]
const r2 = computeCoverageStatus(doses2, regimen2, { now: NOW })
const lex2 = r2.find((s) => s.presetKey === 'escitalopram')!
// Sem doses → concentração 0 → fica < min → vulnerabilidade ganha sobre nao_registrada por prioridade
assert.equal(lex2.klass, 'vulnerabilidade')
assert.equal(lex2.concentrationNow, 0)
assert.ok(lex2.missedDoses > 0)
assert.ok(lex2.expectedDosesLast48h >= 2)

// ─── Test 3: Concentração adequada + dose esperada faltando → nao_registrada ──

// Lexapro: doses suficientes pra manter concentração mas regime espera 2/dia
// e só logamos 1 nas últimas 48h.
const doses3: DoseRecord[] = [
  dose('Escitalopram', 4, 60), // dose recente alta mantém concentração alta
]
const regimen3 = [regimenEntry('Escitalopram', 30, ['08:00', '20:00'])] // espera 2/dia
const r3 = computeCoverageStatus(doses3, regimen3, { now: NOW })
const lex3 = r3.find((s) => s.presetKey === 'escitalopram')!
// concentração não-zero, mas missed > 0 → nao_registrada (se conc >= min)
if (lex3.concentrationNow >= lex3.therapeuticMin) {
  assert.equal(lex3.klass, 'nao_registrada')
  assert.ok(lex3.missedDoses > 0)
}

// ─── Test 4: Regime vazio + sem doses → vulnerabilidade ───────────────────────

const r4 = computeCoverageStatus([], [], { now: NOW })
r4.forEach((s) => {
  // Todas as substâncias com therapeutic range entram. Sem doses → concentração 0 → vulnerabilidade.
  assert.equal(s.klass, 'vulnerabilidade')
  assert.equal(s.concentrationNow, 0)
  assert.equal(s.missedDoses, 0) // sem regime, sem expectativa
})

// ─── Test 5: Output contém todas as 4 medicações do preset ────────────────────

const r5 = computeCoverageStatus([], null, { now: NOW })
const keys = r5.map((s) => s.presetKey).sort()
assert.deepEqual(keys, ['clonazepam', 'escitalopram', 'lamotrigine', 'lisdexamfetamine'].sort())

// ─── Test 6: Classes válidas ──────────────────────────────────────────────────

const validClasses: CoverageClass[] = ['adequada', 'queda', 'vulnerabilidade', 'nao_registrada']
r5.forEach((s) => {
  assert.ok(validClasses.includes(s.klass), `klass inválida: ${s.klass}`)
})

console.log('pk-coverage.test.ts — all assertions passed')
