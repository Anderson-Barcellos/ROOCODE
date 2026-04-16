import type { MoodRecord } from '@/lib/api'

/**
 * MoodRecord mock no formato que `/mood` endpoint DEVERIA retornar
 * (quando o bug do AutoExport for corrigido).
 *
 * Útil pra testar o adapter `buildMoodRows` + `detectMoodDataQuality`
 * de ponta a ponta — os snapshots visuais vêm de MOCK_SNAPSHOTS
 * (que já tem mood computado).
 */
function buildMockMoodRecords(days = 14, entriesPerDay = 2): MoodRecord[] {
  const records: MoodRecord[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days; i >= 1; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)

    for (let j = 0; j < entriesPerDay; j++) {
      const entryTime = new Date(date)
      entryTime.setHours(9 + j * 6, 0, 0, 0) // 09h e 15h
      // Valence sintético com seed posicional (determinístico)
      const seed = (i * 31 + j) % 100
      const valence = ((seed - 50) / 50) * 0.7 // -0.7 a +0.7

      records.push({
        Iniciar: entryTime.toISOString(),
        Associações: +valence.toFixed(2),
      })
    }
  }

  return records
}

export const MOCK_MOOD: MoodRecord[] = buildMockMoodRecords()
