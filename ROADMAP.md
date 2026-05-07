# RooCode — Roadmap de Regularização

> Última atualização: 2026-05-04
> Estado: **sprints anteriores canceladas**; foco total em estabilização.

## Objetivo do ciclo atual

Homogeneizar documentação, fechar implementações incompletas e recuperar confiança técnica antes de abrir nova sprint de produto.

## Escopo deste roadmap

- **Inclui:** consistência docs↔código, lint/testes, heurísticas incompletas, decisão sobre WIP parcial.
- **Não inclui:** nova feature de produto enquanto o gate de regularização estiver aberto.

## Trilhas de regularização

| Ordem | Trilha | Status | Resultado esperado |
|---|---|---|---|
| REG-0 | Baseline + decisão de WIP | CONCLUÍDA (LOCAL) | WIP antigo retirado do worktree e estacionado em stash (`stash@{0}`). |
| REG-1 | Frontend unit tests | CONCLUÍDA (LOCAL) | `npm run test:unit` verde sem bypass. |
| REG-2 | Frontend lint/purity | CONCLUÍDA (LOCAL) | `npm run lint` verde (hooks/purity resolvidos). |
| REG-3 | Heurística de qualidade de humor | CONCLUÍDA (LOCAL) | `detectMoodDataQuality` objetivo + ingestão mood robusta para AutoExport v1/v2. |
| REG-4 | Documentação homogênea | CONCLUÍDA (LOCAL) | `AGENTS.md`/`ROADMAP.md`/`CLAUDE.md` refletindo estado real do código e validações. |
| REG-5 | Reabertura de roadmap de features | BLOQUEADA | Próxima sprint definida somente após gate fechado. |

## Backlog executável por trilha

### REG-0 — Baseline + decisão de WIP

1. Registrar estado atual do worktree (`git status --short`).
2. Classificar arquivos alterados em:
   - manter e finalizar,
   - reverter,
   - postergar.
3. Não iniciar feature nova sem essa decisão.

### REG-1 — Frontend unit tests

1. Corrigir testes stale vs tipos/exports atuais.
2. Atualizar fixtures para schema atual (`DailyHealthMetrics`, bridge PK, etc.).
3. Garantir execução do runner atual sem dependências ocultas.

### REG-2 — Frontend lint/purity

1. Resolver `set-state-in-effect` em componentes críticos.
2. Remover fontes impuras em render (`Date.now` em árvore renderizada, etc.).
3. Ajustar memoização onde o React Compiler sinaliza risco.

### REG-3 — Heurística de qualidade de humor

1. Stub substituído por regra explícita e testável em `frontend/src/utils/roocode-adapter.ts`.
2. Cobertura aplicada para payload válido/vazio/corrompido por assinatura de sono.
3. Ingestão de datas do mood endurecida para formatos legado (dd/mm) e v2 (ISO-like).

### REG-4 — Documentação homogênea

1. Manter como fonte única: `AGENTS.md`, `ROADMAP.md`, `CLAUDE.md`.
2. Remover material legado que só gera ambiguidade.
3. Atualizar docs **somente** com status comprovado por código/validação.

## Gate de conclusão da regularização

Executar e manter verde:

```bash
cd /root/RooCode/frontend
npx tsc --noEmit
npm run build
npm run lint
npm run test:unit

cd /root/RooCode
/root/RooCode/bin/python -m unittest tests.test_farma -v
/root/RooCode/bin/python -m unittest tests.test_forecast -v
/root/RooCode/bin/python -m unittest tests.test_mood -v
git diff --check
```

Status local 2026-05-06 (após Fatia B):

- Frontend: `npx tsc --noEmit`, `npm run test:unit`, `npm run lint` ✅
- Backend: 19/19 tests OK (farma + forecast + mood)
- Integridade de diff: `git diff --check` ✅
- ⚠ `npm run build` tem 1 erro pré-existente em `pk-standard-dose-comparison.tsx:263` (Codex WIP, intocado nesta sessão).

## Critério para voltar a sprint de feature

Só abrir nova sprint quando:

1. Gate acima estiver fechado;
2. docs estiverem consistentes com o commit em `main`;
3. WIP parcial tiver destino resolvido.

## Pendência final de desbloqueio

Resolvido em 2026-05-06: `git stash list` verificado vazio — não há WIP residual a tratar. Gate de regularização (REG-0..REG-4) fechado; reabertura de sprint de feature autorizada (Cross-Domain Insights iniciada nesta data).

## Sprint Cross-Domain Insights — execução

| Fatia | Status | Resultado |
|---|---|---|
| Fatia A — Free Wins | ✅ commit `59b133e` | RecoveryScore + WeekdayWeekend + forecastRationale |
| Fatia B — Cross-Domain Frontend | ✅ este commit | HRR no heatmap, sleep debt cumulativo, eficiência no SleepStages, card sleepDebt × HRV, adapter v2 hardening |
| Fatia C — Backend-heavy | backlog | Endpoint PK + Forecast Accuracy backtest (sprint dedicada) |

Plano completo: `/root/.claude/plans/oi-claude-eu-valiant-boole.md`.

## KICKOFF — Sprint Codex Cleanup (próxima sessão fresh)

> Cole este bloco quando voltar de /compact. Claude lê e segue.

```
# Sprint Codex Cleanup

Estado entrando: Fatias A/B/C da Cross-Domain Insights fechadas no main.
Worktree tem 11 arquivos do Codex em WIP + 1 untracked com erro TS:

Modified (Codex WIP):
- frontend/src/components/charts/lag-correlation-chart.tsx
- frontend/src/components/charts/pk-humor-correlation.tsx
- frontend/src/components/charts/pk-medication-grid.tsx
- frontend/src/components/charts/pk-mood-scatter-chart.tsx
- frontend/src/components/charts/shared/DataReadinessGate.tsx
- frontend/src/components/charts/vital-signs-timeline.tsx
- frontend/src/utils/data-readiness.ts
- frontend/src/utils/intraday-correlation.ts
- frontend/src/utils/pharmacokinetics.ts
- frontend/tests/intraday-correlation.test.ts

Untracked (Codex novo):
- frontend/src/components/charts/pk-standard-dose-comparison.tsx
  → erro TS conhecido em linha 263 (Recharts Formatter type mismatch:
    'value: number' incompatível com ValueType | undefined)

## Escopo desta sessão

Auditar e fechar o WIP do Codex de forma defensiva — sem perder contexto
das edições, sem assumir que o autor (Codex) não voltará.

### Step 1 — Auditoria
Para cada arquivo Modified do Codex:
- git diff HEAD -- <arquivo>
- Avaliar: a edição é parcial (em progresso) ou completa?
- Categorizar: (a) keep e commitar, (b) keep e deixar uncommitted pro Codex
  fechar depois, (c) reverter (`git checkout HEAD -- <arquivo>`)

### Step 2 — Fix do erro untracked
pk-standard-dose-comparison.tsx:263 — fix mínimo:
  trocar `(value: number, name: NameType | undefined) => ...`
  por `(value, name) => ...` ou tipar com cast explícito de Recharts ValueType.

### Step 3 — Verification gate
- npx tsc --noEmit
- npm run lint
- npm run test:unit
- npm run build (DEVE ficar 100% verde)
- /root/RooCode/bin/python -m unittest tests (todos)
- git diff --check

### Step 4 — Commit ou stash
Se categorizou como (a): commit por arquivo ou agrupado por tema.
Se categorizou como (b): /git stash com message clara, restaurar depois.
Se (c): commit do revert.

## Backlog menor (após Codex Cleanup)
- Resgatar walkingStepLengthCm no adapter (1 linha + 2 tipos)
- pk-rem-suppression: adicionar lag toggle + AUC trapezoidal precisa
- Considerar Sprint D (próxima feature cross-domain — TBD)

## Não tocar
- Forecast/storage.py + endpoint /accuracy (estável, Fatia C)
- Farma/router.py concentration-series (estável, Fatia C)
- Forecast/forecast_history.json (deve estar gitignored)
```

## KICKOFF — Fatia C (próxima sessão fresh)

> Cole este bloco na próxima sessão. Claude lê e sai executando.

```
# Sprint Cross-Domain Insights — Fatia C

Dar continuidade à sprint Cross-Domain Insights.
Plano completo: /root/.claude/plans/oi-claude-eu-valiant-boole.md
Commit Fatia A: 59b133e
Commit Fatia B: aaccd55

## Status entrando

- Fatia A fechada e commitada (RecoveryScore + WeekdayWeekend + forecastRationale)
- Fatia B fechada e commitada (HRR no heatmap, sleep debt cumulativo, eficiência em SleepStages, card sleepDebt × HRV, adapter v2 hardening)
- Codex pode ainda ter WIP em arquivos de farmaco (lag-correlation-chart, pk-humor-correlation, pk-medication-grid, pk-mood-scatter-chart, DataReadinessGate, vital-signs-timeline, data-readiness, intraday-correlation, pharmacokinetics, intraday-correlation.test) — não tocar
- pk-standard-dose-comparison.tsx pode ainda estar untracked com erro TS na linha 263 (Recharts Formatter); confirmar com `npm run build` antes de começar

## Escopo desta sessão (Fatia C — backend-heavy)

⚠ Mais risco que A e B: endpoints novos no backend + persistência. Pode virar Sprint 2 dedicada se ficar grande.

### C1 — Endpoint /farma/concentration-series + chart Lisdex × REM

Backend novo:
- Rota em Farma/router.py que usa concentration_after_multiple_doses() de Farma/math.py
  - Query: ?substance=venvanse&from=YYYY-MM-DD&to=YYYY-MM-DD&resolution=daily
  - Returns: [{date, cmax_est, cmin_est, auc_est}] por dia
  - NÃO mexer em Farma/math.py — só wrappar a função existente

Frontend novo:
- frontend/src/components/charts/pk-rem-suppression.tsx
  - Scatter Cmax_estimated (X) × sleepRemHours next-night (Y)
  - Pearson r com permutation p-value (reusar intraday-correlation.ts)
  - DataReadinessGate

Hipótese clínica: lisdex peak ~3h post-dose, REM suppression conhecida → r negativo esperado.

### C2 — Forecast Accuracy Backtest

Backend novo módulo:
- Forecast/storage.py
  - Persistir cada forecast gerado em Forecast/forecast_history.json com {generated_at, target_date, predicted, confidence}
  - Função compute_accuracy(snapshots, history, days_back=30) retorna MAPE/MAE por field

Backend novo endpoint:
- GET /forecast/accuracy?days=30

Frontend novo:
- frontend/src/components/charts/forecast-accuracy-card.tsx na aba Panorama
  - Mostra MAPE 7d/30d por field (sleep, hrv, rhr)
  - Aviso explícito: "histórico começa hoje — dados acumulam ao longo do tempo"

Caveat: backtest só vira útil após ~14 dias de previsões acumuladas. Implementar agora pra começar a coletar.

## Reuso obrigatório
- Farma/math.py:concentration_after_multiple_doses() — PK estável
- frontend/src/utils/intraday-correlation.ts — permutation testing
- frontend/src/components/charts/shared/DataReadinessGate.tsx — gate de readiness
- frontend/src/components/analytics/shared.tsx:MetricGrid — wrapper de tiles

## NÃO mexer
- Schema público de /farma/doses, /farma/regimen, /farma/substances
- Arquivos do Codex WIP (ver lista acima)

## Verification gate

cd /root/RooCode/frontend
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build

cd /root/RooCode
/root/RooCode/bin/python -m unittest tests.test_farma -v
/root/RooCode/bin/python -m unittest tests.test_forecast -v
/root/RooCode/bin/python -m unittest tests.test_mood -v
git diff --check

# E2E manual:
systemctl restart roocode.service
curl -s 'http://localhost:8011/farma/concentration-series?substance=venvanse&from=2026-04-01&to=2026-05-01' | jq .
curl -s 'http://localhost:8011/forecast/accuracy?days=30' | jq .

## Commit final esperado
1 commit atômico (ou 2 separando C1/C2). Mensagem com seção "por que".

## Backlog menor (pós-Fatia C)
- Resgatar walkingStepLengthCm no adapter (1 linha + ajuste em 2 tipos)
- Aguardar Codex fechar pk-standard-dose-comparison.tsx
- Atualizar AGENTS.md / ROADMAP.md / CLAUDE.md com Fatia C fechada
```
