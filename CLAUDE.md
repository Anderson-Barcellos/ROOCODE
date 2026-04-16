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

- `/sleep` recebe multipart com filename esquisito (`//mnt/...`) — `UploadFile` falha.
  Solução: `request.stream()` raw + parse manual do boundary em `Sleep/sleep.py`.
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
- [x] **Fase 2:** portar 9 utils (date, statistics, correlations, aggregation, pharmacokinetics, medication-bridge, anomaly-engine, data-pipeline, pharma-analytics) + types (apple-health, analytics) + roocode-adapter
- [x] **Fase 3:** portar 14 charts + criar ChartsDemo (`#charts-demo`) com MOCK_SNAPSHOTS de 14 dias
- [x] **Fase 5:** mock data (`snapshotMock`, `doseMock`, `moodMock`) com correlação HRV × Valence R ≈ 0.43 embutida
- [ ] **Fase 4:** implementar 4 surfaces (Executive, Mood+Meds, Sleep, Patterns) consumindo charts + adapter
- [ ] **Fase 6:** hooks computados (useCorrelationMatrix, useScatterPair) — opcional, pode fatiar em Fase 4

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

## KICKOFF — Próxima Sessão (Fase 4)

> Texto pra colar quando voltar ao projeto. Claude lê e executa.

**Estado (pós Fase 2+3, concluída em 2026-04-16):**
- 14 charts portados do `/root/claude-workspace` em `src/components/charts/`
- 9 utils analíticos em `src/utils/` (correlations, statistics, pharmacokinetics, aggregation, medication-bridge, anomaly-engine, data-pipeline, pharma-analytics, date)
- `src/utils/roocode-adapter.ts` converte `useSleep+useMetrics+useMood+useDoses` → `DailySnapshot[]` (via reuso de `buildDailySnapshots` do aggregation.ts)
- `src/types/{apple-health,analytics}.ts` — tipos base + payload backend
- `src/mocks/{snapshotMock,doseMock,moodMock}.ts` — 14 dias determinísticos com R≈0.43 HRV×Valence
- `#charts-demo` (hash route em App.tsx) renderiza todos os 14 charts com mock data
- Stubs em `src/hooks/{useCardioAnalysis,useActivityAnalysis}.ts` — só tipos, hook real fica pra Fase 4
- `weightKg` default corrigido de 80 → 91 em `lib/api.ts`
- Build: 789kB JS / 56kB CSS, zero erros tsc

**⚠️ Atenção:** repositório ainda **não está sob git** — Anders precisa decidir `git init` antes do primeiro commit.

**Agora (Fase 4):** instanciar as 4 surfaces consumindo o adapter + charts.

### Passo-a-passo Fase 4

1. **ExecutiveSurface** — grid de 6 MetricCards (sleep7d, hrv7d, rhr7d, mood7d, activeEnergy7d, steps) via `buildOverviewMetrics(snapshots)`. Timeline chart multi-série (sleep+HRV+RHR) + InsightList.
2. **MoodMedsSurface** — pk-concentration-chart (todas drogas ativas) + grid 2col: mood-timeline + mood-donut. pk-individual-chart pra Lexapro. DoseLogger preservado.
3. **SleepSurface** — sleep-stages-chart + grid 1.25fr_0.75fr: hrv-analysis + heart-rate-bands. weekly-pattern-chart.
4. **PatternsSurface** — correlation-heatmap (N×N, todas métricas) + scatter-correlation interativo. Lag analysis eventual.

### Dados
- Até `/mood` ser corrigido (bug AutoExport) e Anders ter 30+ pontos reais → cada surface fala com adapter que detecta data quality e cai pra `MOCK_SNAPSHOTS` automaticamente.
- `adapter.moodQuality` já retorna `'valid'|'corrupted'|'empty'` — surface pode exibir banner ("⚠️ Usando mock — /mood corrompido" etc.)

### Open loops
- `detectMoodDataQuality` em `roocode-adapter.ts` tem stub simples (detecta qualquer field sleep). Anders pode refinar thresholds.
- `pk-concentration-chart` precisa de ≥10 pares PK×mood — mock tem 14, backend real vai precisar semanas.
- Sessão de Fase 4 deve começar lendo `src/pages/ChartsDemo.tsx` pra ver os props exatos de cada chart.

---

## KICKOFF anterior — Fase 2+3 (concluído 2026-04-16)

**Estado:** Shell warm editorial renderizando em `https://ultrassom.ai/health/`. Fase 0+1 aprovadas por Anders (confirmação visual em 2026-04-16). 4 surfaces-esqueleto com TabNav e SurfaceFrame funcionais, DoseLogger estilizado, fontes Fraunces+Manrope self-hosted, gradiente teal+amber no background.

**Agora (Fase 2+3):** portar **utils** + **charts** do `/root/claude-workspace` para renderizar análises reais.

### Passo-a-passo mecânico

1. **Ler** `/root/.claude/plans/wise-puzzling-shell.md` (plano completo aprovado)
2. **Portar 5 utils core** (copy-paste direto, eles já usam `@/`):
   ```bash
   cp /root/claude-workspace/src/utils/{correlations,statistics,date,aggregation,pharmacokinetics}.ts \
      /root/RooCode/frontend/src/utils/
   ```
3. **Portar 13 charts**:
   ```bash
   cp /root/claude-workspace/src/components/charts/*.tsx \
      /root/RooCode/frontend/src/components/charts/
   ```
4. **Adicionar cada arquivo novo ao `@source` em `src/index.css`** (ver gotcha Tailwind v4 acima) — SEM ESSE PASSO, classes Tailwind são perdidas silenciosamente. Sugestão: adicionar `@source` para cada pasta de uma vez:
   ```css
   @source "./utils/*.ts";
   @source "./components/charts/*.tsx";
   ```
   Se globs pararem de funcionar, listar arquivos individualmente.
5. **Resolver imports** dos charts — alguns importam tipos específicos do claude-workspace (`AnalyticsPayload`, `MoodDriver`, etc.). Esses tipos já estão em `src/components/analytics/types.ts` (já portado).
6. **Criar `analytics-adapter.ts`** em `src/utils/` que converte:
   - `useSleep()`, `useMetrics()`, `useMood()`, `useDoses()`, `usePKCurve()` do RooCode
   - → nos formatos esperados pelas surfaces (`ExecutiveAnalyticsPayload`, `MoodMedicationAnalyticsPayload`, etc.)
7. **Build check** após cada lote:
   ```bash
   cd /root/RooCode/frontend && npm run build
   ```
8. **Depois (Fase 4)**: instanciar as 4 surfaces (`ExecutiveSurface`, `MoodMedsSurface`, `SleepSurface`, `PatternsSurface`) consumindo `analytics-adapter` + charts.

### Decisões de design já tomadas (não re-perguntar)
- Tema: **light warm parchment** (NÃO dark)
- Nav: **tab top** (sidebar removida)
- shadcn/ui: **adiado** — hand-rolled como claude-workspace
- Correlações: **matriz N×N completa** (PK × humor × sono × HRV × atividade)
- Mock data: **sim**, toggle via `import.meta.env.VITE_USE_MOCK`
- Peso: **91 kg** hardcoded como `WEIGHT_KG` em App.tsx

### Pontos de atenção
- `Mood/mood.csv` ainda tem estrutura de sono (Anders vai reconfigurar AutoExport)
- `dose_log.json` ainda não existe — PK chart mostrará placeholder até primeira dose registrada
- Backend em 8011 roda sem systemd (morre no reboot) — criar service eventualmente
- 3 serviços antigos (sleep-api, metrics-api, mood-api) devem ser desabilitados

### Comando de boot
```bash
# Backend
source /root/RooCode/bin/activate && ./bin/python main.py &
# Frontend
cd /root/RooCode/frontend && nohup npm run dev -- --host 0.0.0.0 > /tmp/roocode-vite.log 2>&1 &
# Validar
curl -s -H "Host: ultrassom.ai" http://localhost:3031/health/ -o /dev/null -w "%{http_code}\n"
curl -s http://localhost:8011/farma/substances | python3 -c "import sys,json;print(len(json.load(sys.stdin)),'substâncias')"
```
