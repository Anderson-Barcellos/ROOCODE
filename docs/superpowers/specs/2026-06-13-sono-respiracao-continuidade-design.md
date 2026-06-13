# Sono — Respiração Noturna & Continuidade — Design Doc

**Status:** spec aprovada · pronta pra writing-plans/execução
**Brainstorm:** 2026-06-13 (superpowers:brainstorming)
**Frente mãe:** continuação da "Frente Sono" (2026-06-11) — fatiar o dashboard por sistema fisiológico
**Modo:** manutenção (cada índice = ticket focado; sem KICKOFF/Pós-Sprint Protocol)

---

## Objetivo

Adicionar dois índices de sono com evidência científica à aba Sono, **desdobrando sinais
que hoje vivem diluídos e cegos dentro do `sleep-quality-score`** numa leitura dedicada:

1. **Respiração Noturna** — quadro de vigilância respiratória (proxy-apneia + SpO₂ + taxa
   respiratória), com escala híbrida absoluto/pessoal que corrige a cegueira do componente
   respiratório atual.
2. **Continuidade do sono** — eficiência + WASO em leitura clínica direta, com faixas AASM.

Ambos são **frontend-only**: todos os campos já chegam parseados em `DailyHealthMetrics`
(`respiratoryDisturbances`, `spo2`, `respiratoryRate`, `sleepEfficiencyPct`,
`sleepAsleepHours`, `sleepInBedHours`, `sleepAwakeHours`). Sem mudança no backend nem no
pipeline.

## Não-objetivos

- **Não** detectar episódios de apneia individuais. O dado bruto da Apple é uma **taxa
  agregada por noite** (proxy de AHI em eventos/hora), não uma série com timestamp de cada
  evento. Tratar como sentinela de tendência, nunca como diagnóstico minuto-a-minuto —
  mesma disciplina já cravada pra `SleepRegularity`.
- **Não** adicionar HRV ao sono. Decisão fundamentada no brainstorm: (a) `hrvSdnn` já é o
  coração da aba Recuperação (7 utils + 4 charts) → duplicação; (b) nos dados reais a HRV
  **não** rastreia os distúrbios respiratórios (r=+0,28, 86 noites pareadas — sentido oposto
  ao esperado da teoria apneia→HRV↓); (c) o uso cientificamente único da HRV no sono
  (variação cíclica da FC / CVHR) exige HRV intra-noite batida-a-batida, granularidade
  ausente. Fica como evolução futura se o pipeline passar a receber HRV fina.
- **Não** mexer no `sleep-quality-score` nesta frente. O bug do `RESP_DIST_CAP = 30` (que
  satura o componente respiratório na faixa real) fica como **ticket separado** —
  recalibrar muda a semântica do score histórico e merece commit próprio.
- **Não** criar novo score 0-100 pra Continuidade. Decisão: leitura clínica direta.
- **Não** tocar Pressão Arterial (já reservada pra futura seção Coração).

---

## Estado atual (baseline)

A aba Sono hoje renderiza (via `App.tsx`) os cards `SleepArchitectureCard` e
`SleepRegularityCard`, mais os charts `SleepStagesChart`, `SleepDebtChart` e
`VenvanseSleepOnsetChart`. Os utils de sono existentes:

- `sleep-debt.ts` · `sleep-architecture.ts` · `sleep-quality-score.ts` ·
  `sleep-regularity.ts` · `sleep-onset-delay.ts`

**O problema que motiva esta frente:** o `sleep-quality-score` já consome
`respiratoryDisturbances` (peso 15%) e `spo2` (10%), mas:

- `scoreRespiratory` usa `RESP_DIST_CAP = 30` (escala de AHI clínico onde >30 = grave).
- Os dados reais do Anders vão de **0 a 4,89** (todos clinicamente normais, <5 = sem apneia).
- Resultado: `4,89 / 30 → score ≈ 84`. O componente fica **saturado no topo** e não
  discrimina nada na faixa real → sinal anestesiado.

O mesmo padrão vale pra eficiência (30%) e WASO/awake (15%): sinais valiosos diluídos num
score composto, sem leitura própria.

### Retrato dos dados (amostra atual)

| Sinal | Campo | n / 162 | Média | Faixa |
|---|---|---|---|---|
| Distúrbios Respiratórios (proxy AHI) | `respiratoryDisturbances` | 87 | 0,70/h | 0 – 4,89 |
| SpO₂ noturna | `spo2` | 138 | 96,9% | 94 – 98 |
| Taxa respiratória | `respiratoryRate` | 127 | 15,6/min | 12 – 22,7 |
| Eficiência | `sleepEfficiencyPct` | — | — | derivada |
| WASO | `sleepAwakeHours` | 109 | — | — |

---

## Índice 1 — Respiração Noturna

### Arquitetura

- **Util:** `frontend/src/utils/respiratory-load.ts`
- **Card:** `frontend/src/components/cards/respiratory-load-card.tsx`
- **Teste:** `frontend/src/utils/respiratory-load.test.ts`

### Cálculo (por noite, de cada `DailySnapshot`)

**Métrica primária:** `respiratoryDisturbances` (proxy AHI), plotada no tempo.

**Escala híbrida** (decisão do brainstorm):

1. **Banda absoluta (AASM)** — âncora clínica tranquilizadora:
   - `<5` normal · `5–15` leve · `15–30` moderada · `>30` grave.
   - Hoje mantém o Anders sempre em "normal". É o contexto de gravidade real.
2. **Percentil pessoal** — sensibilidade na faixa real:
   - Baseline rolante via `computeRollingBaseline` (reuso; janela 30d, `minPoints` ~14).
   - Noite acima do **p90 pessoal** = flag `atypical` ("atípica pra ti").
   - Baseline computada **só sobre dias reais** (ignora interp/forecast), espelhando a regra
     já usada em `computeSleepQualityBaselines`.

**Co-sinais:** `spo2` e `respiratoryRate`, exibidos como séries secundárias.

**Co-ocorrência (o achado clínico central):**
- `desaturationFlag` — SpO₂ abaixo do piso pessoal (ex.: < p10 pessoal) **ou** limiar
  absoluto (ex.: < 95%).
- `coOccurrenceFlag` — distúrbios > p90 pessoal **E** `desaturationFlag` na mesma noite =
  **bandeira vermelha** (a assinatura que apneia real deixaria).

### Shape de saída (esboço)

```ts
export interface RespiratoryLoadPoint {
  date: string
  disturbances: number | null      // proxy AHI bruto
  ahiBand: 'normal' | 'leve' | 'moderada' | 'grave' | null
  personalPercentile: number | null
  atypical: boolean                // > p90 pessoal
  spo2: number | null
  respiratoryRate: number | null
  desaturationFlag: boolean
  coOccurrenceFlag: boolean         // distúrbios atípico + dessaturação
  confidence: number               // 1 real / 0.7 interpolado
  derivedFromInterpolated: boolean
  evidence: IndexEvidenceReport
}

export interface RespiratoryLoadSummary {
  latest: RespiratoryLoadPoint | null
  meanDisturbances: number | null  // janela recente
  currentBand: 'normal' | 'leve' | 'moderada' | 'grave' | null
  atypicalNights: number           // contagem na janela
  coOccurrenceNights: number
  nightsUsed: number
}
```

### Card (UI)

- Mini-chart dos distúrbios no tempo, com **faixa pessoal sombreada** (banda p10–p90).
- Badge de banda absoluta ("zona normal — AHI <5").
- SpO₂ + taxa respiratória como valores/linhas secundárias.
- Noites de co-ocorrência **destacadas visualmente**.
- Botão "Evidência" no padrão dos índices de sono (via `buildIndexEvidenceReport`).
- Recharts: `ResponsiveContainer` + `minWidth/minHeight={0}` + `initialDimension={{ width: 1,
  height: 1 }}`; paleta de `CHART_TOKENS`.

### Honestidade embutida

O card é **vigilância, não detector dramático**. Tua faixa é toda normal → 90% do tempo
ele dirá "tudo tranquilo". O valor é pegar a noite que destoa. O texto do card e o report de
evidência declaram explicitamente: *"Distúrbios Respiratórios da Apple como proxy de AHI,
agregado por noite — não episódios individuais."*

---

## Índice 2 — Continuidade do sono

### Arquitetura

- **Util:** `frontend/src/utils/sleep-continuity.ts`
- **Card:** `frontend/src/components/cards/sleep-continuity-card.tsx`
- **Teste:** `frontend/src/utils/sleep-continuity.test.ts`

### Cálculo (leitura clínica direta — sem score 0-100)

**Eficiência** = `sleepAsleepHours / sleepInBedHours` (preferir `sleepEfficiencyPct` se já
derivado; recalcular dos brutos como fallback). Faixas AASM:
- `≥85%` ideal · `75–85%` limítrofe · `<75%` pobre.

**WASO** = `sleepAwakeHours`. Faixas:
- `<0,5h` (30min) ideal · `0,5–1h` limítrofe · `>1h` fragmentado.

Mais **tendência recente** (médias da janela) + os números reais lado a lado.

### Shape de saída (esboço)

```ts
export interface SleepContinuityPoint {
  date: string
  efficiencyPct: number | null
  efficiencyBand: 'ideal' | 'limitrofe' | 'pobre' | null
  wasoHours: number | null
  wasoBand: 'ideal' | 'limitrofe' | 'fragmentado' | null
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
```

### Card (UI)

- Eficiência (%) + WASO (min) com faixas AASM coloridas.
- Sparkline/mini-chart de tendência.
- Sem badge de score 0-100 — os números clínicos falam.
- Mesmo rigor Recharts + `CHART_TOKENS` + botão "Evidência".

---

## Governança de evidência

Ambos entram na matriz central `frontend/src/utils/index-evidence.ts` com `domain: 'sono'`
(o padrão que o projeto exige — fonte/proxy/política de interpolação declarados na matriz,
não em ifs espalhados). Novas entradas:

- **`RespiratoryLoad`** — inputs: `respiratoryDisturbances` (primary, proxy AHI),
  `spo2` (co-sinal), `respiratoryRate` (co-sinal). Nota de proxy: agregado por noite, não
  episódios. `confidenceRule`: 1 real / 0.7 interpolado.
- **`SleepContinuity`** — inputs: `sleepAsleepHours` + `sleepInBedHours` (ou
  `sleepEfficiencyPct` derivado) + `sleepAwakeHours`. Faixas AASM declaradas.

Adicionar ambos os ids ao union type de `IndexId` em `index-evidence.ts`. Se houver
`CHART_REQUIREMENTS` correspondente em `data-readiness.ts`, registrar os requisitos de
prontidão (mín. de noites reais pra leitura agregada confiável).

---

## Integração no App

- Renderizar `RespiratoryLoadCard` e `SleepContinuityCard` na aba **Sono** do `App.tsx`,
  junto de `SleepArchitectureCard`/`SleepRegularityCard`.
- Política de janela: seguir o padrão da aba Sono (leitura histórica filtrada). Confirmar
  na implementação se recebem `ranged` ou `data.snapshots` conforme os cards vizinhos.

---

## Bug colateral (ticket separado — fora desta frente)

Registrar no `BACKLOG.md`: `scoreRespiratory` em `sleep-quality-score.ts` usa
`RESP_DIST_CAP = 30`, que satura o componente respiratório na faixa real (0–4,89). O índice
dedicado Respiração Noturna já nasce com escala correta, então o quality-score **segue
funcionando** — mas o cap continua objetivamente errado. Recalibrar (cap realista ou
percentil pessoal) muda a semântica do score histórico → commit próprio, com nota de
trade-off de comparabilidade temporal.

---

## Testing & Gate

- `respiratory-load.test.ts`: banda absoluta, percentil pessoal, flag atypical, dessaturação,
  co-ocorrência, noites sem dado, confidence interpolado.
- `sleep-continuity.test.ts`: faixas AASM de eficiência e WASO, fallback de cálculo de
  eficiência, dados faltantes, confidence.
- Gate completo: `npx tsc --noEmit` + `npm run build` + `npm run lint` + `npm run test:unit`.
- QA visual desktop + mobile dark (zero ilhas claras, sem overflow), no padrão da Frente Sono.

---

## Fatiamento sugerido (pra writing-plans)

1. **Fase 1 — Respiração Noturna:** util + teste + card + matriz de evidência + integração.
2. **Fase 2 — Continuidade do sono:** util + teste + card + matriz + integração.
3. **Fase 3 — QA visual + registro no BACKLOG** (incluindo o ticket do bug do cap=30).

Cada fase = 1 commit focado, gate verde antes de avançar.
