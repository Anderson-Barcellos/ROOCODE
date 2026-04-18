# RooCode — Dashboard de Saúde Pessoal

Pipeline: iPhone AutoExport → FastAPI (8011) → React (3031) → Apache → `https://ultrassom.ai/health/`

---

## Stack

- **Backend:** FastAPI unificado em `main.py` (porta 8011) + pandas + venv local (`/root/RooCode/bin/python`)
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query
- **Tema:** warm editorial (Fraunces serif + Manrope sans, fundo creme + glow teal/amber)
- **Módulos do backend:** `Sleep/`, `Metrics/`, `Mood/`, `Farma/` — cada um expõe APIRouter
- **PK engine:** `Farma/math.py` (criado pelo Codex) — 1-compartment oral, 8 substâncias no `medDataBase.json`

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
| `/farma/substances` | GET | 8 substâncias do PK DB |
| `/farma/doses` | GET/POST | Log manual de doses |
| `/farma/curve` | GET | Curvas PK 24h (% Cmax) |
| `/farma/now` | GET | Concentração atual de cada droga |

---

## Quirks do AutoExport (iPhone)

- `/sleep`, `/metrics`, `/mood` aceitam `UploadFile` simples (field name `HealthData`) — validado com iPhone AutoExport em 2026-04-17. Sem necessidade de parse manual de multipart.
- Encoding: UTF-8 primário, fallback latin-1 (acentos).
- Formato de data: ISO 8601 — usar `pd.to_datetime(..., format="mixed")`.
- `Mood/mood.csv` atualmente tem dados de SONO (Anders copiou URL errada no AutoExport) — endpoint correto: `POST /health/api/mood` com arquivo State of Mind.

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
91 kg — hardcoded no App.tsx como `WEIGHT_KG`. Usado em `usePKCurve(91)` e `usePKNow(91)` para calcular Vd.

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
- [ ] **Fase 6:** projeção futura (forecasting 5 dias pra frente)

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

## KICKOFF — Próxima Sessão (Fase 6: Forecasting 5 dias)

> Texto pra colar em sessão fresh. Claude lê e executa.

**Estado pós Fase 5 + 5b + 5c (concluídas 2026-04-17 / 2026-04-18):**
- Interpolação temporal completa e validada. Rota `#interpolation-demo` compara R² **Linear vs Claude lado a lado**. Prompt Gemini é clínico preciso com farmacocinética explícita. `HEALTH_POLICIES` resolvido com `linear_bounded` pra temperatura e `classifyValence` dos dois lados. Helper `tooltip-helpers.ts` centraliza o cast de `interpolated`. Frontend 848 kB / 59 kB CSS, tsc zero erros.
- Plano detalhado da Fase 6 em `/root/.claude/plans/bora-fechar-as-pontas-fuzzy-knuth.md` — **ler primeiro**.

**Decisões arquiteturais já tomadas (não re-perguntar ao Anders):**
1. **Horizonte:** fixo em **5 dias** (sem slider nesta fase).
2. **Fields previstos:** os 6 prioritários da Fase 5 Claude — `sleepTotalHours`, `hrvSdnn`, `restingHeartRate`, `activeEnergyKcal`, `exerciseMinutes`, `valence`.
3. **Incerteza:** só **texto no tooltip** (`conf 0.72 · rationale`). Sem error bands, sem fan chart.
4. **Actionability:** **descritivo + sinais a vigiar** textual. Sem prescrição direta ("reduza X").
5. **Medicação:** regime atual **estável** no prompt — sem simulação de cenários ("e se pular dose?").
6. **Diferenciação visual vs interpolated:** dotted `2 3` (mais denso), opacidade 0.55, `ReferenceLine` vertical em "hoje", badge 🔮 no tooltip.

**Arquitetura — reusar 80% da Fase 5:**

Backend (`Forecast/router.py`, novo):
- Reusa `_load_api_key`, `_call_gemini`, `_strip_fences`, cache md5 de `Interpolate/router.py` (copy ou extrai shared module)
- `POST /health/api/forecast` · `ForecastRequest(snapshots, horizon=5)` · `ForecastResponse(snapshots, meta, signals)`
- `_build_future_dates(latest, 5)`, `_build_prompt(recent, future_dates)` com PK já estabelecida, `_apply_forecasted(orig, response)`
- `main.py`: `app.include_router(forecast_router, prefix="/forecast", tags=["forecast"])`

Frontend:
- Types: `DailySnapshot.forecasted?: boolean`, `forecastConfidence?: number`, `forecastRationale?: string`; `TimelinePoint.forecasted?: boolean`; novo `ForecastSignal`
- `buildTimelineSeries` em `utils/aggregation.ts:215` propaga `forecasted` paralelo a `interpolated`
- Hook novo `useForecast.ts` espelhando `useInterpolation.ts` (queryKey, staleTime Infinity, retry 1)
- `useRooCodeData.ts` ganha 2º param `forecast: ForecastMode` + expõe `forecastedCount` + `forecastSignals`
- TabNav: segundo segmented control pill `['off', 'Projetar 5d']` com spinner
- 6 charts ganham branch `forecasted` (timeline, hrv-analysis, heart-rate-bands, activity-bars, mood-timeline, spo2) — reusa helper `tooltip-helpers.ts` expandido (adicionar `getForecastSuffix`)
- Novo componente `ForecastSignalsPanel.tsx` (card na Executive, tom descritivo)

Scope guardrails:
- Não construir engine próprio — Gemini é black box
- Não prever medicações (hard rule da Fase 5)
- Não fazer backtest rigoroso (fica pra 6b)
- Dark mode / tokens semânticos ficam **fora** (Sprint 5d separada)

Comando de boot:
```bash
# Backend já roda via uvicorn --reload
cd /root/RooCode/frontend && npm run dev -- --host 0.0.0.0 &
# Sanidade:
curl -s http://localhost:8011/farma/substances | python3 -c "import sys,json;print(len(json.load(sys.stdin)),'substâncias')"
# Ler o plano:
cat /root/.claude/plans/bora-fechar-as-pontas-fuzzy-knuth.md
```
