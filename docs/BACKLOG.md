# BACKLOG — Tickets pontuais

> Backlog vivo de modificações pontuais nos dados, gráficos e cálculos
> do RooCode. Cada ticket = 1 commit focado, sem sprint formal.
>
> Modo operacional: manutenção (ver `CLAUDE.md` raiz). Sem KICKOFF,
> sem Pós-Sprint Protocol — apenas escolher ticket, resolver, commitar.
>
> Origem: catálogo SIDEEFFECTS consolidado em 2026-05-11 via 3 agents
> paralelos + diálogo com Anders + validação ao vivo do #4.
> Convertido para BACKLOG em 2026-05-12 (entrada em modo manutenção).
>
> ✅ Já corrigidos: #2 (clonazepam range, commit `c005464`),
>    #3 (lisdex TS, commit `3ceca20`).
> ✅ Validado como falso positivo: #4 (mood valence — pipeline ok).
> ⏳ Pendentes ativos: 10 P0/P1 + P2 cosméticos abaixo.
>
> Adendo 2026-05-14: ingressados #28-#35 (Auditoria UX da aba Panorama).
> Plano detalhado em `/root/.claude/plans/oi-claude-meu-velho-rosy-salamander.md`.
>
> Adendo 2026-05-15: ingressados #36-#43 (Auditoria visual aba Insights pós-backend 9 commits).
> Plano detalhado em `/root/.claude/plans/eita-era-comprida-essa-refactored-rainbow.md`.
> ✅ Todos os 8 tickets fechados em 2026-05-15 (8 commits T6→T7).
>
> Adendo 2026-05-16: ingressados #44-#48 (auditoria frontend pós-cálculos estatísticos).
> ✅ Fechados em pacote único: viewport sem corte, heatmaps touch-friendly, janela analítica consistente,
> consolidação da Insights e QA visual desktop/mobile em `/health/`.

---

## Convenções

- **Severidade:** ALTA (impacta decisão clínica/interpretação) · MÉDIA (impacta acurácia ou higiene) · BAIXA (cosmético/refactor/discrepância de doc)
- **Prioridade:** P0 (corrigir antes de voltar à Sprint D2) · P1 (próxima sprint) · P2 (backlog)
- Cada achado deve ter: contexto, evidência (arquivo:linha), proposta, referências quando relevante.

---

## Sumário executivo

| # | Achado | Sev | Prio | Domínio |
|---|---|---|---|---|
| 1 | Dose Coverage confunde adesão/regularidade/cobertura | ALTA | P0 | PK Coverage |
| 2 | Clonazepam therapeutic range pra epilepsia, não ansiolítico | ALTA | P0 | PK Presets |
| 3 | Lisdexamfetamina: TS vs DB modelam analitos diferentes | ALTA | P0 | PK Presets |
| 4 | Mood valence escala 0-100 vs [-1,+1] (✅ validado · falso positivo) | BAIXA | P2 | Backend Mood |
| 5 | bodyWeight=70kg hardcoded em 5 lugares (Profile=91kg) | MÉDIA | P1 | PK Engine |
| 6 | Autoinduction lamotrigina 20% conservador + 'lamictal' duplicado | MÉDIA | P1 | PK Engine |
| 7 | Modelo 2-compartimento Vd>10 é heurística empírica | MÉDIA | P1 | PK Engine |
| 8 | HRR_BANDS bpm absolutos sem base ACSM | MÉDIA | P1 | Scores Cardio |
| 9 | HRV_BANDS usa norma SDNN-24h vs SDNN noturno PPG | MÉDIA | P1 | Scores Cardio |
| 10 | Uth-Sørensen confundidor BZD/SSRI no RHR | MÉDIA | P1 | Scores Cardio |
| 11 | MOOD_DEBUG_SNAPSHOT default "true" (opt-out invertido) | MÉDIA | P1 | Backend Mood |
| 12 | forecast_history/reports_history sem rotação | MÉDIA | P1 | Backend Forecast |
| 13 | `print` hardcoded em Metrics sem debug guard | MÉDIA | P1 | Backend Metrics |
| 14 | SLEEP_DEBT_CAP=7h vs NSF target 7.5h | BAIXA | P2 | Score Sleep |
| 15 | Awake threshold 1.0h flag vs cap 1.5h inconsistente | BAIXA | P2 | Score Sleep |
| 16 | SPO2_CEIL=96% vs AASM normal=95% | BAIXA | P2 | Score Sleep |
| 17 | ABI z(ln(HRV/RHR)) sem citação publicada | BAIXA | P2 | Score Cardio |
| 18 | HRmax 181 estático não envelhece (2027→181 deveria ser 180) | BAIXA | P2 | Profile |
| 19 | Lamotrigine t½ TS=29h vs DB=32.8h divergência ~13% | BAIXA | P2 | PK Presets |
| 20 | Lamotrigine upper range TS=14000 vs DB=10000 ng/mL | BAIXA | P2 | PK Presets |
| 21 | Interpolate router não preenche campos Phase 8A | BAIXA | P2 | Backend Interp |
| 22 | test_farma.py:169 fixture weight_kg=70.0 legado | BAIXA | P2 | Tests |
| 23 | reasoning_effort + json_object compatibilidade gpt-5.1 | BAIXA | P2 | Backend Forecast |
| 24 | Docstring `_scalingValence` diz 0-100 mas input real é [-100,+100] | BAIXA | P2 | Backend Mood |
| 25 | `_normalize_mood_association` faz round() perdendo precisão decimal | BAIXA | P2 | Backend Mood |
| 26 | DRY: 2 normalizadores espelhados (`normalizeMoodValence` + `normalizeIntradayValence`) | BAIXA | P2 | Frontend Adapter |
| 27 | Falta test de integração validando schema GET `/mood` vs contract frontend | BAIXA | P2 | Tests |
| 28 | PK badge "Não registrada" contradiz concentração na faixa | ALTA | P0 | PK Coverage |
| 29 | Recovery Score: badge "Robusto · 29/35" contradiz texto "4/35 completos" | ALTA | P0 | Recovery Score |
| 30 | Cards Limitante/Noite mostram 21/abr sem explicar critério | ALTA | P0 | Panorama UX |
| 31 | Pílulas do LimitingFactor: notação `0/100 -25.0 pts` ambígua | MÉDIA | P1 | Panorama UX |
| 32 | `Detalhe médico` só no LimitingFactor — inconsistente em summary | MÉDIA | P1 | Panorama UX |
| 33 | PK card sem tooltip de justificativa de faixa (Lamotrigina custom) | MÉDIA | P1 | PK Coverage |
| 34 | Copy "decisão de hoje" sem CTA correspondente no fluxo | BAIXA | P2 | Panorama UX |
| 35 | 8x JSX duplicado de header de score — falta `CardScoreBadge` | BAIXA | P2 | Refactor |
| 36 | Lamictal: remover therapeutic_range (TDM não é prática padrão em bipolar) ✅ `08eccf7` | ALTA | P0 | PK Presets |
| 37 | Remover MoodLagHypothesisLab (seção "Métrica hoje, humor depois") ✅ `fabd50c` | BAIXA | P2 | Insights UX |
| 38 | Reduzir HEATMAP_ROWS: remover Eficiência sono + Recuperação cardíaca ✅ `2b9855f` | BAIXA | P2 | Insights UX |
| 39 | CorrelationHeatmap não filtra interpolated/forecasted ✅ `2b9855f` | MÉDIA | P1 | Insights Math |
| 40 | Remover SleepDebtHrvCard + mover TempHumorCorrelation pra Hipóteses Acionáveis ✅ `f39aa99` | BAIXA | P2 | Insights UX |
| 41 | Remover ScatterCorrelation (seção "Scatter interativo") ✅ `8f47d4c` | BAIXA | P2 | Insights UX |
| 42 | LagCorrelationChart: escala Y fixo [-1,+1] não acompanha amplitude real ✅ `67706ef` | BAIXA | P2 | Insights UX |
| 43 | Refatorar PKVariabilityHumorLab pra grade 4×3 + observações textuais ✅ `65eed37` | MÉDIA | P1 | Insights UX |
| 44 | Visualizações largas cortavam/comprimiam conteúdo em viewport estreita ✅ 2026-05-16 | MÉDIA | P1 | Frontend UX |
| 45 | Peso PK hardcoded em labs intraday divergente do perfil canônico ✅ 2026-05-16 | MÉDIA | P1 | PK Frontend |
| 46 | Heatmaps dependiam de hover/title e perdiam detalhe em touch/mobile ✅ 2026-05-16 | MÉDIA | P1 | Insights UX |
| 47 | Cards misturavam janela selecionada, baseline histórico e leitura atual sem declarar ✅ 2026-05-16 | MÉDIA | P1 | Frontend Math UX |
| 48 | Insights duplicava variabilidade PK e não explicava melhora "menos negativa" ✅ 2026-05-16 | BAIXA | P2 | Insights UX |

**P0 (7)** · **P1 (18)** · **P2 (23)** · Total: **48 achados** · ✅ **#44-#48 fechados** em 2026-05-16.

---

## Auditoria frontend pós-cálculos — 2026-05-16

### ACHADOS #44-#48 — Fechados em pacote único

**Contexto:** auditoria do frontend para garantir que dados estatísticos/PK/backend apareçam com leitura fiel, interativa e sem restrição de viewport.

**Fechamentos:**
- #44: `ForecastReportModal` e `PKVariabilityHumorLab` ganharam scroll horizontal local para não cortar tabela/matriz em viewport estreita.
- #45: labs intraday (`PKMoodScatterChart`, `LagCorrelationChart`) passaram a usar `DEFAULT_PK_BODY_WEIGHT_KG`, alinhado ao perfil canônico.
- #46: heatmaps relevantes agora têm seleção clicável/touch-friendly, `aria-label` e painel persistente "Detalhe selecionado".
- #47: política de janela explicitada: Sono usa `ranged`, Atividade separa `ranged` de `baselineSnapshots`, PK grid deriva janela de `range`, PK coverage declara leitura fixa 48h.
- #48: Insights consolidou `PKVariabilityReportCard` dentro do bloco PK × Humor, removeu o heatmap panorâmico duplicado da tela principal, adicionou leitura "menos negativa" no lag e guia "Leitura clínica rápida" em Humor vs fisiologia.

**Validação:** `npm run test:unit`, `npm run build`, `npm run lint`, `git diff --check` e QA visual Playwright em `https://ultrassom.ai/health/` com desktop 1440×1000 + mobile 390×844. QA confirmou zero duplicidade do título "Substância × métrica de variabilidade", presença de "Leitura clínica rápida", presença de "Melhoras de valência detectadas", sem overlay, sem tela em branco e sem warnings/errors de console.

---

# P0 — ALTA prioridade (corrigir antes da Sprint D2)

## ACHADO #1 — Dose Coverage confunde 3 camadas distintas

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** diálogo Anders

### Contexto

O `PKCoverageCard` (Sprint D, T4) classifica em 4 classes
(`adequada / queda / vulnerabilidade / nao_registrada`) misturando
em um único algoritmo conceitos que a literatura farmacológica
trata como **3 dimensões ortogonais**:

1. **Taking adherence** — tomou a dose? (binário por dia natural)
2. **Timing adherence** — em que horário, vs padrão? (variabilidade)
3. **Effective coverage** — concentração no range? (proxy do efeito)

Resultado: o card aciona `nao_registrada` falsamente quando:
- O usuário ainda não logou a dose da manhã (não tem grace period)
- O log foi feito em horário diferente do agendado
- A dose foi tomada no dia anterior mas fora da janela rígida de 48h
- A droga é usada em sub-dose terapêutica deliberada (caso clonazepam)

### Evidência

- `frontend/src/utils/pk-coverage.ts` — algoritmo count-based em janela 48h
- `frontend/src/components/cards/pk-coverage-card.tsx` — UI

Caso real Anders (2026-05-11 14:26 local):
- Lexapro: 1 logado nas 48h, regime espera 2 → `nao_registrada`
- Lamictal: 1 logado, espera 2 → idem
- Clonazepam: conc ~5 ng/mL, range pop 20-80 → `vulnerabilidade`

### Literatura

Framework canônico **Vrijens 2012 (ABC taxonomy)** subdivide adesão em:
Initiation → **Implementation** → Discontinuation. Implementation
inclui taking + dosing + timing adherence (Ko 2021).

**Chen 2013** simula lamotrigine: atraso ≤4h em LHL drugs causa
queda <15% de conc (insignificante); dose pulada causa queda
16-68% no trough.

**Boissel 2002 / McAllister 2022 / Clark 2024** estabelecem o
conceito de **drug forgiveness**: drogas com t½ longa toleram
melhor lapsos. Lexapro (30h), Lamictal (29h), Clonazepam (35h)
são LHL; Venvanse (11h) é borderline.

DOIs: [Vrijens 2012](https://doi.org/10.1111/j.1365-2125.2012.04167.x) · [Chen 2013](https://doi.org/10.1097/FTD.0b013e318281891c) · [Ko 2021](https://doi.org/10.1038/s41598-021-84868-5) · [Boissel 2002](https://doi.org/10.2165/00003088-200241010-00001) · [McAllister 2022](https://doi.org/10.1007/s10928-022-09808-w) · [Clark 2024](https://doi.org/10.1007/s10928-023-09897-1) · [Cramer 2019](https://doi.org/10.1016/j.yebeh.2019.106634) · [Gidal 2021](https://doi.org/10.1016/j.yebeh.2021.107993)

### Fix proposto

Substituir 1 card por **3 cards distintos** (ou 1 card com 3 abas):

**Camada 1 — ADESÃO (taking)**
- Janela: dia natural (00:00–23:59 local)
- Métrica: MPR ≥80%
- Alarma: ≥1 dia perdido em 7d (LHL) ou 3d úteis (Venvanse)

**Camada 2 — REGULARIDADE (timing)**
- Métrica: |Δt vs mediana 7d|
  - ≤4h: regular (verde)
  - 4-8h: variável (amarelo)
  - >8h: dispersão (vermelho)
- UI bonus: raster plot horário × dia

**Camada 3 — COBERTURA (PK)**
- Manter engine atual
- Rebaixar prioridade vs camadas 1+2
- Adicionar `personal_range` per-substância (ver #2)

### Decisões pendentes antes de codar

1. 3 cards separados OU 1 card com tabs?
2. Range pessoal — onde armazenar (Profile? per-medication setting?)
3. Threshold 4h universal ou per-medication (Venvanse t½=11h merece 2h)?
4. "Dia natural" pra Venvanse weekday-only — sáb/dom conta como esperado ou se exclui?

---

## ACHADO #2 — Clonazepam therapeutic range pra epilepsia, não ansiolítico

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** Agent A

### Contexto

`PK_PRESETS.clonazepam.therapeuticRange = { min: 20, max: 80 }` ng/mL
corresponde à faixa de **epilepsia**. Com 1 mg/dia e peso 91 kg,
ambos os modelos PK calculam Css ~6-7 ng/mL — **permanentemente
abaixo do mínimo**. O `pk-coverage.ts` vai sempre classificar como
`vulnerabilidade`, mesmo com adesão 100% e uso clínico correto.

Bate diretamente com ACHADO #1: o clonazepam é usado pelo Anders
como ansiolítico de baixa dose, não como antiepiléptico.

### Evidência

- `frontend/src/utils/pharmacokinetics.ts:367` — `min: 20`
- `Farma/medDataBase.json` já usa `therapeutic_range_min: 5`
  (divergência entre os 2 backends)
- Caso real: Anders sempre marcado vulnerável

### Fix proposto

- Reduzir min para 5-10 ng/mL no `PK_PRESETS.clonazepam` alinhando com
  uso ansiolítico
- OU adicionar conceito de `personal_range` que sobrescreve
  o populacional (mais flexível, conecta com #1 camada 3)

**Recomendação:** combinar com #1 — criar `personal_range` no Profile
ou per-medication setting; clonazepam ganha range 3-15 ng/mL pessoal.

---

## ACHADO #3 — Lisdexamfetamina: TS e DB modelam analitos diferentes

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** Agent A

### Contexto

`PK_PRESETS.lisdexamfetamine` (TS) e `medDataBase.json` (DB)
têm parâmetros incompatíveis representando **analitos diferentes**:

| Parâmetro | TS | DB |
|---|---|---|
| Vd | 3.5 L/kg (d-anfetamina livre) | 15.58 L/kg (Vd/F oral aparente) |
| Range | 50-150 ng/mL | 10-30 ng/mL |
| Css 200mg | ~399 ng/mL (acima 150) | ~95 ng/mL (acima 30) |

Não há documentação sobre qual analito cada um modela. Ambos
extrapolam seus próprios ranges. Resultado: dois backends que
dão números diferentes pro mesmo dado, sem reconciliação.

### Evidência

- `pharmacokinetics.ts:342-344` (TS)
- `Farma/medDataBase.json:25-29` (DB)

### Fix proposto

1. Decidir qual analito modelar (lisdexamfetamina pró-droga vs
   d-anfetamina ativa)
2. Documentar explicitamente no preset (`display_name` ou comentário)
3. Alinhar Vd/range em ambos backends
4. Considerar que dose Anders=200mg é justificada (escândalo Takeda),
   range terapêutico talvez também precise ser revisto

---

## ACHADO #4 — Mood valence: escala 0-100 vs [-1,+1] ✅ VALIDADO (falso positivo)

**Severidade:** BAIXA · **Prioridade:** P2 · **Origem:** Agent C
**Status:** Verificado ao vivo em 2026-05-11 — pipeline correto, sem bug em produção.

### Resolução da validação

Fluxo real confirmado:

1. **Backend POST `/mood`** (`Mood/mood.py:64-70`): `_normalize_mood_association`
   detecta escala de entrada. Se input ∈ [-1,+1] aplica `(v*100+100)/2`;
   se ∈ [0,100] passa direto. **Persiste sempre em [0,100]** no `mood.csv`.
2. **Backend GET `/mood`** retorna [0,100] cru (confirmado:
   `"Associações": 81, 75, 57, ...` na consulta ao vivo).
3. **Frontend** faz a conversão inversa em DUAS funções espelhadas:
   - `normalizeMoodValence` (`utils/roocode-adapter.ts:219`)
   - `normalizeIntradayValence` (`utils/intraday-correlation.ts:73`)
   Ambas: input ∈ [-1,+1] passa direto; ∈ [0,100] aplicam `(v/50)-1`.
   Robustas a ambas escalas.
4. **Forecast/Interpolate** routers consomem valence ∈ [-1,+1] vindo
   do frontend (validado em `Forecast/router.py:73` + assertions em
   `tests/test_forecast.py:120-121`).
5. **Recovery Score** (M4) detectou em runtime [-1,+1] e reescala via
   `(v+1)/2*100`. Coerente.

### Origem do falso positivo

O agent C leu `_scalingValence` + `_normalize_mood_association` sem
o contexto do frontend, formulou hipótese de bug sem evidência
direta. A nota original ("ANTES DE FIX: validar comportamento real")
era prudente — validação confirmou que não há bug.

### Sub-achados derivados da validação (rebaixados pra P2)

A inspeção descobriu 4 itens menores de higiene/cleanup — catalogados
como achados #24-27 no final desta seção.

---

## ACHADO #28 — PK badge "Não registrada" contradiz concentração na faixa

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Card "Cobertura PK" exibe concentração calculada (ex: Escitalopram 17.6 ng/mL,
dentro de 15-80) mas badge "Não registrada". Bug puramente de ordem do `if/else`
em `pk-coverage.ts:157-168` — branch `missed > 0 → 'nao_registrada'` está acima
da queda e sem guarda de concentração. Schema não tem campo `confirmed`;
"registrada" hoje = "dose foi logada".

### Evidência

- `frontend/src/utils/pk-coverage.ts:157-168` — bloco `if/else`
- `frontend/src/components/cards/pk-coverage-card.tsx` — `CLASS_META`
- Caso ao vivo Anders 2026-05-14: Lexapro 17.6 + Lisdex 27.9 → ambos `Não registrada`

### Fix proposto

1. Extrair `derivePKStatus()` pura, reordenar para:
   `acima_faixa → vulnerabilidade → queda → cobertura_incompleta (guarda cNow < 1.2*min) → adequada`
2. Renomear `nao_registrada` → `cobertura_incompleta` em `CoverageClass` e `CLASS_META`
3. Sem mudança de schema (decisão Anders 2026-05-14)

Detalhe completo: `/root/.claude/plans/oi-claude-meu-velho-rosy-salamander.md` ticket #28.

---

## ACHADO #29 — Recovery Score: badge "Robusto" contradiz texto "4/35"

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Card Recovery Score mostra três fontes de verdade divergentes para a mesma
série: texto "4/35 completos" (12%), badge "Robusto · 29/35 válidos" (83%),
e ~3 pontos visíveis no gráfico. O texto lê `coverageSummary.validDays`
(5/5 inputs + baseline rolling 14d); o badge lê `evaluateReadiness(field:
'hrvSdnn')` (1 input só). Política de 5/5 obrigatórios também produz gráfico
visualmente vazio.

### Evidência

- `frontend/src/components/charts/recovery-score-chart.tsx:174-184` (coverageSummary inline)
- `frontend/src/utils/recovery-score.ts:117` (política 5/5)
- `frontend/src/utils/data-readiness.ts:205` (`robustMin: 28`, só hrvSdnn)
- `frontend/src/components/charts/shared/DataReadinessGate.tsx:44-52` (badge)

### Fix proposto

1. Centralizar `computeRecoveryCoverage()` em novo `utils/recovery-coverage.ts`
   com `completeDays / validDays / partialDays / badge`
2. Thresholds: robusto ≥80%, aceitável ≥50%, preliminar ≥20%, insuficiente <20%
3. Permitir score com ≥3/5 inputs (`completeness` + `inputsUsed` em `RecoveryScorePoint`)
4. 3ª `<Line scorePartial>` pontilhada no chart
5. Substituir `<DataReadinessGate>` desta seção pelo novo badge

Detalhe completo: ticket #29 no plano.

---

## ACHADO #30 — Cards Limitante/Noite mostram 21/abr sem explicar critério

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Em janela 30d até 14/mai, ambos os cards (`LimitingFactorCard`, `NightQualityCard`)
mostram `21 ABR`. Não é bug — é fallback `findLatest` que pega o último dia
com `score != null && components != null`. Usuário não tem affordance pra
entender por quê.

### Evidência

- `frontend/src/components/cards/limiting-factor-card.tsx:84-120` (findLatest)
- `frontend/src/components/cards/limiting-factor-card.tsx:178` (dayLabel)
- `frontend/src/components/cards/night-quality-card.tsx:111-137, 169`

### Fix proposto

Sufixo condicional no label quando `state.snapshot.date !== todayIso`:
`"LIMITANTE · 21 ABR · último dia completo"`. Idêntico em ambos os cards.

Detalhe completo: ticket #30 no plano.

---

# P1 — MÉDIA prioridade (próxima sprint)

## ACHADO #5 — bodyWeight=70kg hardcoded em 5 lugares

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent A

### Contexto

Profile centralizado define `weightKg=91`, mas 5 funções PK ainda
têm `bodyWeight = 70` como default:
- `calculateConcentration`
- `calculateEffectConcentration`
- `generateConcentrationCurve`
- `calculateSteadyStateMetrics`
- `buildDailyConcentrations` (medication-bridge)

Callers principais (PKHumorCorrelation, PKMedicationGrid) passam
`DEFAULT_PK_BODY_WEIGHT_KG` explícito; outros caem no default 70.

Pra lamotrigina (Vd=1.1 L/kg) a diferença é ~23% na concentração.

### Evidência

- `pharmacokinetics.ts:154, 185, 238, 521`
- `medication-bridge.ts:107`

### Fix proposto

Substituir `bodyWeight = 70` por `bodyWeight = DEFAULT_PK_BODY_WEIGHT_KG`
nos 5 locais. Fix de 5 linhas. Trivial.

---

## ACHADO #6 — Autoinduction lamotrigina 20% conservador + duplicata

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent A

### Contexto

- `AUTOINDUCTION_HL_REDUCTION = 0.2` (20% em 21 dias). Literatura
  reporta 25-35% redução t½ em monoterapia em 2-4 semanas. 20% é
  conservador, vai **superestimar** concentrações.
- `AUTOINDUCTION_DRUGS` contém `'lamictal'` duas vezes — typo inócuo
  mas indicativo.

### Evidência

`pharmacokinetics.ts:61-63`

### Fix proposto

- `AUTOINDUCTION_HL_REDUCTION = 0.28` (ponto médio 25-35%)
- Remover `'lamictal'` duplicado

---

## ACHADO #7 — Modelo 2-compartimento é heurística empírica

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent A

### Contexto

Switch para 2-compartimentos ativa em `Vd > 10 L/kg` (escitalopram
20 L/kg cai aqui). Mas o "2-compartimento" implementado **não é o
modelo biexponencial padrão** (sem k12, k21, alpha, beta derivados).

Em vez: `alpha = min(Ka, 3*Ke)`, `periph = min(Vd/20, 0.7)` — frações
empíricas sem referência. Produz Cmax e AUC diferentes do 1-compartimento
mas sem validação clínica.

### Evidência

`pharmacokinetics.ts:112-123`

### Fix proposto

- **Opção A:** documentar explicitamente que é heurística aproximada (1 comentário)
- **Opção B:** substituir pelo modelo Bateman 2-compartimentos completo
- Opção A é P1; Opção B é P2 (mais trabalho)

---

## ACHADO #8 — HRR_BANDS bpm absolutos sem base ACSM

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent B

### Contexto

ACSM classifica intensidade de treino como **% do HRR (Karvonen)**,
nunca em bpm absolutos. As bandas Baixa/Moderada/Boa/Excelente
(cortes 0/100/115/125 bpm) foram calibradas informalmente pro Anders
(HRmax=181). Pra HRmax diferente, os cortes erram.

### Evidência

`heart-rate-reserve.ts:31-36`

### Fix proposto

- Converter pra `%HRR` (Karvonen): 0-40% / 40-60% / 60-80% / >80%
- OU documentar como "cortes pessoais Anders 2026, recalibrar se HRmax mudar"

---

## ACHADO #9 — HRV_BANDS usa SDNN-24h vs SDNN noturno PPG (Apple)

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent B

### Contexto

`HRV_BANDS_MALE_39` cita Shaffer & Ginsberg 2017 e Malik 1996 —
ambas referem **SDNN de 24h via Holter**. Apple Watch reporta
**SDNN noturno via PPG**, sistematicamente menor.

Valores típicos Apple Watch SDNN noturno (homem ~39a): 20-60ms.
Banda "Excelente" começa em 60ms → classifica como "Bom" a maioria
dos valores normais.

### Evidência

`hrv-variability.ts:27-32`

### Fix proposto

- Usar normas derivadas de wearables PPG noturno (Hernando 2018, Lee 2021)
- OU recalibrar como **percentis pessoais** (z-score em vez de bandas absolutas)
- Adicionar disclaimer "bandas populacionais SDNN-24h, leitura
  Apple Watch noturna ~30% menor — interpretar com cautela"

---

## ACHADO #10 — Uth-Sørensen confundidor BZD/SSRI

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent B

### Contexto

Uth-Sørensen 2004 foi validado em ciclistas treinados **sem
psicotrópicos**. Anders usa clonazepam (reduz RHR via efeito
GABAérgico central), o que **inflaria HRV/RHR ratio** e
superestimaria o VO2max estimado.

Código já tem disclaimer "NÃO substitui CPET" mas não menciona
confundidor medicamentoso.

### Evidência

`health-policies.ts:51-52`

### Fix proposto

Adicionar comentário/tooltip:
> ⚠ Estimativa pode superestimar VO2 em uso de BZD/SSRI
> (RHR cronicamente deprimido). Para Anders, valor real provável
> 5-10% menor que estimado.

---

## ACHADO #11 — MOOD_DEBUG_SNAPSHOT default "true" (opt-out invertido)

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent C

### Contexto

```python
os.environ.get("MOOD_DEBUG_SNAPSHOT", "true")
```

Default ativo. A cada POST de humor, grava `.tmp/mood/Previous_Mood.csv`
em produção. Inverso do padrão `FORECAST_DEBUG=false` default.

### Evidência

`Mood/mood.py:23`

### Fix proposto

Inverter para `default="false"`. Trivial.

---

## ACHADO #12 — forecast_history/reports_history sem rotação

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent C

### Contexto

`record_forecast` e `record_report` só fazem `.extend()/.append()`
sem cap de tamanho. Em meses de uso, pode crescer pra centenas de MB,
degradando latência de leitura/escrita atômica.

Ambos arquivos já estão no `.gitignore` (correto), mas sem TTL.

### Evidência

`Forecast/storage.py:94-124, 235-247`

### Fix proposto

- `MAX_HISTORY_ENTRIES = 10000` com truncagem FIFO
- OU rotação por `days_back` no record_forecast

---

## ACHADO #13 — `print` hardcoded em Metrics sem debug guard

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Agent C

### Contexto

```python
print("[🏁]: binary payload saved successfully")
```

Emitido em produção a cada upload de métricas. Contrasta com padrão
`FORECAST_DEBUG` / `_trace()` do projeto.

### Evidência

`Metrics/metrics.py:34`

### Fix proposto

`if os.environ.get("METRICS_DEBUG"):` OU remover.

---

## ACHADO #31 — Pílulas do LimitingFactor: notação `0/100 -25.0 pts` ambígua

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Pílulas internas do `LimitingFactorCard` justapõem duas grandezas semanticamente
distintas (`0/100` = score absoluto da subdimensão; `-25.0 pts` = contribuição
negativa ao score do dia) sem separador. Leitor custa a parsear.

### Evidência

`frontend/src/components/cards/limiting-factor-card.tsx:216-223`

### Fix proposto

Adicionar separador `·` discreto entre as grandezas e sufixo `"pts no dia"`
para desambiguar a contribuição negativa.

Detalhe completo: ticket #31 no plano.

---

## ACHADO #32 — `Detalhe médico` só no LimitingFactor — inconsistente em summary

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

`▶ Detalhe médico` aparece só no `LimitingFactorCard` em Panorama.
`NightQualityCard` esconde no modo `summary` (`!isSummary &&`); `PKCoverageCard`
summary não tem detail. Affordance assimétrica entre cards equivalentes.

### Evidência

- `frontend/src/components/cards/limiting-factor-card.tsx:227-255` (`<details>` sem guarda)
- `frontend/src/components/cards/night-quality-card.tsx:222` (`!isSummary` guard)
- `frontend/src/App.tsx:~595` (uso em Panorama)

### Fix proposto

Adicionar prop `variant: 'full' | 'summary'` no `LimitingFactorCard` (default
`'full'`), envolver `<details>` em guarda, passar `variant="summary"` no uso
de Panorama.

Detalhe completo: ticket #32 no plano.

---

## ACHADO #33 — PK card sem tooltip de justificativa de faixa (Lamotrigina custom)

**Severidade:** MÉDIA · **Prioridade:** P1 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Faixa de Lamotrigina (2000-10000 ng/mL) diverge da literatura clínica padrão
(3000-15000 µg/L). Anders mantém ajuste clínico próprio para estabilização
de humor. `Farma/medDataBase.json` já tem `sources`, `confidence`, `notes`;
basta consumir no frontend e expor via hover. Relacionado a #19, #20 (drift
TS/DB), mas o foco aqui é tooltip de transparência.

### Evidência

- `Farma/medDataBase.json` (metadados já presentes)
- `Farma/router.py` (endpoint `/farma/substances?full=true`)
- `frontend/src/components/cards/pk-coverage-card.tsx` (ainda sem consumo)

### Fix proposto

1. Tipo `SubstanceMetadata` em `frontend/src/lib/api.ts`
2. Hook `useSubstances()` com TanStack Query consumindo `/farma/substances?full=true`
3. Tooltip ao hover na faixa terapêutica do `pk-coverage-card.tsx`:
   `notes` + `sources` + `confidence`
4. Não substituir `PK_PRESETS` (motor de cálculo) — só adicionar metadados

Detalhe completo: ticket #33 no plano.

---

# P2 — BAIXA prioridade (backlog)

## ACHADO #14 — SLEEP_DEBT_CAP=7h vs NSF target 7.5h

**Severidade:** BAIXA · **Origem:** Agent B

`sleep-debt.ts:13` assume target=7.5h (NSF/AASM); `recovery-score.ts:37`
usa cap=7h. Não corresponde a "1 noite perdida" (que seria 7.5h).
**Fix:** alinhar pra 7.5h ou documentar a escolha.

## ACHADO #15 — Awake threshold inconsistente (1.0h vs 1.5h)

**Severidade:** BAIXA · **Origem:** Agent B

Flag `fragmentada` dispara em `awakeHours >= 1.0`, mas
`AWAKE_PENALTY_CAP_H=1.5`. Cria zona 1.0-1.5h onde noite é
fragmentada mas componente awake ainda dá score parcial.
**Fix:** unificar — ou flag em 1.5h, ou cap em 1.0h.

`sleep-quality-score.ts:50,192`

## ACHADO #16 — SPO2_CEIL=96% vs AASM normal=95%

**Severidade:** BAIXA · **Origem:** Agent B

SpO2 noturna "normal" começa em 95% (AASM). Ceiling de 96%
penaliza leitura clinicamente normal (SpO2=95% dá ~17/100).
**Fix:** `SPO2_CEIL = 95` ou adicionar justificativa conservadora.

`sleep-quality-score.ts:53`

## ACHADO #17 — ABI z(ln(HRV/RHR)) sem citação publicada

**Severidade:** BAIXA · **Origem:** Agent B

ABI é derivação local sem referência publicada. Literatura usa
LF/HF ratio ou índices simpato-vagais separados.
**Fix:** referenciar ou documentar como "métrica exploratória pessoal,
não índice clínico padrão".

`autonomic-balance.ts:4-10`

## ACHADO #18 — HRmax 181 estático não envelhece

**Severidade:** BAIXA · **Origem:** Agent B

`hrMaxBpm: 181` é hardcoded; `getCurrentAge()` é dinâmico. Em 2027
getCurrentAge=40 mas HRmax fica 181 (deveria ser 180).
**Fix:** `hrMaxBpm: estimateHrMaxByAge(getCurrentAge())` (computed)
OU adicionar comentário de expiração datado.

`user-profile.ts:24`, `health-policies.ts:54`

## ACHADO #19 — Lamotrigine t½ TS=29h vs DB=32.8h

**Severidade:** BAIXA · **Origem:** Agent A

Ambos dentro do range literatura (25-33h monotherapy) mas
divergência ~13% no Css. Dois backends, números diferentes.
**Fix:** padronizar em 29h (mediana bula) ou documentar.

`pharmacokinetics.ts:352` vs `Farma/medDataBase.json:78`

## ACHADO #20 — Lamotrigine upper range TS=14000 vs DB=10000

**Severidade:** BAIXA · **Origem:** Agent A

TS=14 µg/mL, DB=10 µg/mL. Literatura cita 3-15 µg/mL. Divergência
pode afetar classificação se dose aumentar.
**Fix:** alinhar em 15000 (15 µg/mL) com nota de que 10 é
conservador de alguns centros.

## ACHADO #21 — Interpolate router não preenche campos Phase 8A

**Severidade:** BAIXA · **Origem:** Agent C

`_apply_filled` constrói `health_block` com campos pré-8A.
Campos 8A (`steps`, `distanceKm`, `walkingStepLengthCm`, etc.)
não aparecem; frontend espera `null` mas recebe `undefined`.
**Fix:** adicionar campos 8A com `null` no health_block sintético.

`Interpolate/router.py:266-292`

## ACHADO #22 — test_farma.py:169 fixture weight_kg=70.0

**Severidade:** BAIXA · **Origem:** Agent C

Fixture usa peso legado pré-Sprint R. Não é bug mas pode
mascarar regressões.
**Fix:** atualizar pra `91.0` ou importar `DEFAULT_BODY_WEIGHT_KG`.

## ACHADO #23 — reasoning_effort + json_object combinação gpt-5.1

**Severidade:** BAIXA · **Origem:** Agent C

Payload envia simultaneamente `reasoning_effort: "medium"` e
`response_format: {"type": "json_object"}`. Compatibilidade
não documentada publicamente — em alguns reasoning models
o response_format pode ser ignorado silenciosamente.
**Fix:** monitorar logs 502 com `FORECAST_DEBUG=true`. Avaliar
remover response_format em favor de instrução no prompt.

`Forecast/router.py:118-122`

---

## ACHADO #24 — Docstring de `_scalingValence` engana o leitor

**Severidade:** BAIXA · **Origem:** Validação #4 (2026-05-11)

Docstring atual: "Scales the valence value to a range of 0 to 100."
Sugere que input é arbitrário. Na prática, o input REAL é [-100,+100]
(o caller `_normalize_mood_association` faz `value*100` antes de chamar).
Leitor casual deduz contrato errado.
**Fix:** reescrever docstring → "Maps a valence in [-100,+100] to [0,100]
via affine transform. Caller must scale [-1,+1] input by ×100 first."

`Mood/mood.py:15-19`

---

## ACHADO #25 — `_normalize_mood_association` faz round() perdendo precisão

**Severidade:** BAIXA · **Origem:** Validação #4 (2026-05-11)

`_scalingValence` retorna `round((value + 100) / 2)` — descarta decimal.
Pipeline downstream depois divide por 50 e subtrai 1 no frontend, então
input de 0.73 vira 87 (round de 86.5) que vira 0.74 no front. Diff de
~0.01 — irrelevante pra ranges humanos, mas pode afetar correlações
finas se Apple State of Mind algum dia emitir granularidade decimal.
**Fix:** trocar `round(...)` por `(value + 100) / 2` (manter float).
Casts implícitos pra int não são necessários — pandas armazena float.

`Mood/mood.py:19`

---

## ACHADO #26 — DRY violation: 2 normalizadores de valence espelhados

**Severidade:** BAIXA · **Origem:** Validação #4 (2026-05-11)

Frontend tem 2 funções funcionalmente idênticas:
- `normalizeMoodValence` (`utils/roocode-adapter.ts:219`)
- `normalizeIntradayValence` (`utils/intraday-correlation.ts:73`)

Ambas detectam escala [-1,+1] vs [0,100] e convertem. Divergência sutil:
intraday usa `(value - 50) / 50`, adapter usa `(numeric / 50) - 1`.
Aritmeticamente equivalentes mas evolução desalinhada se uma for
atualizada sem a outra.
**Fix:** consolidar numa função única exportada de `utils/mood-valence.ts`
(novo módulo) ou export-only de um dos arquivos. Ambos callers passam
a importar do mesmo lugar. Refactor de ~10 linhas.

---

## ACHADO #27 — Falta test de contract GET `/mood` × frontend adapter

**Severidade:** BAIXA · **Origem:** Validação #4 (2026-05-11)

`tests/test_mood.py` valida `_format_mood_date` e `_normalize_mood_association`
isoladamente. Não há test de integração que faça GET `/mood` (ou seu mock)
e valide que o schema retornado é o que o frontend espera (chave `Associações`
em [0,100], chave `Iniciar` em DD/MM/YYYY [HH:MM:SS], chave `Fim` em
'Humor Diário' | 'Emoção Momentânea' | null).
**Fix:** adicionar test_mood que faça `POST` de um CSV mock + `GET` e valide
contrato. Bonus: também adicionar test no frontend (vitest) com fixture
JSON do mood real validando que `buildMoodRows` produz `valence ∈ [-1,+1]`.

Net de regressão pra evitar repetir investigação do #4 no futuro.

---

## ACHADO #34 — Copy "decisão de hoje" sem CTA correspondente no fluxo

**Severidade:** BAIXA · **Prioridade:** P2 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Em `frontend/src/App.tsx:637`, a seção Tendência tem `description="Depois da
decisão de hoje, estes painéis mostram trajetória e padrões semanais."` —
referencia "decisão de hoje" que não existe no fluxo atual (não há CTA de
"tomar conduta do dia"). Texto provavelmente herdado de design anterior.

### Evidência

`frontend/src/App.tsx:637`

### Fix proposto

Substituir por: `"Trajetória e padrões semanais — complementam a foto do dia
mostrada acima."` (ou variante equivalente sem pressupor conceito ausente).

---

## ACHADO #35 — 8x JSX duplicado de header de score — falta `CardScoreBadge`

**Severidade:** BAIXA · **Prioridade:** P2 · **Origem:** Auditoria UX Panorama (2026-05-14)

### Contexto

Padrão idêntico de "label uppercase top-right + número grande Fraunces" se
repete em 8 arquivos sem componente reutilizável. Variação leve de labels
(`SCORE DO DIA`, `SCORE`, `ÚLTIMO`) mas tipografia/spacing/cores idênticos.

### Evidência

8 ocorrências:
- `frontend/src/components/cards/limiting-factor-card.tsx:198`
- `frontend/src/components/cards/night-quality-card.tsx:215`
- `frontend/src/components/cards/activity-readiness-card.tsx:63`
- `frontend/src/components/charts/recovery-score-chart.tsx:265`
- `frontend/src/components/charts/hrv-variability-chart.tsx:361`
- `frontend/src/components/charts/chronotropic-response-chart.tsx:314`
- `frontend/src/components/charts/autonomic-balance-chart.tsx:331`
- `frontend/src/components/charts/heart-rate-reserve-chart.tsx:380`

### Fix proposto

Criar `frontend/src/components/cards/CardScoreBadge.tsx` com props
`{ label, value, date?, colorClass? }`. Substituir o JSX duplicado nos 8 lugares
mantendo aparência visual idêntica.

Detalhe completo: ticket #35 no plano.

---

# Roteiro de execução (próxima sessão)

**Fase 0 — Validação:** ✅ CONCLUÍDA em 2026-05-11
1. ~~Validar achado #4 (Mood valence) inspecionando GET `/mood` ao vivo.~~
   **Resultado:** falso positivo confirmado. Pipeline correto (backend
   persiste [0,100], frontend converte pra [-1,+1] via `normalizeMoodValence`
   e `normalizeIntradayValence`). Achado #4 rebaixado pra P2/BAIXA;
   4 sub-achados de cleanup (#24-27) catalogados.
2. ~~Revisar prioridades P0/P1/P2 com Anders, ajustar se necessário.~~
   **Resultado:** P0 reduzido de 4 → 3 itens (todos PK/farmacologia).

**Fase 1 — P0 (Sprint D-patch1, quick wins):**
- ACHADO #2 — clonazepam therapeutic range (ansiolítico vs epilepsia)
- ACHADO #3 — alinhar lisdexamfetamina TS/DB ou documentar analito

**Fase 1.5 — P0 redesign (Sprint D-patch2, brainstorming-first):**
- ACHADO #1 — redesign do PKCoverageCard em 3 camadas (Adesão ·
  Regularidade · Cobertura). Requer brainstorm sobre Q1-Q4 do achado
  antes de codar. Sprint dedicada.

**Fase 2 — P1 (1 sprint patch):**
- ACHADO #5 + #6 — limpeza PK engine (bodyWeight, autoinduction)
- ACHADO #11 + #13 — fix opt-in debug flags
- ACHADO #12 — rotação history files
- ACHADO #7 — documentar 2-compartimento heurística
- ACHADO #8 + #9 + #10 — refactor bandas cardio + disclaimers

**Fase 3 — P2 (manutenção):**
- Aplicar fixes triviais em batch (todos os #14-#23)

**Estimativa:** Fase 1 = 1 sessão (3-4h), Fase 2 = 1 sessão, Fase 3 = 0.5 sessão.

---

# Auditoria Visual Insights — 2026-05-15

Correlação das 6 screenshots de `/root/RooCode/*.png` com componentes frontend
após auditoria matemática backend (9 commits, 2026-05-15). 8 tickets derivados.
Plano completo em `/root/.claude/plans/eita-era-comprida-essa-refactored-rainbow.md`.
**Ordem de execução:** T6 → T1 → T5 → T9 → T3+T4 → T2 → T8 → T7.

---

## ACHADO #36 — Lamictal: remover therapeutic_range (TDM não prática padrão em bipolar) ✅

**Severidade:** ALTA · **Prioridade:** P0 · **Domínio:** PK Presets · **Ticket:** T6 · **Resolvido:** `08eccf7`

### Contexto

O range terapêutico atual da lamotrigina (2000–10000 ng/mL) deriva de estudos em
epilepsia — há consenso na literatura de que TDM rotineiro não é prática padrão em
transtorno bipolar. Exibir o range gera badge de "queda"/"adequada" sem base clínica
para o contexto de uso do Anders. A Lamictal deve aparecer com concentração atual
mas sem badge de status terapêutico.

### Evidência

- `Farma/medDataBase.json` — campos `therapeutic_range_min: 2000`, `therapeutic_range_max: 10000`, `therapeutic_range_unit: "ng/mL"` no bloco `"lamictal"`
- `frontend/src/utils/pharmacokinetics.ts` — `therapeuticRange: { min: 2000, max: 10000, unit: 'ng/mL' }` no preset `lamotrigine`
- `frontend/src/utils/pk-coverage.ts:173` — comportamento atual: `if (!preset.therapeuticRange) continue` pula a substância completamente

### Fix proposto

1. Remover `therapeutic_range_min/max/unit` de `Farma/medDataBase.json` (bloco `lamictal`).
2. Remover `therapeuticRange` do preset `lamotrigine` em `pharmacokinetics.ts`.
3. Modificar `pk-coverage.ts` pra incluir Lamictal com concentração corrente mas sem cálculo de status (badge null).
4. Verificar `PKCoverageCard` renderiza sem badge sem quebrar.
5. Gate: `python -m unittest tests.test_farma` + `npx tsc --noEmit && npm run build && npm run test:unit`.

---

## ACHADO #37 — Remover MoodLagHypothesisLab ("Métrica hoje, humor depois") ✅

**Severidade:** BAIXA · **Prioridade:** P2 · **Domínio:** Insights UX · **Ticket:** T1 · **Resolvido:** `fabd50c`

### Contexto

A seção viola o CLAUDE.md baseline ("MoodLagHypothesisLab com lags 0d..3d, n, qualidade,
Pearson r, baseline ±, aviso de sampling bias"). No entanto, após revisão visual, a seção
foi considerada de baixo valor informativo para o fluxo atual — o CorrelationHeatmap já
cobre lag 0 e lag+1, e os dados de State of Mind têm viés de sampling severo que limita
a interpretabilidade. Remover simplifica a Insights sem perda clínica.

### Evidência

- `frontend/src/components/charts/correlation-heatmap.tsx:10` — import MoodLagHypothesisLab
- `frontend/src/components/charts/correlation-heatmap.tsx:137` — render `<MoodLagHypothesisLab />`
- `frontend/src/components/charts/mood-lag-hypothesis-lab.tsx` — arquivo a deletar
- `frontend/src/utils/correlations.ts` — símbolos exclusivos: `MOOD_LAG_METRICS`, `MoodLagMetricOption`, `MoodLagQuality`, `MoodLagHypothesisRow`, `MoodLagHypothesis`, `buildMoodLagHypothesis`

### Fix proposto

1. Remover import e render de `MoodLagHypothesisLab` em `correlation-heatmap.tsx`.
2. Deletar `mood-lag-hypothesis-lab.tsx`.
3. Remover os 6 símbolos exclusivos de `correlations.ts`.
4. Gate: `npx tsc --noEmit && npm run build && npm run lint`.

---

## ACHADO #38 — Reduzir HEATMAP_ROWS: remover Eficiência sono + Recuperação cardíaca ✅

**Severidade:** BAIXA · **Prioridade:** P2 · **Domínio:** Insights UX · **Ticket:** T5 · **Resolvido:** `2b9855f`

### Contexto

`CorrelationHeatmap` testa 12 métricas × 2 lags = 24 pares simultâneos no FDR BH.
"Eficiência sono" e "Recuperação cardíaca" têm n baixo e correlação fraca com humor
na série do Anders — removê-las reduz o número de testes (24→20) e melhora o poder
do FDR BH sobre os pares realmente informativos.

### Evidência

- `frontend/src/components/charts/correlation-heatmap.tsx:21-34` — array `HEATMAP_ROWS` com `'sleepEfficiencyPct'` e `'cardioRecoveryBpm'`

### Fix proposto

Remover `'sleepEfficiencyPct'` e `'cardioRecoveryBpm'` do array `HEATMAP_ROWS`.
Gate: `npx tsc --noEmit && npm run build`.

---

## ACHADO #39 — CorrelationHeatmap não filtra interpolated/forecasted ✅

**Severidade:** MÉDIA · **Prioridade:** P1 · **Domínio:** Insights Math · **Ticket:** T9 · **Resolvido:** `2b9855f`

### Contexto

`MoodDriverBoard` e `PKVariabilityHumorLab` já filtram `!s.forecasted && !s.interpolated`
antes de calcular correlações. `CorrelationHeatmap` passa os snapshots brutos (inclusive
dias estimados) pra `correlate()`, inflando artificialmente r em métricas auto-preenchidas
como sono. Inconsistência metodológica entre componentes da mesma aba.

### Evidência

- `frontend/src/components/charts/correlation-heatmap.tsx:68-71` — `moodValues` calculado direto de `snapshots` sem filtro
- `frontend/src/components/charts/correlation-heatmap.tsx:83-91` — `correlate(snapshots, ...)` sem filtro

### Fix proposto

Filtrar `snapshots.filter(s => !s.forecasted && !s.interpolated)` antes de passar pra
`correlate()` no componente (preserva `correlate` como utilitário neutro).
Gate: `npx tsc --noEmit && npm run build && npm run lint`. Smoke test: comparar r antes/depois.

---

## ACHADO #40 — Remover SleepDebtHrvCard + mover TempHumorCorrelation ✅

**Severidade:** BAIXA · **Prioridade:** P2 · **Domínio:** Insights UX · **Tickets:** T3 + T4 · **Resolvido:** `f39aa99`

### Contexto

O LabGroup "Cross-domain" tem `SleepDebtHrvCard` (seção "Sono, autonomia, temperatura e
farmacocinética") e `TempHumorCorrelation`. O SleepDebtHrvCard foi considerado de baixo
valor informativo no contexto atual. `TempHumorCorrelation` (wrist temp × valência, lag 0–3d,
r=-0.56 não-causal) é o componente mais útil do bloco e deve ser relocado para "Hipóteses
Acionáveis" junto com CorrelationHeatmap e PKVariabilityReportCard.

### Evidência

- `frontend/src/App.tsx` — LabGroup "Cross-domain" com `SleepDebtHrvCard` + `TempHumorCorrelation`
- `frontend/src/components/charts/sleep-debt-hrv-card.tsx` — arquivo a deletar
- **NÃO** deletar `frontend/src/utils/sleep-debt.ts` — `computeSleepDebt` ainda consumido por `sleep-debt-chart.tsx` (aba Sono)

### Fix proposto

1. Remover LabGroup "Cross-domain" inteiro de `App.tsx`.
2. Adicionar `<TempHumorCorrelation snapshots={ranged} />` no LabGroup "Hipóteses acionáveis" após `<CorrelationHeatmap />`.
3. Remover import `SleepDebtHrvCard` de `App.tsx`.
4. Deletar `sleep-debt-hrv-card.tsx`.
5. Gate: `npx tsc --noEmit && npm run build`. Confirmar que `sleep-debt-chart.tsx` (aba Sono) continua ok.

---

## ACHADO #41 — Remover ScatterCorrelation ("Scatter interativo") ✅

**Severidade:** BAIXA · **Prioridade:** P2 · **Domínio:** Insights UX · **Ticket:** T2 · **Resolvido:** `8f47d4c`

### Contexto

A seção exibe scatter plots de pares predefinidos de métricas vs humor. Após revisão visual,
foi considerada redundante com o CorrelationHeatmap — adiciona complexidade de UI sem
insight incremental. O bloco "Modo laboratório" fica mais limpo sem ela.

### Evidência

- `frontend/src/App.tsx:1006` — `<ScatterCorrelation snapshots={ranged} />`
- `frontend/src/components/charts/scatter-correlation.tsx` — arquivo a deletar
- `frontend/src/utils/correlations.ts` — símbolos exclusivos: `PRESET_CORRELATIONS`, `PresetCorrelation`

### Fix proposto

1. Remover `<ScatterCorrelation />` e import de `App.tsx`.
2. Deletar `scatter-correlation.tsx`.
3. Remover `PRESET_CORRELATIONS` e `PresetCorrelation` de `correlations.ts`.
4. Gate: `npx tsc --noEmit && npm run build`.

---

## ACHADO #42 — LagCorrelationChart: escala Y fixo [-1,+1] não acompanha amplitude real ✅

**Severidade:** BAIXA · **Prioridade:** P2 · **Domínio:** Insights UX · **Ticket:** T8 · **Resolvido:** `67706ef`

### Contexto

O gráfico de correlação por lag horário usa `domain={[-1, 1]}` fixo no eixo Y. Quando todos
os r ficam em ±0.2-0.3 (amplitude real dos dados do Anders), metade da escala fica vazia,
dificultando a leitura das diferenças entre lags. Escala adaptativa com clamp em [-1,+1]
comunica melhor a estrutura temporal das correlações.

### Evidência

- `frontend/src/components/charts/lag-correlation-chart.tsx:282-289` — `<YAxis type="number" domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} />`

### Fix proposto

```tsx
const observedRs = data.map(d => d.r).filter((r): r is number => r != null && Number.isFinite(r))
const maxAbs = observedRs.length > 0 ? Math.max(...observedRs.map(Math.abs)) : 1
const yDomain: [number, number] = [Math.max(-1, -(maxAbs * 1.1)), Math.min(1, maxAbs * 1.1)]
// <YAxis ... domain={yDomain} /> com ticks adaptativos baseados em yDomain
```
Gate: `npx tsc --noEmit && npm run build`. Smoke test visual: confirmar escala comprime pra amplitude real.

---

## ACHADO #43 — Refatorar PKVariabilityHumorLab pra grade 4×3 + observações por lag ✅

**Severidade:** MÉDIA · **Prioridade:** P1 · **Domínio:** Insights UX · **Ticket:** T7 · **Resolvido:** `65eed37`

### Contexto

O componente atual exibe uma tabela com tabs de CV%/Swing/TIR separadas, mostrando
só uma métrica por vez. A estrutura dificulta a comparação simultânea de lag × métrica.
O `PKVariabilityHeatmap` (logo abaixo) já usa uma grade mais legível com `HeatmapCell`.
O objetivo é alinhar `PKVariabilityHumorLab` visualmente com o heatmap, preservando
toda a matemática (`analyzePkVariabilityVsMood` inalterado).

### Evidência

- `frontend/src/components/charts/pk-variability-humor-lab.tsx:181-340` — seção de exibição a re-escrever
- `frontend/src/components/charts/shared/heatmap-cell.tsx` — `HeatmapCell` disponível pra reutilização
- `frontend/src/utils/pk-variability.ts` — `analyzePkVariabilityVsMood` (matemática a preservar)

### Fix proposto

- **Grade 4×3**: linhas = lag (0d, +1d, +2d, +3d), colunas = métrica (CV%, Swing, TIR).
- Uma grade por substância selecionada (manter `<select>` de substância; remover seletor de métrica).
- Células via `HeatmapCell`. Cor: verde (r>0) / vermelho (r<0) / cinza (n.s.). ★ pra `q_fdr < 0.05`.
- FDR BH sobre as 12 células (4 lags × 3 métricas) — atualmente sem FDR no componente.
- Observações textuais abaixo da grade, 1 linha por lag não-trivial.
- Coluna TIR vazia (cinza neutro) pra Lamictal após T6.
- Gate: `npx tsc --noEmit && npm run build && npm run lint && npm run test:unit`.
  Smoke test: selecionar Lexapro → grade preenchida; Lamictal → TIR vazia; comparar r com tabela antiga.

---

# Como retomar (sessão fresh)

```
Olá Claude! Sou o Anders. Retomando RooCode (`/root/RooCode`).
Sessão fresh — siga sprint-system.md e o protocolo do CLAUDE.md.

Há um catálogo de 23 incongruências em /root/RooCode/SIDEEFFECTS.md
que precisamos corrigir ANTES de voltar à Sprint D2.

Plano:
1. Ler o MD inteiro.
2. Começar pela Fase 0: validar ACHADO #4 (Mood valence)
   inspecionando o endpoint /mood ao vivo.
3. Depois confirmar prioridades P0 e abrir Sprint D-patch1
   pra atacar os 4 itens ALTA.

Bora!
```

---

# Anexo — DOIs citados

- Vrijens 2012: https://doi.org/10.1111/j.1365-2125.2012.04167.x
- Chen 2013 (lamotrigine): https://doi.org/10.1097/FTD.0b013e318281891c
- Ko 2021 (taking/dosing/timing): https://doi.org/10.1038/s41598-021-84868-5
- Boissel 2002 (forgiveness): https://doi.org/10.2165/00003088-200241010-00001
- McAllister 2022 (PK/PD forgiveness): https://doi.org/10.1007/s10928-022-09808-w
- Clark 2024 (on/off model): https://doi.org/10.1007/s10928-023-09897-1
- Cramer 2019 (LHL/SHL hospitalization): https://doi.org/10.1016/j.yebeh.2019.106634
- Gidal 2021 (LHL clinical guide): https://doi.org/10.1016/j.yebeh.2021.107993
- Kardas 2013 (adherence determinants): https://doi.org/10.3389/fphar.2013.00091
