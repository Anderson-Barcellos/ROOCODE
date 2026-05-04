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
| REG-3 | Heurística de qualidade de humor | PENDENTE | `detectMoodDataQuality` sem TODO/stub e com regra objetiva. |
| REG-4 | Documentação homogênea | EM ANDAMENTO | `AGENTS.md`/`ROADMAP.md`/`CLAUDE.md` refletindo só estado real. |
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

1. Substituir stub de `detectMoodDataQuality` por regra explícita e testável.
2. Cobrir casos:
   - payload válido,
   - payload vazio,
   - payload corrompido por colunas de sono/métricas.
3. Evitar falso positivo que bloqueie mood válido.

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
git diff --check
```

Status local 2026-05-04:

- Frontend: `npx tsc --noEmit`, `npm run test:unit`, `npm run lint`, `npm run build` ✅
- Backend: `/root/RooCode/bin/python -m unittest tests.test_farma -v` ✅
- Integridade de diff: `git diff --check` ✅

## Critério para voltar a sprint de feature

Só abrir nova sprint quando:

1. Gate acima estiver fechado;
2. docs estiverem consistentes com o commit em `main`;
3. WIP parcial tiver destino resolvido.
