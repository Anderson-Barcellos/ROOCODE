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
  - Visual: dashed lines (Timeline, HRV) + alpha 0.4 (SleepStages, ActivityBars) + tooltip "⚠ estimado"
  - Fix gotcha `dates` da Fase 4: re-derivado de `effectiveSnapshots` quando modo ≠ off
  - 2 TODO(Anders) marcados: prompt Gemini + HEALTH_POLICIES de linear
- [ ] **Fase 5b:** polish + demo R² (aplicar visual nos 6 charts restantes + demo page com ground truth)
- [ ] **Fase 6:** projeção futura (forecasting 3-7 dias pra frente)

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

## KICKOFF — Próxima Sessão (Fase 5b: Polish + Demo R²)

> Texto pra colar quando voltar ao projeto. Claude lê e executa.

**Estado pós Fase 5 (concluída 2026-04-17):**
- Backend: `POST /health/api/interpolate` via Gemini 2.5 Flash, cache md5, fallback linear on error. `google-genai` 1.73.1 no venv. Endpoint testado live — Gemini retorna dias preenchidos fisiologicamente plausíveis (7.2→7.5→7.0→6.8h de sono).
- Frontend: `useInterpolation(snapshots, mode)` wrapper TanStack, `InterpolationMode = 'off' | 'linear' | 'claude'`, `useRooCodeData(mode)` re-deriva pkGroups/overview/weeklyPattern/dates a partir de snapshots interpolados.
- UI: toggle TabNav (segunda linha) + `InterpolationBanner` (teal/amber por modo) + filledCount dinâmico.
- Visual (4 de 10 charts feitos): TimelineChart + HrvAnalysis com dual-series dashed; SleepStagesChart + ActivityBars com `<Cell>` fillOpacity 0.4 em dias interpolados.
- localStorage: `roocode-interpolation` persiste entre sessões.
- 2 TODO(Anders) marcados: `Interpolate/router.py::_build_prompt()` e `src/utils/interpolate.ts::HEALTH_POLICIES`.
- Build: 836.99 kB JS (+10 KB) · 59.12 kB CSS (+1.3 KB) · tsc zero erros.

**Agora (Fase 5b):** fechar Fase 5 de verdade com polish visual + validação quantitativa.

### Escopo

1. **Aplicar diferenciação visual nos 6 charts restantes:**
   - `MoodTimeline` (line chart — padrão dual-series como Timeline/HRV)
   - `ScatterCorrelation` (scatter — `<Scatter>` com fillOpacity condicional)
   - `CorrelationHeatmap` (cells — marcar bordas das células envolvendo dias interpolados)
   - `HeartRateBands` (line/area — dual-series)
   - `Spo2Chart` (line — dual-series)
   - `WeeklyPatternChart` (aggregated — discutir se faz sentido distinguir; provavelmente não, já que é média)

2. **Criar `src/pages/InterpolationDemo.tsx`** (rota `#interpolation-demo` espelhando `#charts-demo`):
   - Gera mock "ground truth" com 14 dias completos
   - Injeta 30% de lacunas aleatórias
   - Plota lado-a-lado: original / linear / claude
   - Computa R² per field (sleepTotalHours, hrvSdnn, restingHeartRate, activeEnergyKcal, exerciseMinutes, valence)
   - Exibe tabela simples: `{strategy, field, R², mean_error}`

3. **Screenshot A/B antes/depois** — tirar prints de Executive tab com toggle off vs claude, salvar em `/root/RooCode/frontend/docs/fase5-ab.png` (criar pasta se preciso).

### Arquivos a tocar
- `src/components/charts/mood-timeline.tsx`
- `src/components/charts/scatter-correlation.tsx`
- `src/components/charts/correlation-heatmap.tsx`
- `src/components/charts/heart-rate-bands.tsx`
- `src/components/charts/spo2-chart.tsx`
- `src/pages/InterpolationDemo.tsx` (criar)
- `src/App.tsx` (rotear `#interpolation-demo`)

### Open loops
- **Tooltip consistency:** hoje cada chart tem sua própria `Tooltip formatter`. Talvez valha um `InterpolationTooltip` compartilhado pra evitar drift visual.
- **`WeeklyPatternChart`:** agregação por dia da semana. Se DOW tiver 3 dias reais + 1 interpolado, mostrar fillOpacity por % de dias interpolados? Ou só ignorar dias interpolados na agregação? Decisão UX tua.
- **Accessibility:** dashed + alpha podem sumir em P&B ou low-contrast. Considerar ícone diagonal hatching ou pattern fill no futuro.

### Comando de boot
```bash
# Backend já roda via uvicorn --reload (PID 2020958)
# Frontend dev
cd /root/RooCode/frontend && npm run dev -- --host 0.0.0.0 &
# Testar live
curl -s -X POST http://localhost:8011/interpolate \
  -H "Content-Type: application/json" \
  -d '{"snapshots":[{"date":"2026-04-10","health":{"sleepTotalHours":7.2,"hrvSdnn":42},"mood":{"valence":0.3},"medications":null},{"date":"2026-04-13","health":{"sleepTotalHours":6.8,"hrvSdnn":38},"mood":{"valence":-0.1},"medications":null}],"strategy":"claude"}' \
  | python3 -m json.tool
```
