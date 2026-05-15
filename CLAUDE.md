# RooCode — Handoff Operacional

Pipeline: iPhone AutoExport → FastAPI (8011) → React/Vite (3031) → Apache → `https://ultrassom.ai/health/`

App em **modo manutenção**: tickets pontuais em `BACKLOG.md`, sem sprint formal.

## Modo operacional

**Modo manutenção ativo.** `~/.claude/rules/sprint-system.md` NÃO se aplica aqui (Locality Principle). Cada mudança = 1 ticket de `BACKLOG.md` resolvido em 1 commit focado. Sem KICKOFF, sem Pós-Sprint Protocol, sem ROADMAP novo. Histórico de sprints concluídas em `docs/HISTORY/` + `git log`.

## Stack

- **Backend:** FastAPI unificado em `main.py` (porta 8011), pandas, venv local (`/root/RooCode/bin/python`).
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query.
- **Módulos backend:** `Sleep/`, `Metrics/`, `Mood/`, `Farma/`, `Forecast/`, `Interpolate/`, `Profile/`.
- **Farmacocinética:** `Farma/math.py` + `Farma/medDataBase.json` (backend) e `frontend/src/utils/pharmacokinetics.ts` (frontend).
- **Perfil canônico:** `Profile/__init__.py` (backend) e `frontend/src/utils/user-profile.ts` (front) — peso 91 kg, HRmax 181 bpm, idade 39, sexo M, timezone America/Sao_Paulo.

## Runtime e serviços

- Backend oficial: `roocode.service` (`/etc/systemd/system/roocode.service`). Nunca subir manual via uvicorn/nohup.
- Proxy Apache:
  - `/health/` → frontend (`localhost:3031`)
  - `/health/api/` → backend (`localhost:8011`)
- Forecast backend é OpenAI-only com hardening de saída (dedupe/ordem por data futura, clamp de faixa, erro HTTP explícito). Runtime atual: `OPENAI_MODEL=gpt-5.1`, `OPENAI_REASONING_EFFORT=high`, `OPENAI_TIMEOUT_SECONDS=300`. Validação real em 2026-05-14: `gpt-5.1` rejeita `xhigh`; `gpt-5.1/high` respondeu `/forecast` em ~48s.
- Logging de trace do forecast é opt-in via `FORECAST_DEBUG=true`.
- PK coverage: `queda` só deve alertar quando a concentração está perto do piso terapêutico (`<1.2× min`) e projeta cruzar o mínimo em até 12h; substância confortavelmente em faixa fica `adequada`. Cards PK com faixa usam escala `% do teto terapêutico` e mantêm ng/mL no tooltip.

## Comandos principais

```bash
# Backend (debug local)
source /root/RooCode/bin/activate
/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011

# Frontend
cd /root/RooCode/frontend
npm run dev -- --host 0.0.0.0

# Qualidade frontend
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

- `/sleep`, `/metrics`, `/mood` (GET/POST cada)
- `/farma/substances` (GET; `?full=true` pra campos PK completos)
- `/farma/substances/{key}` (POST/PUT/DELETE custom)
- `/farma/regimen` (GET)
- `/farma/doses` (GET/POST) · `/farma/doses/{id}` (PUT/DELETE)
- `/farma/concentration-series` (GET)
- `/interpolate` (POST)
- `/forecast` (POST) · `/forecast/accuracy` (POST) · `/forecast/report` (POST)

## Componentes ativos por aba

| Aba | Componentes |
|---|---|
| **Panorama** | MetricGrid · LimitingFactorCard · NightQualityCard (summary) · PKCoverageCard (summary) · RecoveryScoreChart · WeekdayWeekendCard |
| **Farmaco** | MoodTimeline · PKMedicationGrid · PKHumorCorrelation · PKCoverageCard · DoseLogger · DoseCalendarView · MedicationCatalogEditor |
| **Sono** | NightQualityCard · SleepStagesChart · SleepDebtChart · Spo2Chart · RespiratoryDisturbancesChart · VitalSignsTimeline |
| **Coração** | AutonomicBalanceChart · HrvVariabilityChart · HRRangeChart · HeartRateReserveChart · ChronotropicResponseChart · CardioRecoveryChart |
| **Atividade** | ActivityReadinessCard · ActivityBars · StepsChart · Vo2MaxChart · WalkingVitalityChart |
| **Insights** | MoodDriverBoard · MoodLagHypothesisLab · CorrelationHeatmap · SleepDebtHrvCard · ScatterCorrelation · PKMoodScatterChart · PkRemSuppression · LagCorrelationChart · ForecastAccuracyCard (colapsada) |

## Baseline funcional a preservar

- `DoseLogger` mantém atalhos "tomar agora" para entradas ativas do regime.
- `DoseCalendarView` mantém fluxo rápido de adicionar/editar/remover dose no dia selecionado.
- Contrato Farma sem mudança de schema público: `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances`.
- `MoodDriverBoard` no topo de Insights via `CorrelationHeatmap`.
- `MoodLagHypothesisLab` com lags `0d..3d`, `n`, qualidade, Pearson `r`, baseline ±, aviso de sampling bias.
- Estado "dados insuficientes" explícito em correlações; sem causalidade clínica.

## Fresh start

```bash
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
git status --short
```

Depois: abrir `BACKLOG.md`, escolher ticket, resolver em 1 commit focado.

## Histórico

10 sprints concluídas até 2026-05-11: REG-0..5, Cross-Domain Insights (A/B/C), Codex Cleanup, PK×Humor Methodology, M1-M7, R, D, D-patch1. Detalhes em `docs/HISTORY/ROADMAP_maturation.md`, `docs/HISTORY/ROADMAP.md`, `docs/HISTORY/AGENTS.md` ou `git log --oneline`.
