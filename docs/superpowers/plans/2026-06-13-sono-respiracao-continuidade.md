# Sono — Respiração Noturna & Continuidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar dois índices de sono com evidência (Respiração Noturna e Continuidade) à aba Sono do RooCode, desdobrando sinais hoje cegos dentro do `sleep-quality-score`.

**Architecture:** Frontend-only. Dois utils puros (`respiratory-load.ts`, `sleep-continuity.ts`) que derivam séries noite-a-noite de `DailySnapshot[]`, dois cards que os consomem no padrão de `sleep-architecture-card.tsx`, governança via `index-evidence.ts` + `data-readiness.ts`, e integração na aba Sono do `App.tsx`. Todos os campos brutos já chegam parseados em `DailyHealthMetrics` — sem mudança de backend/pipeline.

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + Recharts. Testes via runner custom (`node:assert/strict`, registro em `frontend/tests/run-all.test.ts`, compilação por `tsconfig.test.json`). Gate: `npx tsc --noEmit` + `npm run build` + `npm run lint` + `npm run test:unit`.

**Spec:** `docs/superpowers/specs/2026-06-13-sono-respiracao-continuidade-design.md`

**Convenções de calibração (cravadas a partir dos dados reais):**
- AHI bands (AASM, eventos/h): `<5 normal` · `5–15 leve` · `15–30 moderada` · `>30 grave`.
- Percentil pessoal: janela rolante de **30 dias reais** (exclui interpolated/forecasted), mínimo **14 pontos**. Usa **percentil empírico** (não z-score gaussiano) porque o sinal é assimétrico (média 0,70 · mediana 0,48 · máx 4,89).
- `atypical` = distúrbios da noite > **p90 pessoal**. `desaturationFlag` = SpO₂ < piso pessoal (**p10**); fallback **95%** absoluto quando baseline insuficiente. `coOccurrenceFlag` = `atypical && desaturationFlag`.
- Flags só disparam em **dias reais** (política `visual_only`): dia interpolado recebe valor com `confidence 0.7` mas nunca acende bandeira.
- Continuidade (AASM): eficiência `≥85 ideal · 75–85 limítrofe · <75 pobre`; WASO `<0,5h ideal · 0,5–1h limítrofe · >1h fragmentado`.

---

## Task 1: Util `respiratory-load.ts` (núcleo + testes)

**Files:**
- Create: `frontend/src/utils/respiratory-load.ts`
- Create: `frontend/tests/respiratory-load.test.ts`
- Modify: `frontend/tsconfig.test.json` (adicionar o util ao `include`)
- Modify: `frontend/tests/run-all.test.ts` (registrar o teste)

- [ ] **Step 1: Escrever o teste falhando** — `frontend/tests/respiratory-load.test.ts`

```ts
import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  computeRespiratoryLoadSeries,
  computeRespiratoryLoadSummary,
} from '../src/utils/respiratory-load'

function isoDate(daysBack: number): string {
  const base = new Date('2026-06-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function health(date: string, over: Partial<DailyHealthMetrics> = {}): DailyHealthMetrics {
  return {
    date,
    sleepStartAt: null, sleepEndAt: null,
    sleepTotalHours: 7.5, sleepAsleepHours: 7.0, sleepInBedHours: 8.0,
    sleepCoreHours: 4.0, sleepDeepHours: 1.4, sleepRemHours: 1.5, sleepAwakeHours: 0.4,
    sleepEfficiencyPct: 88,
    respiratoryDisturbances: 0.4, spo2: 97, respiratoryRate: 15,
    activeEnergyKcal: null, restingEnergyKcal: null,
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: null,
    pulseTemperatureC: null, exerciseMinutes: null, standingMinutes: null, daylightMinutes: null,
    hrvSdnn: null, steps: null, distanceKm: null, physicalEffort: null,
    walkingHeartRateAvg: null, walkingAsymmetryPct: null, walkingSpeedKmh: null,
    walkingStepLengthCm: null, runningSpeedKmh: null, vo2Max: null,
    sixMinuteWalkMeters: null, cardioRecoveryBpm: null,
    recordCount: 1, placeholderRestingEnergyRows: 0,
    ...over,
  }
}

function snap(daysBack: number, over: Partial<DailyHealthMetrics> = {}, flags: { interpolated?: boolean; forecasted?: boolean } = {}): DailySnapshot {
  const date = isoDate(daysBack)
  return {
    date,
    interpolated: flags.interpolated,
    forecasted: flags.forecasted,
    health: health(date, over),
    mood: null,
    medications: null,
  }
}

// Baseline real: 16 noites tranquilas (distúrbios ~0.4, spo2 ~97), depois a noite-alvo.
function baseline(target: Partial<DailyHealthMetrics>, flags: { interpolated?: boolean; forecasted?: boolean } = {}): DailySnapshot[] {
  const out: DailySnapshot[] = []
  for (let d = 16; d >= 1; d -= 1) {
    out.push(snap(d, { respiratoryDisturbances: 0.3 + (d % 3) * 0.1, spo2: 96.5 + (d % 3) * 0.3 }))
  }
  out.push(snap(0, target, flags))
  return out
}

// 1) Banda AASM absoluta da última noite.
const normalNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 0.5 })).at(-1)!
assert.equal(normalNight.ahiBand, 'normal', 'distúrbios <5 = normal')
const moderateNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 18 })).at(-1)!
assert.equal(moderateNight.ahiBand, 'moderada', '15-30 = moderada')

// 2) Atípico pessoal: noite muito acima do p90 da distribuição tranquila.
const atypicalNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 3.0 })).at(-1)!
assert.ok(atypicalNight.personalP90 != null, 'p90 pessoal disponível com 16+ noites reais')
assert.equal(atypicalNight.atypical, true, 'noite >> p90 é atípica')

// 3) Dessaturação pessoal: spo2 abaixo do piso (p10).
const desatNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 3.0, spo2: 92 })).at(-1)!
assert.equal(desatNight.desaturationFlag, true, 'spo2 92 abaixo do piso pessoal')

// 4) Co-ocorrência = atípico + dessaturação na mesma noite.
assert.equal(desatNight.coOccurrenceFlag, true, 'distúrbios atípico + dessaturação = bandeira')
assert.equal(atypicalNight.coOccurrenceFlag, false, 'só atípico sem dessaturação não é bandeira')

// 5) Dia interpolado nunca dispara flag (visual_only).
const interpNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: 3.0, spo2: 92 }, { interpolated: true })).at(-1)!
assert.equal(interpNight.atypical, false, 'interpolado não é atípico')
assert.equal(interpNight.coOccurrenceFlag, false, 'interpolado não acende bandeira')
assert.ok(Math.abs(interpNight.confidence - 0.7) < 1e-9, 'interpolado tem confidence 0.7')

// 6) Noite sem distúrbios: ponto inelegível, sem crash.
const missingNight = computeRespiratoryLoadSeries(baseline({ respiratoryDisturbances: null })).at(-1)!
assert.equal(missingNight.disturbances, null)
assert.equal(missingNight.ahiBand, null)
assert.equal(missingNight.confidence, 0)
assert.equal(missingNight.evidence.reason, 'inputs_missing')

// 7) Summary agrega janela recente real.
const summary = computeRespiratoryLoadSummary(baseline({ respiratoryDisturbances: 0.6 }))
assert.ok(summary.latest != null, 'summary tem latest')
assert.ok(summary.meanDisturbances != null && summary.meanDisturbances > 0, 'média positiva')
assert.equal(summary.currentBand, 'normal', 'média na zona normal')

console.log('respiratory-load.test.ts — all assertions passed')
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx tsc -p tsconfig.test.json`
Expected: FAIL com erro de módulo inexistente (`Cannot find module '../src/utils/respiratory-load'`) — ainda não criado nem registrado no `include`.

- [ ] **Step 3: Criar o util** — `frontend/src/utils/respiratory-load.ts`

```ts
/**
 * Respiração Noturna — quadro de vigilância respiratória do sono.
 *
 * Métrica primária: respiratoryDisturbances (proxy de AHI da Apple, agregado
 * POR NOITE — não episódios individuais). Escala híbrida: banda AASM absoluta
 * (contexto clínico) + percentil pessoal (sensibilidade na faixa real, que é
 * toda normal). Co-sinais SpO2 e taxa respiratória; co-ocorrência (distúrbios
 * atípico + dessaturação) é a assinatura que apneia real deixaria.
 *
 * Política visual_only: dia interpolado/forecastado recebe valor com confidence
 * 0.7, mas NUNCA dispara flag (atypical/desaturation/coOccurrence). Percentis
 * pessoais usam só dias reais — coerente com a regra interim das baselines.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type AhiBand = 'normal' | 'leve' | 'moderada' | 'grave'

const AHI_LEVE = 5
const AHI_MODERADA = 15
const AHI_GRAVE = 30

const PERSONAL_WINDOW_DAYS = 30
const PERSONAL_MIN_POINTS = 14
const SPO2_ABSOLUTE_FLOOR = 95
const SUMMARY_WINDOW_DAYS = 14
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export interface RespiratoryLoadPoint {
  date: string
  disturbances: number | null
  ahiBand: AhiBand | null
  personalP90: number | null
  atypical: boolean
  spo2: number | null
  spo2Floor: number | null
  respiratoryRate: number | null
  desaturationFlag: boolean
  coOccurrenceFlag: boolean
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface RespiratoryLoadSummary {
  latest: RespiratoryLoadPoint | null
  meanDisturbances: number | null
  currentBand: AhiBand | null
  atypicalNights: number
  coOccurrenceNights: number
  nightsUsed: number
}

function bandOfAhi(value: number): AhiBand {
  if (value < AHI_LEVE) return 'normal'
  if (value < AHI_MODERADA) return 'leve'
  if (value < AHI_GRAVE) return 'moderada'
  return 'grave'
}

// Percentil empírico com interpolação linear (padrão dos helpers do codebase).
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (base + 1 < sorted.length) return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  return sorted[base]
}

function realValues(
  snapshots: ReadonlyArray<DailySnapshot>,
  pick: (s: DailySnapshot) => number | null | undefined,
): number[] {
  const out: number[] = []
  for (const s of snapshots) {
    if (s.interpolated || s.forecasted) continue
    const v = pick(s)
    if (v != null && Number.isFinite(v)) out.push(v)
  }
  return out
}

export function computeRespiratoryLoadSeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): RespiratoryLoadPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.respiratoryLoadIndex,
    'RespiratoryLoad',
  )

  return snapshots.map((snap, idx) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const disturbances = snap.health?.respiratoryDisturbances ?? null
    const spo2 = snap.health?.spo2 ?? null
    const respiratoryRate = snap.health?.respiratoryRate ?? null

    // Janela rolante de dias reais ATÉ esta noite (inclusive).
    const past = snapshots.slice(0, idx + 1)
    const distWindow = realValues(past, (s) => s.health?.respiratoryDisturbances).slice(-PERSONAL_WINDOW_DAYS)
    const spo2Window = realValues(past, (s) => s.health?.spo2).slice(-PERSONAL_WINDOW_DAYS)

    const personalP90 =
      distWindow.length >= PERSONAL_MIN_POINTS
        ? quantileSorted([...distWindow].sort((a, b) => a - b), 0.9)
        : null
    const spo2Floor =
      spo2Window.length >= PERSONAL_MIN_POINTS
        ? quantileSorted([...spo2Window].sort((a, b) => a - b), 0.1)
        : null

    const ahiBand = disturbances != null ? bandOfAhi(disturbances) : null
    const atypical =
      !derivedFromInterpolated && disturbances != null && personalP90 != null
        ? disturbances > personalP90
        : false
    const effectiveFloor = spo2Floor ?? SPO2_ABSOLUTE_FLOOR
    const desaturationFlag =
      !derivedFromInterpolated && spo2 != null ? spo2 < effectiveFloor : false
    const coOccurrenceFlag = atypical && desaturationFlag

    const hasPrimary = disturbances != null
    const confidence = hasPrimary ? (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) : 0

    const inputsUsed: string[] = []
    if (disturbances != null) inputsUsed.push('respiratoryDisturbances')
    if (spo2 != null) inputsUsed.push('spo2')
    if (respiratoryRate != null) inputsUsed.push('respiratoryRate')

    return {
      date: snap.date,
      disturbances,
      ahiBand,
      personalP90,
      atypical,
      spo2,
      spo2Floor,
      respiratoryRate,
      desaturationFlag,
      coOccurrenceFlag,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: hasPrimary && readiness.status !== 'standby',
        reason: hasPrimary
          ? readiness.status === 'standby'
            ? 'insufficient_readiness'
            : 'ok'
          : 'inputs_missing',
        inputsUsed,
        inputsMissing: hasPrimary ? [] : ['respiratoryDisturbances'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeRespiratoryLoadSummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): RespiratoryLoadSummary {
  const series = computeRespiratoryLoadSeries(snapshots)
  const withDist = series.filter((p) => p.disturbances != null)
  const recent = withDist.slice(-SUMMARY_WINDOW_DAYS)
  const latest = withDist.length ? withDist[withDist.length - 1] : null

  const realRecent = recent.filter((p) => !p.derivedFromInterpolated)
  const meanDisturbances =
    realRecent.length > 0
      ? realRecent.reduce((acc, p) => acc + (p.disturbances as number), 0) / realRecent.length
      : null
  const currentBand = meanDisturbances != null ? bandOfAhi(meanDisturbances) : null

  return {
    latest,
    meanDisturbances,
    currentBand,
    atypicalNights: recent.filter((p) => p.atypical).length,
    coOccurrenceNights: recent.filter((p) => p.coOccurrenceFlag).length,
    nightsUsed: realRecent.length,
  }
}
```

- [ ] **Step 4: Registrar o util no `tsconfig.test.json`**

Em `frontend/tsconfig.test.json`, no array `include`, adicionar a linha (após `"src/utils/sleep-debt.ts",`):

```json
    "src/utils/respiratory-load.ts",
```

- [ ] **Step 5: Registrar o teste no `run-all.test.ts`**

Em `frontend/tests/run-all.test.ts`, adicionar ao fim da lista de imports:

```ts
import './respiratory-load.test'
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd frontend && npm run test:unit`
Expected: PASS — saída inclui `respiratory-load.test.ts — all assertions passed`. O `data-readiness.ts` ainda não tem `respiratoryLoadIndex`; **se o tsc reclamar** de `CHART_REQUIREMENTS.respiratoryLoadIndex`, isso é esperado e resolvido na Task 2 — execute a Task 2 antes de rodar o gate. (Para isolar o util agora, a Task 2 já deve estar feita em sequência; este plano ordena `data-readiness`/matriz como Task 2.)

> **Nota de ordenação:** Tasks 1 e 2 são acopladas pelo `readinessKey`. Execute Step 1–5 da Task 1, depois Task 2 inteira, e só então rode o gate (Task 1 Step 6 + Task 2). Commit único ao fim da Task 2.

---

## Task 2: Governança — `data-readiness.ts` + `index-evidence.ts` + teste da matriz

**Files:**
- Modify: `frontend/src/utils/data-readiness.ts` (novo `respiratoryLoadIndex` em `CHART_REQUIREMENTS`)
- Modify: `frontend/src/utils/index-evidence.ts` (novo id `RespiratoryLoad` no union + entrada na matriz)
- Modify: `frontend/tests/index-evidence-matrix.test.ts` (adicionar id ao `expectedIds`)

- [ ] **Step 1: Adicionar requirement em `data-readiness.ts`**

Em `CHART_REQUIREMENTS` (após `sleepArchitectureIndex: {...},`):

```ts
  respiratoryLoadIndex: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'respiratoryDisturbances' },
```

- [ ] **Step 2: Adicionar id e spec em `index-evidence.ts`**

No union `IndexEvidenceId`, adicionar após `'SleepArchitecture'`:

```ts
  | 'RespiratoryLoad'
```

No `INDEX_EVIDENCE_MATRIX`, adicionar a entrada (após o bloco `SleepArchitecture`):

```ts
  RespiratoryLoad: {
    id: 'RespiratoryLoad',
    domain: 'sono',
    interpolationPolicy: 'visual_only',
    minimumInputs: 1,
    readinessKey: 'respiratoryLoadIndex',
    confidenceRule: 'confidence = 1 real / 0.7 interpolado; flags (atípico/dessaturação/co-ocorrência) só em dias reais',
    primarySources: [
      { field: 'respiratoryDisturbances', kind: 'primary', note: 'proxy de AHI da Apple, agregado por noite — não episódios individuais' },
    ],
    proxySources: [],
    derivedSources: [
      { field: 'spo2', kind: 'derived', note: 'co-sinal de dessaturação; piso pessoal p10 (fallback 95%)' },
      { field: 'respiratoryRate', kind: 'derived', note: 'co-sinal de carga respiratória noturna' },
      { field: 'personalP90', kind: 'derived', note: 'limiar de noite atípica vs distribuição pessoal' },
    ],
  },
```

- [ ] **Step 3: Atualizar o teste de lista fechada da matriz**

Em `frontend/tests/index-evidence-matrix.test.ts`, adicionar `'RespiratoryLoad'` ao array `expectedIds` (após `'SleepArchitecture',`). O `assert.equal(Object.keys(...).length, expectedIds.length)` continua válido.

- [ ] **Step 4: Rodar o gate completo (fecha Task 1 + Task 2)**

Run: `cd frontend && npx tsc --noEmit && npm run test:unit`
Expected: PASS — `respiratory-load.test.ts — all assertions passed` e `index-evidence-matrix.test.ts — matrix contracts ok`.

- [ ] **Step 5: Commit**

```bash
cd /root/RooCode/.claude/worktrees/thirsty-turing-07d955
git add frontend/src/utils/respiratory-load.ts frontend/tests/respiratory-load.test.ts \
  frontend/tsconfig.test.json frontend/tests/run-all.test.ts \
  frontend/src/utils/data-readiness.ts frontend/src/utils/index-evidence.ts \
  frontend/tests/index-evidence-matrix.test.ts
git commit -m "$(cat <<'EOF'
feat(sono): índice Respiração Noturna (proxy-apneia + SpO2 + taxa resp)

Métrica primária respiratoryDisturbances com escala híbrida (banda AASM
absoluta + percentil pessoal p90 sobre 30d reais). Co-sinais SpO2/taxa resp
com flag de co-ocorrência (atípico + dessaturação). Política visual_only:
interpolado não dispara bandeira. Governança na matriz de evidência.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Card `RespiratoryLoadCard`

**Files:**
- Create: `frontend/src/components/cards/respiratory-load-card.tsx`

- [ ] **Step 1: Criar o card** — segue o padrão visual de `sleep-architecture-card.tsx` (mesmas classes de container dark, kicker, título Fraunces, badge, grid de articles, `<details>` de contexto clínico). Consome `computeRespiratoryLoadSummary`.

```tsx
import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeRespiratoryLoadSummary,
  type AhiBand,
} from '@/utils/respiratory-load'

interface RespiratoryLoadCardProps {
  snapshots: DailySnapshot[]
}

const BAND_STYLE: Record<AhiBand, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  leve: { label: 'Leve', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  moderada: { label: 'Moderada', cls: 'border-orange-200 dark:border-orange-400/30 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  grave: { label: 'Grave', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

function fmt(value: number | null, digits = 1, suffix = ''): string {
  return value != null ? `${value.toFixed(digits)}${suffix}` : '--'
}

export function RespiratoryLoadCard({ snapshots }: RespiratoryLoadCardProps) {
  const summary = useMemo(() => computeRespiratoryLoadSummary(snapshots), [snapshots])
  if (!snapshots.length) return null

  const latest = summary.latest
  const band = summary.currentBand
  const bandStyle = band
    ? BAND_STYLE[band]
    : { label: 'Coletando', cls: 'border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300' }

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Respiração noturna
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Como respirei dormindo?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Distúrbios respiratórios (proxy de AHI da Apple, agregado por noite) com SpO₂ e taxa respiratória como co-sinais.
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-['Fraunces'] text-5xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">
            {fmt(summary.meanDisturbances, 2)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">eventos/h · média recente</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${bandStyle.cls}`}>
          {bandStyle.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Última noite</p>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{fmt(latest?.disturbances ?? null, 2)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{latest?.atypical ? 'atípica pra ti' : 'dentro do teu padrão'}</p>
        </article>
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">SpO₂</p>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{fmt(latest?.spo2 ?? null, 0, '%')}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{latest?.desaturationFlag ? 'abaixo do teu piso' : 'estável'}</p>
        </article>
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Taxa resp.</p>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{fmt(latest?.respiratoryRate ?? null, 0)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">resp/min</p>
        </article>
      </div>

      {summary.coOccurrenceNights > 0 && (
        <p className="mt-4 rounded-2xl border border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-700 dark:text-rose-300">
          <span className="font-semibold">Atenção:</span> {summary.coOccurrenceNights} noite(s) na janela com distúrbios atípicos E dessaturação juntos — vale observar.
        </p>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Proxy de AHI: &lt;5 normal, 5–15 leve, 15–30 moderada, &gt;30 grave (AASM). O dado é uma taxa média por noite, não episódios individuais. "Atípica pra ti" usa o p90 da tua distribuição pessoal (30 dias). Vigilância de tendência, não diagnóstico.
        </p>
      </details>
    </div>
  )
}
```

- [ ] **Step 2: Rodar tsc e confirmar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS, sem erros.

- [ ] **Step 3: Commit**

```bash
cd /root/RooCode/.claude/worktrees/thirsty-turing-07d955
git add frontend/src/components/cards/respiratory-load-card.tsx
git commit -m "$(cat <<'EOF'
feat(sono): card Respiração Noturna

Consome computeRespiratoryLoadSummary; banda AASM, última noite vs padrão
pessoal, co-sinais SpO2/taxa resp e callout de co-ocorrência. Padrão visual
dark do sleep-architecture-card.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Util `sleep-continuity.ts` (núcleo + testes)

**Files:**
- Create: `frontend/src/utils/sleep-continuity.ts`
- Create: `frontend/tests/sleep-continuity.test.ts`
- Modify: `frontend/tsconfig.test.json` (adicionar o util ao `include`)
- Modify: `frontend/tests/run-all.test.ts` (registrar o teste)
- Modify: `frontend/src/utils/data-readiness.ts` (novo `sleepContinuityIndex`)
- Modify: `frontend/src/utils/index-evidence.ts` (id `SleepContinuity` + spec)
- Modify: `frontend/tests/index-evidence-matrix.test.ts` (adicionar id ao `expectedIds`)

- [ ] **Step 1: Escrever o teste falhando** — `frontend/tests/sleep-continuity.test.ts`

```ts
import assert from 'node:assert/strict'

import type { DailySnapshot, DailyHealthMetrics } from '../src/types/apple-health'
import {
  computeSleepContinuitySeries,
  computeSleepContinuitySummary,
} from '../src/utils/sleep-continuity'

function isoDate(daysBack: number): string {
  const base = new Date('2026-06-10T00:00:00Z')
  base.setUTCDate(base.getUTCDate() - daysBack)
  return base.toISOString().slice(0, 10)
}

function health(date: string, over: Partial<DailyHealthMetrics> = {}): DailyHealthMetrics {
  return {
    date,
    sleepStartAt: null, sleepEndAt: null,
    sleepTotalHours: 7.5, sleepAsleepHours: 7.0, sleepInBedHours: 8.0,
    sleepCoreHours: 4.0, sleepDeepHours: 1.4, sleepRemHours: 1.5, sleepAwakeHours: 0.4,
    sleepEfficiencyPct: 88,
    respiratoryDisturbances: 0.4, spo2: 97, respiratoryRate: 15,
    activeEnergyKcal: null, restingEnergyKcal: null,
    heartRateMin: null, heartRateMax: null, heartRateMean: null, restingHeartRate: null,
    pulseTemperatureC: null, exerciseMinutes: null, standingMinutes: null, daylightMinutes: null,
    hrvSdnn: null, steps: null, distanceKm: null, physicalEffort: null,
    walkingHeartRateAvg: null, walkingAsymmetryPct: null, walkingSpeedKmh: null,
    walkingStepLengthCm: null, runningSpeedKmh: null, vo2Max: null,
    sixMinuteWalkMeters: null, cardioRecoveryBpm: null,
    recordCount: 1, placeholderRestingEnergyRows: 0,
    ...over,
  }
}

function snap(daysBack: number, over: Partial<DailyHealthMetrics> = {}, flags: { interpolated?: boolean; forecasted?: boolean } = {}): DailySnapshot {
  const date = isoDate(daysBack)
  return { date, interpolated: flags.interpolated, forecasted: flags.forecasted, health: health(date, over), mood: null, medications: null }
}

// 1) Bandas AASM de eficiência.
const ideal = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 92 })]).at(-1)!
assert.equal(ideal.efficiencyBand, 'ideal', 'eff >=85 = ideal')
const limit = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 80 })]).at(-1)!
assert.equal(limit.efficiencyBand, 'limitrofe', '75-85 = limítrofe')
const poor = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: 70 })]).at(-1)!
assert.equal(poor.efficiencyBand, 'pobre', '<75 = pobre')

// 2) Bandas de WASO.
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 0.3 })]).at(-1)!.wasoBand, 'ideal', '<0.5h = ideal')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 0.8 })]).at(-1)!.wasoBand, 'limitrofe', '0.5-1h = limítrofe')
assert.equal(computeSleepContinuitySeries([snap(0, { sleepAwakeHours: 1.4 })]).at(-1)!.wasoBand, 'fragmentado', '>1h = fragmentado')

// 3) Fallback de eficiência: sem sleepEfficiencyPct, calcula de asleep/inBed.
const fallback = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: null, sleepAsleepHours: 7.2, sleepInBedHours: 8.0 })]).at(-1)!
assert.ok(fallback.efficiencyPct != null && Math.abs(fallback.efficiencyPct - 90) < 1e-9, 'eficiência derivada = 7.2/8.0 = 90%')

// 4) Dados faltantes: ponto sem eficiência nem WASO.
const missing = computeSleepContinuitySeries([snap(0, { sleepEfficiencyPct: null, sleepAsleepHours: null, sleepInBedHours: null, sleepAwakeHours: null })]).at(-1)!
assert.equal(missing.efficiencyPct, null)
assert.equal(missing.efficiencyBand, null)
assert.equal(missing.wasoHours, null)
assert.equal(missing.wasoBand, null)

// 5) Confidence interpolado.
const interp = computeSleepContinuitySeries([snap(0, {}, { interpolated: true })]).at(-1)!
assert.ok(Math.abs(interp.confidence - 0.7) < 1e-9, 'interpolado tem confidence 0.7')

// 6) Summary médias da janela real.
const dataset: DailySnapshot[] = []
for (let d = 9; d >= 0; d -= 1) dataset.push(snap(d, { sleepEfficiencyPct: 86 + (d % 3), sleepAwakeHours: 0.4 }))
const summary = computeSleepContinuitySummary(dataset)
assert.ok(summary.latest != null)
assert.ok(summary.meanEfficiencyPct != null && summary.meanEfficiencyPct > 85, 'média de eficiência alta')
assert.ok(summary.meanWasoHours != null && Math.abs(summary.meanWasoHours - 0.4) < 1e-9, 'WASO médio 0.4h')

console.log('sleep-continuity.test.ts — all assertions passed')
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx tsc -p tsconfig.test.json`
Expected: FAIL (`Cannot find module '../src/utils/sleep-continuity'`).

- [ ] **Step 3: Criar o util** — `frontend/src/utils/sleep-continuity.ts`

```ts
/**
 * Continuidade do sono — leitura clínica direta (sem score 0-100).
 *
 * Eficiência = asleep/inBed (prefere sleepEfficiencyPct derivado; recalcula dos
 * brutos como fallback). WASO = sleepAwakeHours. Faixas AASM clássicas. Os
 * componentes já entram diluídos no sleep-quality-score; aqui ganham superfície
 * própria. Política visual_only: interpolado recebe confidence 0.7.
 */
import type { DailySnapshot } from '@/types/apple-health'
import { CHART_REQUIREMENTS, evaluateReadiness } from './data-readiness'
import { buildIndexEvidenceReport, type IndexEvidenceReport } from './index-evidence'

export type EfficiencyBand = 'ideal' | 'limitrofe' | 'pobre'
export type WasoBand = 'ideal' | 'limitrofe' | 'fragmentado'

const EFF_IDEAL = 85
const EFF_LIMIT = 75
const WASO_IDEAL_H = 0.5
const WASO_LIMIT_H = 1.0
const SUMMARY_WINDOW_DAYS = 14
const INTERP_CONFIDENCE_MULTIPLIER = 0.7

export interface SleepContinuityPoint {
  date: string
  efficiencyPct: number | null
  efficiencyBand: EfficiencyBand | null
  wasoHours: number | null
  wasoBand: WasoBand | null
  confidence: number
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface SleepContinuitySummary {
  latest: SleepContinuityPoint | null
  meanEfficiencyPct: number | null
  meanWasoHours: number | null
  nightsUsed: number
}

function effBand(pct: number): EfficiencyBand {
  if (pct >= EFF_IDEAL) return 'ideal'
  if (pct >= EFF_LIMIT) return 'limitrofe'
  return 'pobre'
}

function wasoBand(hours: number): WasoBand {
  if (hours < WASO_IDEAL_H) return 'ideal'
  if (hours <= WASO_LIMIT_H) return 'limitrofe'
  return 'fragmentado'
}

function efficiencyOf(snap: DailySnapshot): number | null {
  const direct = snap.health?.sleepEfficiencyPct
  if (direct != null && Number.isFinite(direct)) return direct
  const asleep = snap.health?.sleepAsleepHours
  const inBed = snap.health?.sleepInBedHours
  if (asleep != null && inBed != null && Number.isFinite(asleep) && Number.isFinite(inBed) && inBed > 0) {
    return (asleep / inBed) * 100
  }
  return null
}

export function computeSleepContinuitySeries(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepContinuityPoint[] {
  const readiness = evaluateReadiness(
    snapshots as DailySnapshot[],
    CHART_REQUIREMENTS.sleepContinuityIndex,
    'SleepContinuity',
  )

  return snapshots.map((snap) => {
    const derivedFromInterpolated = !!(snap.interpolated || snap.forecasted)
    const efficiencyPct = efficiencyOf(snap)
    const wasoRaw = snap.health?.sleepAwakeHours
    const wasoHours = wasoRaw != null && Number.isFinite(wasoRaw) ? wasoRaw : null

    const inputsUsed: string[] = []
    if (efficiencyPct != null) inputsUsed.push('sleepEfficiencyPct')
    if (wasoHours != null) inputsUsed.push('sleepAwakeHours')
    const hasAny = inputsUsed.length > 0
    const confidence = hasAny ? (derivedFromInterpolated ? INTERP_CONFIDENCE_MULTIPLIER : 1) : 0

    return {
      date: snap.date,
      efficiencyPct,
      efficiencyBand: efficiencyPct != null ? effBand(efficiencyPct) : null,
      wasoHours,
      wasoBand: wasoHours != null ? wasoBand(wasoHours) : null,
      confidence,
      derivedFromInterpolated,
      evidence: buildIndexEvidenceReport({
        eligible: hasAny && readiness.status !== 'standby',
        reason: hasAny
          ? readiness.status === 'standby'
            ? 'insufficient_readiness'
            : 'ok'
          : 'inputs_missing',
        inputsUsed,
        inputsMissing: hasAny ? [] : ['sleepEfficiencyPct', 'sleepAwakeHours'],
        proxiesUsed: [],
        usedInterpolated: derivedFromInterpolated,
        confidencePenalty: confidence,
        readiness: readiness.status,
      }),
    }
  })
}

export function computeSleepContinuitySummary(
  snapshots: ReadonlyArray<DailySnapshot>,
): SleepContinuitySummary {
  const series = computeSleepContinuitySeries(snapshots)
  const recent = series.slice(-SUMMARY_WINDOW_DAYS).filter((p) => !p.derivedFromInterpolated)
  const latest = series.filter((p) => p.efficiencyPct != null || p.wasoHours != null).at(-1) ?? null

  const effs = recent.map((p) => p.efficiencyPct).filter((v): v is number => v != null)
  const wasos = recent.map((p) => p.wasoHours).filter((v): v is number => v != null)
  const mean = (arr: number[]): number | null => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

  return {
    latest,
    meanEfficiencyPct: mean(effs),
    meanWasoHours: mean(wasos),
    nightsUsed: recent.length,
  }
}
```

- [ ] **Step 4: Registrar util + teste + governança**

`frontend/tsconfig.test.json` include (após a linha do `respiratory-load.ts`):
```json
    "src/utils/sleep-continuity.ts",
```

`frontend/tests/run-all.test.ts` (ao fim dos imports):
```ts
import './sleep-continuity.test'
```

`frontend/src/utils/data-readiness.ts` em `CHART_REQUIREMENTS` (após `respiratoryLoadIndex`):
```ts
  sleepContinuityIndex: { type: 'days', robustMin: 21, exploratoryMin: 10, collectingMin: 5, field: 'sleepEfficiencyPct' },
```

`frontend/src/utils/index-evidence.ts` — union (após `'RespiratoryLoad'`):
```ts
  | 'SleepContinuity'
```

`INDEX_EVIDENCE_MATRIX` (após o bloco `RespiratoryLoad`):
```ts
  SleepContinuity: {
    id: 'SleepContinuity',
    domain: 'sono',
    interpolationPolicy: 'visual_only',
    minimumInputs: 1,
    readinessKey: 'sleepContinuityIndex',
    confidenceRule: 'confidence = 1 real / 0.7 interpolado; leitura direta sem score composto',
    primarySources: [
      { field: 'sleepEfficiencyPct', kind: 'primary', note: 'eficiência do sono (asleep/inBed), faixa AASM >=85%' },
      { field: 'sleepAwakeHours', kind: 'primary', note: 'WASO — tempo acordado, faixa AASM <30min' },
    ],
    proxySources: [
      { field: 'sleepAsleepHours+sleepInBedHours', kind: 'proxy', note: 'recálculo de eficiência quando sleepEfficiencyPct falta' },
    ],
    derivedSources: [],
  },
```

`frontend/tests/index-evidence-matrix.test.ts` — adicionar `'SleepContinuity'` ao `expectedIds` (após `'RespiratoryLoad',`).

- [ ] **Step 5: Rodar o gate e confirmar que passa**

Run: `cd frontend && npx tsc --noEmit && npm run test:unit`
Expected: PASS — `sleep-continuity.test.ts — all assertions passed` e `index-evidence-matrix.test.ts — matrix contracts ok`.

- [ ] **Step 6: Commit**

```bash
cd /root/RooCode/.claude/worktrees/thirsty-turing-07d955
git add frontend/src/utils/sleep-continuity.ts frontend/tests/sleep-continuity.test.ts \
  frontend/tsconfig.test.json frontend/tests/run-all.test.ts \
  frontend/src/utils/data-readiness.ts frontend/src/utils/index-evidence.ts \
  frontend/tests/index-evidence-matrix.test.ts
git commit -m "$(cat <<'EOF'
feat(sono): índice Continuidade do sono (eficiência + WASO, faixas AASM)

Leitura clínica direta sem score 0-100. Eficiência prefere sleepEfficiencyPct
com fallback asleep/inBed; WASO de sleepAwakeHours. Governança na matriz.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Card `SleepContinuityCard`

**Files:**
- Create: `frontend/src/components/cards/sleep-continuity-card.tsx`

- [ ] **Step 1: Criar o card** — padrão de `sleep-architecture-card.tsx`, consumindo `computeSleepContinuitySummary`. Dois articles (Eficiência, WASO) com badge de banda; sem badge de score global.

```tsx
import { useMemo } from 'react'

import type { DailySnapshot } from '@/types/apple-health'
import {
  computeSleepContinuitySummary,
  type EfficiencyBand,
  type WasoBand,
} from '@/utils/sleep-continuity'

interface SleepContinuityCardProps {
  snapshots: DailySnapshot[]
}

const EFF_STYLE: Record<EfficiencyBand, { label: string; cls: string }> = {
  ideal: { label: 'Ideal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  limitrofe: { label: 'Limítrofe', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  pobre: { label: 'Pobre', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

const WASO_STYLE: Record<WasoBand, { label: string; cls: string }> = {
  ideal: { label: 'Ideal', cls: 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  limitrofe: { label: 'Limítrofe', cls: 'border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  fragmentado: { label: 'Fragmentado', cls: 'border-rose-200 dark:border-rose-400/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

export function SleepContinuityCard({ snapshots }: SleepContinuityCardProps) {
  const summary = useMemo(() => computeSleepContinuitySummary(snapshots), [snapshots])
  if (!snapshots.length) return null

  const latest = summary.latest
  const effPct = latest?.efficiencyPct ?? null
  const wasoMin = latest?.wasoHours != null ? latest.wasoHours * 60 : null

  return (
    <div className="rounded-[1.5rem] border border-slate-900/10 dark:border-slate-100/10 bg-white/85 dark:bg-slate-900/85 p-5 shadow-[0_18px_42px_rgba(17,35,30,0.08)] backdrop-blur">
      <span className="inline-flex rounded-full border border-slate-900/10 dark:border-slate-100/10 bg-slate-50 dark:bg-slate-800/40 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
        Continuidade
      </span>
      <h3 className="mt-3 font-['Fraunces'] text-2xl tracking-[-0.04em] text-slate-900 dark:text-slate-100">Meu sono foi contínuo?</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Eficiência (tempo dormindo sobre tempo na cama) e WASO (tempo acordado após adormecer), contra faixas AASM.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Eficiência</p>
            {latest?.efficiencyBand && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${EFF_STYLE[latest.efficiencyBand].cls}`}>
                {EFF_STYLE[latest.efficiencyBand].label}
              </span>
            )}
          </div>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{effPct != null ? `${effPct.toFixed(0)}%` : '--'}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            média {summary.meanEfficiencyPct != null ? `${summary.meanEfficiencyPct.toFixed(0)}%` : '--'} · ideal ≥85%
          </p>
        </article>

        <article className="rounded-2xl border border-slate-900/10 dark:border-slate-100/10 bg-slate-50/80 dark:bg-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">WASO</p>
            {latest?.wasoBand && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${WASO_STYLE[latest.wasoBand].cls}`}>
                {WASO_STYLE[latest.wasoBand].label}
              </span>
            )}
          </div>
          <p className="mt-2 font-['Fraunces'] text-3xl tracking-[-0.06em] text-slate-900 dark:text-slate-100">{wasoMin != null ? `${wasoMin.toFixed(0)} min` : '--'}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            média {summary.meanWasoHours != null ? `${(summary.meanWasoHours * 60).toFixed(0)} min` : '--'} · ideal &lt;30min
          </p>
        </article>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600">
          Contexto clínico
        </summary>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Eficiência ≥85% e WASO &lt;30min são thresholds AASM de sono consolidado. Sem latência de início (o export não separa o horário de deitar do adormecer). Leitura direta, não diagnóstico.
        </p>
      </details>
    </div>
  )
}
```

- [ ] **Step 2: Rodar tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /root/RooCode/.claude/worktrees/thirsty-turing-07d955
git add frontend/src/components/cards/sleep-continuity-card.tsx
git commit -m "$(cat <<'EOF'
feat(sono): card Continuidade do sono

Eficiência + WASO com badges de faixa AASM e médias da janela. Leitura
clínica direta no padrão visual dark dos cards de sono.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Integração na aba Sono (`App.tsx`)

**Files:**
- Modify: `frontend/src/App.tsx` (imports + nova `DecisionSection` na aba Sono, ~linha 950)

- [ ] **Step 1: Adicionar imports**

Junto dos imports de cards (perto da linha 24, `SleepArchitectureCard`):

```tsx
import { RespiratoryLoadCard } from '@/components/cards/respiratory-load-card'
import { SleepContinuityCard } from '@/components/cards/sleep-continuity-card'
```

- [ ] **Step 2: Renderizar os cards na aba Sono**

Em `App.tsx`, dentro do bloco `activeTab === 'sono'`, **após** a `DecisionSection` "Arquitetura da noite" (que fecha em `</DecisionSection>` na ~linha 952) e **antes** da seção "Estimulante × sono", inserir:

```tsx
                  <DecisionSection
                    eyebrow="Respiração & continuidade"
                    title="Como respirei e quão contínuo foi o sono?"
                    description="Vigilância respiratória noturna (proxy de apneia, agregado por noite) e a continuidade do sono em leitura clínica direta."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <RespiratoryLoadCard snapshots={ranged} />
                      <SleepContinuityCard snapshots={ranged} />
                    </div>
                  </DecisionSection>
```

- [ ] **Step 3: Gate completo**

Run: `cd frontend && npx tsc --noEmit && npm run build && npm run lint && npm run test:unit`
Expected: todos PASS. Build sem erro, lint limpo, testes com as duas novas linhas de `all assertions passed`.

- [ ] **Step 4: Commit**

```bash
cd /root/RooCode/.claude/worktrees/thirsty-turing-07d955
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(sono): integra Respiração Noturna + Continuidade na aba Sono

Nova DecisionSection com os dois cards lado a lado, após Arquitetura da noite.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: QA visual + registro no BACKLOG (inclui ticket do bug do cap=30)

**Files:**
- Modify: `BACKLOG.md`
- Modify: `frontend/src/utils/sleep-quality-score.ts` (apenas comentário de aviso, sem mudar lógica)

- [ ] **Step 1: Restart do serviço e verificação de runtime**

```bash
sudo systemctl restart roocode.service
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
curl -s -o /dev/null -w "%{http_code}\n" https://ultrassom.ai/health/
```
Expected: `active`, `200`, `200`.

- [ ] **Step 2: QA visual desktop + mobile dark** (Chrome DevTools MCP ou Playwright)

Abrir `https://ultrassom.ai/health/`, aba Sono, em 1440×1000 e 390×844 dark. Verificar:
- Os dois cards novos renderizam sem ilhas claras (fundo dark consistente).
- Sem overflow horizontal no mobile; grid colapsa pra 1 coluna.
- Sem warning/erro de console.
- Callout de co-ocorrência só aparece se houver noite com bandeira (pode não aparecer — esperado, faixa normal).

- [ ] **Step 3: Marcar o bug do cap=30 no código** — comentário em `sleep-quality-score.ts`, logo acima de `const RESP_DIST_CAP = 30`:

```ts
// NOTA (2026-06-13): cap=30 (escala AHI clínico) satura o componente na faixa
// real do usuário (0–4.9), deixando-o quase cego. O índice dedicado Respiração
// Noturna (respiratory-load.ts) já usa escala calibrada. Recalibrar este cap é
// ticket separado no BACKLOG — muda a semântica do score histórico.
```

- [ ] **Step 4: Registrar no BACKLOG.md** — em "Pendentes", adicionar o ticket do bug; em "Concluídos recentes", a frente:

```markdown
## Pendentes

- **Bug calibração `RESP_DIST_CAP`** — `sleep-quality-score.ts` usa cap=30 (escala
  AHI clínico) que satura o componente respiratório na faixa real (0–4,9), deixando-o
  cego. Recalibrar (cap realista ~5–8 ou percentil pessoal). Trade-off: muda a
  semântica do score histórico de qualidade — commit próprio, com nota de
  comparabilidade temporal. O índice dedicado Respiração Noturna já contorna isso.
```

```markdown
- **2026-06-13** — **Sono: Respiração Noturna + Continuidade (frente de 4 commits)**.
  Dois índices novos na aba Sono desdobrando sinais antes cegos no quality-score.
  (1) Respiração Noturna: `respiratory-load.ts` — proxy-apneia (respiratoryDisturbances)
  com escala híbrida banda AASM + percentil pessoal p90 (30d reais), co-sinais SpO2/taxa
  resp, flag de co-ocorrência (atípico + dessaturação), política visual_only. (2)
  Continuidade: `sleep-continuity.ts` — eficiência + WASO em faixas AASM, leitura direta
  sem score. Governança na matriz de evidência (2 ids novos, domain 'sono'). HRV descartada
  por dado empírico (r=+0,28). Bug do cap=30 registrado como ticket separado. Gate verde:
  tsc/build/lint/test:unit. Spec/plan em `docs/superpowers/`.
```

- [ ] **Step 5: Commit**

```bash
cd /root/RooCode/.claude/worktrees/thirsty-turing-07d955
git add BACKLOG.md frontend/src/utils/sleep-quality-score.ts
git commit -m "$(cat <<'EOF'
docs(backlog): fecha frente Sono Respiração+Continuidade, abre ticket cap=30

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (executado na escrita do plano)

**Spec coverage:**
- Respiração Noturna (primário + escala híbrida + co-ocorrência) → Tasks 1–3. ✓
- Continuidade (eficiência + WASO, faixas AASM, sem score) → Tasks 4–5. ✓
- Governança matriz `domain: 'sono'` → Tasks 2 e 4. ✓
- Integração App.tsx → Task 6. ✓
- HRV fora → respeitado (não há task de HRV). ✓
- Bug cap=30 como ticket separado → Task 7, sem alterar lógica. ✓
- Testing + gate → todas as tasks + gate final na Task 6. ✓

**Placeholder scan:** sem TBD/TODO/"handle edge cases". Código completo em cada step. ✓

**Type consistency:** `RespiratoryLoadPoint`/`Summary`, `SleepContinuityPoint`/`Summary`, `AhiBand`, `EfficiencyBand`, `WasoBand`, `computeRespiratoryLoadSeries/Summary`, `computeSleepContinuitySeries/Summary`, `respiratoryLoadIndex`/`sleepContinuityIndex` (readinessKey), ids `RespiratoryLoad`/`SleepContinuity` — consistentes entre util, teste, matriz, data-readiness e cards. ✓

**Nota de risco conhecido:** o teste `index-evidence-behavior.test.ts` (registrado no run-all) pode iterar sobre a matriz; se ele tiver asserts específicos por id, conferir que as entradas novas não violam invariantes (ambas têm `primarySources.length > 0`, `minimumInputs > 0`, `readinessKey` válido — os invariantes conhecidos do `matrix.test`). Rodar o gate completo cobre isso.
