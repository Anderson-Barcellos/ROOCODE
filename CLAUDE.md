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

## KICKOFF — Próxima Sessão (Fase 6: Projeção Futura / Forecasting)

> Texto pra colar quando voltar ao projeto. Claude lê e executa.

**Estado pós Fase 5 + 5b (concluídas 2026-04-17):**
- Interpolação temporal completa: off/linear/claude via TabNav. 10/10 charts diferenciam visualmente dias estimados (dashed em line, alpha 0.4 em bars, hollow dot em MoodTimeline, custom shape em Scatter, badge ⚠ em Heatmap/WeeklyPattern).
- Rota `#interpolation-demo` valida R² per field (MOCK_SNAPSHOTS como ground truth, 30% sparsify, linear reconstrói).
- Backend `/health/api/interpolate` estável. Frontend 845 kB JS / 59 kB CSS. tsc zero erros.
- Fase 5 commit: `0d6f869`. Fase 5b commit: pendente quando Anders acordar e validar.
- 2 TODO(Anders) vivos: prompt Gemini em `Interpolate/router.py::_build_prompt()` e `HEALTH_POLICIES` em `src/utils/interpolate.ts`.

**Fase 6 (agora):** projeção futura. Fase 5 preenche passado; Fase 6 prevê futuro. Novo modo no toggle ou nova feature separada — decisão UX.

### PERGUNTAS CLÍNICAS QUE ANDERS PRECISA RESPONDER ANTES DE COMEÇAR

Claude NÃO deve começar a implementação de Fase 6 em autopilot — cada uma dessas perguntas muda materialmente o design:

**1. Horizonte de projeção**
- [ ] **3 dias** (conservador, alta confiança, serve pra "como tá próxima semana")
- [ ] **5 dias** (balanço, cobre sábado-domingo a partir de terça)
- [ ] **7 dias** (semana completa, mais speculation)
- [ ] **Horizonte variável** (slider 1-14 dias, usuário controla)

**2. Quais fields prever?**
- [ ] Só os 5-6 clinicamente acionáveis: sleep, HRV, RHR, valence, exerciseMinutes
- [ ] Todos os 22 (mesma lista que interpolação Claude filtra pra 6)
- [ ] Subset escolhido por tab (Executive: sleep+HRV; MoodMeds: valence; Sleep+Physio: sleep completo)

**3. Como representar incerteza no chart?**
- [ ] **Error bands** (upper/lower 95% CI via Gemini percentis) — visual rich, complexo
- [ ] **Confidence no tooltip** (só texto, pontual) — simples, mas perde forma da uncertainty
- [ ] **Dotted line** sem banda (assume confidence decresce com horizonte) — visual minimal
- [ ] **Fan chart** (multiple scenarios coloridos) — overkill pro nosso caso?

**4. Diferenciação visual vs Fase 5**
Dias interpolados hoje usam dashed `5 4` em linha + alpha em barras. Forecast precisa ser claramente distinto:
- [ ] **Dotted `2 3`** (mais denso que dashed, visualmente "menos firme")
- [ ] **Color-shifted** (linha fica cinza-azulada ao entrar no futuro)
- [ ] **ReferenceLine vertical "hoje"** separando passado/futuro + opacity 0.5 no futuro
- [ ] Combinação das acima

**5. Actionable vs descritivo**
- [ ] Forecast só mostra projeção, usuário interpreta
- [ ] Forecast gera **alertas clínicos** ("HRV projetado cai 20% — reduza treino") — atenção: autoridade narrativa da IA sobre decisões de saúde
- [ ] Meio-termo: mostra projeção + "sinais a vigiar" textual sem recomendação direta

**6. Refresh cadence + cache**
- [ ] Forecast recomputado em toda query invalidation (mesma logic do Claude interpolate)
- [ ] Forecast "congelado" por 24h (calcula 1x/dia, evita churn narrativo)
- [ ] Usuário decide via botão "recalcular projeção"

**7. Integração com medicações**
- [ ] Forecast considera dose_log.json real (timing explícito, onset/offset)
- [ ] Forecast assume regime atual estável (não pede log)
- [ ] Forecast simula cenários ("e se eu pular uma dose de escitalopram amanhã?") — scope creep?

### Arquitetura proposta (depois das respostas acima)

**Backend: `Forecast/router.py`** (espelhando `Interpolate/router.py`):
- `POST /health/api/forecast` com `{ snapshots: recent[], horizon: 3|5|7, fields?: [] }`
- Cache md5 com TTL de 24h (se escolha 6b)
- Prompt Gemini: histórico + medicação + pergunta de forecasting
- Response: `{ forecast: [{ date, values, confidence, p5, p95, rationale }], meta }`

**Frontend:**
- Novo modo `'forecast'` no TabNav OU botão separado "Projetar 5d" (depende de Q3)
- `useForecast(snapshots, horizon)` hook wrapper TanStack
- Charts aceitam `forecastData?: TimelinePoint[]` opcional e renderizam no final da série

**Dados:**
- `DailySnapshot.forecasted?: boolean` + `DailySnapshot.forecastConfidence?: number`
- `TimelinePoint.forecasted?: boolean` propagado via `buildTimelineSeries`

### Comando de boot
```bash
# Ler as respostas do Anders ANTES de codar
# Backend já roda via uvicorn --reload
cd /root/RooCode/frontend && npm run dev -- --host 0.0.0.0 &
# Sanidade:
curl -s http://localhost:8011/farma/substances | python3 -c "import sys,json;print(len(json.load(sys.stdin)),'substâncias')"
```

### Scope guardrails (não fazer em Fase 6)
- Não construir engine próprio de forecasting — usar Gemini como black box
- Não prever medicações (mesmo hard rule da Fase 5)
- Não fazer backtest rigoroso nesta fase — R² validation fica pra 6b se justificar

## KICKOFF alternativo — Fase 5c (se Anders quiser refinar Fase 5 antes de Fase 6)

Escopo menor, polish tardio:
- Adicionar testes R² pra estratégia 'claude' no demo (chamar backend real)
- Screenshots A/B salvos em `/frontend/docs/fase5-ab.png`
- Preencher TODO(Anders) do prompt Gemini e HEALTH_POLICIES com decisões dele
- `InterpolationTooltip` component compartilhado pra todos os charts (DRY)
- Accessibility: testar dashed/alpha em modo escuro e P&B
