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

Status local 2026-05-04:

- Frontend: `npx tsc --noEmit`, `npm run test:unit`, `npm run lint`, `npm run build` ✅
- Backend: `/root/RooCode/bin/python -m unittest tests.test_farma -v`, `/root/RooCode/bin/python -m unittest tests.test_forecast -v`, `/root/RooCode/bin/python -m unittest tests.test_mood -v` ✅
- Integridade de diff: `git diff --check` ✅

## Critério para voltar a sprint de feature

Só abrir nova sprint quando:

1. Gate acima estiver fechado;
2. docs estiverem consistentes com o commit em `main`;
3. WIP parcial tiver destino resolvido.

## Pendência final de desbloqueio

- Decidir destino de `stash@{0}` (absorver ou descartar) e executar recorte de commits em fatias limpas antes de reabrir sprint de feature.

Decisão atual (2026-05-04):

- O tratamento de `stash@{0}` será executado em **sprint dedicada numa sessão fresh**, para reduzir cache/contexto acumulado.
