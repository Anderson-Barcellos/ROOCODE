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

---

## Quirks do AutoExport (iPhone)

- `/sleep`, `/metrics`, `/mood` aceitam `UploadFile` simples (field name `HealthData`) — validado com iPhone AutoExport em 2026-04-17. Sem necessidade de parse manual de multipart.
- Encoding: UTF-8 primário, fallback latin-1 (acentos).
- Formato de data: CSVs misturam ISO 8601 e PT-BR; backend usa `pd.to_datetime(..., format="mixed")` quando aplicável, e frontend centraliza normalização em `toDayKey()`.
- `Mood/mood.csv` contém dados reais de humor do State of Mind do iPhone (validado 2026-04-18 — 22 linhas, 26/03 a 17/04). Colunas: `Iniciar` (DD/MM/AAAA), `Fim` (tipo: `Humor Diário` ou `Emoção Momentânea`), `Associações` (score), `Valência` (classe textual PT-BR: `Muito Desagradável` → `Muito Agradável`). Endpoint: `POST /health/api/mood`.
- **Gotcha resolvido 2026-04-18:** `GET /metrics` retornava string JSON duplamente encoded porque `df.to_json(orient="records")` já serializa, e `JSONResponse` envolvia de novo. Fix em `Metrics/metrics.py:41-45`: `json.loads(df.to_json(...))` — pandas converte NaN → null, json.loads devolve `list[dict]` nativo. Sleep e Mood não tinham esse bug.
- **Gotcha resolvido 2026-04-20:** range `7d` renderizava vazio porque `/mood` entregava `Iniciar` em `DD/MM/YYYY` e o fallback JS interpretava `05/04/2026` como `MM/DD/YYYY`, criando snapshots futuros mood-only. Fix: `toDayKey()` suporta `dd/MM/yyyy`, `dd/MM/yyyy HH:mm:ss`, `dd-MM-yy`, ISO e `yyyy-MM-dd HH:mm:ss`; `selectSnapshotRange()` agora usa janela por calendário ancorada na maior data válida não-futura, não os últimos N registros do array.
- **Fluxo crítico do humor:** `/mood` → `MoodRecord.Iniciar` → `buildMoodRows()` → `buildDailySnapshots()` → `toDayKey(row.start)` → `selectSnapshotRange()` → `DataReadinessGate`.
- **Gotcha: `VITE_USE_MOCK=true` órfão no processo Vite.** Se dev server subiu uma vez com a env var setada, o Vite **não revalida `import.meta.env`** em HMR — fica mock pra sempre até restart. Se o app mostrar "Mock · 14 dias" sem `.env` existir: `cat /proc/<pid-vite>/environ | grep VITE_USE_MOCK`. Kill + relançar com `env -u VITE_USE_MOCK`.
- **Uvicorn `--reload` em loop** acontece quando Apache tem conexões em `CLOSE_WAIT` + processo antigo zombie. Sintoma: log spammando `Errno 98 address already in use` a cada edição Python. Fix: `kill -9` no PID master + relançar **sem** `--reload` pra uso pessoal (reiniciar manual em edits).
- **CSS vars fantasma (dívida técnica descoberta na Fase 6c):** componentes herdados do mood-pharma-tracker (`DoseLogger`, `DoseHistoryView`, `MedicationCatalogEditor`, `PKMedicationGrid`) usam `var(--text-primary)`, `var(--bg-base)`, `var(--accent-violet)` — **nenhuma dessas está definida** no `index.css` do RooCode (tema real é warm editorial: `--foreground`, `--muted`, `--card`, `--border`). Caem pro herdado (preto em cream), funciona acidentalmente em fundo claro mas quebra com fundo dark hardcoded (tooltip do grid PK teve que ser corrigido). Sprint futuro pra mapear essas vars pros tokens warm editorial ficaria limpo — por ora, fix cirúrgico onde dá breakage visível.

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

### Serviço systemd ausente
`main.py` está rodando manualmente (PID órfão). Morre no reboot. **TODO:** criar `roocode.service` apontando para `ExecStart=/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011 --app-dir /root/RooCode`.

Serviços antigos por-módulo (`sleep-api.service`, `metrics-api.service`, `mood-api.service`) devem ser desabilitados — redundantes com `main.py`.

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
  - Órfãos dormindo: `PKConcentrationChart`, `medication-bridge.ts::buildPKTimelinePayload`, `usePKCurve`, `usePKNow`, `MedicationRegimenEditor`, `math.py` — sem consumer, avaliar remoção na Fase 8
  - Dep nova: `@radix-ui/react-dialog@1.1.15` (bundle +9 kB gzip)
- [ ] **Fase 7:** projeção futura (forecasting 5 dias pra frente) — ver KICKOFF abaixo
- [ ] **Fase 8:** polish final com mais variáveis do `/metrics` (steps, VO2 Max, Cardio Recovery, Respiratory Rate, Pulse Temp) + cleanup dos órfãos da Fase 6

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

## KICKOFF — Fase 7: Forecasting 5 dias

> Texto pra colar em sessão fresh. Claude lê e executa.

**Estado pós Fase 6 (concluída 2026-04-20):**
- **CRUD completo de medicação ativo.** Aba Humor + Medicação agora tem: botão "Catálogo de substâncias" (modal Radix — add/edit/delete customs, built-ins imutáveis), MoodTimeline + MoodDonut acima, `PKMedicationGrid` com cartões compactos auto-fit em **% da faixa terapêutica (0-150%)** com banda verde shaded, dose markers como `ReferenceLine`, badge sub/within/supra. Embaixo, DoseLogger (registro rápido) + DoseHistoryView (histórico com edit inline + delete com confirmação).
- **Bug do Venvanse a 800% resolvido.** O chart deixou de consumir `medication-bridge.ts` (que expandia regime + CSV Apple Health). Agora consome só `/farma/doses` (logs reais do backend). Normalização por `therapeutic_range_max` mata as discrepâncias entre drogas (Lexapro ng/mL vs Lamictal µg/mL).
- **PK 100% frontend.** `calculateConcentration` de `utils/pharmacokinetics.ts` roda localmente sobre os logs reais. Backend `/farma/curve` e `/farma/now` são legados dormindo sem consumer.
- **Therapeutic ranges canônicos (ng/mL) seedados** em `Farma/medDataBase.json`: Lexapro 15-80, Venvanse 10-30, Lamictal 2000-10000. Lamictal convertido de µg/mL pra ng/mL pra unidade única.
- **Interpolação + Progressive Unlock + PK temporal + regime editável (5a-5e)** continuam ativos das sessões anteriores.
- **App roda em dados reais** (`VITE_USE_MOCK=false`). Backend CSVs: sleep 117, metrics 331, mood 22 linhas.
- Plano da Fase 6 (histórico) em `/root/.claude/plans/e-ai-gaucho-velho-tender-pnueli.md`. Fase 5d em `/root/.claude/plans/isso-so-mais-pra-bubbly-newt.md`.

**Objetivo Fase 7**: forecast de 5 dias pra frente usando Gemini sobre séries já coletadas — antever sono/HRV/RHR/energia/exercício/valence com incerteza modulada pela densidade de dados reais.

**Oportunidades novas viabilizadas pela Fase 5d (considerar no prompt e na UI):**
- `data.validRealDays` e `data.validMoodDays` estão expostos via `useRooCodeData`. O forecast deve **modular `confidence`** pelo histórico: <14 dias reais → `confidence ≤ 0.4`; <30 dias → `≤ 0.7`; ≥60 dias → até `0.9`. Evita Gemini "chutar alto" em base pobre.
- Charts com `readiness.status === 'pending'` NÃO devem receber forecast. Gate a projeção em `readiness.status !== 'pending'`.

**Decisões arquiteturais já tomadas (não re-perguntar ao Anders):**
1. **Horizonte:** fixo em **5 dias** (sem slider).
2. **Fields previstos:** 6 prioritários — `sleepTotalHours`, `hrvSdnn`, `restingHeartRate`, `activeEnergyKcal`, `exerciseMinutes`, `valence`.
3. **Incerteza:** só **texto no tooltip** (`conf 0.72 · rationale`). Sem error bands, sem fan chart.
4. **Actionability:** **descritivo + sinais a vigiar**. Sem prescrição direta.
5. **Medicação como contexto descritivo apenas.** Não simular cenários (`e se pular dose?`) nem transformar correlação concentração-humor em causalidade.
6. **Diferenciação visual vs interpolated:** dotted `2 3` (mais denso que linear 4 4), opacidade 0.55, `ReferenceLine` vertical em "hoje", badge 🔮 no tooltip.

**Arquitetura — reusar 80% da Fase 5:**

Backend (`Forecast/router.py`, novo):
- Reusa `_load_api_key`, `_call_gemini`, `_strip_fences`, cache md5 de `Interpolate/router.py` (extrair shared module se virar pain)
- `POST /health/api/forecast` · `ForecastRequest(snapshots, horizon=5)` · `ForecastResponse(snapshots, meta, signals)`
- `_build_future_dates(latest, 5)`, `_build_prompt(recent, future_dates)` com PK já estabelecida, `_apply_forecasted(orig, response)`
- `main.py`: `app.include_router(forecast_router, prefix="/forecast", tags=["forecast"])`

Frontend:
- Types: `DailySnapshot.forecasted?: boolean`, `forecastConfidence?: number`, `forecastRationale?: string`; novo `ForecastSignal`
- `buildTimelineSeries` em `utils/aggregation.ts:215` propaga `forecasted` paralelo a `interpolated`
- Hook novo `useForecast.ts` espelhando `useInterpolation.ts` (queryKey, staleTime Infinity, retry 1)
- `useRooCodeData.ts` ganha 2º param `forecast: ForecastMode` + expõe `forecastedCount` + `forecastSignals`
- TabNav: segundo segmented control `['off', 'Projetar 5d']` com spinner
- 6 charts ganham branch `forecasted` (timeline, hrv-analysis, heart-rate-bands, activity-bars, mood-timeline, spo2) — reusa `tooltip-helpers.ts` expandido (`getForecastSuffix`)
- Novo componente `ForecastSignalsPanel.tsx` (card na Executive, tom descritivo)

Scope guardrails:
- Não construir engine próprio — Gemini é black box
- Não prever medicações (hard rule da Fase 5)
- Não fazer backtest rigoroso (fica pra 7b)

Comando de boot:
```bash
ps aux | grep -E "uvicorn main:app.*8011" | grep -v grep
ps aux | grep -E "RooCode.*vite" | grep -v grep
# Sanidade:
curl -s -o /dev/null -w "metrics=%{http_code}\n" http://localhost:8011/metrics
curl -s -o /dev/null -w "sleep=%{http_code}\n"   http://localhost:8011/sleep
curl -s -o /dev/null -w "mood=%{http_code}\n"    http://localhost:8011/mood
curl -s -o /dev/null -w "substances=%{http_code}\n" http://localhost:8011/farma/substances
curl -s -o /dev/null -w "doses=%{http_code}\n"   http://localhost:8011/farma/doses
# Modo real:
cat /proc/$(pgrep -f "RooCode/frontend.*vite" | head -1)/environ 2>/dev/null | tr '\0' '\n' | grep VITE_USE_MOCK || echo "OK (dados reais)"
```

---

## KICKOFF — Fase 8: Polish final + expansão Metrics

> Depois que Fase 7 fechar. Último sprint antes do merge definitivo.

**Objetivo:** incorporar ao dashboard variáveis do `/metrics` que hoje são expostas pelo backend mas não renderizadas, e limpar órfãos acumulados.

**Variáveis ignoradas pelo frontend (já expostas por `/metrics`):**
- `Contador de Passos (passos)` — atividade psicomotora (útil pra detectar slowing depressivo ou hyperativity estimulante)
- `VO2 Máx (ml/(kg·min))` — capacidade cardiorrespiratória (efeito crônico de antidepressivos/antipsicóticos)
- `Recuperação Cardio (contagem/min)` — HR recovery pós-exercício (tônus autonômico — pareado com HRV é ouro clínico)
- `Taxa Respiratória (contagem/min)` — já está no `DailyHealthMetrics` + `aggregation.ts:54` mas **ausente** do `TimelineSeriesKey` (apple-health.ts:119-131) → agregada mas não plotada
- `Temperatura do Pulso ao Dormir Apple (ºC)` — idem, agregada mas sem chart (ciclo circadiano/metabólico/lítio-valproato)

**Decisão pendente Anders:** quais renderizar como (a) cards KPI na Executive, (b) linhas novas no timeline principal, (c) charts próprios na aba Sleep + Physiology. Propostas clínicas já estão em `/root/.claude/plans/e-ai-gaucho-velho-tender-pnueli.md` seção "Unused-but-Interesting".

**Housekeeping dos órfãos da Fase 6 (avaliar deleção):**
- `frontend/src/components/charts/pk-concentration-chart.tsx` (862 LOC sem consumer)
- `frontend/src/utils/medication-bridge.ts::buildPKTimelinePayload` + `expandRegimenDoses` (~500 LOC dormindo)
- `frontend/src/components/MedicationRegimenEditor.tsx` (sem consumer — backend `/farma/regimen` segue)
- `frontend/src/lib/api.ts::usePKCurve` + `usePKNow` (hooks sem consumer)
- `Farma/math.py::concentration_for_substance` + `load_medication_database` (curve/now endpoints sem consumer)
- `@lru_cache` em `math.py:156` pode sumir sem cerimônia

**Outras pendências leves (opcionais):**
- Screenshots A/B dos 11 gates readiness em `frontend/docs/` (Anders captura manualmente)
- Rodar `code-reviewer` e `code-simplifier` sobre `data-readiness.ts` + `DataReadinessGate.tsx` em sessão fresh
- Proteção defensiva no `roocode-adapter.ts` contra API retornando tipo inesperado (`Array.isArray(x) ? x : []`)
- Mapear as **CSS vars fantasma** (`--text-primary`, `--bg-base`, `--accent-violet`) dos componentes herdados do mood-pharma-tracker pros tokens warm editorial do RooCode (`--foreground`, `--muted`, `--card`, `--border`). Sprint curto, alto impacto visual.
