# Insights Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a aba Insights de painel multivariado denso em cockpit narrativo curto que responde *"Quem mexeu no meu humor essa semana?"*.

**Architecture:** Bottom-up. Primeiro 2 módulos utilitários puros (`driver-ranking` + `insights-narrative`), depois desacoplar `CorrelationHeatmap` do `MoodDriverBoard`, depois 5 componentes folha do cockpit, depois container `InsightsCockpit`, depois integração no `App.tsx` (Insights + Panorama), por último deletar `MoodDriverBoard` órfão. Validação ao final.

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + Recharts + TanStack Query. Tests em Node assert (não vitest globals) por convenção do repo. Comandos: `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

**Spec mãe:** `docs/superpowers/specs/insights-redesign.md` (14 decisões consolidadas).

---

## File Structure

### Novos arquivos

```
frontend/src/
├── utils/
│   ├── driver-ranking.ts                    # NOVO — Task 1
│   └── insights-narrative.ts                # NOVO — Task 2
└── components/insights/                     # PASTA NOVA
    ├── ranking-metadata-chips.tsx           # NOVO — Task 4
    ├── medication-context-strip.tsx         # NOVO — Task 5
    ├── driver-ranking-card.tsx              # NOVO — Task 6
    ├── driver-detail-panel.tsx              # NOVO — Task 7
    └── insights-cockpit.tsx                 # NOVO — Task 8

frontend/tests/
├── driver-ranking.test.ts                   # NOVO — Task 1
└── insights-narrative.test.ts               # NOVO — Task 2
```

### Arquivos modificados

```
frontend/src/
├── App.tsx                                  # MOD — Task 9 (Panorama tab) + Task 10 (Insights tab)
└── components/charts/
    ├── correlation-heatmap.tsx              # MOD — Task 3 (remove embed do MoodDriverBoard)
    └── mood-driver-board.tsx                # DEL — Task 11

frontend/tests/
└── run-all.test.ts                          # MOD — Tasks 1 e 2 (registrar testes novos)
```

### Arquivos preservados sem callsite (não modificar)

```
frontend/src/components/cards/pk-variability-report-card.tsx
frontend/src/components/charts/pk-variability-humor-lab.tsx
frontend/src/components/charts/pk-mood-scatter-chart.tsx
frontend/src/components/charts/lag-correlation-chart.tsx
frontend/src/components/charts/temp-humor-correlation.tsx   # Vira <details> próprio na Task 10
```

---

## Task 1: `driver-ranking.ts` — módulo de ranking

**Files:**
- Create: `frontend/src/utils/driver-ranking.ts`
- Create: `frontend/tests/driver-ranking.test.ts`
- Modify: `frontend/tests/run-all.test.ts`

**Contexto:** migra a lógica de `DRIVERS` array + `buildDriverCard` do `mood-driver-board.tsx` (linhas 45-238) pra módulo puro, expandindo com função `rankDrivers` que retorna `top3 + others + metadados pros chips do topo`. Driver `medicação` (`polarity: 'context'`) é **excluído** automaticamente — vai pra strip separada (Task 5).

- [ ] **Step 1: Criar arquivo `driver-ranking.ts` com tipos e constantes**

```typescript
// frontend/src/utils/driver-ranking.ts
import { Activity, HeartPulse, Moon, SunMedium } from 'lucide-react'
import type { DailySnapshot } from '@/types/apple-health'
import { pearson, type CorrelationResult } from '@/utils/statistics'

export const MIN_PAIRED_DAYS_FOR_RANKING = 10
export const ROBUST_R_THRESHOLD = 0.3
export const TOP_N = 3
export const RECENT_WINDOW = 7
export const SPARKLINE_WINDOW = 14

export type DriverRankingState = 'qualified' | 'dim'
export type DriverTone = 'positive' | 'watch' | 'neutral'

export interface DriverDefinition {
  id: string
  title: string
  label: string
  unit: string
  sourcePath: string
  chartHint: string
  iconName: 'moon' | 'heart-pulse' | 'activity' | 'sun-medium'
  polarity: 'higher-is-better' | 'lower-is-better' | 'context'
  getter: (snapshot: DailySnapshot) => number | null
  precision?: number
}

export interface RankedDriver {
  id: string
  title: string
  label: string
  unit: string
  sourcePath: string
  chartHint: string
  iconName: DriverDefinition['iconName']
  polarity: DriverDefinition['polarity']
  precision: number
  state: DriverRankingState
  pearson: CorrelationResult | null
  recentValue: number | null
  baselineValue: number | null
  delta: number | null
  tone: DriverTone
  pairCount: number
  sparkline14d: Array<{ date: string; value: number | null; mood: number | null }>
}

export interface RankingResult {
  top3: RankedDriver[]
  others: RankedDriver[]
  total: number
  robustCount: number
  coveragePct: number
  pairedDays: number
}

export const DRIVERS: DriverDefinition[] = [
  {
    id: 'sleep',
    title: 'Sono',
    label: 'sono total',
    unit: 'h',
    sourcePath: 'DailySnapshot.health.sleepTotalHours',
    chartHint: 'Sono · SleepStages/SleepDebt',
    iconName: 'moon',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.sleepTotalHours ?? null,
    precision: 1,
  },
  {
    id: 'autonomic',
    title: 'Autonômico',
    label: 'HRV',
    unit: 'ms',
    sourcePath: 'DailySnapshot.health.hrvSdnn',
    chartHint: 'Coração · AutonomicBalance/HRV',
    iconName: 'heart-pulse',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.hrvSdnn ?? null,
    precision: 0,
  },
  {
    id: 'activity',
    title: 'Ativação',
    label: 'passos',
    unit: '',
    sourcePath: 'DailySnapshot.health.steps',
    chartHint: 'Atividade · Steps/ActivityBars',
    iconName: 'activity',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.steps ?? null,
    precision: 0,
  },
  {
    id: 'circadian',
    title: 'Circadiano',
    label: 'luz do dia',
    unit: 'min',
    sourcePath: 'DailySnapshot.health.daylightMinutes',
    chartHint: 'Atividade/Insights · ciclo circadiano',
    iconName: 'sun-medium',
    polarity: 'higher-is-better',
    getter: (s) => s.health?.daylightMinutes ?? null,
    precision: 0,
  },
]

export const ICON_MAP = { moon: Moon, 'heart-pulse': HeartPulse, activity: Activity, 'sun-medium': SunMedium }
```

- [ ] **Step 2: Criar o teste com fixture e casos esperados**

```typescript
// frontend/tests/driver-ranking.test.ts
import assert from 'node:assert/strict'
import type { DailySnapshot } from '../src/types/apple-health'
import { rankDrivers, MIN_PAIRED_DAYS_FOR_RANKING, ROBUST_R_THRESHOLD, TOP_N } from '../src/utils/driver-ranking'

function makeSnapshot(overrides: Partial<DailySnapshot['health']> & { date: string; mood?: number | null }): DailySnapshot {
  const { date, mood, ...health } = overrides as never
  return {
    date,
    health: { sleepTotalHours: null, hrvSdnn: null, steps: null, daylightMinutes: null, ...health },
    mood: mood == null ? null : { valence: mood as number },
    medications: null,
    forecasted: false,
    interpolated: false,
  } as DailySnapshot
}

// CASO 1: dados suficientes pra ranking
const days12: DailySnapshot[] = Array.from({ length: 12 }, (_, i) => makeSnapshot({
  date: `2026-05-${String(i + 1).padStart(2, '0')}`,
  sleepTotalHours: 6 + (i % 3),
  hrvSdnn: 30 + i,
  steps: 5000 + i * 200,
  daylightMinutes: 200 + i * 5,
  mood: (i % 4) - 1.5,
}))

const result = rankDrivers(days12)
assert.equal(result.top3.length, TOP_N, 'top3 deve ter 3 entradas quando há ≥10 pares')
assert.equal(result.top3[0].state, 'qualified', 'top3 são todos qualified')
assert.ok(result.pairedDays >= MIN_PAIRED_DAYS_FOR_RANKING, 'pairedDays calculado')
assert.ok(typeof result.coveragePct === 'number', 'coveragePct é número')

// CASO 2: dados insuficientes — todos viram dim
const days5: DailySnapshot[] = days12.slice(0, 5)
const insufficient = rankDrivers(days5)
assert.equal(insufficient.top3.length, 0, 'sem qualificados, top3 vazio')
assert.equal(insufficient.others.length, 4, '4 drivers dim em others (sono/HRV/passos/luz)')
insufficient.others.forEach(d => assert.equal(d.state, 'dim', 'todos dim quando pairCount<10'))

// CASO 3: medicação NUNCA aparece no resultado
const ids = [...result.top3, ...result.others].map(d => d.id)
assert.ok(!ids.includes('medication'), 'medicação fora do ranking')

// CASO 4: forecasted/interpolated não contam no pareamento
const polluted = [...days12, makeSnapshot({ date: '2026-05-13', sleepTotalHours: 99, mood: 99 } as never)]
;(polluted[polluted.length - 1] as DailySnapshot).forecasted = true
const ranked = rankDrivers(polluted)
const sleep = ranked.top3.find(d => d.id === 'sleep') || ranked.others.find(d => d.id === 'sleep')
assert.equal(sleep?.pairCount, 12, 'forecasted não conta')

// CASO 5: robustCount conta r≥0.3
assert.equal(typeof result.robustCount, 'number', 'robustCount é número')
assert.ok(result.robustCount <= TOP_N, 'robustCount ≤ TOP_N')

console.log('driver-ranking.test.ts OK')
```

- [ ] **Step 3: Adicionar import no `run-all.test.ts`**

```typescript
// frontend/tests/run-all.test.ts — adicionar no final dos imports
import './driver-ranking.test'
```

- [ ] **Step 4: Rodar o teste pra confirmar que falha (rankDrivers ainda não existe)**

```bash
cd /root/RooCode/frontend && npm run test:unit 2>&1 | tail -20
```
Expected: FAIL — `rankDrivers is not exported from driver-ranking.ts` ou similar.

- [ ] **Step 5: Implementar `rankDrivers` no `driver-ranking.ts`**

Adicionar ao fim do arquivo criado no Step 1:

```typescript
function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

function toneForDelta(delta: number | null, baseline: number | null, polarity: DriverDefinition['polarity']): DriverTone {
  if (delta == null || baseline == null || baseline === 0 || polarity === 'context') return 'neutral'
  const relative = delta / Math.abs(baseline)
  if (Math.abs(relative) < 0.08) return 'neutral'
  const improving = polarity === 'higher-is-better' ? delta > 0 : delta < 0
  return improving ? 'positive' : 'watch'
}

function buildSparkline(snapshots: DailySnapshot[], driver: DriverDefinition): RankedDriver['sparkline14d'] {
  const usable = snapshots.filter(s => !s.forecasted && !s.interpolated).slice(-SPARKLINE_WINDOW)
  return usable.map(s => ({
    date: s.date,
    value: driver.getter(s),
    mood: s.mood?.valence ?? null,
  }))
}

function buildRankedDriver(snapshots: DailySnapshot[], driver: DriverDefinition): RankedDriver {
  const usable = snapshots.filter(s => !s.forecasted && !s.interpolated)
  const pairedItems = usable
    .map(s => {
      const value = driver.getter(s)
      return value != null && Number.isFinite(value) && s.mood?.valence != null
        ? { value, mood: s.mood.valence }
        : null
    })
    .filter((item): item is { value: number; mood: number } => item != null)

  const values = usable.map(s => driver.getter(s)).filter((v): v is number => v != null && Number.isFinite(v))
  const recent = values.slice(-RECENT_WINDOW)
  const baseline = values.slice(0, Math.max(0, values.length - RECENT_WINDOW))
  const recentValue = average(recent)
  const baselineValue = average(baseline.length >= 3 ? baseline : values)
  const delta = recentValue != null && baselineValue != null ? recentValue - baselineValue : null
  const pearsonResult = pairedItems.length >= 2
    ? pearson(pairedItems.map(i => i.value), pairedItems.map(i => i.mood))
    : null
  const pairCount = pairedItems.length
  const state: DriverRankingState = pairCount >= MIN_PAIRED_DAYS_FOR_RANKING ? 'qualified' : 'dim'

  return {
    id: driver.id,
    title: driver.title,
    label: driver.label,
    unit: driver.unit,
    sourcePath: driver.sourcePath,
    chartHint: driver.chartHint,
    iconName: driver.iconName,
    polarity: driver.polarity,
    precision: driver.precision ?? 1,
    state,
    pearson: pearsonResult,
    recentValue,
    baselineValue,
    delta,
    tone: toneForDelta(delta, baselineValue, driver.polarity),
    pairCount,
    sparkline14d: buildSparkline(snapshots, driver),
  }
}

export function rankDrivers(snapshots: DailySnapshot[]): RankingResult {
  const ranked = DRIVERS.map(d => buildRankedDriver(snapshots, d))
  const qualified = ranked
    .filter(d => d.state === 'qualified' && d.pearson != null)
    .sort((a, b) => Math.abs(b.pearson!.r) - Math.abs(a.pearson!.r))
  const top3 = qualified.slice(0, TOP_N)
  const othersQualified = qualified.slice(TOP_N)
  const dim = ranked.filter(d => d.state === 'dim')
  const others = [...othersQualified, ...dim]

  const robustCount = top3.filter(d => d.pearson != null && Math.abs(d.pearson.r) >= ROBUST_R_THRESHOLD).length
  const usable = snapshots.filter(s => !s.forecasted && !s.interpolated)
  const pairedDays = usable.filter(s => s.mood?.valence != null).length
  const coveragePct = usable.length > 0 ? Math.round((pairedDays / usable.length) * 100) : 0

  return { top3, others, total: ranked.length, robustCount, coveragePct, pairedDays }
}
```

- [ ] **Step 6: Rodar teste pra confirmar PASS**

```bash
cd /root/RooCode/frontend && npm run test:unit 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 7: tsc + lint**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit && npm run lint
```
Expected: zero erros.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/driver-ranking.ts frontend/tests/driver-ranking.test.ts frontend/tests/run-all.test.ts
git commit -m "feat(insights): driver-ranking utility com top3 + others + metadados"
```

---

## Task 2: `insights-narrative.ts` — templates determinísticos

**Files:**
- Create: `frontend/src/utils/insights-narrative.ts`
- Create: `frontend/tests/insights-narrative.test.ts`
- Modify: `frontend/tests/run-all.test.ts`

**Contexto:** templates `if/then` com placeholders pra headline do cockpit + pergunta investigativa por card. Sem LLM. Funções puras testáveis.

- [ ] **Step 1: Criar teste com casos esperados**

```typescript
// frontend/tests/insights-narrative.test.ts
import assert from 'node:assert/strict'
import { buildCockpitHeadline, buildInvestigativePrompt } from '../src/utils/insights-narrative'
import type { RankedDriver, RankingResult } from '../src/utils/driver-ranking'

const baseDriver: RankedDriver = {
  id: 'sleep', title: 'Sono', label: 'sono total', unit: 'h',
  sourcePath: 'DailySnapshot.health.sleepTotalHours',
  chartHint: 'Sono · SleepStages/SleepDebt',
  iconName: 'moon', polarity: 'higher-is-better', precision: 1,
  state: 'qualified',
  pearson: { r: 0.42, pValue: 0.01, n: 12, direction: 'positive' },
  recentValue: 6.2, baselineValue: 7.4, delta: -1.2, tone: 'watch',
  pairCount: 12, sparkline14d: [],
}

// CASO A: cockpit com top3 cheio
const ranking: RankingResult = {
  top3: [baseDriver, { ...baseDriver, id: 'autonomic', title: 'Autonômico', label: 'HRV' }, { ...baseDriver, id: 'activity', title: 'Ativação', label: 'passos' }],
  others: [], total: 4, robustCount: 2, coveragePct: 78, pairedDays: 42,
}
const headline = buildCockpitHeadline(ranking)
assert.match(headline, /sono|HRV|passos/i, 'headline cita drivers em destaque')
assert.ok(headline.length < 220, 'headline curto')

// CASO B: cockpit todo dim
const emptyRanking: RankingResult = { top3: [], others: [{ ...baseDriver, state: 'dim', pearson: null, pairCount: 5 }], total: 1, robustCount: 0, coveragePct: 30, pairedDays: 5 }
const emptyHeadline = buildCockpitHeadline(emptyRanking)
assert.match(emptyHeadline, /janela|dado|insuficien/i, 'headline fala de insuficiência quando top3 vazio')

// CASO C: pergunta investigativa
const prompt = buildInvestigativePrompt(baseDriver)
assert.match(prompt, /6[.,]2/, 'cita recentValue')
assert.match(prompt, /7[.,]4/, 'cita baseline')
assert.match(prompt, /SleepStages|Sono/i, 'cita chartHint')
assert.ok(prompt.endsWith('?'), 'termina com pergunta')

// CASO D: pergunta com driver dim
const dimDriver: RankedDriver = { ...baseDriver, state: 'dim', pearson: null, pairCount: 5 }
const dimPrompt = buildInvestigativePrompt(dimDriver)
assert.match(dimPrompt, /insuficien|janela/i, 'pergunta com aviso de insuficiência')

console.log('insights-narrative.test.ts OK')
```

- [ ] **Step 2: Adicionar import no `run-all.test.ts`**

```typescript
import './insights-narrative.test'
```

- [ ] **Step 3: Rodar pra confirmar FALHA**

```bash
cd /root/RooCode/frontend && npm run test:unit 2>&1 | tail -10
```
Expected: FAIL — `buildCockpitHeadline is not exported`.

- [ ] **Step 4: Implementar templates**

```typescript
// frontend/src/utils/insights-narrative.ts
import type { RankedDriver, RankingResult } from './driver-ranking'

function fmtNum(value: number, precision: number, unit: string): string {
  const num = value.toLocaleString('pt-BR', { maximumFractionDigits: precision, minimumFractionDigits: precision })
  return unit ? `${num} ${unit}` : num
}

function directionWord(driver: RankedDriver): string {
  if (driver.delta == null) return 'estável'
  return driver.delta > 0 ? 'acima' : driver.delta < 0 ? 'abaixo' : 'igual'
}

export function buildCockpitHeadline(ranking: RankingResult): string {
  if (ranking.top3.length === 0) {
    return `Janela com dados insuficientes pra ranking de drivers — n mínimo é 10 dias pareados com humor. Aumenta a janela ou aguarda mais logs.`
  }
  const names = ranking.top3.map(d => d.label).join(', ')
  const robustNote = ranking.robustCount === 0
    ? 'nenhum atingiu o critério de robustez (|r|≥0.3)'
    : `${ranking.robustCount} ${ranking.robustCount === 1 ? 'driver robusto' : 'drivers robustos'} (|r|≥0.3)`
  return `Essa janela, ${names} aparecem como drivers principais do humor — ${robustNote}. Cobertura pareada: ${ranking.coveragePct}% (${ranking.pairedDays} dias).`
}

export function buildInvestigativePrompt(driver: RankedDriver): string {
  if (driver.state === 'dim' || driver.recentValue == null || driver.baselineValue == null) {
    return `Driver ${driver.label} ainda não tem pareamento suficiente nesta janela (n=${driver.pairCount}, mínimo 10). Aumentar a janela pode revelar relação com humor?`
  }
  const recent = fmtNum(driver.recentValue, driver.precision, driver.unit)
  const base = fmtNum(driver.baselineValue, driver.precision, driver.unit)
  const dir = directionWord(driver)
  const deltaAbs = fmtNum(Math.abs(driver.delta ?? 0), driver.precision, driver.unit)
  return `Tu teve ${driver.label} médio de ${recent} essa janela — ${deltaAbs} ${dir} do baseline (${base}). Quer ver ${driver.chartHint}?`
}
```

- [ ] **Step 5: Rodar testes**

```bash
cd /root/RooCode/frontend && npm run test:unit 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 6: tsc + lint**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/insights-narrative.ts frontend/tests/insights-narrative.test.ts frontend/tests/run-all.test.ts
git commit -m "feat(insights): templates determinísticos pra headline + pergunta investigativa"
```

---

## Task 3: Desacoplar `MoodDriverBoard` do `CorrelationHeatmap`

**Files:**
- Modify: `frontend/src/components/charts/correlation-heatmap.tsx`

**Contexto:** o `CorrelationHeatmap` hoje embute `<MoodDriverBoard>` na linha 191. Removendo essa linha, ambos viram componentes independentes — `CorrelationHeatmap` continua usável como heatmap puro (vai virar `<details>` próprio na Task 10), e `MoodDriverBoard` fica órfão (será deletado na Task 11).

- [ ] **Step 1: Ler o estado atual do bloco**

```bash
cd /root/RooCode && sed -n '185,200p' frontend/src/components/charts/correlation-heatmap.tsx
```
Confirmar que a linha 191 tem `<MoodDriverBoard snapshots={snapshots} />`.

- [ ] **Step 2: Editar — remover import + uso**

Remover do topo do arquivo:
```typescript
import { MoodDriverBoard } from './mood-driver-board'
```

Remover da render (linha ~191):
```tsx
<MoodDriverBoard snapshots={snapshots} />
```

- [ ] **Step 3: Validar build**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit && npm run lint
```
Expected: zero erros (o import quebra o tsc se sobrar referência).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/charts/correlation-heatmap.tsx
git commit -m "refactor(insights): desacopla MoodDriverBoard do CorrelationHeatmap"
```

---

## Task 4: `RankingMetadataChips` — 3 chips do topo

**Files:**
- Create: `frontend/src/components/insights/ranking-metadata-chips.tsx`

**Contexto:** componente folha. 3 chips compactos com `N robustas`, `X% cobertura`, `n=Y dias`. Recebe `RankingResult` ou só os 3 valores derivados.

- [ ] **Step 1: Criar componente**

```typescript
// frontend/src/components/insights/ranking-metadata-chips.tsx
import type { RankingResult } from '@/utils/driver-ranking'

interface Props {
  ranking: RankingResult
}

export function RankingMetadataChips({ ranking }: Props) {
  const items = [
    { label: 'robustas', value: `${ranking.robustCount}` },
    { label: 'cobertura', value: `${ranking.coveragePct}%` },
    { label: 'dias pareados', value: `n=${ranking.pairedDays}` },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[0.72rem] font-semibold text-slate-600"
        >
          <span className="text-slate-900">{chip.value}</span>
          <span className="uppercase tracking-[0.14em] text-slate-400">{chip.label}</span>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Validar tsc**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/insights/ranking-metadata-chips.tsx
git commit -m "feat(insights): RankingMetadataChips (3 chips do topo)"
```

---

## Task 5: `MedicationContextStrip` — faixa contextual de medicação

**Files:**
- Create: `frontend/src/components/insights/medication-context-strip.tsx`

**Contexto:** faixa de 1 linha abaixo do top 3 com contagem de doses + timing médio. Lê `snapshots` (pra `medications.count`) e ignora `forecasted/interpolated`. Para uma versão MVP, focar em "X doses logadas em Y dias" sem timing médio (timing requer chamada a `/farma/doses` que adiciona complexidade — diferir pra iteração se Anders pedir).

**Decisão tomada inline aqui (escopo MVP):** versão inicial mostra apenas `💊 Doses logadas · {total} doses em {pairedDays} dias`. Timing médio fica como `// TODO` comentado pro próximo refino quando ticket #1 do BACKLOG (PK Coverage 3-camadas) estiver implementado.

- [ ] **Step 1: Criar componente**

```typescript
// frontend/src/components/insights/medication-context-strip.tsx
import { Pill } from 'lucide-react'
import type { DailySnapshot } from '@/types/apple-health'

interface Props {
  snapshots: DailySnapshot[]
}

export function MedicationContextStrip({ snapshots }: Props) {
  const usable = snapshots.filter((s) => !s.forecasted && !s.interpolated)
  const totalDoses = usable.reduce((sum, s) => sum + (s.medications?.count ?? 0), 0)
  const daysWithLog = usable.filter((s) => (s.medications?.count ?? 0) > 0).length
  const empty = totalDoses === 0

  // TODO(insights-redesign): timing médio vs mediana 7d quando ticket #1 do BACKLOG (PK Coverage 3-camadas) estiver implementado.

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-slate-700">
        <Pill className="h-3.5 w-3.5" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-slate-700">Doses logadas</span>
        {empty ? (
          <span className="text-slate-500">— sem doses nesta janela</span>
        ) : (
          <span className="text-slate-600">· {totalDoses} doses em {daysWithLog} {daysWithLog === 1 ? 'dia' : 'dias'} ({usable.length} no recorte)</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Validar tsc**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/insights/medication-context-strip.tsx
git commit -m "feat(insights): MedicationContextStrip (faixa contextual de medicação)"
```

---

## Task 6: `DriverRankingCard` — card individual do ranking

**Files:**
- Create: `frontend/src/components/insights/driver-ranking-card.tsx`

**Contexto:** card minimalista. Icon + título + métrica atual + sparkline 14d com baseline pontilhada + botão "Detalhes". Estado `qualified` (colorido por tom) vs `dim` (cinza). Detalhes expande inline (controlled pelo parent — `expanded` + `onToggle`).

- [ ] **Step 1: Criar componente**

```typescript
// frontend/src/components/insights/driver-ranking-card.tsx
import { Line, LineChart, ReferenceLine, ResponsiveContainer } from 'recharts'

import { ICON_MAP, type RankedDriver } from '@/utils/driver-ranking'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'

interface Props {
  driver: RankedDriver
  expanded: boolean
  onToggle: () => void
}

const toneClass: Record<RankedDriver['tone'], string> = {
  positive: 'border-teal-200 bg-teal-50/80 text-teal-900',
  watch: 'border-amber-200 bg-amber-50/80 text-amber-900',
  neutral: 'border-slate-200 bg-white/85 text-slate-800',
}

function fmt(value: number | null, precision: number, unit: string): string {
  if (value == null) return 'sem dado'
  const num = value.toLocaleString('pt-BR', { maximumFractionDigits: precision, minimumFractionDigits: precision })
  return unit ? `${num} ${unit}` : num
}

export function DriverRankingCard({ driver, expanded, onToggle }: Props) {
  const Icon = ICON_MAP[driver.iconName]
  const isDim = driver.state === 'dim'
  const baseClass = isDim ? 'border-slate-200 bg-slate-100/60 text-slate-500' : toneClass[driver.tone]
  const sparkData = driver.sparkline14d
    .filter((p) => p.value != null)
    .map((p) => ({ date: p.date, value: p.value as number }))

  return (
    <article className={`rounded-xl border p-4 transition ${baseClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/70 text-slate-700">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{driver.title}</h4>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{driver.label}</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${isDim ? 'bg-slate-200 text-slate-600' : 'bg-white/70 text-slate-500'}`}>
          n={driver.pairCount}{isDim ? ' (insuf.)' : ''}
        </span>
      </div>

      <div className="mt-4">
        <p className="font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-950">
          {fmt(driver.recentValue, driver.precision, driver.unit)}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          baseline {fmt(driver.baselineValue, driver.precision, driver.unit)}
        </p>
      </div>

      {sparkData.length >= 2 && (
        <div className="mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
            <LineChart data={sparkData}>
              {driver.baselineValue != null && (
                <ReferenceLine y={driver.baselineValue} stroke={CHART_TOKENS.reference.meanText} strokeDasharray="3 3" />
              )}
              <Line type="monotone" dataKey="value" stroke={isDim ? CHART_TOKENS.ui.axis : CHART_TOKENS.series.composite} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 inline-flex items-center rounded-md border border-slate-900/10 bg-white/70 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-600 hover:bg-white"
      >
        {expanded ? 'Fechar' : 'Detalhes'}
      </button>
    </article>
  )
}
```

- [ ] **Step 2: Validar tsc**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/insights/driver-ranking-card.tsx
git commit -m "feat(insights): DriverRankingCard com sparkline 14d e estados qualified/dim"
```

---

## Task 7: `DriverDetailPanel` — painel expandido

**Files:**
- Create: `frontend/src/components/insights/driver-detail-panel.tsx`

**Contexto:** trio: pergunta investigativa + mini-scatter driver×humor 14d com regressão + link/CTA. SEM números crus (decisão #10 da spec).

- [ ] **Step 1: Criar componente**

```typescript
// frontend/src/components/insights/driver-detail-panel.tsx
import { ArrowRight } from 'lucide-react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis, ReferenceLine, Line } from 'recharts'

import type { RankedDriver } from '@/utils/driver-ranking'
import { buildInvestigativePrompt } from '@/utils/insights-narrative'
import { CHART_TOKENS } from '@/components/charts/shared/chart-tokens'

interface Props {
  driver: RankedDriver
}

function regressionLine(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> | null {
  if (points.length < 10) return null
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  const xs = points.map(p => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  return [{ x: minX, y: slope * minX + intercept }, { x: maxX, y: slope * maxX + intercept }]
}

export function DriverDetailPanel({ driver }: Props) {
  const prompt = buildInvestigativePrompt(driver)
  const scatterPoints = driver.sparkline14d
    .filter((p) => p.value != null && p.mood != null)
    .map((p) => ({ x: p.value as number, y: p.mood as number }))
  const regression = regressionLine(scatterPoints)

  return (
    <div className="mt-3 rounded-xl border border-slate-900/10 bg-white/85 p-4 text-sm leading-6 text-slate-700">
      <p className="text-base text-slate-800">{prompt}</p>

      {scatterPoints.length >= 3 && (
        <div className="mt-4 h-44">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
              <CartesianGrid stroke={CHART_TOKENS.ui.grid} />
              <XAxis dataKey="x" name={driver.label} type="number" stroke={CHART_TOKENS.ui.axis} fontSize={11} />
              <YAxis dataKey="y" name="humor" type="number" domain={[-1, 1]} stroke={CHART_TOKENS.ui.axis} fontSize={11} />
              <ReferenceLine y={0} stroke={CHART_TOKENS.reference.meanText} strokeDasharray="2 2" />
              <Scatter data={scatterPoints} fill={CHART_TOKENS.series.composite} />
              {regression && (
                <Line
                  type="linear"
                  data={regression}
                  dataKey="y"
                  stroke={CHART_TOKENS.series.mood}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Destino natural: <span className="font-mono normal-case">{driver.chartHint}</span> <ArrowRight className="h-3 w-3" />
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Validar tsc**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/insights/driver-detail-panel.tsx
git commit -m "feat(insights): DriverDetailPanel (pergunta + scatter + link)"
```

---

## Task 8: `InsightsCockpit` — container

**Files:**
- Create: `frontend/src/components/insights/insights-cockpit.tsx`

**Contexto:** orquestra os 4 anteriores + headline. Calcula ranking, mantém estado de expansão (qual card aberto). Renderiza: headline + chips + top3 grid + medication strip + accordion "ver outros (N)".

- [ ] **Step 1: Criar componente**

```typescript
// frontend/src/components/insights/insights-cockpit.tsx
import { useMemo, useState } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import { rankDrivers } from '@/utils/driver-ranking'
import { buildCockpitHeadline } from '@/utils/insights-narrative'
import { RankingMetadataChips } from './ranking-metadata-chips'
import { MedicationContextStrip } from './medication-context-strip'
import { DriverRankingCard } from './driver-ranking-card'
import { DriverDetailPanel } from './driver-detail-panel'

interface Props {
  snapshots: DailySnapshot[]
}

export function InsightsCockpit({ snapshots }: Props) {
  const ranking = useMemo(() => rankDrivers(snapshots), [snapshots])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)

  const headline = buildCockpitHeadline(ranking)

  const toggleCard = (id: string) => setExpandedId((curr) => (curr === id ? null : id))

  return (
    <section className="rounded-[1.5rem] border border-slate-900/10 bg-white/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-700">
          Quem mexeu no humor essa janela
        </span>
        <p className="font-['Fraunces'] text-xl tracking-[-0.03em] text-slate-900">{headline}</p>
        <RankingMetadataChips ranking={ranking} />
      </header>

      {ranking.top3.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {ranking.top3.map((d) => (
            <div key={d.id} className="flex flex-col">
              <DriverRankingCard driver={d} expanded={expandedId === d.id} onToggle={() => toggleCard(d.id)} />
              {expandedId === d.id && <DriverDetailPanel driver={d} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nenhum driver atingiu n≥10 nesta janela. Aumenta a janela ou aguarda mais logs de humor pra ativar o ranking.
        </div>
      )}

      <div className="mt-4">
        <MedicationContextStrip snapshots={snapshots} />
      </div>

      {ranking.others.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3" open={othersOpen} onToggle={(e) => setOthersOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Ver outros drivers ({ranking.others.length})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {ranking.others.map((d) => (
              <div key={d.id} className="flex flex-col">
                <DriverRankingCard driver={d} expanded={expandedId === d.id} onToggle={() => toggleCard(d.id)} />
                {expandedId === d.id && <DriverDetailPanel driver={d} />}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Validar tsc**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/insights/insights-cockpit.tsx
git commit -m "feat(insights): InsightsCockpit (orquestra ranking + chips + strip + detalhes)"
```

---

## Task 9: Migrar `ForecastAccuracyCard` pro Panorama em accordion

**Files:**
- Modify: `frontend/src/App.tsx` (seção Panorama)

**Contexto:** decisão #12. ForecastAccuracyCard sai do `<details>` do Insights e vira accordion no rodapé do Panorama, junto dos 3 accordions já existentes (`PillarMiniCharts`, `PKTimelineChart`, `IndexRadarSnapshot`).

- [ ] **Step 1: Localizar o final do Panorama no `App.tsx`**

```bash
cd /root/RooCode && grep -n "IndexRadarSnapshot\|PKTimelineChart\|PillarMiniCharts" frontend/src/App.tsx | head -10
```
Identificar o accordion mais ao fundo do Panorama (provavelmente `IndexRadarSnapshot`).

- [ ] **Step 2: Adicionar accordion novo logo após o último**

Após o accordion final do Panorama, adicionar:

```tsx
<details className="rounded-[1.5rem] border border-violet-200 bg-violet-50/60 p-4">
  <summary className="cursor-pointer text-sm font-semibold text-violet-800">
    Calibração técnica · histórico de acurácia do forecast IA
  </summary>
  <div className="mt-4">
    <ForecastAccuracyCard snapshots={ranged} />
  </div>
</details>
```

Garantir que o `import { ForecastAccuracyCard } from './components/charts/forecast-accuracy-card'` permanece no topo do `App.tsx` (já existe — ele só estava sendo usado no Insights).

- [ ] **Step 3: Validar tsc + lint**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(panorama): ForecastAccuracyCard em accordion no rodapé"
```

---

## Task 10: Reorganizar a aba Insights no `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx` (seção `activeTab === 'insights'`)

**Contexto:** substituir os 3 `LabGroup` + `<details>` do forecast pelo novo cockpit + 2 `<details>` (heatmap, temp).

- [ ] **Step 1: Identificar o bloco `activeTab === 'insights'`**

```bash
cd /root/RooCode && grep -n "activeTab === 'insights'" frontend/src/App.tsx
```
Expected: linha ~864.

- [ ] **Step 2: Substituir o conteúdo do bloco**

O bloco atual (linhas 884-935 aproximadamente) substitui-se por:

```tsx
<div className="space-y-4">
  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
    <span className="font-semibold">⚠ Análise exploratória.</span>{' '}
    <span className="text-amber-700/90">
      Correlação ≠ causalidade. n pequeno = r ruidoso. Emoções momentâneas têm sampling bias
      (tu loga quando a emoção é forte). Use como hipótese, não evidência. Precisa ~60 dias de
      dados pra conclusão robusta.
    </span>
  </div>

  {ranged.length > 0 && (
    <>
      <InsightsCockpit snapshots={ranged} />

      <details className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Ver matriz de correlação completa
        </summary>
        <div className="mt-4">
          <CorrelationHeatmap snapshots={ranged} />
        </div>
      </details>

      <details className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Temperatura corporal × humor
        </summary>
        <div className="mt-4">
          <TempHumorCorrelation snapshots={ranged} />
        </div>
      </details>
    </>
  )}
</div>
```

- [ ] **Step 3: Remover imports não usados**

Após a edição, conferir e remover (se sobrarem inutilizados):
- `LabGroup` (provavelmente ainda usado em outras abas — checar antes de tirar)
- `PKVariabilityReportCard`, `PKVariabilityHumorLab`, `PKMoodScatterChart`, `LagCorrelationChart`, `ForecastAccuracyCard` (este último ainda usado no Panorama — manter)

Comando pra checar usos:
```bash
cd /root/RooCode && grep -n "PKVariabilityReportCard\|PKVariabilityHumorLab\|PKMoodScatterChart\|LagCorrelationChart" frontend/src/App.tsx
```
Se zero ocorrências sobrarem, remover os imports correspondentes.

Adicionar import novo:
```typescript
import { InsightsCockpit } from './components/insights/insights-cockpit'
```

- [ ] **Step 4: Validar tsc + lint + test**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit && npm run lint && npm run test:unit
```
Expected: zero erros, todos os testes passam.

- [ ] **Step 5: Build**

```bash
cd /root/RooCode/frontend && npm run build
```
Expected: build com sucesso (warning de chunk >500kB esperado, sem erros).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(insights): redesign da aba — cockpit + 2 details (heatmap, temp)"
```

---

## Task 11: Deletar `MoodDriverBoard` órfão

**Files:**
- Delete: `frontend/src/components/charts/mood-driver-board.tsx`

**Contexto:** após Task 10, `MoodDriverBoard` não tem mais callsite (já desacoplado do heatmap na Task 3, removido do Insights na Task 10). Lógica útil já migrou pra `driver-ranking.ts` na Task 1. Arquivo seguro pra deletar.

- [ ] **Step 1: Confirmar zero callsites**

```bash
cd /root/RooCode && grep -rn "MoodDriverBoard" frontend/src/ frontend/tests/
```
Expected: zero ocorrências (ou só auto-referência no próprio arquivo a ser deletado).

- [ ] **Step 2: Deletar arquivo**

```bash
cd /root/RooCode && rm frontend/src/components/charts/mood-driver-board.tsx
```

- [ ] **Step 3: Validar tsc**

```bash
cd /root/RooCode/frontend && npx tsc --noEmit
```
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/components/charts/mood-driver-board.tsx
git commit -m "refactor(insights): remove MoodDriverBoard órfão (lógica migrada pra driver-ranking)"
```

---

## Task 12: QA visual + validação final

**Files:** nenhuma edição. Apenas verificação.

**Contexto:** rodar bateria completa de validação + screenshot da aba Insights nova pra confirmar visual.

- [ ] **Step 1: Validação completa**

```bash
cd /root/RooCode/frontend && npm run test:unit && npx tsc --noEmit && npm run lint && npm run build
```
Expected: tudo verde, apenas warning conhecido de chunk >500kB no build.

- [ ] **Step 2: Restart do serviço backend (sanity)**

```bash
sudo systemctl restart roocode.service && sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
```
Expected: `200`.

- [ ] **Step 3: Smoke test do frontend via curl**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ultrassom.ai/health/
curl -s -o /dev/null -w "%{http_code}\n" https://ultrassom.ai/health/api/sleep
```
Expected: ambos `200`.

- [ ] **Step 4: QA visual (Playwright ou Chrome DevTools MCP)**

Abrir `https://ultrassom.ai/health/`, clicar na aba Insights, validar:
1. Banner amarelo "Análise exploratória" presente
2. Cockpit "Quem mexeu no humor essa janela" com headline + 3 chips
3. Grid de 3 cards (ou aviso de janela insuficiente se dados curtos)
4. `MedicationContextStrip` abaixo do top 3
5. Accordion "Ver outros drivers (N)" se houver
6. `<details>` "Ver matriz de correlação completa" e "Temperatura corporal × humor"
7. `<details>` do `ForecastAccuracyCard` NÃO presente em Insights (migrou pro Panorama)
8. Console sem warnings/errors críticos

Validar Panorama: scroll até o fundo, confirmar accordion novo "Calibração técnica · histórico de acurácia do forecast IA" funcionando.

- [ ] **Step 5: Sem commit — apenas registro em AGENTS.md**

Adicionar entrada cronológica em `/root/RooCode/AGENTS.md` no padrão usado, datado de hoje:

```markdown
### 2026-MM-DD HH:MM - Insights redesign aplicado (cockpit narrativo)

Context:
Implementada a spec `docs/superpowers/specs/insights-redesign.md` em 12 commits. Aba Insights virou cockpit narrativo "Quem mexeu no humor essa janela" com Top 3 + accordion + faixa de medicação. ForecastAccuracyCard migrou pro rodapé do Panorama.

Details:
[Resumir os 12 commits + decisões 13/14 + componentes novos]

Notes:
Validação completa em verde. QA visual em desktop + mobile sem regressões. MoodDriverBoard deletado (lógica migrada pra utils/driver-ranking.ts). 4 PKs preservados como arquivos sem callsite pra eventual retorno.
```

Commitar AGENTS.md atualizado:

```bash
git add /root/RooCode/AGENTS.md
git commit -m "docs(agents): registra Insights redesign aplicado"
```

---

## Self-Review

**1. Spec coverage:**

| Decisão da spec | Task que implementa |
|-----------------|---------------------|
| 1-4 (alvo, matéria-prima, tom, janela) | Implícitas no design dos componentes (sem código específico) |
| 5 (cockpit absorve MoodDriverBoard; heatmap+temp viram details) | Tasks 3, 10, 11 |
| 6 (headline + 3 chips) | Tasks 2, 4, 8 |
| 7 (card minimalista + sparkline 14d) | Task 6 |
| 8 (Top 3 + accordion; medicação fora) | Tasks 1, 8 |
| 9 (deferir eventos + faixa de medicação) | Task 5 |
| 10 (ver detalhes = pergunta + scatter + link, sem números crus) | Task 7 |
| 11 (drivers fracos sempre visíveis em cinza) | Tasks 1, 6, 8 |
| 12 (ForecastAccuracyCard → Panorama) | Task 9 |
| 13 (heatmap + temp em `<details>` próprios) | Task 10 |
| 14 (templates determinísticos) | Task 2 |

Coberta. Nenhuma decisão sem task.

**2. Placeholder scan:** Plano não contém TBD, TODO sem código, "implement later", "appropriate error handling" sem especificar, ou "similar to Task N" sem repetir código.

**3. Type consistency:** `RankedDriver`, `RankingResult`, `DriverDefinition` definidas na Task 1 e referenciadas tipo-consistente nas Tasks 2 (insights-narrative imports them), 6 (DriverRankingCard recebe `RankedDriver`), 7 (DriverDetailPanel recebe `RankedDriver`), 8 (InsightsCockpit usa `rankDrivers` + ambos os tipos).

Função `buildCockpitHeadline(ranking)` e `buildInvestigativePrompt(driver)` definidas na Task 2 e usadas na Task 7 (`buildInvestigativePrompt`) e Task 8 (`buildCockpitHeadline`). Sem drift.

Constantes nomeadas `MIN_PAIRED_DAYS_FOR_RANKING`, `ROBUST_R_THRESHOLD`, `TOP_N` exportadas na Task 1 e mencionadas nas Tasks 8 e 11 implicitamente (testes).

`ICON_MAP` exportado na Task 1 e usado na Task 6.

**Resultado do self-review:** sem gaps, sem placeholders, types consistentes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-insights-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — eu dispatcho um subagent Sonnet fresh por task, com briefing autocontido, e revisamos entre tasks. Cada subagent vê só o que precisa pra task X (não a sessão inteira). Iteração mais rápida, menos risco de drift de contexto, e respeita a `rules/subagents.md` (subagentes podem CRIAR arquivos, orquestrador edita existentes — perfeito pra ordem das tasks aqui).

**2. Inline Execution** — execução no mesmo turno via `superpowers:executing-plans`, com checkpoints entre tasks. Mais conversacional, mas consome contexto desta sessão pra cada task.

Qual abordagem?
