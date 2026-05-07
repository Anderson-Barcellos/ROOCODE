# RooCode — Roadmap de Regularização

> Última atualização: 2026-05-07
> Estado: **regularização fechada**, Cross-Domain Insights e Codex Cleanup concluídas.

## Objetivo do ciclo atual

Próxima sprint de feature aberta — Sprint D TBD (a definir conforme prioridade clínica/UX).

## Escopo deste roadmap

- **Inclui:** registro histórico das trilhas concluídas, status atual de validação e backlog menor.
- **Não inclui:** plano detalhado de Sprint D (ainda sem escopo definido).

## Trilhas de regularização

| Ordem | Trilha | Status | Resultado esperado |
|---|---|---|---|
| REG-0 | Baseline + decisão de WIP | CONCLUÍDA | WIP antigo retirado do worktree e estacionado em stash. |
| REG-1 | Frontend unit tests | CONCLUÍDA | `npm run test:unit` verde sem bypass. |
| REG-2 | Frontend lint/purity | CONCLUÍDA | `npm run lint` verde (hooks/purity resolvidos). |
| REG-3 | Heurística de qualidade de humor | CONCLUÍDA | `detectMoodDataQuality` objetivo + ingestão mood robusta para AutoExport v1/v2. |
| REG-4 | Documentação homogênea | CONCLUÍDA | `AGENTS.md`/`ROADMAP.md`/`CLAUDE.md` refletindo estado real do código. |
| REG-5 | Reabertura de roadmap de features | CONCLUÍDA | Sprint Cross-Domain Insights (A/B/C) + Codex Cleanup executadas. |

## Backlog executável por trilha (histórico)

### REG-0 — Baseline + decisão de WIP

1. Registrar estado atual do worktree (`git status --short`).
2. Classificar arquivos alterados em manter/finalizar, reverter, postergar.
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

## Gate de validação local (executar e manter verde)

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

Status local 2026-05-07 (após Codex Cleanup + walkingStepLengthCm rescue):

- Frontend: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run build` ✅
- Backend: 29/29 tests OK (farma 10 + forecast 13 + mood 6)
- Integridade de diff: `git diff --check` ✅

## Sprint Cross-Domain Insights — execução

| Fatia | Status | Resultado |
|---|---|---|
| Fatia A — Free Wins | ✅ commit `59b133e` | RecoveryScore + WeekdayWeekend + forecastRationale |
| Fatia B — Cross-Domain Frontend | ✅ commit `aaccd55` | HRR no heatmap, sleep debt cumulativo, eficiência no SleepStages, card sleepDebt × HRV, adapter v2 hardening |
| Fatia C — Backend-heavy | ✅ commit `05e5d53` | `/farma/concentration-series` + `/forecast/accuracy` + chart pk-rem-suppression + card forecast-accuracy |

Plano completo: `/root/.claude/plans/oi-claude-eu-valiant-boole.md`.

## Sprint Codex Cleanup (2026-05-07)

Concluída em commit `8d35972`. Refactor estatístico do Codex (SMA→EMA,
readiness 4 níveis, permutation/bootstrap/Spearman/FDR, novo chart
pk-standard-dose-comparison) adotado como feature coesa. Fix do erro TS
Recharts Formatter destravou o build. Crédito ao Codex via Co-Authored-By.

## Backlog menor (2026-05-07)

- ✅ `walkingStepLengthCm` resgatado no pipeline (commit `8c8128a`):
  type + adapter + aggregation + interpolation policy `linear_bounded`
  (±1.5 cm/dia) + fixtures. Disponível pra próxima sprint visualizar
  (ainda sem chart).
- ⏳ pk-rem-suppression: adicionar lag toggle + AUC trapezoidal precisa (TBD).
- ⏳ Sprint D: próxima feature cross-domain (escopo a definir).
