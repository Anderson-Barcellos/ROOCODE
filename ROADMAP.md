# RooCode — Roadmap de Fechamento

> Última atualização: 2026-04-28 · Pós-Sprint CHART-2 (4 bugs adapter + HRRangeChart) · Filtrado pra contexto pessoal
> Estado base: **Sprints 11A + CHART-1 + CHART-2 ✅ concluídas**, working tree praticamente limpo (`CHARTENDEAVOUR.md` vazio órfão pendente de decisão), sincronizado com `origin/main`
> Referência bruta: `Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md` (25 achados — usar como consulta, **não** como roteiro)
>
> 🎯 **Sidequest ativa:** revisão de charts em `/root/.claude/plans/merry-plotting-sunbeam.md` — 5 sprints (CHART-1 a CHART-5), CHART-1 e CHART-2 fechadas, **CHART-3 (~30min)** próxima na fila (`physicalEffort` + `standingMinutes`).

## Contexto

RooCode é app de **uso pessoal exclusivo do Anders**. Não vai pra distribuição, single-user em rede local/domínio próprio, sem ataque externo realista. A auditoria de 2026-04-26 mapeou achados úteis, mas muitos têm viés SaaS multi-tenant que não se aplica aqui (auth API, code-splitting agressivo, suite Playwright, refactors DRY cosméticos). Esta versão do ROADMAP filtra **só o que single-user vai sentir**.

## Visão geral

| Sprint | Escopo | Esforço | Risco |
|--------|--------|---------|-------|
| **10D** ✅ | Charts clínicos (RespDist, VitalSigns, CardioRecov) | concluída 2026-04-26 | — |
| **9E** ✅ | Re-upload CSV mood histórico (HH:MM:SS preservado) | concluída 2026-04-27 | — |
| **11A** ✅ | Limpeza dead code (-2086 LOC + 4 deps órfãs) | concluída 2026-04-27 | — |
| **CHART-1** ✅ | Remoção 3 charts baixo signal (Mood Donut, Weekly Pattern, Med Adherence) | concluída 2026-04-27 | — |
| **CHART-2** ✅ | 4 bugs adapter (movement, peso, HR keys, sleepInBed) + HRRangeChart | concluída 2026-04-28 | — |
| **CHART-3 🚧** | physicalEffort + standingMinutes | ~30min | Baixo |
| **11B — Bugs + QoL** | Banner erro, lint React 7 erros, Mood NaN→null, gitignore, logrotate, requirements.txt | 1.5-2h | Baixo |
| **11C — Infra + DRY** | Frontend Vite em systemd OU dist estático via Apache, helpers Gemini comuns | 45min | Baixo |
| **Lights paralelos** | 11C Clonazepam + 11D TODOs(Anders) | 1h | Baixo |
| **Cinza** | Higiene operacional barata se vier vontade | 30min | Baixo |
| **Push** | `git push origin main` ao fim de cada sprint | 30s | Nenhum |

**Total realista pra zerar:** ~3-4h em 1-2 sessões. Pode parar em qualquer ponto.

---

## Sprint 11 — Bugs + QoL (~1.5-2h)

**Critério de inclusão:** o item gera bug latente, regressão real, ou QoL que tu já sentiu (ou vai sentir em uso normal). Nada de "boa prática" sem ganho concreto pra single-user.

### Tarefas

1. **Banner global de erro TanStack Query** (~30min)
   - Tu já sentiu o silenciamento na Fase 10B (calendário vazio em 422 sem aviso)
   - Implementação simples: `mutationCache.onError` ou `<QueryErrorBoundary>` mostrando toast amber discreto — `"erro {status} em {endpoint}"`
   - Arquivos: `frontend/src/main.tsx` ou `App.tsx` + helper em `lib/api.ts`

2. **`Mood/mood.py` GET → NaN→null** (~5min)
   - Bug latente: `df.to_dict(orient="records")` preserva `NaN` que pode quebrar `JSONResponse`
   - Fix copiado de Metrics e Sleep que já corrigiram: `json.loads(df.to_json(orient="records"))`
   - Arquivo: `Mood/mood.py:128`

3. **Lint React — só os 7 erros reais** (~30-45min)
   - Esses NÃO são esoterismo — são bugs latentes que podem afetar UX:
     - `DoseLogger.tsx:54` — `setState` sincronico em effect (risco de loop)
     - `pk-medication-grid.tsx:165, 297, 370` — `Date.now()` em render puro (re-render constante)
     - `pk-mood-scatter-chart.tsx:70-82`, `lag-correlation-chart.tsx:78` — memoização instável (perde otimização)
   - Arquivos: 4 componentes acima

4. **`.gitignore` cobrir backups reais** (~1min)
   - Adicionar `*.backup*` e `*.csv.backup*` (atual `*.backup` não pega `mood.csv.backup-2026-04-23-*`)
   - Arquivo: `.gitignore`

5. **logrotate pro `/var/log/roocode-api.log`** (~5min)
   - Log já tá em ~19.6 MB sem rotation, só vai crescer
   - Arquivo novo: `/etc/logrotate.d/roocode` com weekly rotate, keep 4

6. **`requirements.txt` versionado** (~5min)
   - Garante reproducibilidade se algum dia tu trocar de máquina
   - `pip freeze` no venv → filtrar pras 8 deps reais (fastapi, uvicorn, pandas, pydantic, google-genai, PyYAML, python-multipart, scipy)
   - Arquivo novo: `requirements.txt`

### Validação

```bash
# Banner erro:
curl -X POST http://localhost:8011/farma/doses -d 'malformed'    # Frontend deve mostrar toast
# Mood NaN:
curl -s http://localhost:8011/mood | jq . | head    # Sem erro, NaN aparece como null
# Lint:
cd frontend && npm run lint    # 0 erros
# logrotate:
sudo logrotate -d /etc/logrotate.d/roocode    # dry-run sem erro
# requirements.txt:
diff <(sort requirements.txt) <(./bin/pip freeze | sort)    # idem
```

---

## Lights paralelos (~1h total)

Independentes do Sprint 11, podem ser feitas em qualquer ordem ou paralelo.

### 11C — Cadastrar Clonazepam PRN (~30min)
**Por quê:** Clonazepam tem cor reservada (`#f59e0b` em `substance-colors.ts`) mas zero entrada no backend. Aba Insights ganha PK PRN quando logado.

**Como:** entrar via `MedicationCatalogEditor` no UI, PK realista (t½ 30-40h, Vd 3 L/kg, F ~90%, ka 1.0/h), `therapeutic_range` `null` → renderizar como concentração bruta no `PKCompactCard` (modo experimental já existe na Fase 8A.1).

### 11D — TODOs(Anders) (~30min)

| Arquivo:linha | TODO |
|---------------|------|
| `frontend/src/utils/roocode-adapter.ts:158, 180` | Heurística de detecção de mock vs real |
| `frontend/src/utils/data-readiness.ts:61` | Tom/formato das mensagens "faltam N dias" |
| `frontend/src/utils/health-policies.ts:17` | Bands de VO2 max pra homem 35-44 anos |

Tweaks de tom/heurística, não lógica nova.

---

## Cinza (~30min, só se vier vontade)

Higiene operacional barata. Não dá ganho dramático, mas custa pouco e é higiene básica.

- **`POST /farma/doses` validações simétricas** com `PUT` — `dose_mg > 0` + `_validate_iso_timestamp` (3 linhas em `Farma/router.py:440-462`). Tu mesmo é o único que loga, mas evita bug bobo se errar timestamp.
- **`updateDose` resolver custom** — trocar `get_substance_profile()` por `_resolve_substance_any()` em `Farma/router.py:495-503`. Single-line fix, cobre custom substance edits.
- **`chmod 600 /root/GEMINI_API/env.yml`** — higiene de credencial básica, custa zero.
- **Escrita atômica JSON** (`os.replace` em `_save_doses` etc.) — single-user single-process não tem concorrência prática, mas custa 5 linhas e protege contra crash mid-write.

---

## Arquivado (overkill pra contexto pessoal)

Itens da auditoria que **não vão entrar** em Sprint, ficam apenas como referência caso o contexto mude (distribuição, multi-user, equipe). A auditoria completa em `Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md`.

| Achado da auditoria | Por que arquivado |
|---------------------|-------------------|
| Auth básica em `/health/api/*` | Single-user em domínio pessoal, sem threat model realista |
| Vite dev → `dist` estático via Apache | Vite dev funciona, HMR só local, performance OK |
| `roocode.service` rodar como user não-root | Blast radius prático = "Anders apaga dados de Anders" |
| Code-splitting `React.lazy` por aba | First paint em LAN local não dói, manutenção custa mais que o ganho |
| Suite Playwright completa | Validação visual já é manual, overhead de manutenção > regressão capturada |
| Helper `Ai/gemini.py` comum | DRY puro entre 2 arquivos, drift atual gerenciável |
| Harmonizar `useDoses(window)` | Latência atual aceitável, não está no caminho de UX dolorosa |
| Rename `claude` → `gemini` | Cosmético, label não confunde tu mesmo |
| Reescrever testes frontend stale | Se não roda há meses, deletar é melhor que consertar |
| Remover token de `.git/config` | Higiene boa, mas baixa urgência (repo não é alvo realista) |
| `GET /farma/regimen` side effect | Aceitável em single-user — documentado e ponto |
| LRU em cache IA | Cache cresce devagar pra single-user, não é urgente |

**Resumo:** 12 dos 25 achados foram para esta lista. O ROADMAP enxuto cobre os 13 que **single-user vai sentir**.

---

## Visão de longo prazo (Fase 12+)

Vazia por design. Abre quando surgir necessidade real. Hipóteses (sem urgência):

- Export PDF/PNG mensal do dashboard pra registro clínico
- Comparação mês-a-mês (overlay `mês anterior` em charts de tendência)
- Integração direta iPhone Shortcuts → backend (sem AutoExport intermediário)
- Modo de leitura "consulta médica" (versão impressível ou tela cheia clean)

Nada disso entra em planejamento até ser pedido.

---

## Sequenciamento sugerido

**Próxima sessão (Sprint 11 Bugs+QoL, ~1.5-2h):**
1. Banner erro global (30min) — mais alto valor de QoL
2. Lint React 7 erros (45min) — bugs latentes reais
3. Mood NaN + .gitignore + logrotate + requirements.txt (20min) — pequenos
4. Atualizar CLAUDE.md/ROADMAP.md + commit + push (5min)

**Quando der vontade (paralelo):**
- 11C Clonazepam (30min — ganho clínico imediato)
- 11D TODOs(Anders) (30min — polish)
- Cinza (30min — higiene se vier vontade)

Após tudo: projeto entra em **modo manutenção** — só novas features se pedido específico.
