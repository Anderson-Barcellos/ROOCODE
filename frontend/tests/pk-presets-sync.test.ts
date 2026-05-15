/**
 * Valida que `PK_PRESETS` (frontend) está sincronizado com
 * `Farma/medDataBase.json` (backend, fonte de verdade).
 *
 * Auditoria 2026-05-15 detectou drift em Lexapro, Lamictal, Clonazepam e
 * outros 5 medicamentos — backend e frontend tinham valores diferentes
 * para os mesmos parâmetros PK. Este teste impede que isso volte a
 * acontecer silenciosamente: se alguém alterar um lado e esquecer do outro,
 * a CI quebra.
 *
 * Convenção: `volumeOfDistribution` no frontend é sempre L/kg. Quando o
 * backend usa `vd_l` (absoluto), convertemos dividindo por 91kg (peso de
 * referência do Anders).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PK_PRESETS } from '../src/utils/pharmacokinetics'

const REFERENCE_WEIGHT_KG = 91 // Anders — usado para converter vd_l → vd_l_per_kg

interface BackendProfile {
  bioavailability: number
  half_life_hours: number
  ka_per_hour: number
  vd_l_per_kg?: number
  vd_l?: number
}

// `npm run test:unit` é executado a partir de /root/RooCode/frontend.
// O backend está em /root/RooCode/Farma.
const BACKEND_DB_PATH = join(process.cwd(), '..', 'Farma', 'medDataBase.json')

function loadBackendSubstances(): Record<string, BackendProfile> {
  const raw = readFileSync(BACKEND_DB_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as { substances: Record<string, BackendProfile> }
  return parsed.substances
}

// Mapeamento preset_key (frontend) → backend_key (medDataBase)
const PRESET_TO_BACKEND_KEY: Record<string, string> = {
  escitalopram: 'lexapro',
  lisdexamfetamine: 'venvanse',
  lamotrigine: 'lamictal',
  clonazepam: 'clonazepam',
  bacopa: 'bacopa_monnieri',
  magnesium: 'magnesio_treonato',
  omega3: 'omega_3',
  vitamind3: 'vitamina_d3_10000_ui',
  piracetam: 'piracetam',
}

function approxEqual(a: number, b: number, tolerance = 0.02): boolean {
  // 2% de tolerância para arredondamentos (ex: 0.31 ≈ 28/91 = 0.30769)
  if (a === 0 && b === 0) return true
  const denom = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / denom <= tolerance
}

function backendVdPerKg(profile: BackendProfile): number {
  if (typeof profile.vd_l_per_kg === 'number') return profile.vd_l_per_kg
  if (typeof profile.vd_l === 'number') return profile.vd_l / REFERENCE_WEIGHT_KG
  throw new Error('Backend profile missing both vd_l_per_kg and vd_l')
}

function runAssertions(): void {
  const backend = loadBackendSubstances()
  const errors: string[] = []

  for (const [presetKey, preset] of Object.entries(PK_PRESETS)) {
    const backendKey = PRESET_TO_BACKEND_KEY[presetKey]
    if (!backendKey) {
      errors.push(`Sem mapeamento backend para preset "${presetKey}"`)
      continue
    }
    const profile = backend[backendKey]
    if (!profile) {
      errors.push(`Backend "${backendKey}" ausente em medDataBase.json (preset "${presetKey}")`)
      continue
    }

    const checks: Array<[string, number, number]> = [
      ['halfLife', preset.halfLife, profile.half_life_hours],
      ['bioavailability', preset.bioavailability, profile.bioavailability],
      ['absorptionRate (ka)', preset.absorptionRate, profile.ka_per_hour],
      ['volumeOfDistribution (L/kg)', preset.volumeOfDistribution, backendVdPerKg(profile)],
    ]

    for (const [field, frontendVal, backendVal] of checks) {
      if (!approxEqual(frontendVal, backendVal)) {
        errors.push(
          `Drift em ${presetKey}.${field}: frontend=${frontendVal} vs backend=${backendVal} ` +
          `(>2% de diferença). Atualize PK_PRESETS ou medDataBase.json para alinhar.`,
        )
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`pk-presets-sync — ${errors.length} divergência(s):\n` + errors.join('\n'))
  }
}

runAssertions()
console.log('pk-presets-sync.test.ts — all PK_PRESETS aligned with medDataBase.json')
