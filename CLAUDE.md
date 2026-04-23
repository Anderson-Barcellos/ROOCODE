# RooCode — Dashboard de Saúde Pessoal

Pipeline: iPhone AutoExport → FastAPI (8011) → React (3031) → Apache → `https://ultrassom.ai/health/`

---

## Stack

- **Backend:** FastAPI unificado em `main.py` (porta 8011) + pandas + venv local (`/root/RooCode/bin/python`)
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query
- **Tema:** warm editorial (Fraunces serif + Manrope sans, fundo creme + glow teal/amber)
- **Módulos do backend:** `Sleep/`, `Metrics/`, `Mood/`, `Farma/` — cada um expõe APIRouter
- **PK engine:** backend legado em `Farma/math.py` — 1-compartment oral, 8 substâncias no `medDataBase.json`; frontend usa convolução discreta em `pharmacokinetics.ts` + `medication-bridge.ts` para timeline multi-medicação
- **Regime de medicação:** config persistida em `Farma/regimen_config.json` + editor React; logs reais continuam em `/farma/doses`

---

## Comandos

```bash
# Backend
source /root/RooCode/bin/activate
./bin/python main.py            # ou: uvicorn main:app --host 0.0.0.0 --port 8011

# Frontend
cd frontend && npm run dev -- --host 0.0.0.0     # serve em :3031
npm run build                    # tsc + vite build
```

**Web:** `https://ultrassom.ai/health/` (Apache proxy) · **Dev direto:** `http://localhost:3031/health/`

---

## Endpoints

Todos sob `/health/api/*` via Apache (ou `:8011/*` direto):

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/sleep` | GET/POST | AutoExport Sleep CSV |
| `/metrics` | GET/POST | AutoExport Health Metrics CSV |
| `/mood` | GET/POST | AutoExport State of Mind CSV |
| `/farma/substances` | GET | Built-in + custom merged. Use `?full=true` pra todos campos PK |
| `/farma/substances/{key}` | POST/PUT/DELETE | CRUD de custom (built-ins imutáveis → 409) |
| `/farma/doses` | GET/POST | Log de doses |
| `/farma/doses/{id}` | PUT/DELETE | Edita/remove dose individual (PATCH semântico via `exclude_unset`) |
| `/farma/regimen` | GET/PUT | Config persistida (sem consumer UI desde Fase 6a — dormindo) |
| `/farma/curve` | GET | ⚠️ Legado sem consumer (substituído por PK frontend na Fase 6c) |
| `/farma/now` | GET | ⚠️ Legado sem consumer (idem) |
| `/forecast` | POST | Forecasting 5 dias via Gemini (cache md5, confidence cap por densidade) |

---

## Quirks do AutoExport (iPhone)

- `/sleep`, `/metrics`, `/mood` aceitam `UploadFile` simples (field name `HealthData`) — validado com iPhone AutoExport em 2026-04-17. Sem necessidade de parse manual de multipart.
- Encoding: UTF-8 primário, fallback latin-1 (acentos).
- Formato de data: CSVs misturam ISO 8601 e PT-BR; backend usa `pd.to_datetime(..., format="mixed")` quando aplicável, e frontend centraliza normalização em `toDayKey()`.
- `Mood/mood.csv` contém dados reais de humor do State of Mind do iPhone (validado 2026-04-18 — 22 linhas, 26/03 a 17/04). Colunas: `Iniciar` (DD/MM/AAAA), `Fim` (tipo: `Humor Diário` ou `Emoção Momentânea`), `Associações` (score), `Valência` (classe textual PT-BR: `Muito Desagradável` → `Muito Agradável`). Endpoint: `POST /health/api/mood`.
- **Gotcha resolvido 2026-04-18:** `GET /metrics` retornava string JSON duplamente encoded porque `df.to_json(orient="records")` já serializa, e `JSONResponse` envolvia de novo. Fix em `Metrics/metrics.py:41-45`: `json.loads(df.to_json(...))` — pandas converte NaN → null, json.loads devolve `list[dict]` nativo. Sleep e Mood não tinham esse bug.
- **Gotcha resolvido 2026-04-20:** range `7d` renderizava vazio porque `/mood` entregava `Iniciar` em `DD/MM/YYYY` e o fallback JS interpretava `05/04/2026` como `MM/DD/YYYY`, criando snapshots futuros mood-only. Fix: `toDayKey()` suporta `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss`, `dd-MM-yy`, ISO e `yyyy-MM-dd HH:mm:ss`; `selectSnapshotRange()` agora usa janela por calendário ancorada na maior data válida não-futura, não os últimos N registros do array.
- **Gotcha resolvido 2026-04-20 (Fase 8B):** `Mood/mood.py::_format_mood_date` usava `strftime("%d/%m/%Y")` ao salvar `Iniciar` — descartava hora dos timestamps de Emoção Momentânea (iPhone envia `DD/MM/YYYY HH:MM:SS`, virava `DD/MM/YYYY`). Fix: formato condicional com `has_time`. **Requer re-upload do CSV mood histórico** pra recuperar timestamps antigos. Sem isso, charts intraday (`PKMoodScatter`, `LagCorrelation`) só veem emoções momentâneas capturadas após o fix.
- **Fluxo crítico do humor:** `/mood` → `MoodRecord.Iniciar` → `buildMoodRows()` → `buildDailySnapshots()` → `toDayKey(row.start)` → `selectSnapshotRange()` → `DataReadinessGate`.
- **Gotcha: `VITE_USE_MOCK=true` órfão no processo Vite.** Se dev server subiu uma vez com a env var setada, o Vite **não revalida `import.meta.env`** em HMR — fica mock pra sempre até restart. Se o app mostrar "Mock · 14 dias" sem `.env` existir: `cat /proc/<pid-vite>/environ | grep VITE_USE_MOCK`. Kill + relançar com `env -u VITE_USE_MOCK`.
- **Uvicorn `--reload` em loop** acontece quando Apache tem conexões em `CLOSE_WAIT` + processo antigo zombie. Sintoma: log spammando `Errno 98 address already in use` a cada edição Python. Fix: `kill -9` no PID master + relançar **sem** `--reload` pra uso pessoal (reiniciar manual em edits).
- **CSS vars fantasma — shim aplicado (Fase 8A.1, 2026-04-20):** componentes herdados do mood-pharma-tracker (`DoseLogger`, `DoseHistoryView`, `MedicationCatalogEditor`, `PKMedicationGrid`) usam `var(--text-primary)`, `var(--bg-base)`, `var(--accent-violet)` e outras que **não existem** no warm editorial. Fix aplicado via shim em `:root` (`frontend/src/index.css`) mapeando 10 vars fantasma pros tokens nativos (`--foreground`, `--muted`, `--warm`, etc.). Breakage visual resolvido. A migração gradual (substituir os `var(--text-primary)` pelos `var(--foreground)` nativos e remover o shim) continua em aberto como **Fase 9C** (opcional, baixa urgência).

---

## Apache

`/health/` → `localhost:3031` (Vite) · `/health/api/` → `localhost:8011` (FastAPI)
Config em `/etc/apache2/sites-available/ultrassom.ai-optimized.conf`.
Vite requer `allowedHosts: ['ultrassom.ai']` + `base: '/health/'` em `vite.config.ts`.

---

## Gotchas conhecidos

### Tailwind v4 + alias `@/`
O scanner do `@tailwindcss/vite` usa o module graph do Vite, mas **não escaneia arquivos importados via alias `@/`** automaticamente. Solução: listar explicitamente no `src/index.css`:
```css
@source "./App.tsx";
@source "./components/navigation/TabNav.tsx";
@source "./components/analytics/shared.tsx";
```
Glob (`./**/*.{ts,tsx}`) também não funciona confiável. Cada arquivo novo com classes Tailwind → adicionar `@source` no `index.css`.

### Peso Anders
91 kg — default PK único em util/hook frontend (`DEFAULT_PK_BODY_WEIGHT_KG`). Usado nas curvas por convolução e nos hooks PK legados. Ainda **não** inferir peso automaticamente a partir de métricas.

### Status systemd (2026-04-23 — Fase 9B concluída)
- `roocode.service` **`active (running)`** em `/etc/systemd/system/`, enabled, fonte única da verdade na porta 8011. `ExecStart`: `/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011`. Reboot resilience validada (stop → 000 → start → 200 em 3s).
- Resolução Fase 9B: processo manual órfão rodando desde 2026-04-20 (PID 3090260, PPID 1) segurava a porta 8011, causando loop `activating (auto-restart)` com counter em 546+. Após `systemctl stop` + `kill` do manual + `systemctl start`, serviço subiu limpo.
- `sleep-api.service`, `metrics-api.service`, `mood-api.service` **removidos** de `/etc/systemd/system/` — eram redundantes com `main.py` unificado.

---

## Status

- [x] Backend consolidado em `main.py` (porta 8011) com CORS
- [x] Apache proxy `/health/*` → Vite + `/health/api/*` → FastAPI
- [x] Frontend scaffold warm editorial (Fraunces + Manrope + gradiente teal/amber)
- [x] TabNav + SurfaceFrame + DoseLogger funcionais
- [x] **Fase 2:** portar 9 utils analíticos + types + roocode-adapter
- [x] **Fase 3:** portar 14 charts + ChartsDemo (`#charts-demo`) com mocks de 14 dias
- [x] **Fase 4:** 4 surfaces instanciadas + `useRooCodeData` + `useCardioAnalysis` + `useActivityAnalysis` (concluída 2026-04-17)
- [x] **Fase 5:** interpolação temporal Gemini + linear (concluída 2026-04-17)
  - Backend: `Interpolate/router.py` com `POST /health/api/interpolate`, cache md5, fallback gracioso
  - Frontend: `useInterpolation` hook + toggle TabNav (off/linear/claude) + `InterpolationBanner`
  - Visual (4 charts): dashed lines (Timeline, HRV) + alpha 0.4 (SleepStages, ActivityBars)
  - Fix gotcha `dates` da Fase 4: re-derivado de `effectiveSnapshots` quando modo ≠ off
  - 2 TODO(Anders) marcados: prompt Gemini + HEALTH_POLICIES de linear
- [x] **Fase 5b:** polish + demo R² (concluída 2026-04-17, autopilot)
  - Visual nos 6 charts restantes: SpO2/HRBands dual-series dashed, MoodTimeline ValenceDot hollow, ScatterCorrelation Scatter shape per-pair, CorrelationHeatmap + WeeklyPattern badge amber de contagem
  - Rota `#interpolation-demo` com R² per field (sleep/HRV/RHR/energia/exercício/SpO2/luz) usando MOCK_SNAPSHOTS como ground truth
  - `interpolatedCount` propagado pra WeeklyPatternChart (nova prop)
- [x] **Fase 5c:** polish final (concluída 2026-04-18)
  - Helper `frontend/src/components/charts/shared/tooltip-helpers.ts` — DRY do cast interpolated (5 charts migrados: hrv-analysis, heart-rate-bands, activity-bars, sleep-stages-chart, spo2-chart)
  - Prompt Gemini clínico preciso em `Interpolate/router.py::_build_prompt()` — PK explícita (t½/steady-state de escitalopram, lisdex, lamotrigina, clonazepam) + critério escalonado de `confidence`
  - `HEALTH_POLICIES` em `src/utils/interpolate.ts` — nova policy `linear_bounded` pra `pulseTemperatureC` (±0.3°C/dia); `valenceClass` derivado via `classifyValence` em ambos os lados (frontend linear + backend claude em `_classify_valence`)
  - Rota `#interpolation-demo` agora valida **Linear vs Claude lado a lado** (botão "Validar Claude", subcomponentes `MetricsCard`/`ClaudeMetricsCard`, fetch direto em `/health/api/interpolate`)
  - Pasta `frontend/docs/` com README + checklist de 9 screenshots (Anders captura manualmente)
- [x] **Fase 5d:** Progressive Unlock (concluída 2026-04-18)
  - `utils/data-readiness.ts` — `ReadinessRequirement` discriminado por tipo (`days` | `pairs` | `dow_coverage`), `evaluateReadiness()`, `CHART_REQUIREMENTS` como fonte única de thresholds; `buildPendingMessage()` tom clínico (`"Análise requer N dias · X/N · faltam Y"`)
  - `components/charts/shared/DataReadinessGate.tsx` — wrapper 3 estados (ready/partial/pending); reusa `EmptyAnalyticsState` + badge amber inline (padrão já estabelecido em `correlation-heatmap.tsx:101-105`)
  - 11 charts migrados: scatter/heatmap (pares ≥20 ready, 10-19 partial), weekly (dow_coverage ≥5 DOWs + ≥14 dias), timeline (days, readiness opcional via prop), hrv/heartRate/moodTimeline/moodDonut (ready ≥7 dias de field específico), activity/sleepStages/spo2 (ready ≥3 dias)
  - **Princípio chave:** interpolados **NÃO contam** pra readiness — reflete dados coletados. Toggle `off → linear → claude` não altera badges
  - `useRooCodeData` expõe `validRealDays` + `validMoodDays`; KPIs executivos mostram `"Sem dados"` quando `validRealDays < 7` (em vez de média-7d falsa de 2-3 dias)
  - Delta bundle: +3.5 kB JS, CSS inalterado (reuso total de componentes existentes)
- [x] **Fase 5e:** PK temporal + regime editável + range 7d (concluída 2026-04-20)
  - Backend: `GET/PUT /farma/regimen` persiste `MedicationRegimenEntry[]` em `Farma/regimen_config.json`; defaults: Lexapro 40mg 07:00, Venvanse 200mg 07:00 dias úteis, Lamictal 200mg 22:00
  - Frontend: `useRegimen()`/`useSaveRegimen()` + `MedicationRegimenEditor`; `DoseLogger` preservado como log real/manual
  - PK: regime expandido na janela visível + warmup; logs reais substituem dose prevista se caem em ±4h, logs fora da janela viram dose extra/PRN; curvas novas usam convolução discreta com default 91 kg
  - `PKConcentrationChart`: overlay multi-medicação em `%Cmax_ref`, tooltip com concentração bruta, humor no eixo direito, resumo por dia selecionado e tabela de correlação com lags `0..7` (exploratória, não causal)
  - Painéis individuais por medicamento adicionados no estilo do `/root/CODEX/mood-pharma-tracker`, reaproveitando o mesmo payload PK convoluído
  - Layout: fix do Recharts `width(-1) height(-1)` com `min-w-0`, altura mínima estável e `ResponsiveContainer minWidth={0}`
- [x] **Fase 6:** Medicação — CRUD completo + gráfico por logs reais (concluída 2026-04-20)
  - **6a:** Backend `DoseUpdate` + `PUT/DELETE /farma/doses/{id}`; frontend `useUpdateDose`/`useDeleteDose` + `DoseHistoryView` (lista com edit inline e delete); `MedicationRegimenEditor` removido da UI (backend `/farma/regimen` fica dormindo)
  - **6b:** Catálogo de substâncias mutável — `SubstanceEntry`/`SubstanceUpdate` models, `Farma/substances_custom.json` (dict merge com `medDataBase.json`), `POST/PUT/DELETE /farma/substances/{key}` com built-ins imutáveis; frontend `MedicationCatalogEditor` (Radix Dialog, 2 modos list/form + "Copiar de preset"); `useSubstances` faz `?full=true`; `logDose` aceita aliases/custom via `_resolve_substance_any`
  - **6c:** Swap do `PKConcentrationChart` pelo `PKMedicationGrid` — cartões compactos auto-fit 260px, eixo Y **0-150% da faixa terapêutica** (resolve o bug do Venvanse a 800%), banda verde shaded entre `100 * min/max` e 100%, `ReferenceLine` em cada dose real, status badge (sub/within/supra); `therapeutic_range_min/max` seedados em `medDataBase.json` pra Lexapro (15-80), Venvanse (10-30), Lamictal (2000-10000) — todos em ng/mL canônico
  - Layout final da aba Humor + Medicação: botão Catálogo → MoodTimeline + MoodDonut → PKMedicationGrid → DoseLogger + DoseHistoryView
  - Órfãos dormindo: `PKConcentrationChart`, `medication-bridge.ts::buildPKTimelinePayload`, `usePKCurve`, `usePKNow`, `MedicationRegimenEditor`, `concentration_for_substance` de `math.py` — sem consumer, avaliar remoção na **Fase 9A** (cadeia com `load_medication_database` que **segue essencial**)
  - Dep nova: `@radix-ui/react-dialog@1.1.15` (bundle +9 kB gzip)
- [x] **Fase 7:** Forecasting 5 dias com Gemini (concluída 2026-04-20)
  - Backend: `Forecast/router.py` com `POST /health/api/forecast`, cache md5, prompt clínico PT-BR com contexto PK, confidence cap modulado por densidade (14d→0.40, 30d→0.70, 60d→0.82, ≥60→0.90)
  - Frontend: `useForecast` hook (TanStack Query, staleTime Infinity), `useRooCodeData` ganha 2º param forecast
  - TabNav: segmented control violet (Off / 🔮 Projetar 5d) com spinner
  - `ForecastBanner` (paleta violet) + `ForecastSignalsPanel` (sinais descritivos na Executive)
  - 6 charts com visual forecast: timeline/HRV/HR/SpO2 (3-way split `_real/_interp/_forecast`, `strokeDasharray="2 3"`, opacity 0.55), ActivityBars (`Cell` opacity 0.35), MoodTimeline (`ValenceDot` dotted)
  - `ReferenceLine` vertical "hoje" em violet em todos os charts; tooltip unificado via `getDataSuffix` (`🔮 projetado · conf X.XX`)
  - `data-readiness` exclui forecasted dos counts de validação
  - Gotcha: `selectSnapshotRange` clipa futuro → `forecastedSnapshots` em array separado, merge em App.tsx após `ranged`
- [x] **Fase 8A:** Expansão Activity/Physiology (concluída 2026-04-20)
  - 10 campos novos mapeados em `HealthAutoExportRow` + `DailyHealthMetrics` + `metricsRecordToHealthRow`: `steps`, `distanceKm`, `physicalEffort`, `walkingHeartRateAvg`, `walkingAsymmetryPct`, `walkingSpeedKmh`, `runningSpeedKmh`, `vo2Max`, `sixMinuteWalkMeters`, `cardioRecoveryBpm`
  - Débito colateral pago: `heartRateMin/Max/Mean`, `restingEnergyKcal`, `exerciseMinutes`, `standingMinutes`, `daylightMinutes`, `respiratoryDisturbances` (todos já no tipo mas nunca lidos do `/metrics`) — agora populados
  - Novo módulo `utils/health-policies.ts` com `VO2_BANDS_MALE_35_44` + `getVo2Category()` + thresholds de steps/marcha/assimetria (editar cutoffs é one-stop shop)
  - Charts novos: `Vo2MaxChart` (linha + SMA + 5 `ReferenceArea` coloridos por categoria clínica), `WalkingVitalityChart` (speed + walking HR dual-axis + badges tone de speed/asymmetry), `StepsChart` (bar + SMA + ReferenceLine meta 10k)
  - `TimelineSeriesKey` ganhou: `steps`, `vo2Max`, `walkingSpeedKmh`, `walkingHeartRateAvg`, `respiratoryRate`, `pulseTemperatureC` (agora plotáveis em TimelineChart via prop)
  - 3 novos KPIs Executive: Passos 7d (Tudor-Locke tone), VO2 Máx 7d (bands Cooper), Vel. marcha 7d (slowing ≥ 4.5 km/h)
  - Interpolation policies: `steps`/`distanceKm`/`physicalEffort`/`walkingHeartRateAvg`/`cardioRecoveryBpm` → `interpolate`; `vo2Max`/`walkingSpeedKmh` → `linear_bounded` (±1 e ±0.3/dia); `walkingAsymmetryPct`/`runningSpeedKmh`/`sixMinuteWalkMeters` → `skip` (não inventar sinais raros)
  - Readiness: `vo2MaxChart` ready ≥14d partial ≥7d (baseline crônico), `walkingVitalityChart` ready ≥7d partial ≥3d, `stepsTimelineChart` ready ≥3d partial ≥1d
  - Layout: Executive ganhou `StepsChart` após ActivityBars+HeartRateBands; sleepPhysiology ganhou `Vo2MaxChart`+`WalkingVitalityChart` em lg:grid-cols-2 após SpO2+WeeklyPattern
  - Bundle delta: +957KB total / 272KB gzip (warning chunks >500KB pré-existente, não regressão; avaliar code-splitting depois)
  - `TimelineChart.labels` relaxado pra `Partial<Record<...>>` — consumidor só fornece labels das keys que usa
- [x] **Fase 8A.1:** fixes pós-deploy da 8A (concluída 2026-04-20)
  - **Bug 1 (catálogo preto):** componentes herdados do mood-pharma-tracker (`MedicationCatalogEditor`, `DoseLogger`, `DoseHistoryView`, `PKMedicationGrid`) usam ~10 CSS vars que não existem no warm editorial (`--bg-base`, `--text-primary`, `--accent-violet`, etc.). Fallback caía pra hardcoded `#111622`, daí o modal Radix Dialog preto.
  - **Fix:** shim em `:root` (`frontend/src/index.css`) aliasando as 10 vars fantasma pros tokens warm editorial. Zero refactor de componente — resolve 100% do breakage imediato. Migração gradual pra eliminar o shim vira escopo Fase 9C (opcional).
  - **Bug 2 (PK grid descartava suplementos):** os 5 suplementos (Bacopa, Magnésio, Vit D3, Omega-3, Piracetam) sem `therapeutic_range_min/max` eram filtrados fora. Fix: `PKCompactCard` ganha modo "raw concentration" (Y em ng/mL, sem band verde, sem badge sub/within/supra, footer "experimental"). `PKMedicationGrid` só exclui substâncias com PK inválido.
  - **Polish:** `DoseLogger` + `DoseHistoryView` perderam `colorScheme: 'dark'` dos inputs `datetime-local`.
  - Delta: CSS +0.26 kB, JS +0.82 kB.
- [x] **Fase 8B:** aba "Descritivo e Insights" — análise intraday PK×humor (concluída 2026-04-20)
  - **Insight fundador:** dados brutos já são horários (`/farma/doses` tem timestamp, `/mood` tem "Emoção Momentânea" com HH:MM:SS, `calculateConcentration` aceita qualquer instante). Mudar a lente sem mexer nos dados.
  - **Bug crítico backend (`Mood/mood.py::_format_mood_date`):** usava `strftime("%d/%m/%Y")` ao salvar `Iniciar` — descartava hora. Fix: formato condicional com `has_time` — `DD/MM/YYYY HH:MM:SS` quando tem hora, `DD/MM/YYYY` quando só data. **Requer re-upload do CSV mood histórico** pra recuperar horas antigas (ação Anders, Fase 9E).
  - Nova TabKey `'insights'` (ícone `Telescope`) com 3 charts:
    - `PKMoodScatterChart` — emoção momentânea × concentração PK da substância selecionada (lag opcional 0-8h). Pearson r + regressão linear.
    - `LagCorrelationChart` — sweep de lag -6h a +12h. Peak em lag positivo causal = PK→humor; peak em lag negativo = correlação espúria.
    - `MedicationAdherenceChart` — desvio padrão dos minutos-do-dia por substância. Score 0-1. Window 7/30/90d.
  - `utils/intraday-correlation.ts` — pure functions: `parseMoodTimestamp`, `buildMoodEvents`, `buildPKMoodPairs`, `pearson`, `linearRegression`, `computeLagCorrelation`, `buildAdherenceStats`. `substanceToPKMedication` e `toPKDoses` extraídos do pk-medication-grid pra reuso.
  - `CHART_REQUIREMENTS` ganha `pkMoodScatter` (20 pares), `lagCorrelation` (25 pares), `medicationAdherence` (3 doses). `readiness type 'pairs'` previne r ruidoso com n<10.
  - `MoodRecord.Fim` adicionado (distingue Humor Diário vs Emoção Momentânea); `buildMoodRows` propaga `row.Fim` pro field `type`.
  - Banner honesto: "análise exploratória, não conclusiva · n pequeno = r ruidoso · emoções momentâneas têm sampling bias · precisa ~60 dias".
  - Bundle: +977KB / +277KB gzip. Delta sobre 8A.1: +20KB / +5KB gzip.
- [ ] **Fase 9:** housekeeping residual + consolidação operacional — detalhes abaixo em "KICKOFF — Fase 9"
  - **9.0 ✅** (2026-04-23) — commit working tree pendente (`234a70f`): doc Fase 8B→9, refactor `UploadFile→Request` em Metrics/Mood, remoção de `_organizeMetrics`
  - **9B ✅** (2026-04-23) — roocode.service `active (running)`, uvicorn manual (órfão desde 2026-04-20) morto, sleep-api/metrics-api/mood-api services removidos, reboot resilience validada
  - **9A ✅** (2026-04-23) — deletada cadeia órfã da Fase 6 em 3 commits: 9A.1 frontend (ChartsDemo + pk-concentration-chart + 500 linhas de medication-bridge), 9A.2 backend (/farma/curve, /farma/now, concentration_for_substance), 9A.3 (MedicationRegimenEditor + PUT /farma/regimen). Delta: **−1661 linhas**
  - **9D ✅** (2026-04-23) — `respiratoryRate` e `pulseTemperatureC` viraram KPI cards na Executive (opção a do menu). 7d avg com tone clínico: resp >20rpm=negative, 16-20=watch, 12-16=positive, <12=watch; temp ≥37°C=negative, 36.8-37°C=watch, 35.5-36.8=positive, <35.5=watch
  - 9C/9E pendentes

---

## Referência de design: `/root/claude-workspace`

Apple Health dashboard irmão. Portamos dele:
- Design tokens (warm parchment, Fraunces+Manrope, shadows teal-tinted)
- 3 constantes fundamentais: `SURFACE_CLASS`, `CARD_CLASS`, `LABEL_CLASS`
- TabNav pattern (pills pretos sticky top)
- Eyebrow + serif title pattern em cada painel
- Recharts recipe (no axis lines, grid sutil, tooltip arredondado)

Ver plano atual em `/root/.claude/plans/wise-puzzling-shell.md`.

---

## KICKOFF — Fase 9: Housekeeping residual + consolidação operacional

> Texto pra colar em sessão fresh. Claude lê, entrevista o Anders se tiver dúvida sobre prioridade das sub-sprints, e executa uma por vez.

**Estado pós Fase 8B (concluída 2026-04-20):**
- Fase 8 inteira (A, A.1, B) fechada e em `main`. Dashboard rodando em dados reais com: expansão Activity/Physiology (steps, VO2Máx, walking vitality, cardio recovery); catálogo + PK grid tolerantes a suplementos sem faixa terapêutica; aba "Descritivo e Insights" com intraday PK×humor (PKMoodScatter, LagCorrelation, MedicationAdherence); shim CSS cobrindo vars fantasma dos herdados mood-pharma-tracker.
- Bug `Mood/mood.py::_format_mood_date` fixado — Emoções Momentâneas agora preservam HH:MM:SS na ingestão.
- `roocode.service` `active (running)` após Fase 9B — uvicorn manual órfão morto, services antigos removidos, reboot resilience validada.
- Working tree limpo após Fase 9.0 (commit `234a70f` com CLAUDE.md + refactors Metrics/Mood).
- Plano de atualização da doc em `/root/.claude/plans/e-ai-meu-guri-async-mountain.md`. Plano da Fase 8B em `/root/.claude/plans/bora-fechar-as-pontas-fuzzy-knuth.md`. Plano da Fase 9 em `/root/.claude/plans/que-nao-sei-federated-feigenbaum.md`.

**Objetivo Fase 9:** pagar dívida operacional e de código acumulada pra entregar o dashboard em estado "posso esquecer e continua funcionando". **Cinco frentes independentes** — cada uma pode ser uma sub-sprint separada.

### 9A — Deleção de órfãos da Fase 6 (ordem importa — cadeia de dependências)

**Cadeia descoberta no audit de 2026-04-22:**

```
ChartsDemo.tsx (rota #charts-demo, museu pedagógico)
    └─> pk-concentration-chart.tsx  ─┐
            └─> medication-bridge::  │  ← cadeia frontend
                  buildPKTimelinePayload,
                  expandRegimenDoses

usePKCurve, usePKNow (lib/api.ts)  ─┐
    └─> /farma/curve, /farma/now    │  ← cadeia backend
            └─> concentration_for_substance (Farma/math.py)

load_medication_database (Farma/math.py) ← ESSENCIAL, NÃO DELETAR
    └─> /farma/substances (ativo)
    └─> cache_clear() após CRUD de catálogo
```

**Primeiro passo: decisão com Anders.** ChartsDemo (rota `#charts-demo`) é um museu com 14 charts em mock data. Ainda útil pra debug/showcase ou candidato a deletar?

**Se deletar ChartsDemo:**
1. Deletar `frontend/src/pages/ChartsDemo.tsx`
2. Remover `if (hash === '#charts-demo')` de `App.tsx:293`
3. Deletar `frontend/src/components/charts/pk-concentration-chart.tsx`
4. Deletar em `frontend/src/utils/medication-bridge.ts`: `buildPKTimelinePayload`, `expandRegimenDoses` e helpers privados exclusivos delas (confirmar com `grep`)
5. Deletar em `frontend/src/lib/api.ts`: `usePKCurve`, `usePKNow`
6. Em `Farma/router.py`: deletar endpoints `/farma/curve` e `/farma/now`
7. Em `Farma/math.py`: deletar `concentration_for_substance` (agora órfão)
8. **NÃO DELETAR** `load_medication_database` nem o `@lru_cache` — segue essencial pra `/farma/substances` e `cache_clear()` do CRUD

**Se manter ChartsDemo:** só a cadeia backend sai (usePKCurve/usePKNow + endpoints + `concentration_for_substance`). Frontend (ChartsDemo + pk-concentration-chart + medication-bridge) permanece como museu.

**Componente independente (sem cadeia):** `frontend/src/components/MedicationRegimenEditor.tsx` + hooks `useRegimen`/`useSaveRegimen` + backend `/farma/regimen`. Todos dormindo. Candidato a deleção conjunta se Anders confirmar.

**Protocolo:** commit atômico 1 por cadeia (frontend / backend / MedicationRegimenEditor). Validar com `tsc --noEmit && npm run build` após cada. `git grep` exaustivo antes de cada `rm`.

### 9B — Estabilização do systemd roocode.service

**Diagnóstico primeiro:**
```bash
systemctl status roocode.service --no-pager -l
journalctl -u roocode.service -n 50 --no-pager
ss -tlnp | grep 8011          # quem está segurando a porta
pgrep -af "uvicorn main:app"  # processos manuais vivos
```

Se processo manual segura a porta: `kill` dele + `systemctl restart roocode.service`. Se bug no `.service` em si: revisar ExecStart, WorkingDirectory, permissões do venv.

**Limpeza dos services antigos:**
```bash
sudo systemctl mask sleep-api.service metrics-api.service mood-api.service
# Quando confirmado que não quebra nada:
sudo rm /etc/systemd/system/{sleep-api,metrics-api,mood-api}.service
sudo systemctl daemon-reload
```

Validação final: `systemctl restart roocode.service` → `curl http://localhost:8011/metrics` → `curl https://ultrassom.ai/health/api/metrics`.

### 9C — Eliminação gradual do shim CSS (opcional)

Shim da 8A.1 resolveu breakage visual. Migrar os 4 componentes pra usar tokens nativos torna código legível e elimina indireção. Não urgente.

Passos:
1. `grep -rn 'var(--' frontend/src/components/{MedicationCatalogEditor,DoseLogger,DoseHistoryView}.tsx frontend/src/components/charts/pk-medication-grid.tsx`
2. Substituir em bulk:
   - `var(--text-primary)` → `var(--foreground)`
   - `var(--text-muted)` → `var(--muted)`
   - `var(--bg-base)` → `var(--card)` (ou gradiente)
   - `var(--bg-raised)` → `var(--card)`
   - `var(--accent-violet)`, `--accent-emerald`, `--accent-amber` → decidir se mantém (cores semânticas de medicação) ou migra pro tema
3. Remover entradas do shim em `index.css` + o TODO inline
4. Screenshot A/B da aba Humor + Medicação

### 9D — Decisão: `respiratoryRate` e `pulseTemperatureC` (sem chart dedicado)

Campos agregados em `DailyHealthMetrics`, com cores em `timeline-chart.tsx:45-46`, incluídos em `correlation-heatmap.tsx:30` — **mas sem viz própria**.

Opções:
- **a)** Cards KPI na Executive (7d avg com tone clínico)
- **b)** Linhas opcionais no `TimelineChart` via prop
- **c)** Charts próprios (`RespiratoryRateChart`, `PulseTemperatureChart`) na aba Sleep + Physiology — padrão do `Vo2MaxChart` da 8A
- **d)** Deixar como está (agregado + correlação, sem viz dedicada)

Contexto clínico:
- `respiratoryRate` — tônus autonômico / sono, pareado com HRV
- `pulseTemperatureC` — ciclo circadiano / metabólico; relevante pra monitorar lítio/valproato (termorregulação)

### 9E — Re-upload do CSV mood histórico (ação Anders, sem código)

Pra recuperar timestamps de Emoções Momentâneas anteriores ao fix do `strftime` na Fase 8B. Anders re-envia pelo AutoExport do iPhone → endpoint `/mood`.

---

**Comando de boot pra Fase 9:**

```bash
# Sanity dos serviços
systemctl status roocode.service --no-pager -l | head -20
ss -tlnp | grep -E "8011|3031"
pgrep -af "uvicorn main:app|RooCode/frontend.*vite"

# Sanity dos endpoints
curl -s -o /dev/null -w "metrics=%{http_code}\n"    http://localhost:8011/metrics
curl -s -o /dev/null -w "substances=%{http_code}\n" http://localhost:8011/farma/substances
curl -s -o /dev/null -w "doses=%{http_code}\n"      http://localhost:8011/farma/doses

# Inventário de órfãos (confirmar cadeia antes de deletar)
grep -rn "ChartsDemo\|pk-concentration-chart\|PKConcentrationChart" /root/RooCode/frontend/src/ | grep -v node_modules
grep -rn "buildPKTimelinePayload\|expandRegimenDoses" /root/RooCode/frontend/src/
grep -rn "usePKCurve\|usePKNow" /root/RooCode/frontend/src/
grep -rn "concentration_for_substance\|farma/curve\|farma/now" /root/RooCode/
```
