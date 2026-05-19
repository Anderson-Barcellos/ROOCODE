# RooCode — Project Memory

Use `CLAUDE.md` as the main operational handoff for runtime, topology, commands, and validated product constraints. This file records concise implementation notes that future sessions should not have to rediscover.

### 2026-05-16 16:32 - Panorama bundle 1 top hierarchy

Context:
Implemented the first Panorama cleanup bundle focused only on top hierarchy and duplicated context, without changing the deeper clinical cards.

Details:
`frontend/src/App.tsx` now uses a Panorama-specific `metaPanel` in `SurfaceFrame` to replace the old `Janela analítica` + `Status` pair with a single `Cobertura da janela` card. The internal top trio changed from `Agora / Janela / Confiança` to `Agora / Cobertura / Confiança`, with `Confiança` visually dominant and compact. Coverage counts only real snapshots (no interpolated or forecasted points) via `frontend/src/utils/panorama-top.ts`. `frontend/tests/panorama-top.test.ts` covers coverage math and compact confidence-priority behavior.

Notes:
This bundle intentionally does not change `dailyVerdict`, `MetricGrid`, `WeekdayWeekendCard`, or `RecoveryScoreChart` beyond feeding the new top summaries. Next Panorama bundles should treat this top structure as the new baseline instead of reintroducing range/status duplication.

### 2026-05-16 16:48 - Panorama home restructure (IMPLEMENTACAO FEITA POR 5.3 CODEX VIA API)

Context:
Reworked the Panorama tab as a true start dashboard, keeping the existing visual theme but changing hierarchy, organization, and feature mix.

Details:
`frontend/src/App.tsx` now gives Panorama a compact contextual top hero ("Estado geral para decidir o dia") instead of the generic pharmacokinetic manifesto. Panorama then starts with a large "Estado de hoje" hero driven by `dailyVerdict`, followed by two compact KPI groups: `Sinais principais` and `Rotina e humor`. PK/remedy content was removed from the Panorama body; `PKCoverageCard` remains in Farmaco only. The explanatory area now uses only `LimitingFactorCard` and `NightQualityCard`, while `WeekdayWeekendCard` and `RecoveryScoreChart` moved into a secondary "Direção" section. `SurfaceFrame.metaPanel` is still used for Panorama-specific header metadata, now as `Dados usados`. `frontend/src/index.css` adds the `hero-panel--compact` variant. The small `Recovery atual` card should stay aligned with `dailyVerdict.score` instead of the older `useCardioAnalysis` shortcut to avoid contradicting the hero.

Notes:
Future Panorama changes should preserve this boundary: Panorama summarizes general state and decision readiness; medication/PK detail belongs in Farmaco unless implemented as a deliberately exceptional safety alert.


2026-05-16 19:15 - Pré-auditoria PK Variability: mapa de consumidores e riscos
Context:

Anders pediu confirmação pré-implementação para um plano de refatoração do PK Variability Lab, com foco em coerência backend/frontend e critérios de robustez estatística.
Details:

Mapeados utilitários da seção 7 e consumidores principais:
frontend/src/utils/pk-variability.ts → pk-variability-humor-lab.tsx, pk-variability-heatmap.tsx, pk-variability-report-card.tsx, frontend/tests/pk-variability.test.ts.
frontend/src/utils/correlations.ts → correlation-heatmap.tsx, pk-variability-humor-lab.tsx.
frontend/src/utils/temp-humor-correlation.ts → temp-humor-correlation.tsx, frontend/tests/temp-humor-correlation.test.ts.
frontend/src/utils/intraday-correlation.ts → múltiplos charts PK×humor/lag e cards de variabilidade + testes intraday/statistics.
frontend/src/utils/aggregation.ts e data-readiness.ts → consumidores amplos no App/charts/hooks.
frontend/src/utils/interpolate.ts → useInterpolation.ts e pages/InterpolationDemo.tsx.
Utilitários adicionais com derivação não trivial que devem entrar na auditoria: frontend/src/utils/statistics.ts, frontend/src/utils/pharmacokinetics.ts, frontend/src/utils/personal-baselines.ts.
Módulos backend relevantes para divergência de pipeline/performance: Farma/router.py (/doses, /concentration-series, _compute_daily_pk_series).
Confirmado: TIR diário já existe e é calculado no frontend em computeTirSeries (pk-variability.ts) com amostragem horária (24 pontos/dia) via calculateConcentration; não vem pré-computado upstream.
Notes:

Para suportar janelas 30/60/90 simultâneas sem regressão de performance, preferir uma série base única (90d) e derivar sub-janelas em memória; evitar multiplicar chamadas useConcentrationSeries/useDoses por janela.
2026-05-16 19:42 - PK Variability refactor v1 (robustez + transparência)
Context:

Anders aprovou executar a refatoração para reduzir incoerências metodológicas entre destaque de UI e robustez estatística no PK Variability Lab.
Details:

frontend/src/utils/pk-variability.ts recebeu expansão da pipeline:
novas métricas swing_in_range e swing_transgressor;
classificação diária de saída de range (vale_breve vs plateau_baixo) e censura quando N_plateau_baixo < 5;
replicação cross-janela 30/60/90 com flags de inversão de sinal e drift de magnitude;
consistência cross-lag e cross-tab swing × TIR com mediana de humor por célula e flag de baixa potência (n<5).
frontend/src/components/charts/pk-variability-humor-lab.tsx passou a exibir tiers visuais (robusto / a vigiar / ruído), warning de inversão de sinal, card explícito de censura amostral e matriz swing×TIR.
frontend/src/components/cards/pk-variability-report-card.tsx trocou critério de "sinal detectado" para classificação por replicação+consistência; achado isolado não vira destaque principal.
frontend/src/components/charts/temp-humor-correlation.tsx + frontend/src/utils/temp-humor-correlation.ts agora mostram flag explícita quando hipótese pré-registrada (+1d negativo) é contradita no período.
frontend/src/components/charts/forecast-accuracy-card.tsx ganhou warning explícito para MAPE > 100% (modelo não preditivo no período).
frontend/src/components/charts/correlation-heatmap.tsx ajustado para declarar exclusão de dias interpolados/forecasted (em vez de dizer que estavam incluídos).
frontend/src/App.tsx ajustado na aba Insights para exibir Dados usados com separação clara entre janela analítica, histórico total e cobertura pareada humor×métrica; banner de interpolação também ficou menos ambíguo quando não há lacunas.
Documentação adicionada em frontend/src/utils/README.md e novo teste frontend/tests/correlations.test.ts (incluído em run-all.test.ts).
Notes:

PKVariabilityHeatmap legado foi mantido com métricas base (cv/swing/tir) para compatibilidade visual; a exploração completa ficou concentrada no PKVariabilityHumorLab.
Verificação frontend em verde: npm run test:unit, npx tsc --noEmit, npm run lint, npm run build.
2026-05-16 19:58 - Reconhecimento pós-refactor e plano de paridade front↔back
Context:

Anders pediu um novo reconhecimento completo (levantamento + plano) antes de seguir com commit/push.
Details:

Estado atual confirma avanço metodológico no frontend (pk-variability.ts, pk-variability-humor-lab.tsx, pk-variability-report-card.tsx) com replicação 30/60/90, tiers, censura e cross-tab swing×TIR.
Risco de coerência ainda aberto: useConcentrationSeries pode usar regimen_fallback no backend (Farma/router.py:751-803), mas TIR no frontend usa useDoses (apenas dose log real via /farma/doses) + calculateConcentration; isso pode produzir TIR divergente em períodos sem dose log real.
Outros pontos remanescentes para fase 2:
MoodDriverBoard continua baseado em delta de baseline e não em correlação (potencial desalinhamento narrativo com heatmap).
Falta teste de paridade numérica ponta-a-ponta comparando derivados frontend vs backend bruto por janela (30/60/90) e por lag.
Comentários legados em pk-variability-report-card.tsx ainda descrevem critério antigo (9 combinações/sinal forte por p-value).
Notes:

Próximo passo recomendado: criar auditoria de paridade com fixtures douradas (backend series + doses/regimen) e migrar TIR para usar exposição diária derivada da própria série backend (ou endpoint backend dedicado de range-exposure) para eliminar drift estrutural.
2026-05-16 20:15 - Paridade fase 1: guard rail para fallback de regime
Context:

Executada a fase inicial de paridade front↔back para evitar incoerência silenciosa nas métricas derivadas de range (TIR/swing condicional) quando backend usa série com fallback de regime.
Details:

frontend/src/utils/pk-variability.ts agora detecta confiabilidade de métricas dependentes de dose local:
novo helper evaluateDoseDerivedReliability;
quando série PK está positiva mas não há doses locais, métricas tir, swing_in_range, swing_transgressor retornam null (em vez de pseudo-resultado incoerente);
PKVariabilityHypothesis ganhou doseDerivedMetricsReliable e coherenceWarning.
frontend/src/components/charts/pk-variability-humor-lab.tsx exibe warning explícito de coerência front↔back quando essa condição ocorre.
Novo teste de auditoria: frontend/tests/pk-variability-parity.test.ts (incluído no run-all.test.ts) cobrindo o cenário de risco e os guard rails.
Notes:

Esta fase não resolve paridade numérica absoluta; ela evita overclaim quando faltam dados locais para recomputar range de forma equivalente ao backend.
Próxima fase recomendada: endpoint backend de range-exposure diário para eliminar a necessidade de recomputar TIR no frontend.
2026-05-16 20:36 - Paridade fase 2: endpoint backend de range exposure integrado
Context:

Continuação da paridade front↔back para reduzir drift estrutural das métricas de range no PK Variability.
Details:

Backend (Farma/router.py):
novo endpoint GET /farma/range-exposure-series com a mesma lógica de resolução de eventos usada em concentration-series (incluindo fallback de regime e warm-up);
novos helpers _resolve_pk_dose_events e _compute_daily_range_exposure;
retorno diário de in_range_hours, out_of_range_hours, below_range_hours, above_range_hours, low_exit_class.
Frontend API (frontend/src/lib/api.ts):
novos tipos RangeExposureSeriesPayload / RangeExposureSeriesPoint;
novo hook useRangeExposureSeries.
Pipeline PK (frontend/src/utils/pk-variability.ts):
analyzePkVariabilityVsMood e buildPkVariabilitySeries agora aceitam override de exposição diária vindo do backend;
confiabilidade de métricas dependentes de dose (doseDerivedMetricsReliable) considera override backend para evitar falso warning.
UI PK Variability:
pk-variability-humor-lab.tsx e pk-variability-report-card.tsx passam a consumir useRangeExposureSeries e alimentar o pipeline com override quando disponível.
Testes:
frontend/tests/pk-variability-parity.test.ts expandido para cobrir cenário com override backend;
python -m py_compile Farma/router.py executado para sanity sintático backend.
Notes:

Resultado prático: quando backend fornece exposição de range, frontend deixa de depender exclusivamente de useDoses para TIR/swing condicional, reduzindo inconsistência em contexto de fallback de regime.
2026-05-16 21:01 - Fase 3 concluída: narrativa Mood Driver alinhada ao heatmap
Context:

Avançada a fase de consistência narrativa final para reduzir discrepância interpretativa entre MoodDriverBoard e correlações Pearson.
Details:

frontend/src/components/charts/mood-driver-board.tsx agora calcula um cue de Pearson lag0 por driver (quando n>=10) usando utils/statistics.pearson.
Cada card mantém a natureza operacional (delta vs baseline), mas exibe badge de coerência com categorias:
alinhado,
fraco,
direção oposta,
insuficiente (n<10).
Bloco de evidência expandido passou a mostrar r, p, n do Pearson lag0.
Texto de cabeçalho do board foi atualizado para deixar explícito que ele não substitui o heatmap.
Comentário de topo em pk-variability-report-card.tsx atualizado para refletir o critério novo de replicação/cross-lag (remove descrição legada do critério antigo).
Notes:

Verificação em verde após a fase 3: npm run test:unit, npx tsc --noEmit, npm run lint, npm run build.
### 2026-05-16 23:41 - REBUILD phase 1: Recuperação + Capacidade + horários de sono
Context:

Implementada a refatoração principal do spec `REBUILDING (Phase 1).md`, com mudança de taxonomia das abas e extensão do pipeline de sono para suportar regularidade/jet lag social.
Details:

Backend `Sleep/sleep.py` deixou de descartar `Start/End` ou `Iniciar/Fim`; frontend passou a carregar `sleepStartAt` e `sleepEndAt` em `HealthAutoExportRow` / `DailyHealthMetrics`, agregados em `frontend/src/utils/aggregation.ts` e preservados no mock/interpolação.
`frontend/src/utils/recovery-index.ts` introduziu o novo `Recovery Index` basal (sono + débito + HRV + RHR + temp noturna) com confiança parcial e badge exploratória enquanto baseline pessoal <30 dias.
`frontend/src/utils/sleep-regularity.ts` implementou a proxy de `Sleep Regularity Index` baseada em onset/offset e o cálculo de `Social Jet Lag` por midsono útil vs fim de semana.
UI reorganizada em `frontend/src/App.tsx` e `frontend/src/components/navigation/TabNav.tsx`: abas finais agora são `Panorama`, `Recuperação`, `Capacidade`, `Farmaco`, `Insights`. `Recuperação` absorve Sono + autonômico basal; `Capacidade` absorve os cards de resposta a esforço antes em Coração.
Novos componentes: `RecoveryIndexCard`, `RecoveryIndexChart`, `SleepRegularityCard`, `CardiovascularAgeCard`, `RecoveryWeekCard`.
Testes adicionados: `frontend/tests/recovery-index.test.ts` e `frontend/tests/sleep-regularity.test.ts`; fixtures antigas atualizadas para o novo contrato com `sleepStartAt/sleepEndAt`.
Validação concluída: `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `/root/RooCode/bin/python -m py_compile Sleep/sleep.py`, `systemctl restart roocode.service`, `curl` 200 em `http://localhost:8011/sleep`, `https://ultrassom.ai/health/` e `https://ultrassom.ai/health/api/sleep`.
Notes:

`Recovery Score` antigo permaneceu no código para compatibilidade com consumidores legados, mas o centro narrativo de Panorama/Recuperação agora é o `Recovery Index`.
O SRI é explicitamente uma proxy exploratória baseada em horários de dormir/acordar, não a implementação minuto-a-minuto original de Phillips 2017.
Próxima retomada recomendada: QA visual focado em `Panorama -> Recuperação -> Capacidade` e então escolha entre polimento narrativo do Panorama, expansão de temperatura circadiana real ou spec nova de Capacidade.

### 2026-05-17 15:03 - Capacidade refactor: FCI + carga real + marcha/circadiano

Context:
Implementada a spec completa da aba Capacidade para responder como o corpo reage sob demanda, preservando Prontidão de Movimento como abridor e reorganizando os cards antigos em painéis narrativos.

Details:
`frontend/src/App.tsx` agora renderiza 6 painéis em Capacidade: Prontidão, Functional Capacity Index, Capacidade cardiovascular, Carga real, Circadian Robustness e Movement Efficiency. Novos utilitários: `functional-capacity.ts`, `movement-efficiency.ts`, `circadian-robustness.ts`. Novo componente agregador: `frontend/src/components/charts/capacity-panels.tsx`. O contrato Apple Health ganhou campos opcionais para `walkingDoubleSupportPct` e `runningGroundContactTimeMs`, mapeados no adapter quando as colunas existirem; interpolação não inventa esses sinais. Testes novos cobrem renormalização por input ausente, alerta persistente de marcha, CRI exploratório sem amplitude térmica e mapeamento do adapter.

Notes:
Amplitude térmica circadiana continua pendente com honestidade porque o pipeline atual só possui temperatura noturna agregada. HRR/6MWT não penalizam FCI quando ausentes; peso vira zero e confiança cai. Validação em verde: `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Rotas vivas: `https://ultrassom.ai/health/` 200 e `GET https://ultrassom.ai/health/api/sleep` 200.

### 2026-05-17 15:12 - FCI usa último valor válido por componente

Context:
Após revisão visual, o FCI aparecia com vários componentes pendentes apesar de haver fonte real em dias próximos, porque o cálculo usava o mesmo último snapshot parcial para todos os componentes.

Details:
`frontend/src/utils/functional-capacity.ts` agora busca o último valor válido por componente dentro do recorte visível. VO2 estimado prioriza fórmula preditiva por FC de repouso recente; VO2 Apple/AutoExport fica como fallback/cross-check. Reserva cardíaca e cronotrópica usam o último ponto válido das séries derivadas no recorte, e HRR1 permanece pendente quando `Recuperação Cardio` não existe na fonte. Teste `frontend/tests/functional-capacity.test.ts` cobre dia mais recente parcial com 6MWT e dados cardiovasculares válidos em dia anterior.

Notes:
No payload real validado em 2026-05-17, RHR e FC caminhada existem até 2026-05-14, 6MWT existe em 2026-05-16, VO2 Apple é raro/antigo, e HRR1 ainda não tem fonte registrada.

### 2026-05-17 16:38 - CRI com proxy térmica por baseline e interpolação leve

Context:
Anders pediu para o Circadian Robustness Index aproveitar variações da temperatura do pulso/braço vs baseline, mesmo com falhas ocasionais de captura do Apple Watch.

Details:
`frontend/src/utils/circadian-robustness.ts` trocou o componente térmico pendente por uma proxy noturna: `Temp. pulso vs baseline`. O cálculo usa `pulseTemperatureC`, cria baseline pessoal recente (mínimo 10 pontos, janela 30), pontua pelo desvio absoluto do valor mais recente contra esse baseline, e permite interpolação leve apenas para lacunas curtas entre valores reais. A interpolação só preenche até 3 dias ausentes e rejeita mudanças maiores que 0,25 °C/dia. `frontend/tests/circadian-robustness.test.ts` cobre componente térmico ativo, interpolação leve e lacuna longa.

Notes:
Isso não é amplitude circadiana intradia real; é uma proxy de estabilidade/desvio térmico noturno do wearable. Continuar usando linguagem de proxy no CRI até existir dado intradia ou método cosinor/RA verdadeiro.

### 2026-05-17 16:58 - Recovery Index: não mostrar input ausente como zero

Context:
Anders questionou valores baixos no painel "Quanto meu corpo recuperou?". Auditoria com payload real mostrou que o score final estava correto, mas a UI podia induzir erro ao ranquear componentes ausentes como 0/100.

Details:
`frontend/src/utils/recovery-index.ts` agora permite `rankRecoveryIndexComponents(components, inputsUsed)`, filtrando apenas inputs realmente usados. `RecoveryIndexCard`, `RecoveryWeekCard` e o veredito diário no `App.tsx` passaram a usar `inputsUsed`, evitando que `pulseTemp` sem dado apareça como pior componente. Também renomeado o card CRI visualmente para `Robustez circadiana parcial` em `capacity-panels.tsx`.

Notes:
No payload real de 2026-05-17, Recovery Index 39 vinha de sono ~49,7, débito de sono 28,4 (7,16h/7d), HRV 13,0 (HRV 13,32 vs baseline 23,43) e RHR 62,5. Temperatura do pulso estava ausente no dia e não deveria ser interpretada como 0.

### 2026-05-18 14:08 - Governanca de indices (Recuperacao + Capacidade)

Context:
Implementada governanca formal de evidencias para indices clinicos de Recuperacao/Capacidade, com matriz central de fonte/proxy/interpolacao/confianca e reforco de elegibilidade por readiness especifico por indice.

Details:
Novo modulo `frontend/src/utils/index-evidence.ts` com tipos publicos (`EvidenceSourceKind`, `InterpolationPolicy`, `IndexEvidenceSpec`, `IndexEvidenceReport`) e matriz oficial `INDEX_EVIDENCE_MATRIX` para: NightQuality, RecoveryIndex, SleepRegularity, AutonomicBalance, HRVVariability, HRRange, CardiovascularAge, ActivityReadiness, FunctionalCapacityIndex, CircadianRobustness e MovementEfficiency. `frontend/src/utils/data-readiness.ts` ganhou chaves dedicadas de readiness (`nightQualityIndex`, `recoveryIndex`, `sleepRegularityIndex`, `cardiovascularAgeIndex`, `activityReadinessIndex`) mantendo thresholds por indice. Indices passaram a emitir metadados de evidencia nos calculos: `sleep-quality-score.ts`, `recovery-index.ts`, `sleep-regularity.ts`, `autonomic-balance.ts`, `hrv-variability.ts`, `activity-readiness.ts`, `functional-capacity.ts`, `circadian-robustness.ts`, `movement-efficiency.ts`; `HRRange` e `CardiovascularAge` receberam evidencias no nivel da leitura do card/chart. Politica aplicada: score_with_penalty (RecoveryIndex/NightQuality/Circadian), visual_only (FCI/MEI/Activity/HRRange/CardiovascularAge), none (SleepRegularity). Adapter reforcado para coluna real `Porcentagem de Suporte Duplo ao Caminhar (%)` em `frontend/src/utils/roocode-adapter.ts` e tipo em `frontend/src/lib/api.ts`.

Notes:
Fonte de verdade documental da matriz ficou em `frontend/src/utils/INDEX_EVIDENCE_MATRIX.md`. Novos testes: `frontend/tests/index-evidence-matrix.test.ts` e `frontend/tests/index-evidence-behavior.test.ts`, mais regressao do adapter em `frontend/tests/roocode-adapter.test.ts`. Suite verde com `npm run test:unit`, `npx tsc --noEmit`, `npm run build`.

### 2026-05-18 16:14 - Panorama refactor final (decisão + trinca + atalhos)

Context:
Implementada a refatoração final da aba Panorama para virar tela de decisão rápida, removendo KPIs fisiológicos crus e consolidando o fluxo `1 número -> 3 índices -> atalhos`.

Details:
`frontend/src/utils/panorama-model.ts` virou o motor único da aba, consumindo índices já existentes (Recovery Index, Functional Capacity e Circadian Robustness) sem duplicar fórmulas. O `Estado geral` foi implementado com pesos fixos (40/35/25), renormalização por pilar ausente, suavização por EMA curta e modulação PK por cap progressivo com transparência explícita. Regras de decisão determinísticas agora bloqueiam veredito verde sob modulação moderada e forçam recomendação conservadora sob modulação alta. `frontend/src/App.tsx` foi reorganizado em 5 painéis (Estado de hoje, Trinca sintética clicável, Humor+Cobertura PK, Regime semanal, Histórico longitudinal), incluindo navegação de Cronobiologia para `Capacidade` com foco no painel circadiano (`#capacity-panel-circadian`). Novos componentes de visualização: `panorama-sparkline.tsx`, `panorama-weekly-regime-card.tsx`, `panorama-history-chart.tsx`. Testes novos em `frontend/tests/panorama-model.test.ts` (composição, renormalização, modulação PK, sem dose registrada e bloqueios de status por PK), incluídos no `run-all.test.ts`.

Notes:
Validação completa em verde após ajustes de tipagem/lint: `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. O build mantém apenas warning não-bloqueante de chunk >500kB; sem impacto funcional nesta sprint.

### 2026-05-18 19:31 - QA visual mobile e warnings Recharts

Context:
Rodada de QA renderizada com a skill `frontend-testing-debugging` após o refactor final do Panorama, focada no fluxo `Panorama -> Recuperação -> Capacidade` em `https://ultrassom.ai/health/`.

Details:
Corrigido overflow horizontal mobile no topo: `frontend/src/components/navigation/TabNav.tsx` agora permite quebra do grupo `Período + Análise IA` e reduz a margem do botão em viewport estreito. Padronizados os `ResponsiveContainer` restantes em `frontend/src/components/charts/*.tsx` com `minWidth={0}`, `minHeight={0}` e `initialDimension={{ width: 1, height: 1 }}`, seguindo o padrão já usado nos charts que não geravam warning. Validação: `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm run build` e Playwright com Chrome do sistema em desktop 1440x1000 e mobile 390x844. Depois do patch, console ficou sem warnings/errors e mobile reportou `scrollWidth=390` para `clientWidth=390`.

Notes:
Browser plugin não estava disponível nesta sessão; Playwright foi usado com pacote temporário em `/tmp/roocode-playwright-check` e `/usr/bin/google-chrome`, sem alterar dependências do repo. O build ainda emite apenas o warning conhecido de chunk >500kB.
