import assert from 'node:assert/strict'

import type { RankedDriver, RankingResult } from '../src/utils/driver-ranking'
import {
  buildCockpitHeadline,
  buildInvestigativePrompt,
} from '../src/utils/insights-narrative'

const baseDriver: RankedDriver = {
  id: 'sleep',
  title: 'Sono',
  label: 'sono total',
  unit: 'h',
  sourcePath: 'DailySnapshot.health.sleepTotalHours',
  chartHint: 'Sono · SleepStages/SleepDebt',
  iconName: 'moon',
  polarity: 'higher-is-better',
  precision: 1,
  state: 'qualified',
  pearson: {
    r: 0.42,
    pValue: 0.01,
    n: 12,
    strength: 'moderate',
    direction: 'positive',
    significant: true,
  },
  recentValue: 6.2,
  baselineValue: 7.4,
  delta: -1.2,
  tone: 'watch',
  pairCount: 12,
  sparkline14d: [],
}

// CASO A — cockpit cheio (3 drivers no top3)
const fullRanking: RankingResult = {
  top3: [
    baseDriver,
    { ...baseDriver, id: 'autonomic', title: 'Autonômico', label: 'HRV' },
    { ...baseDriver, id: 'activity', title: 'Ativação', label: 'passos' },
  ],
  others: [],
  total: 4,
  robustCount: 2,
  coveragePct: 78,
  pairedDays: 42,
}
const fullHeadline = buildCockpitHeadline(fullRanking)
assert.match(fullHeadline, /sono total|HRV|passos/, 'headline cita drivers do top3')
assert.match(fullHeadline, /2 drivers robustos/, 'headline cita robustCount plural')
assert.match(fullHeadline, /78%/, 'headline cita coveragePct')
assert.ok(fullHeadline.length < 260, `headline curto (${fullHeadline.length} chars)`)

// CASO B — robustCount=1 (singular)
const singularRanking: RankingResult = { ...fullRanking, robustCount: 1 }
const singularHeadline = buildCockpitHeadline(singularRanking)
assert.match(singularHeadline, /1 driver robusto/, 'singular do robustCount')

// CASO C — robustCount=0
const noRobust: RankingResult = { ...fullRanking, robustCount: 0 }
const noRobustHeadline = buildCockpitHeadline(noRobust)
assert.match(noRobustHeadline, /nenhum atingiu/, 'headline informa zero robustos')

// CASO D — top3 vazio (cockpit insuficiente)
const emptyRanking: RankingResult = {
  top3: [],
  others: [
    {
      ...baseDriver,
      state: 'dim',
      pearson: null,
      pairCount: 5,
      recentValue: null,
      baselineValue: null,
      delta: null,
    },
  ],
  total: 1,
  robustCount: 0,
  coveragePct: 30,
  pairedDays: 5,
}
const emptyHeadline = buildCockpitHeadline(emptyRanking)
assert.match(emptyHeadline, /insuficientes|janela/i, 'headline fala de insuficiência')
assert.match(emptyHeadline, /n mínimo é 10/, 'headline expõe critério')

// CASO E — pergunta investigativa com driver qualified
const prompt = buildInvestigativePrompt(baseDriver)
assert.match(prompt, /6,2|6\.2/, 'cita recentValue 6.2h')
assert.match(prompt, /7,4|7\.4/, 'cita baselineValue 7.4h')
assert.match(prompt, /1,2|1\.2/, 'cita deltaAbs 1.2h')
assert.match(prompt, /abaixo/, 'direção abaixo (delta negativo)')
assert.match(prompt, /SleepStages|Sono/, 'cita chartHint')
assert.ok(prompt.endsWith('?'), 'termina com pergunta')

// CASO F — pergunta com driver dim
const dimDriver: RankedDriver = {
  ...baseDriver,
  state: 'dim',
  pearson: null,
  pairCount: 5,
  recentValue: null,
  baselineValue: null,
  delta: null,
}
const dimPrompt = buildInvestigativePrompt(dimDriver)
assert.match(dimPrompt, /insuficien|n=5/, 'pergunta com aviso de n insuficiente')
assert.ok(dimPrompt.endsWith('?'), 'pergunta termina com ?')

// CASO G — pergunta com delta positivo
const positiveDriver: RankedDriver = {
  ...baseDriver,
  recentValue: 8.5,
  baselineValue: 7.4,
  delta: 1.1,
  tone: 'positive',
}
const positivePrompt = buildInvestigativePrompt(positiveDriver)
assert.match(positivePrompt, /acima/, 'direção acima (delta positivo)')

console.log('insights-narrative.test.ts OK')
