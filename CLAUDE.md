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
- [ ] **Fase 5:** interpolação Claude pra lacunas temporais (dados reais chegam esparsos)

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

## KICKOFF — Próxima Sessão (Fase 5: Interpolação Claude)

> Texto pra colar quando voltar ao projeto. Claude lê e executa.

**Estado (pós Fase 4, concluída em 2026-04-17, commit `391ce92`):**
- 4 surfaces (Executive, MoodMeds, Sleep, Patterns) funcionais em App.tsx consumindo adapter + mocks
- `useRooCodeData` orquestra api.ts + adapter + mocks + derivações (pkGroups, overview, weeklyPattern, dates)
- `useCardioAnalysis` real: baseline HRV rolling 14d, overtraining ≥7d, recovery score 0-100
- `useActivityAnalysis` real: weeklyPattern, loadBalance, 4 impacts correlacionais
- Toggle `VITE_USE_MOCK=true` + `MockBanner` amber quando ativo
- Fix /metrics: 500 → NaN via df.to_json + json.loads
- Build: 827kB JS / 57.8kB CSS · tsc zero erros
- iPhone AutoExport validado com `UploadFile` simples (advertência CLAUDE.md corrigida)

**Problema da Fase 5:** dados reais chegam **esparsos**. Em 2026-04-17: sleep tem 5 dias, metrics 7, mood 6, doses 0. Pra surfaces renderizarem análises significativas (correlação, weekly pattern, baseline ±1σ), precisam ≥14-30 dias **contínuos**. Lacunas hoje fazem chart crashar em `EmptyAnalyticsState`.

**Agora (Fase 5):** interpolar lacunas temporais com 3 estratégias: `linear` (vizinhos), `claude` (LLM contextual via Gemini API), `off`. Toggle no TabNav. Dias interpolados renderizam com opacity/dash diferente + tooltip "valor estimado".

### Estratégia de interpolação

1. **Linear** (baseline, sem IA): média ponderada entre dia anterior e próximo com dado real. Falha se lacuna > 3 dias consecutivos.
2. **Claude** (Gemini 2.5 Flash, batch 1 request): "Dado 30 snapshots do Anders com lacunas nos dias X, Y, Z, preencha cada lacuna com `{value, confidence 0-1, rationale}`. Considera week-day effects, tendências, medicação ativa." Uma request pra todas as lacunas — não 1 por lacuna.
3. **Off**: comportamento Fase 4 atual (chart cru).

### Passo-a-passo Fase 5

1. **`src/utils/interpolate.ts`** — `interpolateSnapshots(snapshots, strategy) → snapshots + flags`. Set `DailyHealthMetrics.interpolated = true` nos dias preenchidos (campo já existe no tipo, hoje morto).
2. **`Interpolate/interpolate.py`** — endpoint `POST /health/api/interpolate` que recebe snapshots + strategy, chama Gemini API (`/root/GEMINI_API/` já configurado), retorna preenchido. Cache por hash(snapshots).
3. **`src/hooks/useInterpolation.ts`** — wrapper useMemo + TanStack query pra batch.
4. **UI visual**: charts detectam `interpolated === true` → linha dashed ou alpha 0.4 + tooltip badge "⚠ estimado".
5. **TabNav toggle**: `Interpolação: off | linear | claude`. Persiste em `localStorage` por ser preference.
6. **Validação**: mock com 30% lacunas artificiais, plot real vs interpolado, medir R².

### Open loops
- Custo de tokens: batch claude em 1 request é a ideia; validar cost/latency.
- Interpolação é só pra **passado** — projeção futura é escopo Fase 6.
- `confidence` do claude pode virar barra de erro nos charts (lag opcional).
- `detectMoodDataQuality` continua stub (fora de escopo 5).

### Comando de boot
```bash
# Backend (main.py já tem reload=True)
source /root/RooCode/bin/activate && ./bin/python main.py &
# Frontend dev (mock mode pra teste sem dados reais)
cd /root/RooCode/frontend && VITE_USE_MOCK=true npm run dev -- --host 0.0.0.0 &
# Validar
curl -s http://localhost:8011/farma/substances | python3 -c "import sys,json;print(len(json.load(sys.stdin)),'substâncias')"
```
