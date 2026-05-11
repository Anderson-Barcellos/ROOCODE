# SIDEEFFECTS — Catálogo de incongruências e bugs latentes

> Lista viva de achados que precisam ser corrigidos antes de seguir
> com novas features. Cada item: contexto, evidência, severidade,
> fix proposto, prioridade.
>
> Criado: 2026-05-11 (Sprint D · pós-deploy).
> Status: 23 achados consolidados via 3 agents de auditoria + 1
> achado original do diálogo com Anders sobre Dose Coverage.

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
| 4 | Mood valence escala 0-100 vs [-1,+1] (potencial bug) | ALTA | P0 | Backend Mood |
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

**P0 (4)** · **P1 (9)** · **P2 (10)** · Total: **23 achados**.

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

## ACHADO #4 — Mood valence: escala 0-100 vs [-1,+1] confusion

**Severidade:** ALTA · **Prioridade:** P0 · **Origem:** Agent C

### Contexto

`Mood/mood.py` tem lógica de escala que pode estar enviando valência
em escala errada para o resto do pipeline:

- `_scalingValence(value) = (value + 100) / 2` → escala 0-100
- `_normalize_mood_association` bifurca: se já em [0,100] retorna direto,
  se em [-1, +1] multiplica por 100 e converte
- Pipeline downstream (Forecast, Interpolate, frontend) **espera [-1, +1]**
- Conversão inversa no GET `/mood` não foi confirmada na auditoria

Se a conversão inversa não existe, todo o pipeline pode estar
recebendo valência em escala errada — afetando correlações,
forecast e o Recovery Score (componente mood).

### Evidência

- `Mood/mood.py:15-19, 64-68`

### Fix proposto

1. **ANTES DE FIX:** validar comportamento real
   - Fazer GET `/mood` e inspecionar formato retornado
   - Confirmar onde a conversão inversa acontece (ou não acontece)
2. Se bug confirmado: garantir armazenamento em [-1,+1] desde POST,
   ou adicionar conversão inversa no GET
3. Adicionar test que valida formato de saída

**Severidade pode ser RAISED se confirmado bug em produção** —
afetaria retroativamente correlações documentadas em sprints anteriores
(PKHumorCorrelation, MoodDriverBoard, etc).

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

# Roteiro de execução (próxima sessão)

**Fase 0 — Validação:**
1. Validar achado #4 (Mood valence) inspecionando GET `/mood` ao vivo.
   Se confirmado bug → eleva severidade pra crítica, fix imediato.
2. Revisar prioridades P0/P1/P2 com Anders, ajustar se necessário.

**Fase 1 — P0 (1 sprint patch dedicada):**
- ACHADO #2 + #1 (camada 3 PK Coverage) — corrigir clonazepam range
  como parte do redesign de 3 cards
- ACHADO #3 — alinhar lisdexamfetamina TS/DB ou documentar analito
- ACHADO #4 — fix de valence se confirmado bug
- ACHADO #1 — implementar 3 cards (Adesão · Regularidade · Cobertura)

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
