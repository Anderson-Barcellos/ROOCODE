# RooCode — Roadmap de Amadurecimento de Dados

> Última atualização: 2026-05-09
> Estado: Sprints M1 + M2 + M3 concluídas; próxima execução: Sprint M4
> Sessão de planejamento: `/root/.claude/plans/vamos-brainstormar-entao-meu-virtual-brook.md`

## Princípio

Variáveis cruas (FC, HRV, sono, etc) servem como matéria-prima. O cérebro humano lê mal valores absolutos isolados; lê BEM ratios, deltas, z-scores e índices compostos. Esta sprint transforma 5 charts atuais em derivações ativas, seguindo o padrão Cross-Domain Insights (RecoveryScore, sleepDebt × HRV, etc).

Princípio metodológico (do PK×Humor): cada derivação tem hipótese clínica pré-registrada. Sem caça à correlação visual.

## Tabela executiva

| Sprint | Seção | Ação | Risco | Estimativa |
|---|---|---|---|---|
| M1 | Farmaco | Debug do PKStandardDoseComparison | Baixo | ✅ 2026-05-09 (`b0622ff` + `6b1bc07`) |
| M2 | Atividade | VO2 Máx via Uth-Sørensen (substitui empty) | Baixo | ✅ 2026-05-09 (`611db4c`) |
| M3 | Sinais Vitais | Wrist Temp Deviation + FR variability + remover badge "Hipotermia" | Baixo-médio | ✅ 2026-05-09 (`bb4cad6`) |
| M4 | Panorama | Recovery Score composto (Whoop-style) | Médio | 1-2 sessões |
| M5 | Coracao | Autonomic Balance Index | Médio | 1-2 sessões |
| M6 | Cross-cutting | Interpolation Strategy (a definir) | Aberto | brainstorm + 1-2 sessões |

Ordem por: dificuldade crescente, evitando blocking. M1+M2 são quick wins; M3 é misto (rename+derivação); M4+M5 são derivações principais. M3 cria utility de baseline rolling reusada em M4 e M5. **M6 é cross-cutting** e deve ser brainstormada antes de executar — afeta retroativamente M3/M4/M5 se mudar a política de interpolação atual.

---

## Sprint M1 — Farmaco debug do PKStandardDoseComparison ✅ CONCLUÍDA

**Status:** CONCLUÍDA em 2026-05-09 — commits `b0622ff` (XAxis domain + YAxis liberado) + `6b1bc07` (normalização pelo pico simulado, "Closes Sprint M1").

**Resultado real:**
- **XAxis:** `domain={['dataMin', 'dataMax']}` (root cause). Default `[0, dataMax]` com timestamps epoch ms (~1.78e12) fazia os 5 dias ocuparem 0.029% do range visual.
- **YAxis:** `[0, 160]` → `[0, 'auto']` pra acomodar picos reais.
- **Denominator do %ref:** trocou `therapeuticRange.max` (esmagava as 3 curvas com Venvanse 200mg em ~420%) por pico simulado da janela por substância. Todas as 3 curvas agora em escala 0-100%, comparáveis entre si.
- **ReferenceLine y=100:** semântica passou de "limite terapêutico" pra "pico esperado do regime".

**Trade-off aceito:** perde referência clínica absoluta ao `therapeuticRange.max`. Tooltip mantém %.

---

**Plano original (preservado pra auditoria):**

**Objetivo:** Fix do chart "Curvas comparativas das 3 medicações" (`pk-standard-dose-comparison.tsx`) que mostra eixo Y até 420% mas só renderiza 1 ponto vertical no extremo direito do eixo X.

**Arquivos-alvo:**
- `/root/RooCode/frontend/src/components/charts/pk-standard-dose-comparison.tsx`
- `/root/RooCode/Farma/medDataBase.json` (verificação de `therapeuticRange.max`)

**Hipóteses do bug (em ordem de probabilidade):**
1. `domain={[0, 160]}` no YAxis (linha ~245) com Recharts auto-expandindo (`allowDataOverflow` false padrão expande domain pra acomodar dados, mas pode estar truncando visualização)
2. Cálculo de % ref (linha 179): `(concentration / denominator) * 100` com denominator = `therapeuticRange?.max` — possível mismatch de unidades (ng/mL vs mcg/mL)
3. `therapeuticRange.max` zero ou inadequado pra alguma das 3 drogas → fallbackPeak usado mas inconsistente
4. Timestamps colapsados pelo `scale="time"` se XAxis não recebe valores numéricos válidos

**Plano:**
1. Read `medDataBase.json` — verificar `therapeuticRange` das 3 drogas (Lamictal, Lexapro, Venvanse) com unidades
2. Read pk-standard-dose-comparison.tsx — focar nas linhas 154-189 (cálculo) e 244-251 (YAxis)
3. Rodar `npm run dev`, abrir aba Farma, DevTools — capturar `model.chartData` real
4. Diagnosticar qual das 4 hipóteses
5. Fix dirigido + commit

**Validação:**
- 3 curvas distintas no chart (Lamictal azul, Lexapro verde, Venvanse roxo)
- Cada curva oscila ao longo do tempo (não constant nem ponto isolado)
- Y axis range plausível (provavelmente 0-200%)
- Tooltip funcional com `% referência`
- 6 dias visíveis (5 atrás + 1 frente)

**Não tocar:** outros charts da aba Farma (PKMedicationGrid, PKHumorCorrelation, MoodTimeline, DoseLogger, DoseCalendarView, MedicationCatalogEditor).

---

## Sprint M2 — VO2 Máx via Uth-Sørensen ✅ CONCLUÍDA

**Status:** CONCLUÍDA em 2026-05-09 — commit `611db4c` ("Closes Sprint M2").

**Resultado real:**
- **Helper novo** em `health-policies.ts`: `estimateVo2MaxUthSorensen(rhr, hrMax)` + constante `ANDERS_HRMAX_BPM = 182` (220 − 38). Referência primária Uth et al (2004) registrada no comentário.
- **Chart** agora filtra por `s.health?.restingHeartRate != null` (era `vo2Max != null`); valores derivados on-the-fly via fórmula. Header passa a "VO2 Máx estimado (Uth-Sørensen)", caveat clínico no `<details>` reescrito.
- **Data-readiness:** `vo2MaxChart.field` passa de `'vo2Max'` pra `'restingHeartRate'` (input real, não derivação).
- **Test novo** em `tests/health-policies.test.ts`: sanity da fórmula (15 × 182/60 = 45.5), edge cases (null/zero/NaN/HRmax≤RHR), range fisiológico esperado pra Anders (RHR 55-65 → VO2 42-50). Plugado em `run-all.test.ts`.

**Trade-off aceito:** o chart deixou de mostrar `s.health.vo2Max` real do Apple Watch (medido com fórmula proprietária durante exercício submáximo). Esse dado real continua em `s.health.vo2Max` e segue alimentando KPIs e agregações (App.tsx `vo2Max7d`, aggregation.ts) — mas não é mais visualizado no Vo2MaxChart pra não misturar metodologias na mesma série visual. Mantém a hipótese pré-registrada limpa.

**Validação local:** `tsc --noEmit` ✅ · `lint` ✅ · `test:unit` ✅ · `build` ✅.

---

**Plano original (preservado pra auditoria):**

**Objetivo:** Substituir empty state do `Vo2MaxChart` por estimação de VO2 via fórmula Uth-Sørensen (`VO2max ≈ 15 × HRmax/RHR`).

**Arquivos-alvo:**
- `/root/RooCode/frontend/src/components/charts/vo2-max-chart.tsx`
- `/root/RooCode/frontend/src/utils/health-policies.ts` (provavelmente novo helper `estimateVo2MaxUthSorensen`)

**Hipótese pré-registrada:**
"VO2 Máx estimado deve cair quando RHR sobe (overtraining ou fadiga) e subir com treinamento aeróbico crônico. HRmax fixo (220-idade) não muda; só RHR varia diariamente. Esperar baseline ~35-50 ml/(kg·min) pra Anders."

**Decisões metodológicas:**
- HRmax: `220 - 38` (idade Anders, hardcoded com TODO pra config user-level)
  - Alternativa: `Math.max(...heartRateMax)` observado nos snapshots, fallback se idade não definida
- RHR: `restingHeartRate` por dia (não SMA — derivação diária)
- Cálculo: `vo2Est = 15 * (HRmax / RHR)` por dia onde RHR != null
- Header rótulo: **"VO2 Máx estimado (Uth-Sørensen)"**
- Bands: `VO2_BANDS_MALE_35_44` já existem em health-policies — reusar
- Caveat clínico no `<details>`: "Estimativa por proxy Uth-Sørensen. Acurácia ~85% vs CPET. Não substitui medida direta em laboratório."

**Plano:**
1. Read vo2-max-chart.tsx — entender estrutura atual
2. Read health-policies.ts — adicionar `estimateVo2MaxUthSorensen(rhr: number, hrMax: number): number`
3. Edit vo2-max-chart.tsx — trocar `s.health?.vo2Max` por `estimateVo2MaxUthSorensen(s.health.restingHeartRate, hrMaxFromAge)`
4. Atualizar header + tooltip + caveat
5. Validação: tsc + lint + test:unit + build + manual UI
6. Commit

**Validação:**
- Vo2MaxChart agora renderiza linha com VO2 estimado em todas datas com RHR válido
- SMA-7d aparece (linha sólida)
- Bandas comparativas cobrem 25-55 ml/(kg·min)
- Header explícito "estimado"
- Range plausível (~38-48 esperado pro Anders dada RHR ~55-65)

---

## Sprint M3 — Sinais Vitais: Wrist Temp Deviation + remover badge "Hipotermia" ✅ CONCLUÍDA

**Status:** CONCLUÍDA em 2026-05-09 — commit `bb4cad6` ("Closes Sprint M3").

**Resultado real:**
- **Utility nova** `personal-baselines.ts`: `computeRollingBaseline` (mean + SD amostral) + `rollingStandardDeviation` (rolling SD por dia). Função pura — chamador filtra `interpolated`/`forecasted` antes (regra interim conservadora da M6). Disponível pra reuso em M4 (Recovery Score) e M5 (ABI).
- **Painel temp** passa a mostrar delta da baseline pessoal (média 30d, mín 14 medições reais). Bandas centralizadas em 0 (Queda anormal / Normal / Elevado / Alerta). Badge "Desvio: +0.4°C ↑". Fallback inline quando baseline insuficiente.
- **Painel FR** ganhou YAxis secundário (direito, 0-5 rpm) com linha tracejada cinza de FR variability rolling SD 7d. Tooltip discrimina "FR" vs "FR var (SD 7d)".
- **`getPulseTempCategory` + `PULSE_TEMP_BANDS` deletados** (zero consumers fora deste chart). Adicionados `getWristTempDeviationCategory` + `WRIST_TEMP_DEVIATION_BANDS` com clamp pra extremos.
- **Caveat clínico** reescrito: explicita que Apple Watch mede temperatura do pulso (não core) e que o algoritmo já normaliza como desvio.

**Trade-off aceito:** `s.health.pulseTemperatureC` segue intacto no tipo, no adapter, no `App.tsx` KPI de wristTemp e em correlations cross-domain — apenas a visualização do chart M3 mudou pra delta. Decisão conservadora, evita romper consumidores fora de escopo.

**Test novo:** `tests/personal-baselines.test.ts` — sanity de mean/SD amostral, filter null/NaN, edge cases (janela curta, array vazio, minPoints).

**Validação local:** `tsc --noEmit` ✅ · `lint` ✅ · `test:unit` ✅ · `build` ✅.

---

**Plano original (preservado pra auditoria):**

**Objetivo:**
1. Remover bug semântico: badge "Hipotermia" pra 35.9°C de wrist temperature (Apple Watch mede desvio do pulso, não core temp)
2. Substituir Temp Pulso linear absoluto por **Wrist Temp Deviation** (delta da baseline pessoal)
3. Manter FR + adicionar **FR variability rolling SD 7d** como derivação complementar

**Arquivos-alvo:**
- `/root/RooCode/frontend/src/components/charts/vital-signs-timeline.tsx`
- `/root/RooCode/frontend/src/utils/health-policies.ts` (atualizar `getPulseTempCategory` ou substituir por `getWristTempDeviationCategory`)
- **NOVO:** `/root/RooCode/frontend/src/utils/personal-baselines.ts` (computar baseline rolling — reusado em M4 e M5)

**Hipótese pré-registrada:**
"Desvio de wrist temp >+0.5°C sustentado por 2-3 noites pode preceder doença infecciosa subclínica. FR variability ↑ (SD rolling >2.5 rpm) pode preceder estresse autonômico/ansiedade ou início de quadro respiratório."

**Decisões metodológicas:**
- Wrist temp baseline: média das últimas 30 medições válidas (excluir interpolated/forecasted)
- Mínimo de 14 medições reais pra calcular baseline (DataReadinessGate)
- Delta = `temp_today - personal_baseline` em °C
- Bandas: `[-1.0, -0.3]` queda anormal; `[-0.3, +0.3]` normal; `[+0.3, +0.5]` elevado; `[+0.5, +1.5]` alerta
- Badge atualizado: **"Desvio: +0.4°C ↑"** ou **"Normal · 0°C"** ou **"Alerta · +0.7°C"**
- FR variability: rolling SD 7d, mostrado como segunda linha tracejada no painel de FR

**Plano:**
1. Read vital-signs-timeline.tsx — entender estrutura
2. Read health-policies.ts — ver getPulseTempCategory atual
3. Criar `personal-baselines.ts` com `computeRollingBaseline(values, minPoints, windowDays)` — utility genérica reusável em M4/M5
4. Edit vital-signs-timeline.tsx — substituir absoluto por delta, atualizar badge, adicionar FR SD
5. Validação completa
6. Commit

**Validação:**
- Badge "Hipotermia" não aparece mais
- Chart mostra delta da baseline pessoal (eixo Y centralizado em 0)
- FR mantém + nova linha tracejada de SD
- Tooltip esclarece "wrist temp deviation"
- DataReadinessGate ativa se <14 dias de baseline

---

## Sprint M4 — Recovery Score (Panorama)

**Objetivo:** Substituir o `TimelineChart` de 3 séries cruas (RHR, HRV, Sono) na aba Panorama por um **Recovery Score composto** estilo Whoop.

**Arquivos-alvo:**
- **NÃO mexer** em `frontend/src/components/charts/timeline-chart.tsx` (componente genérico, usado em outras abas)
- **NOVO:** `/root/RooCode/frontend/src/components/charts/recovery-score-chart.tsx`
- **NOVO:** `/root/RooCode/frontend/src/utils/recovery-score.ts` (fórmula isolada)
- `/root/RooCode/frontend/src/App.tsx` (substituir TimelineChart por RecoveryScoreChart APENAS na aba panorama, ~linha 428)
- Reuso: `personal-baselines.ts` criado em M3

**Hipótese pré-registrada:**
"Recovery Score 7d trend deve correlacionar com produtividade subjetiva e ausência de sintomas. Quedas >20pts em 3d = sinal de overtraining/stress agudo. Score composto reduz ruído de variáveis individuais."

**Decisões metodológicas — pesos do score (0-100):**
- 30%: HRV z-score pessoal (clamp -2σ a +2σ → 0-100)
- 25%: Sleep efficiency normalizada (% efficiency direto)
- 20%: RHR z-score invertido (alto RHR = baixo recovery)
- 15%: Sleep debt cumulativo invertido (clamp em 7h debt máx)
- 10%: Mood valence (já em 0-100 via adapter)

Soma ponderada de 5 componentes, cada um normalizado 0-100. Pesos derivados de literatura informal (Whoop, Oura) — documentar como "preliminary calibration".

**Bandas visuais:**
- 0-33: baixo (vermelho `#ef4444`)
- 33-66: médio (âmbar `#f59e0b`)
- 66-100: bom (verde `#10b981`)

**Plano:**
1. Read timeline-chart.tsx (referência de pattern)
2. Read sleep-debt-chart.tsx (existente — reusar lógica de sleepDebt cumulativo)
3. Criar `recovery-score.ts` com `computeRecoveryScore(snapshot, baselines): number | null`
4. Criar `recovery-score-chart.tsx` (line chart 0-100 + bandas + tooltip mostrando 5 componentes)
5. Edit App.tsx panorama tab — substituir TimelineChart por RecoveryScoreChart
6. DataReadinessGate (mínimo 14 dias pra baselines confiáveis)
7. Validação completa
8. Commit

**Validação:**
- RecoveryScoreChart renderiza linha 0-100
- Bandas coloridas visíveis
- Tooltip mostra os 5 componentes do score do dia ao hover
- TimelineChart NÃO é removido do código (continua disponível pra outras abas)
- Aba Panorama agora tem (ordem): MetricGrid → WeekdayWeekendCard → ForecastAccuracyCard → **RecoveryScoreChart** → ForecastSignalsPanel
- Range esperado: 50-85 pra Anders em dias normais

**Risco:** pesos são empíricos. Documentar isso explicitamente. Sprint futura pode calibrar pesos via correlação com sintomas Anders reportar.

**Observação herdada da Sprint M1 (2026-05-09):**

O `TimelineChart` atual da landing (aba Panorama) tem issue de **gaps de interpolação longos demais** — quando há >2 dias sem dado, todas as 3 linhas (FC Repouso, HRV, Sono) param e só retomam após o gap. Atrapalha a leitura de tendência (ex: visível no screenshot de referência: linhas param em ~17 abr e só retomam em ~23 abr). Antes de substituir o `TimelineChart` pelo `RecoveryScoreChart`, decidir se o novo chart:
- Usa a mesma regra estrita (gap >2d quebra a linha) — herda o problema.
- Conecta gaps grandes com tracejado (preserva tendência visual mas marca interpolação).
- Relaxa o limite (ex: 4-5 dias) — depende de quanto Anders acha que preserva fidelidade clínica.

A decisão afeta também `personal-baselines.ts` (criado em M3) que vai alimentar o RecoveryScore — se a baseline rolling exclui interpolated rows, gaps longos derrubam confiança da baseline e podem disparar `DataReadinessGate` mais frequentemente que o desejável.

---

## Sprint M5 — Autonomic Balance Index (Coração)

**Objetivo:** Substituir os 2 charts crus (`HrvAnalysis` e o componente de RHR via `HeartRateBands`) na aba Coração por um único chart de **Autonomic Balance Index**. Manter `HRRangeChart` e `CardioRecoveryChart`.

**Arquivos-alvo:**
- **NOVO:** `/root/RooCode/frontend/src/components/charts/autonomic-balance-chart.tsx`
- **NOVO:** `/root/RooCode/frontend/src/utils/autonomic-balance.ts`
- `/root/RooCode/frontend/src/App.tsx` (atualizar aba coracao, ~linha 528-538)
- `frontend/src/components/charts/hrv-analysis.tsx` — manter no código mas não montar mais na aba coracao
- `frontend/src/components/charts/heart-rate-bands.tsx` — manter no código mas não montar mais na aba coracao (avaliar com Anders se vai pra outra aba ou fica deprecated)
- Reuso: `personal-baselines.ts` criado em M3

**Hipótese pré-registrada:**
"ABI captura balanço simpato-parassimpático melhor que HRV ou RHR isolados. Quedas sustentadas (≥7d) <-1σ correlacionam com fadiga crônica/estresse. Picos >+1σ correlacionam com recovery alto/treino bem dormido."

**Decisões metodológicas:**
- ABI = z-score pessoal de `log(HRV / RHR)` — log estabiliza pq ratio HRV/RHR é skewed
- Baseline pessoal: média + SD das últimas 30 medições válidas
- Bandas:
  - >+1σ: dominância parassimpática (recovery alto)
  - -1σ a +1σ: equilibrado
  - <-1σ: dominância simpática (stress/overtraining)
- Tempo: line chart com SMA-7d sobreposto
- DataReadinessGate (mínimo 30 dias pra baseline válido)
- Tooltip: HRV bruto, RHR bruto, ratio, log-ratio, z-score

**Plano:**
1. Read hrv-analysis.tsx + heart-rate-bands.tsx (estrutura atual)
2. Criar `autonomic-balance.ts` com `computeAbi(hrv, rhr, baseline): {ratio, logRatio, zScore} | null`
3. Criar `autonomic-balance-chart.tsx` (line chart com bandas + SMA-7d)
4. Decidir com Anders se HrvAnalysis e HeartRateBands são removidos do código ou só desmontados da aba coracao
5. Edit App.tsx coracao tab
6. Validação completa
7. Commit

**Validação:**
- AutonomicBalanceChart renderiza com bandas coloridas
- Aba Coração agora tem 3 charts: ABI → HRRangeChart → CardioRecoveryChart (uma a menos)
- DataReadinessGate ativa se <30 dias
- Tooltip educativo (explica componentes)
- Range esperado: -1.5 a +1.5 pra Anders

**Risco:** HRV e RHR já são correlacionados naturalmente (HRV alto tende com RHR baixo). Ratio pode ter info redundante. Validar empiricamente: se ABI tem range muito apertado (-0.3 a +0.3), considerar que separar HRV e RHR era mais informativo. Plano B: voltar pra HRV+RHR separados.

---

## Sprint M6 — Interpolation Strategy (a definir)

**Status:** ⏳ aberto, requer brainstorm dedicado antes de executar.

**Objetivo:** Definir e implementar política consistente de interpolação por contexto de uso do dado:

- **Dados pra plotagem visual**: interpolação livre permitida (preenche gaps, melhora leitura). Já marcado via `interpolated: true` no `DailySnapshot` e renderizado tracejado no TimelineChart.
- **Dados pra cálculo (correlações, derivações compostas, baselines)**: estratégia que MINIMIZE distorção estatística artificial.

**Princípio metodológico:**

Interpolação introduz autocorrelação serial. Se 3 dias entre 2 valores reais são interpolados linearmente, esses pontos são forçadamente colineares com vizinhos. Em Pearson r contra outra variável, isso INFLA o coeficiente artificialmente, criando false significance — equivalente ao p-hacking que a Sprint PK×Humor combateu via lag sweep.

**Backlog de questões a brainstormar antes de executar:**

1. **Política base por consumo:**
   - Excluir interpolated rows das correlações? (conservador, perde poder estatístico)
   - Downweight (peso reduzido) por confiança da interpolação? (elegante mas adiciona parâmetro livre)
   - Limitar interpolação a janelas curtas (ex: ≤2 dias)? (pragmático mas arbitrário)
   - Bootstrap blocking pra séries com autocorrelação? (rigoroso mas complexo)

2. **Propagação em derivações compostas (M3/M4/M5):**
   - Recovery Score deve marcar `interpolated: true` se ≥1 input é interpolado?
   - ABI deve ter `interpolated: true` se HRV ou RHR daquele dia é interpolado?
   - Wrist Temp Deviation deve excluir baselines computadas sobre dias interpolados?

3. **Visualização:**
   - Marcar correlações que dependem fortemente de interpolated data com badge "n_real / n_total"?
   - Mostrar 2 r's: um com tudo, outro só com reais?

4. **Backend (Interpolate/router.py):**
   - Já existe? Como funciona hoje? Está sendo usado consistentemente?

**Reflexo nas sprints M3/M4/M5 (regra interim):**

Até M6 ser brainstormada e executada, **regra conservadora**:
- Derivações compostas (Recovery Score, ABI, Wrist Temp Deviation) **excluem interpolated rows** da baseline rolling.
- Score do dia N é null se HRV/RHR/sleep daquele dia é interpolated.
- Esta é decisão temporária — Sprint M6 pode revisitar com política mais refinada.

**Não tocar até brainstorm:** lógica de interpolação no `Interpolate/router.py` (backend) e qualquer pipeline que dependa disso.

---

## Riscos cross-sprint

1. **Pesos do Recovery Score são empíricos.** Documentar explicitamente como "preliminary calibration". Sprint futura pode calibrar via correlação com sintomas reportados.
2. **ABI pode ter range apertado** se HRV e RHR forem fortemente colineares. Plano B: voltar a HRV+RHR separados se ABI for redundante.
3. **Idade hardcoded em VO2 Uth-Sørensen.** Aceitável pra N=1; documentar TODO pra config user-level.
4. **Wrist temp baseline precisa ≥14 dias** — fallback se Anders trocar device ou der gap longo.
5. **PK debug pode revelar problema mais profundo** (regimen API, calculation engine) — manter scope da M1 apertado, abrir backlog se aparecer mais.
6. **Interpolação introduz autocorrelação serial** que pode inflar correlações em M4/M5. Regra interim conservadora (excluir interpolated rows das derivações) até Sprint M6 definir política refinada. **Importante:** se Anders revisar M4/M5 e o Recovery Score / ABI parecer "muito estável", pode ser sinal de que a regra interim está descartando dados úteis — sinalizar pra brainstorm de M6.

---

## KICKOFF — Sprint M4 (próxima sessão fresh)

```
Olá Claude! Sou o Anders. Estamos retomando o RooCode (`/root/RooCode`).
Sessão fresh — siga sprint-system.md (especialmente Pós-Sprint Protocol,
regra 7) e o protocolo de fresh start do AGENTS.md.

# Sprint M4 — Recovery Score composto (Panorama)

**Objetivo:** Substituir o `TimelineChart` de 3 séries cruas (RHR, HRV,
Sono) na aba Panorama por um Recovery Score composto estilo Whoop —
score 0-100 derivado de 5 componentes ponderados.

**Arquivos-alvo:**
- /root/RooCode/frontend/src/App.tsx (substituir APENAS na aba panorama)
- NOVO: /root/RooCode/frontend/src/components/charts/recovery-score-chart.tsx
- NOVO: /root/RooCode/frontend/src/utils/recovery-score.ts (fórmula isolada)
- Reuso: /root/RooCode/frontend/src/utils/personal-baselines.ts (criado na M3)
- NÃO mexer: frontend/src/components/charts/timeline-chart.tsx (componente
  genérico usado em outras abas — manter intacto)

**Hipótese pré-registrada:**
"Recovery Score 7d trend deve correlacionar com produtividade subjetiva e
ausência de sintomas. Quedas >20pts em 3d = sinal de overtraining/stress
agudo. Score composto reduz ruído de variáveis individuais."

**Decisões metodológicas — pesos do score (0-100):**
- 30%: HRV z-score pessoal (clamp -2σ a +2σ → mapeia pra 0-100)
- 25%: Sleep efficiency normalizada (% efficiency direto)
- 20%: RHR z-score invertido (alto RHR = baixo recovery)
- 15%: Sleep debt cumulativo invertido (clamp em 7h debt máx)
- 10%: Mood valence (já em 0-100 via adapter)

Soma ponderada de 5 componentes, cada um normalizado 0-100. Pesos
derivados de literatura informal (Whoop, Oura) — documentar como
"preliminary calibration". Sprint futura pode calibrar via correlação
com sintomas reportados.

**Bandas visuais:**
- 0-33: baixo (vermelho #ef4444)
- 33-66: médio (âmbar #f59e0b)
- 66-100: bom (verde #10b981)

**Plano:**
1. Read sleep-debt-chart.tsx (existente — reusar lógica de sleepDebt
   cumulativo, ver como ele exclui interpolated rows).
2. Criar `recovery-score.ts` com `computeRecoveryScore(snapshot,
   baselines): { score: number, components: {...} } | null`. Usar
   `computeRollingBaseline` da M3 pra HRV e RHR z-scores.
3. Criar `recovery-score-chart.tsx` (line chart 0-100 + bandas + tooltip
   mostrando os 5 componentes do score do dia ao hover).
4. DataReadinessGate (mínimo 14 dias pra baselines confiáveis).
5. Edit App.tsx panorama tab — substituir TimelineChart por
   RecoveryScoreChart APENAS na aba panorama (~linha 428).
6. Adicionar test em tests/recovery-score.test.ts (sanity dos pesos
   somando 100, range esperado pra Anders 50-85, edge cases nulls).
7. Validação: tsc + lint + test:unit + build + manual UI.
8. Commit.

**Validação:**
- RecoveryScoreChart renderiza linha 0-100.
- Bandas coloridas visíveis.
- Tooltip mostra 5 componentes do score do dia ao hover.
- TimelineChart NÃO é removido do código (segue disponível pra outras abas).
- Aba Panorama: MetricGrid → WeekdayWeekendCard → ForecastAccuracyCard
  → RecoveryScoreChart → ForecastSignalsPanel.
- Range esperado pra Anders: 50-85 em dias normais.

**Observação herdada da Sprint M1 (gaps de interpolação no TimelineChart):**
Antes de implementar, decidir se o RecoveryScoreChart:
- Usa regra estrita (gap >2d quebra a linha) — herda problema do TimelineChart.
- Conecta gaps grandes com tracejado (preserva tendência visual mas marca interpolação).
- Relaxa limite (4-5 dias) — depende de fidelidade clínica que Anders queira.
A regra interim conservadora da M6 (excluir interpolated rows da baseline
rolling) já se aplica automaticamente via `personal-baselines.ts`.

**Não tocar:** outras abas/charts. timeline-chart.tsx fica intocado.

**Pós-Sprint Protocol obrigatório** (ver `/root/.claude/rules/sprint-system.md` regra 7):
- Marcar M4 como concluída no ROADMAP_maturation.md (status + commit hash).
- Atualizar tabela executiva (✅ + hash).
- Adicionar bloco "Status / Resultado" no topo da seção M4.
- Reescrever este KICKOFF apontando pra Sprint M5 (Autonomic Balance Index
  na aba Coração). M5 também reusa `personal-baselines.ts`.
- Atualizar CLAUDE.md raiz: adicionar M4 nas concluídas + linha no Status local.

**ROADMAP completo:** /root/RooCode/ROADMAP_maturation.md
**Sessão de planejamento original:** /root/.claude/plans/vamos-brainstormar-entao-meu-virtual-brook.md

Bora!
```
