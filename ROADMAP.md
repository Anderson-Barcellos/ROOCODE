# RooCode — Roadmap de Fechamento

> Última atualização: 2026-04-27 · Pós-Fase 10D + 9E + Auditoria 2026-04-26
> Estado base: 7 commits ahead de `origin/main` (Fase 10D), trabalho documental desta sessão pendente
> Fonte primária dos achados pós-auditoria: `Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md`

## Visão geral

| Fase | Escopo | Esforço | Risco | Bloqueia? |
|------|--------|---------|-------|-----------|
| **10D** ✅ | Charts clínicos (RespDist, VitalSigns, CardioRecov) + adapter dual-format | concluída 2026-04-26 | — | — |
| **9E** ✅ | Re-upload CSV mood histórico (HH:MM:SS preservado) | concluída 2026-04-27 | — | — |
| **11-Sec** | Segurança operacional (P0/P1) | 2h | Médio | Recomendado primeiro |
| **11-Quality** | Restaurar testes/lint + validações Farma | 1.5h | Baixo | Antes de logic refactor |
| **11-Flow** | Erro global + Gemini common + humor normalize | 2h | Baixo-Médio | Engloba 11B antigo |
| **11-Perf** | Code-splitting + dead code + Playwright | 1.5h | Baixo | Engloba 11A antigo |
| **11C** | Cadastrar Clonazepam PRN | 30min | Baixo | Insights ganham PK PRN |
| **11D** | Resolver TODOs(Anders) | 30min | Baixo | — |
| **11-Ops** | requirements.txt + atomic write + logrotate + LRU | 1h | Baixo | Blindagem ops |
| **Doc** | Atualizar CLAUDE.md/ROADMAP.md | 5min | Nenhum | Cada sprint atualiza |
| **Push** | `git push origin main` | 30s | Nenhum | Backup remoto |

**Total estimado pra zerar tudo:** ~7-9h em 4-5 sessões. Pode parar em qualquer Sprint sem comprometer o que já roda.

---

## Fonte primária da reorganização

A auditoria de 2026-04-26 (`Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md`) mapeou **25 achados** distribuídos em 4 categorias:

- **P0/P1 — Segurança operacional** (achados 1-4): API sem auth, Vite dev exposto, credenciais frágeis, service como root
- **P1 — Correção funcional** (5-9): assimetria validações Farma, custom resolve em update, datas inválidas IA, normalização humor duplicada, NaN em Mood GET
- **P1 — Frontend/UX** (10-14): erro global não exibido, lint React falhando, testes stale, queries doses divergentes, label Claude→Gemini
- **P2 — Manutenção** (15-22): helpers Gemini duplicados, falta requirements.txt, escrita não atômica, GET com side effect, cache sem limite, logs sem rotação, doc divergente, gitignore incompleto
- **P3 — Limpeza** (23-25): dead code data-pipeline, bundle 944KB, falta Playwright

A reorganização abaixo agrupa esses achados em sprints temáticos coerentes.

---

## Sprint 11-Sec — Segurança operacional (~2h, P0/P1)

**Objetivo:** cortar exposição real de superfície pública antes de qualquer outro trabalho.

Achados cobertos: 1, 2, 3, 4, 22.

### Tarefas
1. **Auth básica em `/health/api/*`** — token simples ou Basic Auth, header `X-API-Key` aceito tanto pelo Vite frontend quanto manualmente. Bloquear writes (POST/PUT/DELETE) sem auth, manter GETs públicos OK pra leitura local.
2. **Servir `frontend/dist` estático via Apache** — `npm run build` no deploy + `Alias /health/ /root/RooCode/frontend/dist/` com fallback SPA. Apaga Vite dev da borda pública. Manter `npm run dev` apenas pra desenvolvimento local.
3. **`env.yml` perm 600** — `chmod 600 /root/GEMINI_API/env.yml`. Confirmar leitura ainda funciona pelo systemd com `User=roocode`.
4. **Remover token de `.git/config`** — trocar remote pra SSH ou usar credential helper. Rotacionar token se usado.
5. **Criar usuário não-root** — `useradd --system roocode`, ajustar `User=` em `roocode.service`, `chown -R roocode:roocode /root/RooCode/{Mood,Metrics,Sleep,Farma}` (apenas dirs com escrita).
6. **`.gitignore` cobrir backups** — adicionar `*.backup*` e `*.csv.backup*` (atualmente só `*.backup` cru).

### Validação
```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
curl -I https://ultrassom.ai/health/                          # 200 estático
curl -I https://ultrassom.ai/health/api/farma/regimen         # 200 GET (público)
curl -X POST https://ultrassom.ai/health/api/farma/doses      # 401 (sem auth)
ls -la /root/GEMINI_API/env.yml | awk '{print $1}'            # -rw-------
systemctl status roocode.service | grep User                  # User=roocode
git config --get remote.origin.url                            # ssh://git@...
git status --short                                            # sem .backup* untracked
```

### Riscos
- Reload Apache pode derrubar tela momentaneamente. Sempre `configtest` antes.
- Mudar `User=` no service exige `chown` antes do restart, senão escrita JSON quebra.
- `env.yml` com perm 600 deve ser legível pelo user `roocode` (testar leitura GENAI_KEY antes de fechar).

---

## Sprint 11-Quality — Rede de segurança (~1.5h)

**Objetivo:** restaurar testes/lint como rede antes de mexer em lógica clínica.

Achados cobertos: 5, 6, 9, 11, 12.

### Tarefas
1. **Atualizar fixtures `frontend/tests/date-range.test.ts`** — adicionar 10 campos novos da Fase 8A (`steps`, `distanceKm`, `physicalEffort`, `walkingHeartRateAvg`, `walkingAsymmetryPct`, `walkingSpeedKmh`, `runningSpeedKmh`, `vo2Max`, `sixMinuteWalkMeters`, `cardioRecoveryBpm`).
2. **Reescrever ou remover `frontend/tests/pk-convolution.test.ts`** — imports atuais (`buildConcentrationByConvolution`, `buildPKLagCorrelations`, `buildPKTimelinePayload`, `expandRegimenDoses`) foram removidos na Fase 9A. Substituir por testes em `buildMedGroups` e `buildDailyConcentrations`.
3. **Corrigir 7 erros lint React:**
   - `DoseLogger.tsx:54` — derivar `setState` de handler em vez de effect
   - `pk-medication-grid.tsx:165, 297, 370` — capturar `Date.now()` em ref/state, não em render puro
   - `pk-mood-scatter-chart.tsx:70-82` — estabilizar memoização (depender de `selectedSub.id` não objeto)
   - `lag-correlation-chart.tsx:78` — mesma estratégia de memoização
4. **Validações simétricas em `POST /farma/doses`** — aplicar `dose_mg > 0` e `_validate_iso_timestamp(taken_at)` que `PUT` já tem.
5. **`updateDose` resolver custom** — trocar `get_substance_profile()` por `_resolve_substance_any()` (linha 495-503 de `Farma/router.py`).
6. **`Mood/mood.py` GET → NaN→null** — trocar `df.to_dict(orient="records")` por `json.loads(df.to_json(orient="records"))` (mesmo padrão que Metrics e Sleep).

### Validação
```bash
python3 -m unittest discover -s tests -p 'test_*.py'    # 3 OK + novos
cd frontend && npm run test:unit                        # passa
cd frontend && npm run lint                             # 0 erros
cd frontend && npm run build                            # passa
# Smoke validações:
curl -X POST http://localhost:8011/farma/doses -d '{"substance":"lex","dose_mg":-1}'  # 400
curl -X PUT http://localhost:8011/farma/doses/<id> -d '{"substance":"meu_custom"}'    # 200
```

### Arquivos
- `frontend/tests/date-range.test.ts` (fixtures)
- `frontend/tests/pk-convolution.test.ts` (rewrite)
- `frontend/src/components/DoseLogger.tsx`, `frontend/src/components/charts/pk-medication-grid.tsx`, `pk-mood-scatter-chart.tsx`, `lag-correlation-chart.tsx`
- `Farma/router.py:440-462` (logDose validações)
- `Farma/router.py:495-503` (updateDose custom resolve)
- `Mood/mood.py:128` (NaN→null)

---

## Sprint 11-Flow — Fluidez de lógica (~2h, engloba 11B antigo)

**Objetivo:** reduzir duplicação, dar feedback visual de erros, e limpar inconsistências de UX.

Achados cobertos: 7, 8, 10, 13, 14, 15.

### Tarefas
1. **Banner global de erro/loading** (= 11B do ROADMAP antigo) — `<QueryErrorBoundary>` ou `mutationCache.onError` global mostrando toast amber discreto: `"erro {status} em {endpoint}"`. Não interrompe nav, mas torna falhas visíveis. Resolve o bug do calendário vazio em 422 (Fase 10B).
2. **Helper Gemini comum** — extrair `_load_api_key`, `_call_gemini`, `_strip_fences`, `_classify_valence` de `Interpolate/router.py` e `Forecast/router.py` pra `Ai/gemini.py` (módulo novo). Smoke tests em `_strip_fences` e ausência de chave.
3. **`normalizeMoodValence()` único** — extrair pra `frontend/src/utils/mood.ts`, usar em adapter, `PKMoodScatterChart`, `LagCorrelationChart`. Hoje cada um normaliza diferente (string vírgula/ponto, escala -1/+1 vs 0-100).
4. **Validação datas dentro do try** — mover `_find_missing_dates()` (Interpolate/router.py:292) e `_build_future_dates()` (Forecast/router.py:316) pra dentro do try do handler. Hoje data ruim escapa o fallback gracioso e retorna 500.
5. **Política única `useDoses(window)`** — escolher uma janela ampla (90d) com seletores locais OU explicitar window por escopo (`useDoses14d`, `useDoses90d`). Hoje: `useRooCodeData` 14d, `PKMedicationGrid` 168h, `Insights` 30d, `DoseCalendarView` ~720h. Multiplica requests e estado.
6. **Rename `claude` → `gemini` no UI** — TabNav option `claude` → `ai` ou `gemini`, `App.tsx:215` label "Interpolação IA (Gemini)" — manter compat localStorage com tradução interna se necessário.

### Validação
```bash
# Banner erro:
# 1. Forçar 500 num endpoint, ver toast
curl -X POST http://localhost:8011/farma/doses -d 'malformed'
# Frontend deve mostrar banner amber discreto

# Helper Gemini:
python3 -m unittest tests/test_ai_gemini.py    # smoke novo
grep -c "_call_gemini" Interpolate/router.py Forecast/router.py    # 0 cada (movido)

# normalizeMoodValence:
grep -rn "normalizeMoodValence" frontend/src/    # ≥3 usos (adapter + 2 charts)

# useDoses harmonizado:
grep -rn "useDoses(" frontend/src/    # padrão consistente

# rename:
grep -rn "claude" frontend/src/components/navigation/    # 0 (só interno)
```

### Arquivos
- `frontend/src/main.tsx` ou `App.tsx` (boundary), `frontend/src/lib/api.ts` (handler)
- Novo `Ai/gemini.py` + refactor `Interpolate/router.py`, `Forecast/router.py`
- Novo `frontend/src/utils/mood.ts` ou expansão do `intraday-correlation.ts`
- `frontend/src/hooks/useDoses.ts` ou caller adjust
- `frontend/src/components/navigation/TabNav.tsx`, `App.tsx` (label)

---

## Sprint 11-Perf — Performance + extensibilidade (~1.5h, engloba 11A antigo)

**Objetivo:** reduzir first paint e dead code antes que `App.tsx` cresça mais.

Achados cobertos: 23, 24, 25.

### Tarefas
1. **Code-splitting `React.lazy` por aba** (= 11A do ROADMAP antigo) — cada `<TabContent>` em lazy + `<Suspense fallback={<SkeletonChart />}>`. Pode reduzir first paint de 944KB pra ~200-300KB (só executive). Charts pesados (Recharts) tree-shaken por aba.
2. **Purga dead code frontend** — `data-pipeline.ts` referencia arquitetura antiga (`/metrics/overview`, Zustand, `useAppleHealthStore`); confirmar que está totalmente desconectado e remover. Avaliar deps `zustand`, `clsx`, `class-variance-authority`, `tailwind-merge` — remover do `package.json` se não usados.
3. **Smoke Playwright** — adicionar `frontend/tests/e2e/smoke.spec.ts`:
   - abre `/health/`
   - verifica todas 5 tabs renderizando (não tela branca)
   - captura screenshot baseline opcional

### Validação
```bash
cd frontend && npm run build
# Bundle delta esperado: chunk principal ~200-300KB, demais charts em chunks separados

# Lighthouse manual:
# First Contentful Paint deve cair noticeably

# Playwright:
cd frontend && npx playwright test
```

### Arquivos
- `frontend/src/App.tsx` (lazy imports)
- `frontend/vite.config.ts` (rolldown options se necessário)
- `frontend/src/utils/data-pipeline.ts` (delete ou refactor)
- `frontend/package.json` (deps cleanup)
- Novo `frontend/tests/e2e/smoke.spec.ts`
- Nova dep: `@playwright/test` em devDependencies

---

## Sprints light (~30min-1h cada, paralelos a qualquer um acima)

### 11C — Cadastrar Clonazepam PRN
**Problema:** Clonazepam tem cor reservada (`#f59e0b` em `substance-colors.ts`) mas zero entrada no backend. É fantasma.

**Solução:** entrar via `MedicationCatalogEditor` com PK realista (t½ ~30-40h, Vd 3 L/kg, F ~90%, ka 1.0/h). Therapeutic_range: deixar `null` em PRN, renderizar como concentração bruta no `PKCompactCard` (modo experimental já existe na Fase 8A.1).

**Bonus:** charts da aba Insights (`PKMoodScatter`, `LagCorrelation`) ganham análise PK do Clonazepam quando logado.

### 11D — Resolver TODOs(Anders)
| Arquivo:linha | TODO |
|---------------|------|
| `frontend/src/utils/roocode-adapter.ts:158, 180` | Heurística de detecção de mock vs real |
| `frontend/src/utils/data-readiness.ts:61` | Tom/formato das mensagens "faltam N dias" |
| `frontend/src/utils/health-policies.ts:17` | Bands de VO2 max pra homem 35-44 anos |

São tweaks de tom/heurística, não lógica nova.

### 11-Ops — Blindagem operacional
- `requirements.txt` versionado a partir do venv atual (fastapi, uvicorn, pandas, pydantic, google-genai, PyYAML, python-multipart, scipy)
- Escrita atômica em `_save_doses`, `_save_custom_substances`, `_save_regimen` — escrever em `.tmp` no mesmo dir + `os.replace()`
- `/etc/logrotate.d/roocode` com rotation de `/var/log/roocode-api.log` (já 19.6 MB, sem rotation)
- LRU `maxsize=64` em `Interpolate/router.py:32` `_cache` e `Forecast/router.py:33` `_cache`
- Considerar: documentar `GET /farma/regimen` side effect ou mover criação do default pro startup

---

## Documentação

### Atualizar CLAUDE.md/ROADMAP.md a cada Sprint
A auditoria flagou (achado 21) que doc operacional já desviou da realidade — "22 commits ahead" estava errado, KICKOFF estava com 28+. Cada Sprint deve fechar com:
- bump na seção `## Status` do CLAUDE.md (linha ~189+)
- atualizar este ROADMAP.md (linha ~3 e tabela visão geral)
- novo KICKOFF curto pra próxima fase

---

## Visão de longo prazo (Fase 12+)

Vazia por design. Abre quando surgir necessidade real. Hipóteses (sem urgência, sem compromisso):

- Export PDF/PNG mensal do dashboard pra registro clínico
- Comparação mês-a-mês (overlay `mês anterior` em charts de tendência)
- Integração direta iPhone Shortcuts → backend (sem AutoExport intermediário)
- Modo de leitura "consulta médica" (versão impressível ou tela cheia clean)
- Sistema formal de plugins/registro de charts por aba (após code-splitting funcionar)

Nada disso entra em planejamento até ser pedido.

---

## Sequenciamento sugerido

**Próxima sessão (Sprint 11-Sec, ~2-2.5h):**
1. Push origin/main pré-Sprint (30s, backup)
2. Auth API + Vite static via Apache (1h)
3. env perms + .git/config + user não-root (45min)
4. .gitignore + smoke validation (15min)
5. Atualizar CLAUDE.md/ROADMAP.md + commit (5min)

**Sessão seguinte (Sprint 11-Quality, ~1.5h):**
1. Fixtures + pk-convolution rewrite (30min)
2. Lint React 7 erros (30min)
3. Validações Farma simétricas + Mood NaN (30min)

**Sessão 3 (Sprint 11-Flow, ~2h):**
1. Banner erro global + helper Gemini comum (1h)
2. normalize humor + useDoses + rename (1h)

**Sessão 4 (Sprint 11-Perf, ~1.5h):**
1. Code-splitting (1h)
2. Dead code purge (15min)
3. Smoke Playwright (15min)

**Quando der vontade (light, paralelo):**
- 11C Clonazepam (30min — ganho clínico imediato)
- 11D TODOs(Anders) (30min — polish)
- 11-Ops blindagem (1h — antes de qualquer escala)

Após tudo: projeto entra em **modo manutenção** — só novas features se pedido específico.
