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
| **Insights** | MoodDriverBoard · CorrelationHeatmap · TempHumorCorrelation · PKVariabilityReportCard · PKVariabilityHumorLab (grade 4×3) · PKMoodScatterChart · LagCorrelationChart · PkRemSuppression · ForecastAccuracyCard (colapsada) |

## Baseline funcional a preservar

- `DoseLogger` mantém atalhos "tomar agora" para entradas ativas do regime.
- `DoseCalendarView` mantém fluxo rápido de adicionar/editar/remover dose no dia selecionado.
- Contrato Farma sem mudança de schema público: `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances`.
- `MoodDriverBoard` no topo de Insights via `CorrelationHeatmap`.
- `MoodDriverBoard` deve permanecer investigável: cada driver tem botão "Evidência" com sourcePath, janela recente, baseline, delta, n pareado, últimos valores usados e destino natural de gráfico.
- `CorrelationHeatmap` filtra `forecasted`/`interpolated` antes de correlacionar (alinhado com MoodDriverBoard e PKVariabilityHumorLab); FDR Benjamini-Hochberg sobre todos os pares testados.
- `PKVariabilityHumorLab` em grade 4×3 (lag × métrica) com FDR sobre as 12 células e observações textuais por lag.
- Visualizações largas devem preservar leitura em viewport estreita: tabela do `ForecastReportModal` e matriz do `PKVariabilityHumorLab` usam scroll horizontal local em vez de comprimir/cortar conteúdo.
- Heatmaps compartilhados com `HeatmapCell` devem ser touch-friendly: quando a célula representa um resultado real, renderizar como botão acessível e mostrar "Detalhe selecionado" persistente no consumidor.
- `CorrelationHeatmap` e `TempHumorCorrelation` seguem o mesmo padrão touch-friendly: células reais são botões com `aria-label`, estado selecionado e painel "Detalhe selecionado".
- Insights deve evitar duplicar a família `PKVariability*`: o resumo forte (`PKVariabilityReportCard`) fica dentro do bloco "PK × Humor (variabilidade)" e o heatmap panorâmico separado fica fora da renderização principal enquanto `PKVariabilityHumorLab` já mostra substância × métrica × lag. `LagCorrelationChart` deve explicar que melhora de valência inclui sair de negativa para menos negativa.
- `CorrelationHeatmap` deve manter uma seção "Leitura clínica rápida" antes da matriz, destacando a maior associação positiva e negativa para ajudar a interpretar Humor vs fisiologia sem tratar correlação como causalidade.
- Labs PK intraday (`PKMoodScatterChart`, `LagCorrelationChart`) usam `DEFAULT_PK_BODY_WEIGHT_KG`; não reintroduzir peso literal `91` em cálculos novos.
- Gráficos Recharts que aparecem no primeiro render auditado (`RecoveryScoreChart`, `PKMoodScatterChart`, `LagCorrelationChart`) usam `initialDimension={{ width: 1, height: 1 }}` para evitar warning de dimensão `-1` na montagem.
- Política de janela no `App`: `ranged` para leitura histórica filtrada, `rangedWithForecast` para gráficos com projeção futura, `data.snapshots` para baseline/dia atual. Na aba Sono, `NightQualityCard` recebe `ranged`; em Atividade, `ActivityReadinessCard` recebe `ranged` + `baselineSnapshots={data.snapshots}`; no Farma, `PKMedicationGrid` deriva `hoursWindow` de `PK_HOURS_BY_RANGE`.
- Lamictal sem `therapeutic_range` (TDM não padrão em bipolar); `PKCoverageCard` mostra concentração corrente sem badge de status (`klass: 'sem_faixa'`).
- Estado "dados insuficientes" explícito em correlações; sem causalidade clínica.

## Fresh start

```bash
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
git status --short
```

Depois: abrir `BACKLOG.md`, escolher ticket, resolver em 1 commit focado.

## Histórico

- 2026-05-16: auditoria frontend consolidou viewport/heatmaps/janelas/Insights. QA visual em `https://ultrassom.ai/health/` validou desktop 1440×1000 e mobile 390×844 sem overlay, sem tela em branco, sem warning/erro de console, com `Leitura clínica rápida`, `PK × Humor (variabilidade)` consolidado e zero duplicidade de "Substância × métrica de variabilidade" na tela principal.

10 sprints concluídas até 2026-05-11: REG-0..5, Cross-Domain Insights (A/B/C), Codex Cleanup, PK×Humor Methodology, M1-M7, R, D, D-patch1. Detalhes em `docs/HISTORY/ROADMAP_maturation.md`, `docs/HISTORY/ROADMAP.md`, `docs/HISTORY/AGENTS.md` ou `git log --oneline`.
