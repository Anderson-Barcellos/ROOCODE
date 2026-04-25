# RooCode — Roadmap de Fechamento

> Última atualização: 2026-04-25 · Pós-Fase 10C
> Estado base: 22 commits ahead de `origin/main`, working tree limpo

## Visão geral

| Fase | Escopo | Esforço | Risco | Bloqueia? |
|------|--------|---------|-------|-----------|
| **10D-1** | Remover 3 charts duplicados | 15-20min | Baixo | — |
| **10D-2** | Criar 3 charts clínicos novos | 1-1.5h | Médio | — |
| **11A** | Code-splitting (warn >500KB) | 1h | Baixo-Médio | — |
| **11B** | Logger global de erros frontend | 30-45min | Baixo | — |
| **11C** | Cadastrar Clonazepam + PRN visíveis | 30min | Baixo | Insights ganham PK PRN |
| **11D** | Resolver TODOs(Anders) pequenos | 30min | Baixo | — |
| **9E** | Re-upload CSV mood histórico | minutos no iPhone | Nenhum | Charts intraday ganham retroativo |
| **Doc** | Atualizar CLAUDE.md pós Fase 10 | 5min | Nenhum | — |
| **Push** | `git push origin main` | 30s | Nenhum | Backup remoto |

**Total estimado pra zerar pendências de código:** ~4-5h em 1-2 sessões.

---

## Fase 10D — Implementação dos findings da 10C

Detalhes completos em `/root/.claude/plans/fase-10c-findings.md`. Resumo:

### 10D-1 — Remoções (`refactor`)
- Apagar 3 instâncias duplicadas em `App.tsx`:
  - `<HrvAnalysis />` (L489) — duplicata exata da L399 executive
  - `<HeartRateBands />` (L490) — duplicata exata da L405 executive
  - `<WeeklyPatternChart />` (L499) — triplicata da L527 patterns
- Reorganizar grid de sleepPhysiology
- 1 commit. **Pré-requisito de 10D-2** (libera espaço de layout).

### 10D-2 — Charts clínicos novos (`feat`)
3 componentes novos em `frontend/src/components/charts/`, todos posicionados em sleepPhysiology:

| Chart | Campo(s) | Visualização |
|-------|----------|--------------|
| `RespiratoryDisturbancesChart` | `respiratoryDisturbances` | Bar + SMA-7d, threshold IAH (5/15/30 eventos) |
| `VitalSignsTimeline` | `respiratoryRate` + `pulseTemperatureC` | Dual-axis line, bandas RR 12-20 / Temp 36-37 |
| `CardioRecoveryChart` | `cardioRecoveryBpm` | Pontos + SMA-14d, bandas excelente/boa/regular/ruim |

3 commits (1 por chart). Atualizar `health-policies.ts`, `data-readiness.ts`, `interpolate.ts` em cada.

---

## Fase 11 — Polimentos e dívida técnica

Cada sub-sprint é independente — pode pegar uma solta sem completar tudo.

### 11A — Code-splitting do bundle JS

**Problema:** warning `chunks > 500KB` desde Fase 8A. Bundle atual 944 KB minified, 269 KB gzip. Carrega tudo no first paint, mesmo charts que estão em outras abas.

**Solução proposta:** dynamic import por aba — `React.lazy()` em cada `<TabContent>` + `<Suspense fallback={<SkeletonChart />}>`. Pode reduzir first paint pra ~200-300 KB (só executive). Charts pesados como Recharts seriam tree-shaken por aba.

**Esforço:** 1h. **Validação:** comparar bundle antes/depois + Lighthouse score.

**Arquivos prováveis:** `frontend/src/App.tsx` (lazy imports), `vite.config.ts` (rolldown options se necessário).

### 11B — Logger global de erros frontend

**Problema descoberto na Fase 10B:** o helper `get()` em `frontend/src/lib/api.ts:120` lança `Error("HTTP {status}")` em respostas non-OK, mas o erro é **silenciosamente cacheado pelo TanStack Query** sem feedback visual. Calendário ficou vazio por isso na 10B (status 422 do `hours > 720`).

**Solução proposta:** wrapper `<QueryErrorBoundary>` ou `mutationCache.onError` global que mostra toast/banner amber discreto com mensagem `"erro {status} em {endpoint}"`. Não interrompe navegação, mas torna falhas visíveis.

**Esforço:** 30-45min. Lib opcional: `sonner` ou implementar toast simples.

**Arquivos prováveis:** `frontend/src/lib/api.ts` (handler centralizado), `frontend/src/main.tsx` ou `App.tsx` (boundary).

### 11C — Cadastrar Clonazepam + PRN visíveis

**Problema documentado na Fase 10A:** Clonazepam tem cor reservada (`#f59e0b` em `substance-colors.ts`) mas **zero entrada no backend** (`medDataBase.json` ou `substances_custom.json`). Atualmente é fantasma — não aparece no `/farma/substances`, não pode ser logado.

**Solução proposta:** entrar Clonazepam via `MedicationCatalogEditor` no UI (`POST /farma/substances/clonazepam`) com PK realista:
- t½ ~30-40h (faixa benzodiazepínica longa)
- Vd 3 L/kg
- F ~90% (oral bem absorvido)
- ka 1.0/h
- therapeutic_range: tricky em PRN — talvez deixar `null` e renderizar como concentração bruta no PKMedicationGrid

**Esforço:** 30min (preencher catálogo + validar 1 dose teste).

**Bonus:** uma vez cadastrado, charts da aba Insights (`PKMoodScatter`, `LagCorrelation`) ganham análise PK do Clonazepam quando logado em PRN.

### 11D — Resolver TODOs(Anders) pequenos no código

3 TODOs marcados explicitamente:

| Arquivo:linha | TODO |
|---------------|------|
| `frontend/src/utils/roocode-adapter.ts:158, 180` | Heurística de detecção de mock vs real |
| `frontend/src/utils/data-readiness.ts:61` | Tom/formato das mensagens "faltam N dias" |
| `frontend/src/utils/health-policies.ts:17` | Bands de VO2 max pra homem 35-44 anos |

**Esforço:** 30min total (são tweaks de tom/heurística, não lógica nova).

---

## Ações Anders (sem código, fora-de-sprint)

### 9E — Re-upload CSV mood histórico

**Por quê:** o fix de `Mood/mood.py::_format_mood_date` na Fase 8B preserva HH:MM:SS de Emoções Momentâneas, mas o CSV antigo já tinha perdido essas horas antes do fix. Charts intraday (`PKMoodScatter`, `LagCorrelation`) só veem emoções após 2026-04-20. Re-upload recupera retroativamente.

**Como:**
1. iPhone → AutoExport → export State of Mind CSV completo
2. Upload via `POST /health/api/mood`
3. Verificar:
   ```bash
   curl -s http://localhost:8011/mood | jq '.[] | select(.Fim == "Emoção Momentânea") | .Iniciar' | head -5
   ```
   Esperar HH:MM:SS preservado nos timestamps antigos.

### Push 22 commits pra `origin/main`

Atualmente só local. Decisão puramente de **safety** — sem CI configurado que possa quebrar:

```bash
git push origin main
```

Recomendado fazer **antes da Fase 10D** pra ter checkpoint estável. Se tu não testou ainda o auto-fill do DoseLogger (10A), faz sentido validar isso também antes do push.

### `/memorypack` ao fim de cada sessão

Skill instalada em `/root/.claude/`. Indexa a conversa atual no banco vetorial pra recuperação cross-session via `/memsearch`. **Recomendado rodar antes de fechar a sessão**, não no meio (JSONL só fica completo quando sessão fecha).

---

## Documentação

### Atualizar CLAUDE.md pós Fase 10

Adicionar checklist da Fase 10 na seção `## Status` (após linha 182) e atualizar/limpar o KICKOFF da Fase 10 (linhas 205-307) que ficou desatualizado:

```markdown
- [x] **Fase 10:** UX Medicação + Revisão de Seções (concluída 2026-04-25)
  - **10A ✅** DoseLogger com auto-fill do regime (`a71843e`)
  - **10B ✅** DoseCalendarView dual-pane (`375186c`)
  - **Fix lateral ✅** cap hours 8760 em /farma/doses (`5b8e28c`)
  - **10C ✅** Diagnóstico de redundâncias documentado em `/root/.claude/plans/fase-10c-findings.md`
  - **10D ⏳** Implementação dos findings (escopo em ROADMAP.md)
```

E criar novo KICKOFF pra Fase 10D substituindo o antigo. **Esforço: 5min.**

---

## Visão de longo prazo (Fase 12+)

Vazia por design. Abre quando surgir necessidade real. Hipóteses (sem urgência, sem compromisso):

- Export PDF/PNG mensal do dashboard pra registro clínico
- Comparação mês-a-mês (overlay `mês anterior` em charts de tendência)
- Integração direta iPhone Shortcuts → backend (sem AutoExport intermediário)
- Modo de leitura "consulta médica" (versão impressível ou tela cheia clean)

Nada disso entra em planejamento até ser pedido.

---

## Sequenciamento sugerido

**Próxima sessão (1.5-2h):**
1. Push origin/main (30s, antes de codar)
2. 10D-1 remoções (15-20min)
3. 10D-2 charts novos (1-1.5h)
4. Atualizar CLAUDE.md (5min)
5. /memorypack antes de fechar

**Sessão seguinte (1-2h, opcional):**
1. 11A code-splitting **OU** 11B logger erros (escolher um)
2. 11C Clonazepam (rápido, ganho clínico imediato)
3. 11D TODOs

**Quando puder (sem sprint):**
- 9E re-upload CSV no iPhone

Após tudo: projeto entra em **modo manutenção** — só novas features se pedido específico.
