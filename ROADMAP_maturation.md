# RooCode — Roadmap de Amadurecimento de Dados

> Última atualização: 2026-05-10 (sessão Anders + Claude — meio da Sprint M6)
> Estado: M1-M5 ✅ · M6 EM ANDAMENTO (9/14 sub-tasks done, fatias M6.1+M6.2 fechadas + M6.3.a/b backend done; faltam M6.3.c-f frontend modal)
> Sessão de planejamento M6: `/root/.claude/plans/crystalline-wondering-dijkstra.md`

## Princípio

Variáveis cruas (FC, HRV, sono, etc) servem como matéria-prima. O cérebro humano lê mal valores absolutos isolados; lê BEM ratios, deltas, z-scores e índices compostos. Esta sprint transforma 5 charts atuais em derivações ativas, seguindo o padrão Cross-Domain Insights (RecoveryScore, sleepDebt × HRV, etc).

Princípio metodológico (do PK×Humor): cada derivação tem hipótese clínica pré-registrada. Sem caça à correlação visual.

## Tabela executiva

| Sprint | Seção | Ação | Risco | Estimativa |
|---|---|---|---|---|
| M1 | Farmaco | Debug do PKStandardDoseComparison | Baixo | ✅ 2026-05-09 (`b0622ff` + `6b1bc07`) |
| M2 | Atividade | VO2 Máx via Uth-Sørensen (substitui empty) | Baixo | ✅ 2026-05-09 (`611db4c`) |
| M3 | Sinais Vitais | Wrist Temp Deviation + FR variability + remover badge "Hipotermia" | Baixo-médio | ✅ 2026-05-09 (`bb4cad6`) |
| M4 | Panorama | Recovery Score composto (Whoop-style) | Médio | ✅ 2026-05-10 (`322781e`) |
| M5 | Coracao | Autonomic Balance Index | Médio | ✅ 2026-05-10 (`7fab71b`) |
| M6 | Cross-cutting | Interp policy + payload IA enriquecido + relatório modal | Médio | 🚧 9/14 (M6.1+M6.2 ✅ commits 137d63a→bff5752; M6.3.a/b ✅ a44c525+8ba37fd; M6.3.c-f pendentes) |

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

## Sprint M4 — Recovery Score (Panorama) ✅ CONCLUÍDA

**Status:** CONCLUÍDA em 2026-05-10 — commit `322781e` ("Closes Sprint M4").

**Resultado real:**
- **Utility nova** `frontend/src/utils/recovery-score.ts`: `computeRecoveryScoreSeries(snapshots) → RecoveryScorePoint[]`. Score 0-100 com 5 componentes ponderados (30% HRV z-score, 25% sleep eff, 20% RHR z-score invertido, 15% sleep debt 7d invertido, 10% mood reescalado [-1,+1]→[0,100]). Função pura — reusa `computeRollingBaseline` (M3) + `computeSleepDebt`.
- **Chart novo** `recovery-score-chart.tsx`: LineChart 0-100, 3 ReferenceArea (red 0-33 / amber 33-66 / green 66-100), tooltip mostra os 5 componentes com seus pesos individuais ao hover, badge "Último" no header com score atual. DataReadinessGate threshold 28/14/7.
- **App.tsx**: substituiu `TimelineChart` na aba Panorama por `RecoveryScoreChart`. Removeu consts/imports órfãos (`EXEC_SERIES`, `TIMELINE_LABELS`, `timelineData`, `timelineReadiness`, `buildTimelineSeries`, `evaluateReadiness`, `CHART_REQUIREMENTS`, `TimelineSeriesKey`). `timeline-chart.tsx` intacto — segue consumido por `InterpolationDemo.tsx`.
- **`recoveryScoreChart`** adicionado a `CHART_REQUIREMENTS` (`type: 'days', robust 28 / explor 14 / collect 7, field: 'hrvSdnn'`).

**Decisões metodológicas:**
- **Política rigorosa de inputs:** 5/5 componentes obrigatórios. Se faltar 1 (qualquer null), score=null com `reason: 'inputs_missing'`. Decisão revisável.
- **Regra interim M6:** snapshot `interpolated || forecasted` → score=null com reason correspondente. Baselines HRV/RHR únicas do dataset, computadas só sobre dias reais (mesmo padrão da M3).
- **Mood valence:** detectado em runtime como `[-1,+1]` (NÃO 0-100 como o KICKOFF original supunha). Reescala `(v+1)/2*100` aplicada na fórmula.
- **Sleep debt:** `debt_cumulative_7d` clamp `[0, 7]`h → invertido `(1 - clamp/7) * 100`. Cap em 7h é arbitrário; ajustável.
- **Gaps visuais:** score=null em interpolated/forecasted naturalmente quebra a linha (`connectNulls={false}`). Gap rows `>2d` adicionados pra forçar quebra também quando há buracos sem snapshot. Decisão coerente com regra M6.

**Trade-off aceito:** série fica mais esparsa do que o TimelineChart original (que mostrava todos os dias com tracejado em interp/forecast). Recovery Score só aparece em dias com TODOS os 5 inputs reais. Se Anders revisar e achar "muito esparso", isso vira sinal pra brainstorm da M6 (regra interim conservadora descartando demais).

**Test novo:** `tests/recovery-score.test.ts` — pesos somam 100, dia médio≈67.5 (HRV/RHR z=0, sleepEff=90, debt≈0, valence=0), dia perfeito≥99 (todos componentes no topo), dia péssimo≤5 (todos no fundo), componentes individuais corretos em perfectDay, reason=interpolated/forecasted/inputs_missing (mood null + HRV null)/baseline_missing (dataset com <14 dias), filtro de interp/forecast nas baselines (pollutedDataset).

**Validação local:** `tsc --noEmit` ✅ · `lint` ✅ · `test:unit` ✅ · `build` ✅. **UI manual NÃO testada** nesta sessão — Chrome DevTools MCP indisponível (config persistente requer restart de sessão). Validação visual fica pra Anders no /panorama da próxima abertura.

---

**Plano original (preservado pra auditoria):**

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

## Sprint M5 — Autonomic Balance Index (Coração) ✅ CONCLUÍDA

**Status:** CONCLUÍDA em 2026-05-10 — commit `7fab71b` ("Closes Sprint M5").

**Resultado real:**
- **Utility nova** `frontend/src/utils/autonomic-balance.ts`: `computeAbiBaseline(snapshots)` + `computeAbiSeries(snapshots)`. Z-score pessoal de `ln(HRV/RHR)` com baseline única do dataset (windowSize 30 / minPoints 14, padrão M3/M4). Função pura — reusa `computeRollingBaseline` da M3.
- **Chart novo** `autonomic-balance-chart.tsx`: LineChart com 3 `ReferenceArea` (red z<-1σ / amber -1..+1σ / green z≥+1σ), `ReferenceLine` em y=0, linha tênue do z diário + linha grossa do SMA-7d, tooltip educativo (HRV bruto, RHR bruto, ratio, ln(ratio), z, banda, SMA), badge "Último" no header com z atual + nome da banda. DataReadinessGate 30/14/7.
- **Hard-remove**: `hrv-analysis.tsx` + `heart-rate-bands.tsx` deletados. Hook `useCardioAnalysis.ts` enxugado — saíram `HrvBaselineBand`, `OvertrainingStatus`, `computeHrvBaselineBands`, `computeOvertrainingStatus`, `stdDev`, `OVERTRAINING_MIN_DAYS`. Restaram `RecoveryScore` + `computeRecoveryScore` + `clamp` + `BASELINE_WINDOW` (legacy ainda consumido em `executiveMetrics` no Panorama).
- **CHART_REQUIREMENTS**: `-hrvAnalysis`, `-heartRateBands`, `+autonomicBalanceChart` (30/14/7, field `hrvSdnn`).
- **App.tsx aba Coração**: agora apenas 3 charts (era 4) — ABI → HRRangeChart → CardioRecoveryChart.

**Decisões metodológicas:**
- **Por que log:** ratio HRV/RHR é positivamente skewed (HRV 15-80ms, RHR 50-80bpm, curtose pesada). `ln(HRV/RHR)` normaliza antes do z-score, evitando que outliers altos puxem desproporcionalmente a média.
- **Política rigorosa de inputs:** HRV+RHR ambos obrigatórios. Se 1 faltar, abi=null com `reason: 'inputs_missing'`. Mesma decisão da M4 — revisável.
- **Regra interim M6:** snapshot `interpolated || forecasted` → abi=null com reason correspondente. Baseline ignora esses dias na média + SD.
- **Proteção contra log inválido:** `hrv≤0 || rhr≤0` → `inputs_missing` (evita NaN propagando).
- **Threshold 30/14/7** (vs 28/14/7 do Recovery Score): log-ratio precisa de mais histórico pra estabilizar SD; 2 dias a mais no robustMin é margem prudente.
- **SD=0 fallback:** se baseline tem variância zero (improvável fora de teste sintético), z-score retorna 0 — evita divisão por zero.

**Trade-off aceito:** hard-remove (autorização explícita do Anders) significa que se HRV cru ou FC banded voltar a ser útil em alguma análise futura, é `git revert 7fab71b` ou reescrever. Como pesava ~600 linhas de código não-reusado fora da aba Coração, decisão de blast radius foi favorável à limpeza.

**Risco mapeado pra acompanhar:** se ABI ficar com range muito apertado pra Anders (-0.3 a +0.3 z em variação normal), pode indicar que HRV e RHR são colineares demais nele — a derivação composta acaba redundante. **Plano B documentado:** voltar a HRV + RHR separados na aba Coração (ou em outra aba). Sinalizar pra brainstorm da M6 se observado.

**Test novo:** `tests/autonomic-balance.test.ts` — sanity de `ABI_BAND_THRESHOLD=1`, dia médio z≈0 (HRV=50, RHR=60), parassimpático z>+1 (HRV=90, RHR=50), simpático z<-1 (HRV=30, RHR=80), reason variants (interpolated/forecasted/inputs_missing por HRV null/inputs_missing por RHR null/baseline_missing por dataset curto), baseline filtra forecast poluidor (HRV=9999), proteção contra log inválido (hrv=0 → inputs_missing), série mantém 1 ponto por snapshot.

**Validação local:** `tsc --noEmit` ✅ · `lint` ✅ · `test:unit` ✅ · `build` ✅ (817ms, bundle -7kB pelo hard-remove). **UI manual NÃO testada** nesta sessão — Chrome DevTools MCP indisponível (config persistente requer restart de sessão). Validação visual fica pra Anders no /coracao da próxima abertura.

---

**Plano original (preservado pra auditoria):**

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

## KICKOFF — Continuação Sprint M6 (próxima sessão fresh)

> **Atenção:** M6 já está EM ANDAMENTO. Brainstorm + plano já feitos numa sessão anterior. Plano fechado em `/root/.claude/plans/crystalline-wondering-dijkstra.md`. NÃO refazer brainstorm — retomar execução das tasks pendentes.

### Estado atual (commits no main, todos verdes)

**Fatia M6.1 — Política de interp unificada ✅** (3 commits)
- 137d63a `feat(m6.1.a)`: recovery-score calcula em dia interp com flag derivedFromInterpolated
- 7aa2688 `feat(m6.1.b)`: autonomic-balance segue policy + cria interp-policy.ts (INTERP_CONFIDENCE_MULTIPLIER=0.7)
- b0f4c95 `feat(m6.1.c)`: charts mostram tracejado em dia interp + cleanup test assertions

**Fatia M6.2 — Payload IA enriquecido ✅** (5 commits)
- a3e5bab `feat(m6.2.a)`: payload_helpers.build_pk_series — concentrações ao meio-dia por substância × data
- 757b9b7 `feat(m6.2.b)`: ForecastRequest aceita sleep_detail + derivations + flag interp
- dfb8803 `feat(m6.2.c)`: _build_prompt enriquecido com PACIENTE + REGIME + PK + DERIVAÇÕES
- 0584d57 `feat(m6.2.d)`: forecast-payload-enrichment.ts agrega derivações por dia
- bff5752 `feat(m6.2.e)`: useForecast envia payload enriquecido — sleep detail + derivações + flag interp

**Fatia M6.3 — Relatório modal — PARCIAL (2/6 commits)**
- a44c525 `feat(m6.3.a)`: storage.record_report + load_reports + get_report (+ .gitignore Forecast/*history.json)
- 8ba37fd `feat(m6.3.b)`: POST /forecast/report com verbosity high + persistência (3 endpoints novos: /report, /reports, /reports/{id})

### Tasks pendentes (na ordem)

- **M6.3.c** — Frontend: criar `frontend/src/hooks/useForecastReport.ts` (hook React Query pra POST /forecast/report) + integrar `lib/api.ts`.
- **M6.3.d** — Frontend: criar `frontend/src/components/charts/ForecastReportModal.tsx` (modal fullscreen com narrative + forecast 5d + signals + drivers).
- **M6.3.e** — Frontend: refactor `App.tsx` (botão único "🔮 Análise IA" + modal mounted) + `TabNav.tsx` (remover segmento toggle ON/OFF).
- **M6.3.f** — Frontend: histórico de relatórios dentro do modal (lista + click navega entre relatórios persistidos).
- **M6-final** — Pós-Sprint Protocol: marcar M6 CONCLUÍDA no ROADMAP_maturation.md (substituir esta seção KICKOFF), atualizar CLAUDE.md raiz, reescrever KICKOFF apontando pra M7 (a definir).

### Estado técnico

- Frontend: tsc + lint + test:unit + build verdes pós-bff5752 (M6.2.e). Chunk warning >500kB pré-existente.
- Backend Python: 47 tests verdes (test_forecast) + 16 (test_forecast_payload_helpers) + farma/mood inalterados.
- Service `roocode.service` pode precisar restart pra pegar mudanças backend M6.3.b (não rodado nesta sessão).
- Decisões metodológicas (todas fechadas com Anders no plan):
  - Interp policy: incluir interp com flag explícita + confidence
  - Payload enrichment: TODOS os 4 (PK + derivações + sono detalhado + contexto clínico)
  - UX: modal fullscreen
  - Persistência: reports_history.json com pattern de forecast_history.json
  - Modelo: gpt-5.4-mini + reasoning_effort high (já) + verbosity high (M6.3.b adiciona com fallback)

### Como retomar

```
Olá Claude! Sou o Anders. Retomando RooCode Sprint M6.

Sessão anterior: 9 de 14 tasks done (M6.1 + M6.2 inteiras + M6.3.a/b backend).
Próxima task = M6.3.c — frontend useForecastReport.ts hook.

Plano completo em /root/.claude/plans/crystalline-wondering-dijkstra.md.
Estado real em /root/RooCode/ROADMAP_maturation.md (esta seção é o KICKOFF de continuação).

Modo de trabalho: orchestrator-driven (sem subagents — Anders pediu).
Acompanho cada commit antes de seguir pra próxima task.

Bora seguir!
```

### Pós-Sprint Protocol obrigatório (ao fechar M6.3.f)

Ver `~/.claude/rules/sprint-system.md` regra 7. Quando todas as 14 tasks estiverem done:
- Marcar M6 CONCLUÍDA na tabela executiva (✅ + commits range)
- Bloco Status no topo da seção M6 com 1-3 linhas resumindo
- Documentar trade-offs (interp days agora calculam derivações com flag, modal substitui toggle, reports_history persiste)
- Reescrever este KICKOFF apontando pra M7 (a definir com Anders)
- Atualizar CLAUDE.md raiz: M6 nas concluídas + linha no Status local validado

---

## KICKOFF — Brainstorm Sprint M6 ORIGINAL (preservado pra histórico)

> Este era o KICKOFF antes de Anders abrir o brainstorm. Mantido como registro
> da decisão metodológica original. Brainstorm executado em 2026-05-10 e plano
> fechado em `/root/.claude/plans/crystalline-wondering-dijkstra.md`.

```
Olá Claude! Sou o Anders. Estamos retomando o RooCode (`/root/RooCode`).
Sessão fresh — siga sprint-system.md (especialmente Pós-Sprint Protocol,
regra 7) e o protocolo de fresh start do AGENTS.md.

# Sprint M6 — Interpolation Strategy (brainstorm + execução)

**Status:** ⏳ ABERTA — requer brainstorm dedicado ANTES de codar.

**Por que cross-cutting:** afeta retroativamente Recovery Score (M4) e
Autonomic Balance Index (M5) — eles aplicam regra interim conservadora
(score=null em dia interpolated/forecasted; baselines ignoram dias
interpolated). Se M6 mudar essa política, M4/M5 precisam refletir.

**Antes de codar, brainstormar com Anders** sobre as 4 dimensões abertas:

1. **Política base por consumo (correlações, derivações):**
   - Excluir interpolated rows? (conservador, perde poder estatístico)
   - Downweight por confiança da interpolação? (elegante, +1 parâmetro livre)
   - Limitar interpolação a janelas curtas (≤2d)? (pragmático mas arbitrário)
   - Bootstrap blocking pra séries com autocorrelação? (rigoroso, complexo)

2. **Propagação em derivações compostas (M3/M4/M5):**
   - Recovery Score deve marcar `interpolated: true` se ≥1 input é interp?
   - ABI deve ter `interpolated: true` se HRV ou RHR daquele dia é interp?
   - Wrist Temp Deviation deve excluir baselines computadas sobre dias interp?
   - Política UNIFICADA vs por-derivação?

3. **Visualização:**
   - Marcar correlações que dependem fortemente de interpolated data com
     badge "n_real / n_total"?
   - Mostrar 2 r's no scatter: um com tudo, outro só com reais?
   - No Recovery Score / ABI: relaxar regra "5/5 obrigatório" se 4/5 + 1
     interp permite score com reescala? Mostrar marker de confiança?

4. **Backend (Interpolate/router.py):**
   - Como funciona hoje? (Read antes de propor)
   - Está sendo usado consistentemente em todas as derivações?
   - Há mismatch entre `interpolated` flag e o que efetivamente foi
     interpolado vs preservado?

**Sinais empíricos pra trazer pro brainstorm (capturar antes da sessão):**
- Recovery Score M4 está se mostrando "muito esparso" pra Anders? (sinal
  de que a regra interim 5/5 + null em interp está descartando demais).
- ABI M5 tem range muito apertado (-0.3 a +0.3)? (pode ser colinearidade
  HRV/RHR, OU pode ser a regra interim filtrando dias úteis).
- Correlações nos charts de PK×Humor / lag analysis estão visivelmente
  diferentes quando comparadas "com interp" vs "só real"?

**Workflow proposto pra próxima sessão:**

Fase 1 — Reconhecimento (read-only):
1. Read /root/RooCode/Interpolate/router.py + utils.py (entender política atual).
2. Read frontend/src/utils/interpolate.ts (frontend side).
3. Mapear: quais derivações HOJE excluem interpolated? quais incluem?
4. Trazer dados empíricos: Anders abre /panorama e /coracao, screenshot
   do Recovery Score e ABI atual.

Fase 2 — Brainstorm (usar superpowers:brainstorming):
1. Apresentar trade-offs das 4 dimensões com exemplos.
2. Anders escolhe política (pode ser híbrida: regra A pra plotagem, regra
   B pra correlações, regra C pra derivações compostas).
3. Plan mode pra documentar decisão antes de codar.

Fase 3 — Execução:
1. Refletir mudanças em M3/M4/M5 (se houver) — pode exigir tweaks pequenos
   nos utilities.
2. Eventualmente atualizar Interpolate/router.py.
3. Atualizar docs (ROADMAP + CLAUDE.md raiz).
4. Validação + commit.

**Arquivos prováveis de tocar:**
- `/root/RooCode/Interpolate/router.py` (backend)
- `/root/RooCode/Interpolate/utils.py` (backend)
- `/root/RooCode/frontend/src/utils/interpolate.ts`
- Possíveis tweaks em `recovery-score.ts`, `autonomic-balance.ts`,
  `personal-baselines.ts`, `correlations.ts`, `intraday-correlation.ts`.

**Não comece codando.** Se entrar na sessão e tentar pular o brainstorm,
está pulando a parte mais importante. M6 é decisão metodológica antes
de ser código.

**Pós-Sprint Protocol obrigatório** (ver `/root/.claude/rules/sprint-system.md` regra 7):
- Marcar M6 como concluída no ROADMAP_maturation.md (status + commit hash).
- Atualizar tabela executiva (✅ + hash).
- Adicionar bloco "Status / Resultado" no topo da seção M6.
- Reescrever este KICKOFF apontando pra próximo passo (provavelmente fim
  do roadmap M1-M6 ou nova fase combinada com Anders).
- Atualizar CLAUDE.md raiz: adicionar M6 nas concluídas + linha no Status local.

**ROADMAP completo:** /root/RooCode/ROADMAP_maturation.md
**Sessão de planejamento original:** /root/.claude/plans/vamos-brainstormar-entao-meu-virtual-brook.md
**Seção M6 detalhada (princípios + backlog):** ROADMAP_maturation.md `## Sprint M6 — Interpolation Strategy`

Bora brainstormar!
```
