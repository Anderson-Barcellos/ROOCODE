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

## Baseline funcional preservado

- Medication Action Center ativo:
  - `DoseLogger` com **tomar agora** por regime.
  - `DoseCalendarView` com **adicionar/editar/remover** no dia selecionado.
- Insights ativos:
  - `MoodDriverBoard` no topo de Insights.
  - `MoodLagHypothesisLab` com lags `0d..3d`, `n`, qualidade, `r`, baseline e aviso de sampling bias.

## Achados abertos de regularização

1. `frontend/src/utils/roocode-adapter.ts`: heurística `detectMoodDataQuality` ainda com TODO/stub.
2. Slice antigo de charts estacionado em stash (`stash@{0}`), aguardando decisão de absorver ou descartar.

## Status local validado (2026-05-04)

- Frontend: `npx tsc --noEmit`, `npm run test:unit`, `npm run lint`, `npm run build` ✅
- Backend: `/root/RooCode/bin/python -m unittest tests.test_farma -v` ✅
- Diff hygiene: `git diff --check` ✅

## Fresh start (obrigatório)

```bash
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
git status --short
```

Depois: seguir `ROADMAP.md` e fechar o gate de regularização antes de retomar sprint de feature.
