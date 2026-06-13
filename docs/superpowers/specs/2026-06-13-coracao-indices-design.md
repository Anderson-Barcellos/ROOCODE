# Coração — Aba e Índices Cardíacos — Design Doc

**Status:** spec aprovada · pronta pra writing-plans/execução
**Brainstorm:** 2026-06-13 (superpowers:brainstorming)
**Frente mãe:** continuação do fatiamento por sistema fisiológico (após Sono)
**Modo:** manutenção (cards focados; sem KICKOFF/Pós-Sprint Protocol)

---

## Objetivo

Criar a aba **Coração** com índices cardíacos de evidência clínica, viáveis com os
dados reais e não-duplicados em relação ao cardíaco já espalhado em Recuperação/
Capacidade. Princípio central da frente (ideia do Anders): **implementar todos os
índices, inclusive os que ainda não têm dados suficientes, com gating de readiness
por-card** — o card nasce dormente ("Coletando") e acende sozinho quando a cobertura
de dados cruza o limiar. Usa a infra `data-readiness` que já existe.

## Não-objetivos

- **Não** consolidar nesta frente o cardíaco que já vive em Recuperação (`hrv-variability`,
  `autonomic-balance`, `cardiovascular-age`, `hr-range`) e Capacidade (`heart-rate-reserve`,
  `chronotropic-response`, `cardio-recovery`, `walking-vitality`). A aba Coração nasce só com
  os índices novos. Consolidação futura é outro ticket.
- **Não** usar Pressão Arterial como índice ativo agora — só 2% de cobertura (4/164 dias).
  Entra como card **dormente**.
- **Não** incluir Recuperação Cardio (0%), VO₂ Máx (1%) nem Perfusão Periférica (0%) — mortos
  e/ou já cobertos por proxy (`cardiovascular-age`, `functional-capacity`).
- **Não** mexer no backend/pipeline — todos os sinais já chegam parseados.

---

## Reconhecimento dos dados (164 dias, validado em 2026-06-13)

| Sinal | Cobertura | Decisão |
|---|---|---|
| FC Repouso | 79% (130) — média 83,6 bpm, faixa 60–105 | índice ativo |
| HRV (SDNN) | 85% (141) — 23,6 ms | co-sinal (não índice próprio: já há `hrv-variability`) |
| FC Min/Max/Avg | 86% | já cobertos por `hr-range` |
| Pressão Arterial | **2% (4)** | card **dormente** (gating) |
| Recuperação Cardio | 0% | fora |
| VO₂ Máx | 1% | fora (proxy em `cardiovascular-age`) |

Lição aplicada: a cobertura foi medida em VALORES reais, não só existência de campo
(evita repetir o caso `In Bed`=8% do sono).

---

## Índice 1 — Carga Cardíaca do Estimulante

Pergunta clínica: *quanto o Venvanse (lisdexanfetamina, simpaticomimética) custa ao meu
coração?* Cruza a exposição ao estimulante com FC repouso e HRV.

### Arquitetura
- **Util:** `frontend/src/utils/stimulant-cardiac-load.ts`
- **Card:** `frontend/src/components/cards/stimulant-cardiac-load-card.tsx`
- **Teste:** `frontend/tests/stimulant-cardiac-load.test.ts`

### Cálculo
- **Exposição diária ao Venvanse:** AUC diário da série de concentração já calculada
  (`/farma/concentration-series` / utils de PK). AUC = carga total de exposição do dia.
- **Alvos:** `restingHeartRate` e `hrvSdnn` (séries diárias).
- **Pareamento:** dia-a-dia, exposição × alvo, filtrando `interpolated`/`forecasted`
  (mesmo padrão do `CorrelationHeatmap`/`pk-humor-correlation-daily`).
- **Estatística:** Pearson `r` + p-value, sobre lags 0–N dias (efeito acumulado),
  com correção FDR Benjamini-Hochberg sobre os testes. Reusa `pearson()` de
  `intraday-correlation.ts`.
- **Guarda anti-espúrio (crítica):** com dose fixa de 200mg/dia, a exposição varia pouco.
  Se o coeficiente de variação da exposição na janela for baixo (abaixo de um limiar a
  cravar no plano), o card reporta **"variância insuficiente — sem leitura confiável"** em
  vez de uma correlação instável. Sem isso, o índice produziria ruído travestido de sinal.

### Card
- Scatter (exposição × FC repouso) com seletor FC repouso / HRV; `r`, p-value e leitura
  textual ("nos dias de maior exposição, tua FC repouso fica ~X bpm mais alta").
- Estado explícito de "dados/variância insuficientes" quando aplicável.
- Recharts: `ResponsiveContainer` + `minWidth/minHeight={0}` + `initialDimension`; `CHART_TOKENS`.

---

## Índice 2 — FC de Repouso dedicada

Hoje a FC de repouso é só input de outros índices, sem leitura própria — apesar de estar
elevada. Ganha card dedicado.

### Arquitetura
- **Util:** `frontend/src/utils/resting-heart-rate.ts`
- **Card:** `frontend/src/components/cards/resting-heart-rate-card.tsx`
- **Teste:** `frontend/tests/resting-heart-rate.test.ts`

### Cálculo (leitura clínica direta)
- Valor da última leitura + média do **período recebido** (sem janela interna fixa — lição
  do fix de Sono: cards respeitam o seletor de período) + tendência.
- **Faixas de risco CV** (FC repouso ↔ mortalidade): ótima <65 · normal 65–75 ·
  elevada 75–85 · alta ≥85. (Calibração de referência adulta, não alvo individual.)
- Nota contextual ligando à medicação estimulante (link conceitual com o Índice 1).
- `confidence`: 1 real / 0,7 interpolado.

### Card
- Valor + badge de faixa + média do período + mini-tendência. Padrão visual dark dos cards.

---

## Índice 3 — Pressão Arterial (dormente)

Materializa a ideia de "implementar agora, ativar quando houver dados".

### Arquitetura
- **Util:** `frontend/src/utils/blood-pressure.ts`
- **Card:** `frontend/src/components/cards/blood-pressure-card.tsx`
- **Teste:** `frontend/tests/blood-pressure.test.ts`

### Comportamento
- Enquanto a cobertura real (medições não-interpoladas de sistólica+diastólica) estiver
  abaixo do `collectingMin`, o card mostra **"Coletando — N/M medições"** via readiness.
- Quando ativar: média sistólica/diastólica recente + **classificação ACC/AHA 2017**
  (normal <120/80 · elevada 120–129 e <80 · HAS estágio 1: 130–139 ou 80–89 ·
  HAS estágio 2: ≥140 ou ≥90).
- `dipping` noturno **não** entra (Apple não mede PA durante o sono — só spot-check).

---

## Governança de evidência

Novo `domain: 'coracao'` no tipo `IndexEvidenceSpec.domain` em `index-evidence.ts`.
Três entradas novas na matriz + ids no union `IndexEvidenceId`:

- **`StimulantCardiacLoad`** — primary: `restingHeartRate`, `hrvSdnn`; proxy: exposição PK do
  Venvanse (AUC). `interpolationPolicy: 'visual_only'`. Nota: correlação, não causalidade;
  requer variância de exposição.
- **`RestingHeartRate`** — primary: `restingHeartRate`. `interpolationPolicy: 'visual_only'`.
- **`BloodPressure`** — primary: `bloodPressureSystolic`, `bloodPressureDiastolic`.
  `interpolationPolicy: 'none'` (medição pontual, não interpola).

Cada um com `readinessKey` registrado em `CHART_REQUIREMENTS` (`data-readiness.ts`):
- `stimulantCardiacLoadIndex`: requer dias pareados reais (ex. collectingMin ~14).
- `restingHeartRateIndex`: field `restingHeartRate` (ativa já, ~79%).
- `bloodPressureIndex`: field `bloodPressureSystolic`, collectingMin alto o bastante pra
  manter dormente hoje (4 medições) e acender quando crescer.

Atualizar `index-evidence-matrix.test.ts` (lista fechada `expectedIds`).

---

## Integração no App

- Nova aba **Coração** no TabNav + bloco `activeTab === 'coracao'` no `App.tsx`, com os 3
  cards. Recebem `ranged` (período) e, quando precisarem de baseline estável,
  `baselineSnapshots={data.snapshots}` (padrão dos cards existentes).
- Os campos de PA já são parseados (`roocode-adapter`, `health-policies`); confirmar os
  nomes exatos no tipo durante o plano.

---

## Testing & Gate

- Testes unitários por util (`node:assert/strict`, runner custom, registro em `run-all.test.ts`,
  include em `tsconfig.test.json`): faixas de FC repouso, classificação ACC/AHA, gating de
  readiness (dormente vs ativo), guarda de variância do Índice 1, Pearson contra valor de
  referência.
- Gate: `npx tsc --noEmit` + `npm run build` + `npm run lint` + `npm run test:unit`.
- QA visual desktop + mobile dark (graphite): aba aparece, cards dormentes mostram "Coletando"
  sem ilha clara, card ativo mostra número real.

---

## Fatiamento sugerido (pra writing-plans)

1. **FC de Repouso** (mais simples, ativa já) — util + teste + card + governança + aba nova.
2. **Pressão Arterial dormente** — util + teste + card + governança (valida o padrão de gating).
3. **Carga Cardíaca do Estimulante** (mais complexo) — util + teste + card + governança.
4. **QA visual + BACKLOG.**

Cada fase = 1 commit focado, gate verde antes de avançar.
