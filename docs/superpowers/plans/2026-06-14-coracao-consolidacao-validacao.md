# Coração — Consolidação + Validação dos Marcadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a matemática dos marcadores cardíacos honesta (HRmax Tanaka, idade CV fora, bandas sem lastro removidas) e consolidar todo o cardíaco na aba Coração, esvaziando Recuperação e Capacidade.

**Architecture:** Duas fases sequenciais com gate entre elas. Fase 1 (Validade) corrige utils/cards sem mexer em layout — testável por `test:unit`+`tsc`. Fase 2 (Consolidação) reorganiza só renderização no `App.tsx` e `capacity-panels.tsx` — testável por `tsc`+`build`+QA visual. Os cálculos do `FunctionalCapacityIndex` (que consomem HRR/cronotrópica internamente) **não mudam**; só a visualização migra de aba.

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts. Testes via runner custom (`npm run test:unit`).

**Nota de método (adaptação do skill, aprovada):** TDD estrito só onde há lógica nova testável (Task 1 — HRmax Tanaka). Tarefas de remoção/rename/layout são **gate-driven**: a verificação é `tsc --noEmit` + `npm run lint` + `npm run test:unit` + (Fase 2) QA visual, ajustando testes existentes que quebrarem. Inventar teste unit pra deleção/layout seria cerimônia.

**Spec:** `docs/superpowers/specs/2026-06-14-coracao-consolidacao-validacao-design.md`

**Gate de validação (rodar ao fim de CADA task, no dir `frontend/`):**
```bash
npx tsc --noEmit && npm run lint && npm run test:unit
```
Build (`npm run build`) + QA visual só nas tasks da Fase 2.

---

## FASE 1 — Validade

### Task 1: HRmax via Tanaka (corrige a raiz)

**Files:**
- Modify: `frontend/src/utils/user-profile.ts`
- Modify: `frontend/src/utils/health-policies.ts:54` (`ANDERS_HRMAX_BPM`)
- Modify: `frontend/src/utils/functional-capacity.ts:310-312` (`getEstimatedHrMaxLabel`)
- Test: `frontend/tests/health-policies.test.ts`

- [ ] **Step 1: Escrever o teste falho** em `tests/health-policies.test.ts` (adicionar ao arquivo existente; seguir o estilo de asserção já usado lá):

```ts
// Tanaka et al. (2001): HRmax = 208 - 0.7 * idade
assertEqual(estimateHrMaxByAge(40), 180, 'HRmax Tanaka idade 40')
assertEqual(estimateHrMaxByAge(30), 187, 'HRmax Tanaka idade 30')
// ANDERS_HRMAX_BPM deriva da idade do perfil (40) → 180, não mais 181 (Fox-Haskell)
assertEqual(ANDERS_HRMAX_BPM, 180, 'ANDERS_HRMAX_BPM via Tanaka')
```
Garantir o import de `estimateHrMaxByAge` (de `../src/utils/user-profile`) e `ANDERS_HRMAX_BPM` no topo do teste. Conferir que `src/utils/user-profile.ts` está no `include` de `tsconfig.test.json` (entra transitivamente via health-policies, mas confirmar).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:unit`
Expected: FAIL — `estimateHrMaxByAge(40)` retorna 180 mas hoje a função é `220 - age` (=180 também por acaso? NÃO: 220-40=180), e `ANDERS_HRMAX_BPM` retorna 181 (do `hrMaxBpm` literal). A asserção de `ANDERS_HRMAX_BPM === 180` falha.

- [ ] **Step 3: Implementar.** Em `user-profile.ts`, trocar a fórmula e remover o ponto-de-verdade duplicado `hrMaxBpm`:

```ts
// Tanaka, Monahan, Seals (2001) JACC 37:153-156 — menor viés que Fox-Haskell (220−idade).
export function estimateHrMaxByAge(age: number): number {
  return Math.round(208 - 0.7 * age)
}

export function getCurrentAge(): number {
  const birthYear = USER_PROFILE.birthYear
  return new Date().getFullYear() - birthYear
}

export const USER_PROFILE = {
  name: 'Anders',
  weightKg: 91,
  birthYear: 1986,
  age: 40,
  sex: 'M',
  timezone: 'America/Sao_Paulo',
} as const
```
(Removido `hrMaxBpm` — agora há fonte única: `ANDERS_HRMAX_BPM` derivado da idade.)

Em `health-policies.ts:54`, derivar de Tanaka:
```ts
import { USER_PROFILE, estimateHrMaxByAge } from './user-profile'
// ...
export const ANDERS_HRMAX_BPM: number = estimateHrMaxByAge(USER_PROFILE.age)
```
Atualizar o comentário do bloco Uth-Sørensen (linha 52): trocar "HRmax via Fox-Haskell (220 − idade)" por "HRmax via Tanaka (208 − 0.7×idade)".

Em `functional-capacity.ts:310-312`, `getEstimatedHrMaxLabel` usa `USER_PROFILE.hrMaxBpm` (agora removido) — trocar por `ANDERS_HRMAX_BPM` (importar de `./health-policies`):
```ts
export function getEstimatedHrMaxLabel(): string {
  return `${ANDERS_HRMAX_BPM} bpm estimado`
}
```

- [ ] **Step 4: Varrer consumidores órfãos de `hrMaxBpm`**

Run: `grep -rn "hrMaxBpm" frontend/src`
Expected: zero ocorrências fora do que foi tratado. (Atenção: `cardiovascular-age-card.tsx:32` usa `USER_PROFILE.hrMaxBpm` — será deletado na Task 2; se rodar Task 1 antes, ajustar temporariamente pra `ANDERS_HRMAX_BPM` OU rodar Task 2 logo após. Recomendado: Task 1 → Task 2 em sequência sem gate intermediário se o grep acusar o card.)

- [ ] **Step 5: Rodar gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS (teste novo verde; tipos ok).

- [ ] **Step 6: Commit**
```bash
git add frontend/src/utils/user-profile.ts frontend/src/utils/health-policies.ts frontend/src/utils/functional-capacity.ts frontend/tests/health-policies.test.ts
git commit -m "$(cat <<'EOF'
fix(coracao): HRmax via Tanaka, fonte única derivada da idade

Remove hrMaxBpm literal (Fox-Haskell 220−39, inconsistente com idade 40).
ANDERS_HRMAX_BPM passa a derivar de estimateHrMaxByAge(age) = 208−0.7×idade.
Corrige a raiz que propagava pra reserva de FC, VO2-proxy e FCI.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Remover Idade Cardiovascular

**Files:**
- Delete: `frontend/src/components/cards/cardiovascular-age-card.tsx`
- Modify: `frontend/src/App.tsx:52` (import) e `:908` (uso)
- Modify: `frontend/src/utils/index-evidence.ts:16` (union) e `:247-265` (entry da matriz)
- Modify: `frontend/src/utils/data-readiness.ts:223` (`cardiovascularAgeIndex`)
- Modify: `frontend/src/utils/INDEX_EVIDENCE_MATRIX.md:21` (linha da tabela)
- Vigiar: `frontend/tests/index-evidence-behavior.test.ts`

- [ ] **Step 1: Deletar o card**
```bash
rm frontend/src/components/cards/cardiovascular-age-card.tsx
```

- [ ] **Step 2: Remover do `App.tsx`** — apagar o import (`import { CardiovascularAgeCard } ...` na linha ~52) e o uso (`<CardiovascularAgeCard snapshots={ranged} />` na linha ~908). O uso está no grid do Painel 5 da Recuperação — apenas remover a linha do componente (o grid `xl:grid-cols-...` que o continha vira coluna única com só o `AutonomicBalanceChart`; ajustar a classe do grid de `xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]` pra layout de um só, OU deixar — será reescrito na Task 7). Como a Task 7 reescreve o Painel 5 inteiro, aqui basta remover import + uso pra `tsc` passar.

- [ ] **Step 3: Remover da matriz de evidência (`index-evidence.ts`)** — apagar `'CardiovascularAge'` do union `IndexEvidenceId` (linha ~16) **e** a entry inteira `CardiovascularAge: { ... }` do objeto `INDEX_EVIDENCE_MATRIX` (linhas ~247-265). O `Record<IndexEvidenceId, ...>` exige que union e objeto fiquem em sincronia — remover de ambos ou `tsc` quebra.

- [ ] **Step 4: Remover o requirement** — em `data-readiness.ts:223`, apagar a linha `cardiovascularAgeIndex: { ... }`.

- [ ] **Step 5: Atualizar o doc** — em `INDEX_EVIDENCE_MATRIX.md`, remover a linha `| CardiovascularAge | ... |` (linha ~21).

- [ ] **Step 6: Varrer referências órfãs**
```bash
grep -rn "CardiovascularAge\|cardiovascularAge\|cardiovascular-age" frontend/src frontend/tests
```
Expected: zero (ou só o comentário em `CardScoreBadge.tsx:4-5` listando consumidores antigos — atualizar o comentário removendo a menção). Se `index-evidence-behavior.test.ts` referenciar `CardiovascularAge`, remover esse caso de teste.

- [ ] **Step 7: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add -A frontend/src frontend/tests frontend/src/utils/INDEX_EVIDENCE_MATRIX.md
git commit -m "$(cat <<'EOF'
fix(coracao): remove idade cardiovascular (sem lastro científico)

Coeficientes fabricados + dupla contagem de RHR (direto e via VO2-proxy
Uth-Sørensen, que é função do RHR). RHR sozinho já entrega o sinal.
Remove card, entrada na matriz de evidência e requirement de readiness.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reserva de FC → tendência-pura (remove bandas inventadas)

**Files:**
- Modify: `frontend/src/utils/heart-rate-reserve.ts` (remover `HRR_BANDS`, `HrrBand`, `getHrrBand`, campo `band`)
- Modify: `frontend/src/components/charts/heart-rate-reserve-chart.tsx` (remover uso de banda; escala do eixo por dados)
- Vigiar: `frontend/tests/heart-rate-reserve*.test.ts` (se existir) e `functional-capacity.test.ts`

- [ ] **Step 1: Limpar o util.** Em `heart-rate-reserve.ts`: remover a interface `HrrBand`, a const `HRR_BANDS`, a função `getHrrBand`, e o campo `band: HrrBand | null` da interface `HrrPoint`. No retorno de `computeHeartRateReserveSeries`, remover `band: getHrrBand(hrr)` e `band: null`. Manter `hrr`, `hrrSma7`, `walkingReservePct`, `confidence`, etc. O comentário de cabeçalho sobre bandas ACSM pode ficar (descreve `walkingReservePct`, que permanece).

- [ ] **Step 2: Ajustar o chart.** Em `heart-rate-reserve-chart.tsx`:
  - Remover o import `HRR_BANDS, type HrrBand` (linha ~19) — deixar só `computeHeartRateReserveSeries`.
  - Remover toda renderização de banda: o `<span>` colorido com `row.band.label` (linhas ~134-136), o uso de `row.band.tone` (linhas ~181-195 — substituir a lógica de cor por tom neutro/tendência ou cor fixa do `CHART_TOKENS`), e `latestBandColor`/`latestBandLabel` (linhas ~348-349, 383-384) — passar `undefined` ou remover as props `band`/`bandColor` do header.
  - Escala do eixo Y (linhas ~228-229 usam `HRR_BANDS[0].max`/`HRR_BANDS[2].max`): trocar por domínio derivado dos dados, ex.:
    ```ts
    const hrrVals = rows.map((r) => r.hrr).filter((v): v is number => v != null)
    const min = hrrVals.length ? Math.min(...hrrVals) - 5 : 80
    const max = hrrVals.length ? Math.max(...hrrVals) + 5 : 140
    ```
  - O título/descrição do card deve refletir "tendência da tua reserva", sem rótulo classificatório.

- [ ] **Step 3: Varrer consumidores de banda de reserva**
```bash
grep -rn "HRR_BANDS\|getHrrBand\|HrrBand" frontend/src frontend/tests
```
Expected: zero. Ajustar testes que referenciem.

- [ ] **Step 4: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/utils/heart-rate-reserve.ts frontend/src/components/charts/heart-rate-reserve-chart.tsx frontend/tests
git commit -m "$(cat <<'EOF'
fix(coracao): reserva de FC vira tendência-pura

Remove bandas 100/115/125 bpm (sem referência na literatura — HRR absoluto
depende de HRmax estimado). Card passa a mostrar tendência + SMA, sem rótulo
Bom/Ruim. Eixo escala pelos dados.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cronotrópica → renomear superfície (honestidade do rótulo)

**Files:**
- Modify: `frontend/src/components/charts/chronotropic-response-chart.tsx` (apenas textos/títulos de UI)

**Decisão de escopo:** renomear **só a superfície textual** vista pelo usuário. NÃO renomear símbolos exportados (`computeChronotropicSeries`, `ChronotropicComponents`, `ChronotropicResponseChart`) — eles são consumidos por `functional-capacity.ts`, `capacity-panels.tsx`, `CardScoreBadge.tsx`, e o teste `chronotropic-response.test.ts`. Rename de símbolo aumentaria a superfície de erro sem ganho pro usuário. O nome interno fica como detalhe de implementação.

- [ ] **Step 1: Reescrever os textos de UI** em `chronotropic-response-chart.tsx`:
  - kicker (linha ~297): `Coração · Resposta Cronotrópica` → `Coração · Aceleração na caminhada`
  - h3 (linha ~300): `Resposta Cronotrópica` → `Aceleração na caminhada`
  - descrição (linha ~303): manter a explicação do z-score (FC caminhada − FC repouso vs teu baseline), mas remover a afirmação de "competência cronotrópica" como se fosse teste de esforço. Texto sugerido: "z-score pessoal de FC na caminhada − FC de repouso. Mostra quanto teu coração acelera na caminhada do dia frente ao teu próprio padrão — não é teste de esforço."
  - seção "Sobre competência cronotrópica" (linha ~328) e o parágrafo (linha ~331): reescrever pra deixar explícito que é caminhada casual (submáxima, não-padronizada), não avaliação de incompetência cronotrópica clínica. Manter a referência Brubaker como contexto conceitual, mas enquadrada como "o conceito clínico relacionado (medido por teste de esforço, que isto não é)".
  - verdict (linhas ~59, 76): suavizar "competência cronotrópica" → "aceleração na caminhada vs teu padrão".

- [ ] **Step 2: Confirmar que símbolos não mudaram**
```bash
grep -rn "computeChronotropicSeries\|ChronotropicResponseChart" frontend/src | grep -v "chronotropic-response-chart.tsx"
```
Expected: consumidores intactos (functional-capacity, capacity-panels, CardScoreBadge).

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: PASS (`chronotropic-response.test.ts` intacto, pois símbolos não mudaram).

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/charts/chronotropic-response-chart.tsx
git commit -m "$(cat <<'EOF'
fix(coracao): renomeia cronotrópica → "Aceleração na caminhada"

O nome prometia teste de esforço; o dado é caminhada casual submáxima.
z-score pessoal mantido (válido como tendência). Só a superfície textual
muda — símbolos internos preservados pra não tocar consumidores do FCI.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Bandas com fonte — FC repouso (citar) + HRV (norma de wearable ou tendência-pura)

**Files:**
- Modify: `frontend/src/utils/resting-heart-rate.ts` (anexar citação às bandas)
- Modify: `frontend/src/utils/hrv-variability.ts` (decidir bandas de wearable vs tendência-pura)

- [ ] **Step 1: Pesquisar as fontes.** Usar WebSearch (não há doc de lib aqui):
  - FC de repouso ↔ desfecho CV/mortalidade, faixas adulto. Validar se <65/65-75/75-85/≥85 tem coorte de respaldo (candidatas: Jensen 2013 Copenhagen City Heart; Cooney 2010 Eur Heart J). Anotar a citação concreta.
  - HRV SDNN por idade/sexo medido por **wearable** (Apple Watch / consumer), janela ultra-short. Buscar norma populacional de consumer-grade SDNN. Se houver fonte robusta (ex.: estudo de coorte com wearable), usar pra recalibrar `HRV_BANDS_MALE_39`. Se **não** houver fonte sólida → decisão de fallback: remover as bandas e deixar HRV como tendência-pura (mesmo padrão da reserva na Task 3).

- [ ] **Step 2: FC repouso — anexar citação.** Em `resting-heart-rate.ts`, atualizar o comentário de cabeçalho (linhas ~8-9) com a referência concreta encontrada (autor, ano, periódico). As bandas em si (`BAND_NORMAL_LO=65`, etc.) só mudam se a fonte indicar cutoffs diferentes; caso contrário ficam, agora com lastro citado.

- [ ] **Step 3: HRV — aplicar a decisão do Step 1.**
  - **Caso A (achou fonte de wearable):** recalibrar `HRV_BANDS_MALE_39` conforme a norma; trocar a referência no cabeçalho (linhas ~10-11) de Malik 1996/Shaffer 2017 (que são 5min/24h Task Force) pra a fonte de wearable; adicionar nota de que o Apple mede SDNN ultra-short.
  - **Caso B (sem fonte robusta):** remover `HRV_BANDS_MALE_39`, `HrvBand`, `getHrvBand` e o campo `band` de `HrvVariabilityPoint`; ajustar `hrv-variability-chart.tsx` pra tendência-pura (mesmo tratamento da reserva). Vigiar `tests/hrv-variability.test.ts` (ajustar casos que checam banda).

- [ ] **Step 4: Varrer + Gate**
```bash
grep -rn "getHrvBand\|HRV_BANDS_MALE_39" frontend/src frontend/tests   # vazio se Caso B
npx tsc --noEmit && npm run lint && npm run test:unit
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/utils/resting-heart-rate.ts frontend/src/utils/hrv-variability.ts frontend/src/components/charts/hrv-variability-chart.tsx frontend/tests
git commit -m "$(cat <<'EOF'
fix(coracao): bandas com lastro — FC repouso citada, HRV ajustada

FC de repouso: faixas agora com referência de coorte. HRV: <fonte de wearable
aplicada | bandas removidas (sem norma de consumer-grade robusta) → tendência-pura>.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```
(Editar a mensagem conforme o caso A/B escolhido no Step 3.)

---

### Gate de fim da Fase 1

- [ ] Rodar: `cd frontend && npx tsc --noEmit && npm run lint && npm run test:unit && npm run build`
- [ ] Conferir que as abas atuais (Recuperação/Capacidade) ainda renderizam com a matemática nova — sem idade CV, reserva/HRV sem bandas inventadas, cronotrópica renomeada. (Checkpoint pro Anders testar manualmente antes da Fase 2.)

---

## FASE 2 — Consolidação visual

### Task 6: Popular a aba Coração (4 seções)

**Files:**
- Modify: `frontend/src/App.tsx` (bloco `activeTab === 'coracao'`, ~988-1022; imports ~19-52)

- [ ] **Step 1: Garantir imports no `App.tsx`.** Já presentes: `AutonomicBalanceChart` (~20), `HRRangeChart` (~35), `HrvVariabilityChart` (~41). Adicionar imports diretos dos charts que vêm da Capacidade:
```ts
import { HeartRateReserveChart } from '@/components/charts/heart-rate-reserve-chart'
import { ChronotropicResponseChart } from '@/components/charts/chronotropic-response-chart'
import { CardioRecoveryChart } from '@/components/charts/cardio-recovery-chart'
```
(`RestingHeartRateCard`, `BloodPressureCard`, `StimulantCardiacLoadCard` já estão no bloco coracao atual.)

- [ ] **Step 2: Reescrever o conteúdo do bloco `activeTab === 'coracao'`** em 4 `DecisionSection`, substituindo as 2 seções atuais. Manter o `SurfaceFrame` externo (icon Heart, kicker "Coração", title "Como anda o teu coração?"). Estrutura:
  - **Seção 1 — "Em repouso"**: grid md:grid-cols-2 com `RestingHeartRateCard snapshots={ranged}` + `BloodPressureCard snapshots={data.snapshots}`; abaixo `HRRangeChart snapshots={rangedWithForecast} forecastStartDate={...}` (faixa de FC do dia).
  - **Seção 2 — "Variabilidade & tônus autonômico"**: grid xl:grid-cols-2 com `HrvVariabilityChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast}` + `AutonomicBalanceChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast}`.
  - **Seção 3 — "Resposta ao esforço"**: grid xl:grid-cols-2 com `HeartRateReserveChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast}` + `ChronotropicResponseChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast}`; abaixo `CardioRecoveryChart snapshots={rangedWithForecast} baselineSnapshots={allWithForecast} forecastStartDate={...}` (HRR1, dormente).
  - **Seção 4 — "Estimulante × coração"**: `StimulantCardiacLoadCard snapshots={data.snapshots}` (já existente).

  Usar exatamente os mesmos `snapshots`/`baselineSnapshots` que cada componente recebia na aba de origem (conferir contra Recuperação ~907-912 e `CapacityCardiovascularPanel` ~256-260) pra preservar a política de janela.

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(coracao): consolida cardíaco na aba Coração (4 seções)

Em repouso · Variabilidade & tônus · Resposta ao esforço · Estimulante.
Traz HRV/ABI/HRRange (de Recuperação) e reserva/cronotrópica/HRR1
(de Capacidade) pra casa própria.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Esvaziar o Painel 5 da Recuperação

**Files:**
- Modify: `frontend/src/App.tsx` (bloco `activeTab === 'recuperacao'`, ~840-935)

- [ ] **Step 1: Remover o Painel 5 inteiro** (`DecisionSection` "Meu sistema nervoso autônomo está em equilíbrio?", ~901-914) — todo o bloco (ABI + HRV + HRRange; idade CV já saiu na Task 2). Renumerar os eyebrows dos painéis restantes pra sequência contínua (Painel 1..5): os atuais 1,2,3,4 ficam, e o atual Painel 6 ("Quanto a semana me reparou?") vira Painel 5.

- [ ] **Step 2: Remover imports agora órfãos** no `App.tsx` se nenhum outro bloco usar `AutonomicBalanceChart`, `HrvVariabilityChart`, `HRRangeChart` — mas a Task 6 os usa na aba Coração, então os imports **permanecem**. Confirmar:
```bash
grep -n "AutonomicBalanceChart\|HrvVariabilityChart\|HRRangeChart" frontend/src/App.tsx
```
Expected: cada um aparece só no bloco coracao agora.

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor(recuperacao): remove Painel 5 (cardíaco migrou pro Coração)

Recuperação fica coesa com sono + fisiologia noturna. Painéis renumerados.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Reduzir o painel cardiovascular da Capacidade a VO2

**Files:**
- Modify: `frontend/src/components/charts/capacity-panels.tsx:239-264` (`CapacityCardiovascularPanel`)

- [ ] **Step 1: Reescrever `CapacityCardiovascularPanel`.** Remover `HeartRateReserveChart`, `ChronotropicResponseChart`, `CardioRecoveryChart` da renderização (migraram pro Coração na Task 6) — sobra `Vo2MaxChart`. Remover os imports desses 3 no topo de `capacity-panels.tsx` (linhas ~20-22) **se** não forem usados em outro painel do arquivo (conferir com grep). Reescrever o `verdict` (linhas ~244-247, 251-253): hoje cita "VO2 X, reserva Y, cronotrópica Z, HRR1 W" — passar a falar só de VO2/capacidade aeróbica. Os componentes do FCI (`computeFunctionalCapacity`) **não mudam** — `hrr`/`chrono`/`hrrOne` continuam computados internamente pro score; só a visualização sai. Atualizar o título/eyebrow do painel pra refletir foco em VO2/cardiorrespiratório.

```bash
grep -n "HeartRateReserveChart\|ChronotropicResponseChart\|CardioRecoveryChart" frontend/src/components/charts/capacity-panels.tsx
```
Expected após edição: zero (imports e usos removidos).

- [ ] **Step 2: Ajustar o cabeçalho do Painel 3 da Capacidade** no `App.tsx` (~1053-1058, "Como meu coração responde quando eu exijo dele?") pra refletir que agora é VO2/capacidade aeróbica, não a trinca cardíaca (que foi pro Coração).

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run build`
Expected: PASS (`functional-capacity.test.ts` intacto — cálculo não mudou).

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/charts/capacity-panels.tsx frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor(capacidade): painel cardiovascular reduz a VO2

Reserva/cronotrópica/HRR1 migraram pro Coração. Veredito reescrito pra
capacidade aeróbica. FCI inalterado (segue computando os componentes internamente).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Gate de fim da Fase 2 (QA visual)

- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm run test:unit && npm run build`
- [ ] Restart do serviço e smoke: `systemctl is-active roocode-vite.service` (ou conforme runtime atual) + `curl` 200 em `http://localhost:8011/sleep`.
- [ ] QA visual em `https://ultrassom.ai/health/` (tema graphite via `data-theme`): aba **Coração** com 4 seções renderizando; **Recuperação** e **Capacidade** sem buracos nem cards órfãos; desktop 1440×1000 e mobile 390×844; sem warning/erro de console.

---

## Self-Review (preenchido)

**Spec coverage:** Camada 1 da spec → Tasks 1-5 (HRmax/idade CV/reserva/cronotrópica/bandas). Camada 2 → Tasks 6-8 (Coração/Recuperação/Capacidade). Sequenciamento (validade antes de layout) → ordem das fases + gate intermediário. ✔ sem lacunas.

**Placeholder scan:** Os pontos "decidir caso A/B" na Task 5 são decisão real dependente de pesquisa (com ambos os ramos especificados), não placeholder. Sem TBD/TODO soltos.

**Type consistency:** `estimateHrMaxByAge`/`ANDERS_HRMAX_BPM` (Task 1) consistentes nos consumidores. Remoção de `band`/`HrrBand` (Task 3) e `CardiovascularAge` do union+matriz (Task 2) tratadas em par pra não quebrar `Record`/`tsc`. Símbolos da cronotrópica preservados (Task 4) — consumidores intactos.
