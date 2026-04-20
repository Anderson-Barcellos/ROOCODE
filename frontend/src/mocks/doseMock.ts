import type { DoseRecord } from '@/lib/api'
import type { MedicationRow } from '@/types/apple-health'
import type { MedicationRegimenEntry } from '@/types/pharmacology'

/**
 * 14 dias de doses plausíveis baseadas no regime real do Anders:
 * - Lexapro (escitalopram) 40mg às 07h todo dia
 * - Vyvanse (lisdexanfetamina) 200mg às 07h em dias úteis (skip fim de semana)
 * - Lamictal (lamotrigina) 200mg às 22h todo dia
 */
function buildMockDoses(days = 14, startOffsetDays = 1): DoseRecord[] {
  const doses: DoseRecord[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let id = 1

  for (let i = days - 1 + startOffsetDays; i >= startOffsetDays; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dow = date.getDay()
    const isWeekend = dow === 0 || dow === 6

    const morning = new Date(date)
    morning.setHours(7, 0, 0, 0)

    const night = new Date(date)
    night.setHours(22, 0, 0, 0)

    // Lexapro — todo dia
    doses.push({
      id: `mock-lex-${id++}`,
      substance: 'lexapro',
      dose_mg: 40,
      taken_at: morning.toISOString(),
      note: '',
      logged_at: morning.toISOString(),
    })

    // Vyvanse — só em dias úteis
    if (!isWeekend) {
      doses.push({
        id: `mock-vyv-${id++}`,
        substance: 'venvanse',
        dose_mg: 200,
        taken_at: morning.toISOString(),
        note: '',
        logged_at: morning.toISOString(),
      })
    }

    // Lamictal — todo dia
    doses.push({
      id: `mock-lam-${id++}`,
      substance: 'lamictal',
      dose_mg: 200,
      taken_at: night.toISOString(),
      note: '',
      logged_at: night.toISOString(),
    })
  }

  return doses
}

/**
 * Mesma ideia, mas já convertido para MedicationRow[] que os charts
 * PK consomem diretamente (pk-concentration-chart, medication-bridge).
 */
export function buildMockMedicationRows(doses: DoseRecord[]): MedicationRow[] {
  return doses.map((d) => ({
    id: null,
    date: d.taken_at,
    scheduledDate: null,
    medication: d.substance,
    nickname: d.substance,
    dosage: d.dose_mg,
    scheduledDosage: null,
    unit: 'mg',
    status: 'taken',
    archived: false,
    codings: null,
  }))
}

export const MOCK_DOSES: DoseRecord[] = buildMockDoses()
export const MOCK_MED_ROWS: MedicationRow[] = buildMockMedicationRows(MOCK_DOSES)
export const MOCK_REGIMEN: MedicationRegimenEntry[] = [
  {
    id: 'lexapro-daily',
    substance: 'lexapro',
    dose_mg: 40,
    times: ['07:00'],
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    start_date: null,
    end_date: null,
    color: '#0f766e',
  },
  {
    id: 'venvanse-weekdays',
    substance: 'venvanse',
    dose_mg: 200,
    times: ['07:00'],
    days_of_week: [1, 2, 3, 4, 5],
    active: true,
    start_date: null,
    end_date: null,
    color: '#7c3aed',
  },
  {
    id: 'lamictal-nightly',
    substance: 'lamictal',
    dose_mg: 200,
    times: ['22:00'],
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    active: true,
    start_date: null,
    end_date: null,
    color: '#2563eb',
  },
]

/**
 * Datas sequenciais (ISO yyyy-MM-dd) que cobrem a janela dos mocks —
 * usado por pk-concentration-chart pra alinhar com snapshots.
 */
export const MOCK_DATES: string[] = (() => {
  const out: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 14; i >= 1; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
})()
