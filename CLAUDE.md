# RooCode — Handoff Operacional (estado real)

Pipeline: iPhone AutoExport → FastAPI (8011) → React/Vite (3031) → Apache → `https://ultrassom.ai/health/`

Este arquivo é o handoff curto para sessão fresh. Ordem de execução fica em `ROADMAP.md`; contrato operacional em `AGENTS.md`.

## Stack

- **Backend:** FastAPI unificado em `main.py` (porta 8011), pandas, venv local (`/root/RooCode/bin/python`).
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query.
- **Módulos backend:** `Sleep/`, `Metrics/`, `Mood/`, `Farma/`, `Forecast/`, `Interpolate/`.
- **Farmacocinética:** `Farma/math.py` + `Farma/medDataBase.json` (backend) e `frontend/src/utils/pharmacokinetics.ts` (frontend).

## Runtime e serviços

- Backend oficial: `roocode.service` (`/etc/systemd/system/roocode.service`).
- Proxy Apache:
  - `/health/` → frontend (`localhost:3031`)
  - `/health/api/` → backend (`localhost:8011`)

## Comandos principais

```bash
# Backend
source /root/RooCode/bin/activate
/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011

# Frontend
cd /root/RooCode/frontend
npm run dev -- --host 0.0.0.0

# Qualidade
npx tsc --noEmit
npm run build
npm run lint
npm run test:unit

# Backend tests
cd /root/RooCode
/root/RooCode/bin/python -m unittest tests.test_farma -v
/root/RooCode/bin/python -m unittest tests.test_forecast -v
/root/RooCode/bin/python -m unittest tests.test_mood -v
git diff --check
```

## Endpoints principais

- `/sleep` (GET/POST)
- `/metrics` (GET/POST)
- `/mood` (GET/POST)
- `/farma/substances` (GET; `?full=true` para campos PK completos)
- `/farma/substances/{key}` (POST/PUT/DELETE custom)
- `/farma/regimen` (GET)
- `/farma/doses` (GET/POST)
- `/farma/doses/{id}` (PUT/DELETE)
- `/interpolate` (POST)
- `/forecast` (POST)

## Componentes ativos por aba (27 ativos — 2026-05-11; PKStandardDoseComparison removido em c741b40)

| Aba | Componentes |
|---|---|
| **Panorama** | MetricGrid (KPIs) · WeekdayWeekendCard · ForecastAccuracyCard · RecoveryScoreChart |
| **Farmaco** | MoodTimeline · PKMedicationGrid · PKHumorCorrelation · DoseLogger · DoseCalendarView · MedicationCatalogEditor |
| **Sono** | SleepStagesChart · SleepDebtChart · Spo2Chart · RespiratoryDisturbancesChart · VitalSignsTimeline |
| **Coração** | AutonomicBalanceChart · HrvVariabilityChart · HRRangeChart · HeartRateReserveChart · ChronotropicResponseChart · CardioRecoveryChart (⚪ empty sem HRR) |
| **Atividade** | ActivityReadinessCard · ActivityBars · StepsChart · Vo2MaxChart · WalkingVitalityChart |
| **Insights** | MoodDriverBoard · MoodLagHypothesisLab · CorrelationHeatmap · SleepDebtHrvCard · ScatterCorrelation · PKMoodScatterChart · PkRemSuppression · LagCorrelationChart · ForecastAccuracyCard (calibração técnica colapsada) |

## Notas operacionais recentes

- Forecast backend está OpenAI-only e com hardening de saída (dedupe/ordem por data futura, clamp de faixa, erro HTTP explícito).
- Logging de trace do forecast é opt-in via `FORECAST_DEBUG=true`.

## Status local validado (2026-05-11 — Sprint D-patch1 concluída)

- Frontend: tsc + lint + test:unit + build ✅ pós-3175be7 (M6.3.f)
- Backend: 47 tests verdes em test_forecast (era 29 antes de M6) + 16 em test_forecast_payload_helpers + farma/mood inalterados
- Diff hygiene: ✅ (`reports_history.json` adicionado ao .gitignore na M6.3.a)
- M6 CONCLUÍDA: 14/14 tasks done. Commits 137d63a → 3175be7 (14 commits, 13 feature + 1 docs intermediário). Plano completo em `/root/.claude/plans/crystalline-wondering-dijkstra.md`.
- Adapter PT-BR (`[Mínimo]/[Máx]/[Média]`) consolidado.
- `walkingStepLengthCm` exposto no pipeline (sem chart ainda — disponível pra próxima sprint visualizar).
- PKHumorCorrelation com pré-registro + lag sweep [-3d..+3d] + heatmap UI.
- PKStandardDoseComparison normalizado pelo pico simulado de cada substância (commits `b0622ff` + `6b1bc07`): 3 curvas em escala 0-100%, ReferenceLine y=100 representa "pico esperado do regime". **Componente removido depois em `c741b40`** ("feat(farmaco): clonazepam + heatmap UX + remove curvas comparativas") — substituído por outras visualizações. Mantido aqui como registro histórico da M1.
- Vo2MaxChart deriva via Uth-Sørensen (commit `611db4c`): VO2 estimado a partir de RHR, HRmax = 181 bpm via `Profile` pós-Sprint D (M2 original era 182 com idade 38; D ajusta canônico pra idade 39); `s.health.vo2Max` real do Apple Watch preservado pra outros consumidores (KPI, aggregation).
- VitalSignsTimeline com Wrist Temp Deviation + FR variability (commit `bb4cad6`): badge "Hipotermia" removido, painel temp passa a delta da baseline pessoal (média 30d, mín 14 reais), painel FR ganha YAxis secundário com SD rolling 7d. `s.health.pulseTemperatureC` preservado intacto no tipo/adapter/consumers.
- Utility `personal-baselines.ts` (`computeRollingBaseline` + `rollingStandardDeviation`) consolidada — reusada em M3 (Wrist Temp), M4 (Recovery Score) e M5 (ABI).
- Panorama tab exibe `RecoveryScoreChart` (commit `322781e`): score 0-100 composto (30% HRV z / 25% sleep eff / 20% RHR z invertido / 15% sleep debt 7d invertido / 10% mood reescalado). Regra interim M6 aplicada — score=null em interp/forecast. `timeline-chart.tsx` segue intacto (consumo em InterpolationDemo). Pesos preliminary calibration. **UI manual não validada nessa sessão** — Chrome DevTools MCP indisponível.
- Coração tab exibe `AutonomicBalanceChart` (commit `7fab71b`): z-score pessoal de `ln(HRV/RHR)`, baseline única do dataset (30/14, padrão M3/M4), 3 bandas (z<-1 simpático / -1..+1 equilibrado / z≥+1 parassimpático), SMA-7d sobreposto, tooltip educativo com HRV/RHR/ratio/log-ratio/z. **Hard-remove** dos antigos `hrv-analysis.tsx` e `heart-rate-bands.tsx`; hook `useCardioAnalysis` enxugado mantendo só `RecoveryScore` legacy (alimenta MetricGrid do Panorama). **UI manual não validada nessa sessão**.
- Sprint M7 — Coração expandida de 3 → 6 charts (commit `2380d20`): HrvVariabilityChart (SDNN bruto + SMA-7d/30d + rolling SD 7d + bandas populacionais + painel educativo 7 métricas HRV), HeartRateReserveChart (reserva bpm + dual Y-axis % caminhada via Karvonen), ChronotropicResponseChart (z-score pessoal walkingHR−RHR, padrão ABI). Bandas clínicas em utilities (HRV_BANDS_MALE_39, HRR_BANDS). 38 test cases novos. Análise IA ajustada: gpt-5.4-mini → gpt-5.1, reasoning medium, timeout 180s (commit `5c48c94`). **UI manual não validada nessa sessão**.
- Análise IA verbose em modal fullscreen (commits 137d63a → 3175be7): endpoint `POST /forecast/report` retorna narrative estruturada em 6 seções (contexto/hipóteses/tendências/drivers/projeção 5d/monitoramento) + drivers + signals + forecast cru, persistido em `Forecast/reports_history.json`. Frontend consome via `useForecastReport` mutation + `useForecastReportsList`/`useForecastReportById` queries. Modal Radix Dialog acessível pelo botão "🔮 Análise IA" no TabNav (cor violet, junto ao range selector). Histórico de relatórios clicável na sidebar. **Mudança comportamental:** forecast simples (linhas tracejadas nos charts) agora sempre on (não mais toggle ON/OFF — segmento removido do TabNav), 1 request OpenAI por sessão (cached 1h). `ForecastSignalsPanel.tsx` **removido na Sprint R** (2026-05-11) — era órfão sem consumers desde o modal IA da M6. **UI manual não validada nessa sessão**.
- **Sprint R — Regularização** concluída em 2026-05-11: (1) drift documental sincronizado (PKStandardDoseComparison removido em c741b40, MoodDriverBoard/MoodLagHypothesisLab/MedicationCatalogEditor adicionados às tabelas), (2) ForecastSignalsPanel órfão removido, (3) Profile centralizado em `Profile/` (backend) e `frontend/src/utils/user-profile.ts` (front) — peso 91 kg, HRmax 182 bpm, idade 38, sexo M, timezone America/Sao_Paulo. Default backend `/farma/concentration-series` passou de 70 → 91 kg (alinhado com forecast que já passava 91 explícito). Constantes legadas (`DEFAULT_PK_BODY_WEIGHT_KG`, `ANDERS_HRMAX_BPM`, `_DEFAULT_WEIGHT_KG`) reexportam do Profile. **Trade-off pendente:** strings de prompts IA ainda dizem "39 anos" (Profile=38) — decisão Q2 da Sprint D. Backend 79/79 tests + frontend tsc/lint/test:unit/build ✅. **UI manual não validada nessa sessão**.
- **Sprint D — Daily Health Decision Layer** concluída em 2026-05-11: commits 32efb09 → 718a596 (4 commits). T1: idade canônica 38→39 + HRmax 182→181, drift de prompts IA zerado, 3 strings hardcoded em `heart-rate-reserve-chart.tsx` viram refs dinâmicas a `ANDERS_HRMAX_BPM`/`USER_PROFILE.age`. T2: `LimitingFactorCard` (Panorama) ranqueia top-2 limitantes do Recovery Score via `weightedShortfall = (100−value)×weight`, com headline coaching + tooltip médico + lembrete quando score=null. T3: `NightQualityCard` (Sono full + Panorama summary) com score 0-100 de 6 inputs + 5 classes priorizadas clinicamente (respiratoria > autonomica > fragmentada > reparadora > regular); reusa `personal-baselines.ts` pra detectar anomalia temp/FR. T4: `PKCoverageCard` (Farmaco full + Panorama summary) classifica últimas 48h por substância em 4 classes (vulnerabilidade > nao_registrada > queda > adequada), reusa engine `calculateConcentration` + `findPresetKey`. **Trade-offs aceitos:** idade canônica 39 vs Anders real 40 (escolha B pra zerar drift com prompts IA já validados); pesos preliminary calibration em ambos scores; anomaly thresholds populacionais aproximados em Night Quality. **Backend 79/79 tests + frontend tsc + lint + test:unit + build ✅** (4 testes novos: recovery-score-ranking, sleep-quality-score, pk-coverage). **UI manual não validada nessa sessão** — Anders precisa abrir browser e validar cada card antes do gate de produto.
- **Sprint D-patch1 (Quick wins SIDEEFFECTS #2 + #3)** concluída em 2026-05-11: commits `c005464` (clonazepam) + `3ceca20` (lisdex) + `668dffc` (docs SIDEEFFECTS pós-validação #4). **Fase 0 da sprint validou ao vivo que ACHADO #4 (Mood valence) era falso positivo** — pipeline correto, backend persiste [0,100] e frontend converte pra [-1,+1] em 2 helpers tolerantes; #4 rebaixado pra P2 + 4 sub-achados de cleanup catalogados (#24-27). **T1:** clonazepam `therapeuticRange` `{20,80}` → `{5,70}` ng/mL no preset TS (`pharmacokinetics.ts:358-367`), alinhando com `medDataBase.json` que já tinha range ansiolítico. Resolve caso real Anders (~6 ng/mL passa de `vulnerabilidade` pra `adequada` no PKCoverageCard). **T2:** lisdex preset TS alinhado com DB completo (5 mudanças no `pharmacokinetics.ts:338-347`): halfLife 11→11.2, volumeOfDistribution 3.5→15.58 (Vd/F aparente), bioavailability 0.96→1.0 (evita dupla correção), absorptionRate 1.5→0.604541, therapeuticRange `{50,150}` → `{10,30}`. Css simulado pra Anders (200 mg, 91 kg) passa de ~399 ng/mL pra ~95 ng/mL (alinha com literatura clínica oral). **Trade-offs aceitos:** PKHumorCorrelation re-roda inferências com novo Css lisdex — `r` e CI podem mudar visualmente; PKCoverageCard reclassifica clonazepam (esperado). **Frontend tsc + lint + test:unit (19 arquivos pelo run-all) + build ✅** sem precisar atualizar tests (pré-check confirmou zero fixtures fragéis). Backend não tocado. **UI manual não validada nessa sessão** — Chrome DevTools MCP indisponível. Anders precisa abrir browser e validar PKCoverageCard + PKHumorCorrelation antes da Sprint D-patch2 começar.
- **Reorg UX cockpit/lab (2026-05-11)**: Panorama virou cockpit de decisão diária (MetricGrid → `LimitingFactorCard` → summaries `NightQualityCard`/`PKCoverageCard` → tendência `RecoveryScoreChart`/`WeekdayWeekendCard`); `ForecastAccuracyCard` saiu do fluxo principal e foi para seção colapsada de calibração técnica em Insights. Insights agora agrupa hipóteses em 3 blocos: acionáveis de humor (`CorrelationHeatmap` com `MoodDriverBoard`/`MoodLagHypothesisLab`), cross-domain (`SleepDebtHrvCard` + `PkRemSuppression`) e modo laboratório (`ScatterCorrelation` + `PKMoodScatterChart` + `LagCorrelationChart`). Atividade ganhou `ActivityReadinessCard`, score de prontidão locomotora baseado em passos, energia ativa, velocidade de marcha, comprimento do passo, assimetria e esforço físico vs baseline pessoal 30d. Validação: frontend tsc/lint/test:unit/build ✅; backend farma/forecast/mood ✅; serviço canônico `roocode.service` reiniciado; rotas local/pública `/health/` e `/health/api/sleep` 200 ✅. **UI manual ainda não validada em browser.**

## Próxima sprint planejada

KICKOFF completo no fim do `ROADMAP_maturation.md` (não duplicar nome aqui — evita drift duplo). Próxima sprint default = **D-patch2** (PKCoverageCard 3-em-1 redesign, último P0 pendente do SIDEEFFECTS). Requer brainstorm prévio (Q1-Q4 documentadas). Alternativa: Sprint D2 (cards adicionais "usar energia ou poupar?" + reorg Insights) — KICKOFF arquivado preservado no mesmo arquivo, Anders ativa ao fechar D-patch2 se quiser pivotar. Pré-requisito gate: Anders valida visualmente no browser PKCoverageCard (clonazepam adequada, lisdex coerente) + PKHumorCorrelation (sem regressão visual) pós Sprint D-patch1 antes da D-patch2 começar.

Concluídas:
- Sprint M1 (Farma debug do `PKStandardDoseComparison`) em 2026-05-09 — commits `b0622ff` + `6b1bc07`.
- Sprint M2 (VO2 Máx via Uth-Sørensen) em 2026-05-09 — commit `611db4c`.
- Sprint M3 (Wrist Temp Deviation + FR variability + utility `personal-baselines.ts`) em 2026-05-09 — commit `bb4cad6`.
- Sprint M4 (Recovery Score composto na aba Panorama) em 2026-05-10 — commit `322781e`.
- Sprint M5 (Autonomic Balance Index na aba Coração + hard-remove HrvAnalysis/HeartRateBands) em 2026-05-10 — commit `7fab71b`.
- Sprint M6 (Interp policy + payload IA enriquecido + relatório IA modal) em 2026-05-10 — commits 137d63a → 3175be7 (14 commits, 13 feature + 1 docs intermediário).
- Sprint M7 (3 charts cardíacos educativos: HRV Variability + Reserva Cardíaca + Resposta Cronotrópica) em 2026-05-11 — commits `5c48c94` + `2380d20`.
- **Sprint R (Regularização Pré-Daily Decision Layer)** em 2026-05-11 — commit `4e3ed46`. Profile centralizado + remove ForecastSignalsPanel órfão + drift documental sincronizado.
- **Sprint D (Daily Health Decision Layer)** em 2026-05-11 — commits 32efb09 → 718a596 (4 commits). Idade canônica 38→39 (HRmax 181) + 3 cards acionáveis: Limitante da Recuperação (Panorama), Noite boa/média/ruim (Sono+Panorama summary), Dose Coverage (Farmaco+Panorama summary).
- **Sprint D-patch1 (Quick wins SIDEEFFECTS #2 + #3)** em 2026-05-11 — commits `c005464` + `3ceca20` + `668dffc` (3 commits). Clonazepam therapeutic range pra uso ansiolítico (`{5,70}` ng/mL) + Lisdex TS alinha com DB (Vd/F aparente 15.58 L/kg + range 10-30). Fase 0 validou que ACHADO #4 (Mood valence) era falso positivo — rebaixado pra P2 + 4 sub-achados #24-27 catalogados.

Anteriores: Cross-Domain Insights (A/B/C), Codex Cleanup, PK×Humor Methodology — todas fechadas. Backlog menor com 1 item em ⏳ (pk-rem-suppression refino — `peso corporal hardcoded` resolvido na Sprint R).

## Fresh start (obrigatório)

```bash
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
git status --short
```

Depois: seguir `ROADMAP.md` e fechar o gate de regularização antes de retomar sprint de feature.
