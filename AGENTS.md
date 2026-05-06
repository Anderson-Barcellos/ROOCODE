# RooCode — Agent Handoff (Regularização)

## Regra ativa

**Context is expensive.** Preferir leitura mínima útil, edição mínima segura e saída final que ajude o Anders a decidir.

## Estado do projeto (2026-05-04)

- As trilhas de sprint anteriores foram **canceladas** para evitar continuidade sobre base inconsistente.
- Não existe sprint de feature ativa no momento.
- Prioridade atual: **regularização técnica + documentação homogênea**.

## Contrato documental (fonte de verdade)

1. `AGENTS.md` (este arquivo): contrato operacional atual.
2. `ROADMAP.md`: plano de regularização em ordem executável.
3. `CLAUDE.md`: handoff curto de stack, runtime e comandos.

Qualquer documento fora desse trio deve ser tratado como histórico/legado e pode ser removido quando não agregar.

## Baseline funcional a preservar

### 1) Medication Action Center

- `DoseLogger` mantém atalhos **tomar agora** para entradas ativas do regime.
- `DoseCalendarView` mantém fluxo rápido de **adicionar/editar/remover** dose no dia selecionado.
- Contrato Farma preservado: `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances` sem mudança de schema público.

### 2) Insights de humor

- `MoodDriverBoard` continua no topo de Insights via `CorrelationHeatmap`.
- `MoodLagHypothesisLab` continua com lags `0d..3d`, `n`, qualidade, Pearson `r`, baseline acima/abaixo e aviso de sampling bias.
- Regra de interpretação: estado `dados insuficientes` explícito; sem causalidade clínica.

## Achados abertos (alto valor)

1. Stash original de charts de marcha (`walking-heart-rate`, `physical-effort`, `walkingStepLengthCm`) foi verificado vazio em 2026-05-06 (`git stash list` sem entradas) — não há WIP residual. Expansão dessas viz volta ao backlog livre, sem fatia parcial pendente.
2. Worktree local está com múltiplas fatias de regularização misturadas (backend/frontend/testes/docs) e precisa recorte explícito para commit limpo.

## Status local de regularização (2026-05-04)

- REG-0 fechado localmente: WIP antigo retirado do worktree e estacionado em stash.
- REG-1 fechado localmente: `npm run test:unit` verde.
- REG-2 fechado localmente: `npm run lint` verde.
- REG-3 fechado localmente: heurística `detectMoodDataQuality` objetiva + ingestão de mood robusta (AutoExport v1/v2).
- REG-4 fechado localmente: documentação (`AGENTS.md`/`ROADMAP.md`/`CLAUDE.md`) alinhada ao estado real do código/validações.
- Hardening adicional fechado localmente: forecast (dedupe/ordem/erro HTTP), correlação PK×humor (filtro de concentração) e p-value via Fisher z.
- Decisão operacional: stash@{0} verificado vazio em 2026-05-06 — sem WIP residual a tratar.

## Sequência fresh obrigatória

1. Ler `ROADMAP.md` e `CLAUDE.md`.
2. Sanity de runtime/worktree:
   - `systemctl is-active roocode.service`
   - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep`
   - `git status --short`
3. Validar baseline técnico:
   - `cd /root/RooCode/frontend`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run lint`
   - `npm run test:unit`
   - `cd /root/RooCode`
   - `/root/RooCode/bin/python -m unittest tests.test_farma -v`
   - `/root/RooCode/bin/python -m unittest tests.test_forecast -v`
   - `/root/RooCode/bin/python -m unittest tests.test_mood -v`
   - `git diff --check`

## Gate de regularização (antes de nova feature)

1. Decidir explicitamente o destino do WIP atual (concluir ou descartar).
2. `test:unit` frontend verde.
3. `lint` frontend verde.
4. Heurística de qualidade de humor sem TODO/stub.
5. Docs atualizados apenas com status real.
6. Recorte explícito do worktree em fatias de commit limpas.

## Protocolo `/regularizar`

Quando o Anders pedir `/regularizar`, executar em fatias pequenas:

1. Declarar a fatia (escopo + arquivos + validação).
2. Implementar somente o necessário para fechar a fatia.
3. Rodar validações da fatia.
4. Atualizar `AGENTS.md`, `ROADMAP.md`, `CLAUDE.md` com estado real.
5. Commit/push apenas dos arquivos da fatia concluída.
