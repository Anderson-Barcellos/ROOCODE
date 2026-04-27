# Relatorio de Auditoria do Repositorio RooCode

Data: 2026-04-26  
Escopo: `/root/RooCode`  
Modo: auditoria read-only de codigo, runtime e infraestrutura, com criacao deste relatorio como unico artefato novo.

## 1. Sumario executivo

O RooCode esta em um estado funcional e significativamente mais maduro do que um scaffold. O backend FastAPI esta unificado, o frontend React/Vite ja possui uma camada analitica clinica rica, a integracao Apache aponta para as portas esperadas e o servico principal `roocode.service` esta ativo. A area mais solida do dominio e o modulo `Farma`, especialmente o catalogo farmacocinetico, os aliases, as validacoes de PK e a integracao com o frontend de doses.

Os principais riscos nao sao de compilacao do produto. O build frontend passa e o backend responde no runtime atual. Os riscos maiores estao em seguranca operacional e manutencao: API publica sem auth para endpoints de escrita, frontend publico servido por Vite dev, credenciais/permissoes locais frageis, ausencia de manifesto Python versionado, testes frontend desatualizados e algumas assimetrias de validacao em Farma. Em termos de fluidez da logica, as melhores oportunidades estao em consolidar a camada Gemini/IA, centralizar normalizacao de humor intraday, expor erro global de API no frontend e reduzir estados paralelos de dose/cache.

Status das validacoes executadas nesta auditoria:

| Area | Resultado |
|---|---|
| Backend unit tests | OK, `3 tests` passaram |
| JSONs Farma | OK, `medDataBase.json`, `regimen_config.json`, `substances_custom.json` parsearam |
| Backend runtime | OK, `roocode.service` ativo/enabled, porta `8011` em listen, `/farma/regimen` retorna `200` |
| Apache local | OK, `/health/` e `/health/api/farma/regimen` retornam `200` via `ultrassom.ai` resolvido para `127.0.0.1` |
| Frontend build | OK, `npm run build` passou; warning de bundle `944.38 kB` minificado |
| Frontend unit tests | FAIL existente, testes importam simbolos removidos e fixtures incompletas |
| Frontend lint | FAIL existente, 7 erros de regras React Hooks/Compiler |
| Git status antes do relatorio | Sem diffs rastreados; untracked pre-existentes: `Mood/mood.csv.backup-2026-04-23-1622-mmdd-fix`, `image.png` |

## 2. Como a auditoria foi conduzida

Workflow usado: hierarquico com scouting paralelo e consolidacao centralizada.

Frentes de analise:

1. Backend e dominio Python/FastAPI.
2. Frontend, UX, hooks, charts e possiveis plugins.
3. Infraestrutura, runtime, Apache, systemd, docs e testes.

Subagentes foram usados apenas para leitura e scouting. Nenhum subagente recebeu permissao para editar arquivos. O agente principal consolidou os achados, verificou evidencias localmente quando necessario e criou este Markdown.

Comandos principais usados:

```bash
rg --files
find . -maxdepth 2 -type d
nl -ba <arquivo>
rg -n "<padrao>"
python3 -m unittest discover -s /root/RooCode/tests -p 'test_*.py'
python3 -m json.tool /root/RooCode/Farma/medDataBase.json >/dev/null
npm run test:unit
npm run lint
npm run build
systemctl is-active roocode.service
systemctl is-enabled roocode.service
ss -ltnp | rg ':(8011|3031)\b'
curl -ks --resolve ultrassom.ai:443:127.0.0.1 https://ultrassom.ai/health/
curl -ks --resolve ultrassom.ai:443:127.0.0.1 https://ultrassom.ai/health/api/farma/regimen
git status --short --branch
git rev-list --left-right --count origin/main...main
```

## 3. Mapa do repositorio

### 3.1 Backend

Entrada principal:

- `main.py`: cria `FastAPI(title="RooCode API", version="1.0.0")`, adiciona CORS aberto e inclui seis routers: `/sleep`, `/metrics`, `/mood`, `/farma`, `/interpolate`, `/forecast`.

Modulos:

| Modulo | Papel | Observacao |
|---|---|---|
| `Sleep/sleep.py` | Upload e leitura de CSV de sono | Usa `UploadFile`, limpa colunas e retorna JSON |
| `Metrics/metrics.py` | Upload e leitura de metricas Apple Health | Aceita multipart flexivel via `Request`, converte `NaN` para `null` com `df.to_json` + `json.loads` |
| `Mood/mood.py` | Upload e leitura de State of Mind | Preserva granularidade horaria quando presente; risco de `NaN` em `to_dict` |
| `Farma/math.py` | Utilitarios PK | Modelo oral 1 compartimento, aliases e DB cacheado |
| `Farma/router.py` | Catalogo, doses e regimen | CRUD de substancias custom, doses e leitura de regimen |
| `Interpolate/router.py` | Interpolacao temporal via Gemini | Cache em memoria, fallback gracioso |
| `Forecast/router.py` | Projecao 5 dias via Gemini | Cache em memoria, cap de confianca por densidade de dados |

### 3.2 Frontend

Stack confirmada em `frontend/package.json`:

- React 19.
- Vite 8.
- TypeScript 6.
- Tailwind 4 via `@tailwindcss/vite`.
- TanStack Query.
- Recharts e D3.
- Radix Dialog.
- lucide-react.
- date-fns.

Entrada e navegacao:

- `frontend/src/main.tsx`: monta `QueryClientProvider`.
- `frontend/src/App.tsx`: SPA sem React Router, com tabs locais e rota hash `#interpolation-demo`.
- `frontend/src/components/navigation/TabNav.tsx`: tabs `executive`, `moodMedication`, `sleepPhysiology`, `patterns`, `insights`.

Superficies principais:

- Executivo: KPIs, timeline, HRV, FC, atividade, forecast signals.
- Humor + Medicacao: Mood timeline/donut, catalogo de substancias, PK grid, logger e calendario de doses.
- Sono + Fisiologia: sono, HRV/FC, SpO2, padroes semanais, VO2 e marcha.
- Padroes: heatmap, scatter e padrao semanal.
- Insights: scatter PK x humor, lag correlation e adherence.

### 3.3 Infra/runtime

Runtime atual:

- Backend: `/etc/systemd/system/roocode.service`, `ExecStart=/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011`.
- Frontend: processo Node em `0.0.0.0:3031`, identificado como Vite dev.
- Apache:
  - `/health/api/` -> `127.0.0.1:8011`.
  - `/health/` -> `127.0.0.1:3031/health/`.
- Mapa operacional: `/etc/apache2/APACHE.md` registra `/health/` e `/health/api/`.

### 3.4 Testes e validacao

Backend:

- `tests/test_farma.py` cobre:
  - presenca de perfis no DB Farma;
  - lookup por aliases;
  - criacao de defaults de regimen quando arquivo falta.

Frontend:

- `frontend/tests/date-range.test.ts`: datas e range.
- `frontend/tests/pk-convolution.test.ts`: atualmente desatualizado contra `frontend/src/utils/medication-bridge.ts`.
- `frontend/tests/run-all.test.ts`: importa os dois testes acima.

## 4. Plugins e extensibilidade frontend

Nao foi encontrado diretorio custom de plugins/extensoes frontend no repositorio. A configuracao Vite usa apenas:

- `@vitejs/plugin-react`.
- `@tailwindcss/vite`.

Evidencias:

- `frontend/vite.config.ts`: `plugins: [react(), tailwindcss()]`.
- Busca por arquivos/diretorios `plugin`, `Plugin`, `extension`, `components.json` nao encontrou sistema proprio de plugins fora de dependencias em `node_modules`/venv.

Leitura pratica:

- O frontend hoje e uma SPA monolitica por tabs, com componentes e hooks bem segmentados, mas sem arquitetura formal de plugin.
- Se a ideia for "plugins para frontend" no sentido de extensibilidade futura, o ponto natural seria criar um registro de superficies/charts por aba. Isso permitiria adicionar charts clinicos novos sem crescer ainda mais `App.tsx`.
- Antes de criar uma camada de plugin, vale resolver o que e mais barato e mais util: code-splitting por aba e centralizacao de erro/loading.

## 5. Pontos solidos

### 5.1 Backend unificado e facil de entender

`main.py` e pequeno e direto. A inclusao dos routers em um unico app reduz ambiguidade operacional, especialmente depois da remocao dos servicos antigos separados.

Evidencia:

- `main.py:21-26`: inclui `/sleep`, `/metrics`, `/mood`, `/farma`, `/interpolate`, `/forecast`.
- `/etc/systemd/system/roocode.service:8-9`: roda a app a partir de `/root/RooCode`.

### 5.2 Farma e o dominio mais maduro

O modulo Farma tem modelagem e validacoes superiores ao restante do backend:

- `Farma/math.py` valida parametros matematicos como `ke`, `half_life`, `ka`, `vd`, `t`.
- `load_medication_database()` usa cache com `lru_cache`.
- `get_substance_profile()` normaliza aliases e nomes.
- `Farma/router.py` protege built-ins contra update/delete e separa custom em `substances_custom.json`.
- `medDataBase.json` inclui `confidence`, `notes` e `sources`, o que e adequado para dados PK aproximados.

### 5.3 UI clinica rica e com boa separacao visual

O frontend ja entrega um dashboard real, nao apenas telas placeholder:

- KPIs executivos.
- Readiness gates.
- Forecast visualmente diferenciado.
- Interpolacao linear/IA.
- Catalogo de substancias.
- Calendario visual de doses.
- Analises intraday PK x humor.

Evidencias:

- `frontend/src/App.tsx`: composicao das cinco abas.
- `frontend/src/utils/data-readiness.ts`: thresholds centralizados por chart.
- `frontend/src/hooks/useRooCodeData.ts`: pipeline unico de dados, interpolacao e forecast.

### 5.4 Readiness gates bem pensados

`data-readiness.ts` exclui dados interpolados e forecasted das contagens reais. Isso evita conclusoes falsas quando o usuario liga interpolacao/forecast.

Evidencias:

- `frontend/src/utils/data-readiness.ts:32-43`: filtros ignoram `interpolated` e `forecasted`.
- `frontend/src/utils/data-readiness.ts:146-178`: requisitos por chart.

### 5.5 Fallback de IA reduz quebra de UX

Interpolacao e forecast nao derrubam a tela em erro de Gemini:

- Interpolacao retorna snapshots originais ou fallback linear com flag de erro.
- Forecast retorna lista vazia e `meta.error`.

Evidencias:

- `Interpolate/router.py:322-326`.
- `Forecast/router.py:372-378`.
- `frontend/src/hooks/useInterpolation.ts:83-93`.
- `frontend/src/hooks/useForecast.ts:77-79`.

### 5.6 Build geral passa

`npm run build` passou com TypeScript e Vite. O warning de chunk grande e real, mas nao bloqueia compilacao.

Resultado resumido:

- CSS: `63.69 kB`, gzip `20.07 kB`.
- JS principal: `944.38 kB`, gzip `268.80 kB`.
- Warning: chunk maior que `500 kB`.

### 5.7 Dados sensiveis principais estao parcialmente protegidos

`.gitignore` cobre:

- `**/metrics.csv`.
- `**/mood.csv`.
- `**/sleep_data.csv`.
- `dose_log.json`.
- venv local.
- build.

Ressalva importante: backups com sufixo tipo `.csv.backup-...` nao estao cobertos por `*.backup`.

## 6. Achados priorizados

### P0/P1 - Seguranca e exposicao operacional

#### 1. API `/health/api/*` publica sem auth, com endpoints de escrita

Gravidade: Alta  
Impacto: alteracao ou sobrescrita de dados pessoais de saude, catalogo e doses.  
Escopo: Apache, FastAPI, CORS.

Evidencias:

- `/etc/apache2/APACHE.md:39-40`: `/health/` e `/health/api/` documentados com `Auth: None`.
- `main.py:14-18`: CORS permite qualquer origem, metodo e header.
- `Sleep/sleep.py:80-81`: POST sobrescreve CSV de sono.
- `Metrics/metrics.py:30-32`: POST sobrescreve CSV de metricas.
- `Mood/mood.py:107-109`: POST sobrescreve CSV de humor.
- `Farma/router.py:338-427`: cria/edita/remove substancias.
- `Farma/router.py:440-536`: cria/edita/remove doses.

Recomendacao:

1. Colocar Basic Auth, token simples, allowlist de IP ou outra restricao em `/health/api/*`.
2. Se a UI publica precisa ficar aberta, separar auth do frontend e auth da API.
3. Reduzir CORS para origem esperada (`https://ultrassom.ai`) ou remover se o fluxo e same-origin via Apache.

#### 2. Frontend publico servido por Vite dev

Gravidade: Alta  
Impacto: exposicao de HMR/React Refresh, processo manual, fragilidade pos-reboot, comportamento de dev em superficie publica.

Evidencias:

- Porta `3031` em listen por processo `node`.
- Apache proxia `/health/` para `127.0.0.1:3031/health/`.
- `npm run build` gera `frontend/dist` com sucesso.
- Subagente de infra confirmou HTML com React Refresh e `/health/@vite/client`.

Recomendacao:

1. Preferencia: servir `frontend/dist` como estatico via Apache, com fallback SPA para `/health/index.html`.
2. Alternativa: criar unit systemd oficial para frontend, mas sem HMR publico.
3. Manter Vite dev apenas para desenvolvimento local.

#### 3. Credenciais e permissoes locais frageis

Gravidade: Alta  
Impacto: vazamento de token Git/Gemini ou uso indevido por outro processo local.

Evidencias:

- `.git/config` contem remote HTTPS com credencial embutida na URL. O valor nao foi copiado para este relatorio.
- `/root/GEMINI_API/env.yml` existe com permissao `644`.
- `Interpolate/router.py:30` e `Forecast/router.py:30` usam `/root/GEMINI_API/env.yml` como fallback de chave.

Recomendacao:

1. Rotacionar token GitHub se o remote com credencial ja foi usado.
2. Trocar remote para SSH ou credential helper, sem token em `.git/config`.
3. Ajustar permissoes de `/root/GEMINI_API/env.yml` para `600`.
4. Preferir env var via systemd (`EnvironmentFile` com permissao restrita) se for manter o servico.

#### 4. Servico backend roda como root

Gravidade: Media/Alta  
Impacto: maior blast radius em uploads, parsing CSV, dependencias e rotas de escrita.

Evidencia:

- `/etc/systemd/system/roocode.service:7`: `User=root`.

Recomendacao:

Criar usuario dedicado para RooCode, restringir permissao de escrita aos diretorios de dados necessarios e rodar o service com esse usuario.

### P1 - Correcao funcional e consistencia de dominio

#### 5. `POST /farma/doses` nao valida dose positiva nem timestamp ISO

Gravidade: Alta  
Impacto: persistencia de dose invalida, timestamp ruim e comportamento inconsistente entre create/update.

Evidencias:

- `Farma/router.py:440-462`: `logDose` resolve substancia e grava direto.
- `Farma/router.py:505-515`: `updateDose` valida `dose_mg > 0` e `taken_at` ISO.

Recomendacao:

Aplicar no create as mesmas validacoes do update:

- `dose_mg > 0`.
- `_validate_iso_timestamp(entry.taken_at)`.
- opcionalmente normalizar `dose_mg` para `float`.

#### 6. Update de dose nao resolve substancias custom

Gravidade: Alta  
Impacto: usuario pode logar dose custom, mas nao conseguir editar substancia para custom depois.

Evidencias:

- `Farma/router.py:240-248`: `_resolve_substance_any()` consulta catalogo merged built-in + custom.
- `Farma/router.py:443-445`: `logDose` usa `_resolve_substance_any()`.
- `Farma/router.py:495-503`: `updateDose` usa `get_substance_profile()`, que olha o DB built-in.
- `Farma/math.py:173-189`: `get_substance_profile()` consulta `medDataBase.json`.

Recomendacao:

Trocar `updateDose` para usar `_resolve_substance_any()` tambem.

#### 7. Datas invalidas em Interpolate/Forecast podem escapar antes do fallback

Gravidade: Alta/Media  
Impacto: erro 500 fora do formato gracioso `meta.error`.

Evidencias:

- `Interpolate/router.py:190-213`: `_find_missing_dates()` usa `date.fromisoformat`.
- `Interpolate/router.py:292`: `_find_missing_dates()` e chamado antes do `try`.
- `Forecast/router.py:132-145`: `_build_future_dates()` usa `date.fromisoformat`.
- `Forecast/router.py:316`: `_build_future_dates()` e chamado antes do `try`.

Recomendacao:

Mover essas chamadas para dentro do `try` ou validar snapshots com modelo Pydantic minimo (`date: YYYY-MM-DD`) antes da logica.

#### 8. Normalizacao de humor intraday esta duplicada e divergente

Gravidade: Alta/Media  
Impacto: charts intraday podem perder eventos ou distorcer valencia se `Associações` vier como string ou escala diferente.

Evidencias:

- `frontend/src/lib/api.ts:79-86`: `MoodRecord.Associações` aceita `number | string`.
- `frontend/src/utils/roocode-adapter.ts:195-204`: normaliza string com virgula/ponto e aceita `[-1,+1]` ou `[0,100]`.
- Charts intraday usam normalizacao propria e assumem numero/escala especifica.

Recomendacao:

Extrair helper unico, por exemplo `normalizeMoodValence()`, exportado de um modulo comum e usado por:

- adapter diario;
- `PKMoodScatterChart`;
- `LagCorrelationChart`;
- qualquer chart futuro de humor.

#### 9. `Mood/mood.py` pode preservar `NaN` em GET

Gravidade: Media  
Impacto: `JSONResponse` pode falhar se o CSV tiver celulas vazias ou valores `NaN`.

Evidencias:

- `Metrics/metrics.py:47-50`: usa `json.loads(df.to_json(...))`, que converte `NaN` para `null`.
- `Sleep/sleep.py:98`: tambem usa `df.to_json`.
- `Mood/mood.py:128`: usa `df.to_dict(orient="records")`.

Recomendacao:

Padronizar Mood para o mesmo padrao de Metrics/Sleep:

```python
records = json.loads(df.to_json(orient="records"))
return JSONResponse(content=records)
```

### P1 - Frontend e UX operacional

#### 10. Erros/loading globais calculados mas nao exibidos

Gravidade: Alta/Media  
Impacto: falha de API aparece como tela vazia ou "sem dados", dificultando triagem.

Evidencias:

- `frontend/src/hooks/useRooCodeData.ts:98-107`: calcula `loading` e `error`.
- `frontend/src/hooks/useRooCodeData.ts:175-187`: retorna os campos.
- `frontend/src/App.tsx:364-377`: exibe mock/interpolacao/forecast, mas nao banner global de erro/loading dos dados reais.

Recomendacao:

Adicionar banner global discreto:

- loading real: "Carregando dados reais...".
- erro: "Falha ao consultar API local. Verifique `/health/api` ou `roocode.service`."
- incluir endpoint/status quando possivel a partir do helper `readJson`.

#### 11. Lint React falha em regras relevantes

Gravidade: Alta/Media  
Impacto: risco de re-render instavel, valores impuros no render e memoizacao nao preservada.

Resultado:

`npm run lint` falhou com 7 erros.

Principais evidencias:

- `frontend/src/components/DoseLogger.tsx:54`: `setState` sincronico dentro de effect.
- `frontend/src/components/charts/pk-medication-grid.tsx:165`, `:297`, `:370`: `Date.now()` durante render.
- `frontend/src/components/charts/pk-mood-scatter-chart.tsx:70-82`: memoizacao instavel.
- `frontend/src/components/charts/lag-correlation-chart.tsx:78`: memoizacao instavel.

Recomendacao:

1. Capturar `now` em state/ref/timer controlado, nao em render puro.
2. Para `DoseLogger`, derivar valores iniciais no handler de selecao ou usar reducer.
3. Estabilizar `med` com `useMemo` ou depender de `selectedSub`/id, nao de objeto recriado.

#### 12. Testes frontend estao stale

Gravidade: Alta/Media  
Impacto: o script de teste nao serve como rede de seguranca para mudancas futuras.

Resultado:

`npm run test:unit` falhou antes de rodar os asserts principais.

Erros resumidos:

- fixture de `date-range.test.ts` nao inclui campos adicionados em `DailyHealthMetrics`: `steps`, `distanceKm`, `physicalEffort`, `walkingHeartRateAvg` e outros.
- `pk-convolution.test.ts` importa funcoes que nao existem mais em `frontend/src/utils/medication-bridge.ts`: `buildConcentrationByConvolution`, `buildPKLagCorrelations`, `buildPKTimelinePayload`, `expandRegimenDoses`.

Evidencias:

- `frontend/tests/date-range.test.ts`.
- `frontend/tests/pk-convolution.test.ts:7-10`.
- `frontend/src/types/apple-health.ts:101-111`.
- `frontend/src/utils/medication-bridge.ts` exporta `buildMedGroups` e `buildDailyConcentrations`, nao as funcoes antigas.

Recomendacao:

1. Atualizar fixtures para o tipo atual.
2. Remover ou reescrever teste de convolucao antigo conforme a arquitetura atual.
3. Adicionar testes para normalizacao de humor intraday e erro de API.

#### 13. Queries de doses usam janelas diferentes e multiplicam estados

Gravidade: Media  
Impacto: requests duplicadas, estados parciais e bugs por janela diferente na mesma tela.

Evidencias:

- `useRooCodeData`: `useDoses(14 * 24)`.
- `PKMedicationGrid`: `useDoses(hoursWindow)`, default `168`.
- `DoseCalendarView`: subagente encontrou janela maior para calendario.
- Insights usam `useDoses(30 * 24)`.

Recomendacao:

Centralizar uma politica:

- Uma query ampla (`90d` ou `1y`) com seletores locais; ou
- queries por escopo, mas com nomes e UX explicitando a janela.

#### 14. Label "Claude" para fluxo que usa Gemini

Gravidade: Baixa/Media  
Impacto: confusao operacional, logs e suporte.

Evidencias:

- `frontend/src/components/navigation/TabNav.tsx:12-16`: opcao `claude`.
- `frontend/src/App.tsx:215`: label exibe "Interpolação IA (Gemini)" quando modo e `claude`.
- `Interpolate/router.py` chama Gemini.

Recomendacao:

Renomear modo publico para `ai` ou `gemini` em uma migracao pequena. Se mantiver `claude` por compatibilidade com localStorage, traduzir internamente e exibir somente Gemini/IA no UI.

### P2 - Manutencao e fluidez de logica

#### 15. Interpolate e Forecast duplicam helper Gemini

Gravidade: Media  
Impacto: drift de comportamento, patch duplicado para API key, parse de fences e classificacao de valencia.

Evidencias:

- `Forecast/router.py:10-11`: declara que helpers foram copiados de Interpolate.
- Duplicacao de `_load_api_key`, `_call_gemini`, `_strip_fences`, `_classify_valence`.

Recomendacao:

Criar modulo compartilhado novo, por exemplo:

- `Ai/gemini.py` ou `lib/gemini_client.py`.
- `Health/valence.py` ou helper comum para classificacao de valencia.

Migrar em passos pequenos:

1. Extrair sem mudar comportamento.
2. Adicionar smoke tests de `_strip_fences` e falta de chave.
3. Depois ajustar validacao de datas/payload.

#### 16. Falta manifesto Python versionado

Gravidade: Media  
Impacto: deploy nao reprodutivel, dependencia do venv atual.

Evidencias:

- Nao ha `requirements.txt`, `pyproject.toml`, `Pipfile` ou `poetry.lock` no repo.
- `roocode.service` aponta para venv local `/root/RooCode/bin/python`.
- `pip freeze` no venv mostrou dependencias como `fastapi`, `uvicorn`, `pandas`, `pydantic`, `google-genai`, `PyYAML`, `python-multipart`, `scipy`.

Recomendacao:

Criar `requirements.txt` minimo e versionado a partir do runtime usado, evitando despejar dependencias transientes desnecessarias quando possivel.

#### 17. Persistencia JSON/CSV local sem escrita atomica/lock

Gravidade: Media  
Impacto: concorrencia pode truncar ou corromper `dose_log.json`, custom substances ou CSVs.

Evidencias:

- `Farma/router.py:193-195`: `_save_doses` grava direto.
- `Farma/router.py:224-226`: `_save_custom_substances` grava direto.
- `Farma/router.py:313-315`: `_save_regimen` grava direto.
- CSV uploads sobrescrevem arquivos diretamente.

Recomendacao:

Para baixo custo:

1. Escrever em arquivo temporario no mesmo diretorio.
2. `os.replace(temp, destino)`.
3. Opcional: lock simples por arquivo se houver chance de POST simultaneo.

#### 18. `GET /farma/regimen` tem side effect de escrita

Gravidade: Baixa/Media  
Impacto: GET deixa de ser puramente leitura e pode criar arquivo em ambiente inesperado.

Evidencias:

- `Farma/router.py:298-302`: se arquivo nao existe, cria default e salva.

Recomendacao:

Aceitavel em single-user, mas documentar ou trocar para:

- criar no startup/migracao; ou
- retornar defaults sem persistir ate haver endpoint de save.

#### 19. Cache IA em dict modulo-level sem limite

Gravidade: Baixa/Media  
Impacto: crescimento sem limite no processo longo.

Evidencias:

- `Interpolate/router.py:32`: `_cache`.
- `Forecast/router.py:33`: `_cache`.

Recomendacao:

Adicionar LRU simples ou TTL, mesmo que pequeno. Para single-user, `maxsize=64` ja e suficiente.

#### 20. Logs sem rotacao aparente

Gravidade: Baixa/Media  
Impacto: crescimento continuo de `/var/log/roocode-api.log`.

Evidencias:

- `/etc/systemd/system/roocode.service:12-13`: append em `/var/log/roocode-api.log`.
- `stat` local: arquivo com aproximadamente `19.6 MB`.
- Subagente nao encontrou regra especifica em `/etc/logrotate.d`.

Recomendacao:

Criar regra logrotate ou migrar para journald sem append manual.

#### 21. Documentacao operacional parcialmente divergente

Gravidade: Media  
Impacto: proxima sessao pode partir de premissas erradas.

Evidencias:

- `ROADMAP.md:4`: diz "22 commits ahead" e "working tree limpo".
- `CLAUDE.md:228`: diz "22+ commits ahead".
- `git rev-list --left-right --count origin/main...main`: retornou `0 0`.
- `git status`: untracked `Mood/mood.csv.backup-2026-04-23-1622-mmdd-fix`, `image.png` e agora este relatorio.
- `frontend/docs/README.md` referencia `#charts-demo`, enquanto `App.tsx` usa `#interpolation-demo`.

Recomendacao:

Atualizar `CLAUDE.md` e `ROADMAP.md` depois de decidir as correcoes. Como este pedido era auditoria, a documentacao operacional nao foi alterada agora.

#### 22. `.gitignore` nao cobre backup real de CSV

Gravidade: Media  
Impacto: backup de dado sensivel aparece como untracked e pode ser commitado por engano.

Evidencias:

- `.gitignore:9`: `*.backup`.
- Arquivo real: `Mood/mood.csv.backup-2026-04-23-1622-mmdd-fix`.

Recomendacao:

Adicionar padroes como:

```gitignore
*.backup*
*.csv.backup*
```

### P3 - Limpeza e oportunidades futuras

#### 23. Codigo utilitario antigo/desconectado no frontend

Gravidade: Baixa/Media  
Impacto: confusao sobre arquitetura real, dependencias sem uso e manutencao mais cara.

Achado do subagente frontend:

- `data-pipeline.ts` referencia arquitetura antiga como `/metrics/overview`, `src/api/client.ts`, Zustand e `useAppleHealthStore`.
- Dependencias como `zustand`, `clsx`, `class-variance-authority`, `tailwind-merge` podem estar subutilizadas ou sobrando.

Recomendacao:

Fazer uma passada read-only especifica de dead code antes de remover. Se confirmar, remover em commit separado e pequeno.

#### 24. Bundle grande e `App.tsx` importa todas as abas upfront

Gravidade: Baixa/Media  
Impacto: primeira carga maior que o necessario.

Evidencias:

- `npm run build`: JS principal `944.38 kB`, gzip `268.80 kB`, warning de chunk > `500 kB`.
- `App.tsx` importa todos os charts e editores no topo.

Recomendacao:

Aplicar code-splitting por aba com `React.lazy()` e `Suspense`. Prioridade depois de seguranca, testes stale e erro global.

#### 25. Falta suite visual/browser

Gravidade: Baixa/Media  
Impacto: regressao visual em dashboard rico passa sem alarme.

Evidencias:

- Nao ha Playwright/Cypress/Vitest visual.
- Testes atuais sao `node:assert` e TS compile.

Recomendacao:

Adicionar ao menos um smoke Playwright:

- abre `/health/`;
- verifica tabs principais;
- verifica ausencia de tela branca;
- captura screenshot baseline opcional.

## 7. Validacoes executadas

### 7.1 Backend Python

Comando:

```bash
python3 -m unittest discover -s /root/RooCode/tests -p 'test_*.py'
```

Resultado:

```text
Ran 3 tests
OK
```

Interpretacao:

- `Farma` basico esta coberto e passa.
- Cobertura ainda estreita: Sleep, Metrics, Mood, Interpolate, Forecast, CORS e auth nao sao cobertos.

### 7.2 JSON Farma

Comando:

```bash
python3 -m json.tool /root/RooCode/Farma/medDataBase.json >/dev/null
python3 -m json.tool /root/RooCode/Farma/regimen_config.json >/dev/null
python3 -m json.tool /root/RooCode/Farma/substances_custom.json >/dev/null
```

Resultado: OK.

### 7.3 Runtime backend e Apache

Comandos:

```bash
systemctl is-active roocode.service
systemctl is-enabled roocode.service
ss -ltnp | rg ':(8011|3031)\b'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8011/farma/regimen
curl -ks -o /dev/null -w '%{http_code}\n' --resolve ultrassom.ai:443:127.0.0.1 https://ultrassom.ai/health/
curl -ks -o /dev/null -w '%{http_code}\n' --resolve ultrassom.ai:443:127.0.0.1 https://ultrassom.ai/health/api/farma/regimen
```

Resultado:

- `roocode.service`: `active`, `enabled`.
- `8011`: listen por Python.
- `3031`: listen por Node.
- `GET /farma/regimen`: `200`.
- `GET /health/` via Apache local: `200`.
- `GET /health/api/farma/regimen` via Apache local: `200`.

### 7.4 Frontend unit tests

Comando:

```bash
cd frontend && npm run test:unit
```

Resultado: falhou.

Resumo do output:

- `tests/date-range.test.ts`: fixture incompleta para `DailyHealthMetrics`.
- `tests/pk-convolution.test.ts`: imports inexistentes em `medication-bridge`.
- erros implicitos de `any` decorrentes dos imports quebrados.

Classificacao: `PRE_EXISTING_FAILURE`.

### 7.5 Frontend lint

Comando:

```bash
cd frontend && npm run lint
```

Resultado: falhou com 7 erros.

Resumo:

- `react-hooks/set-state-in-effect` em `DoseLogger`.
- `react-hooks/purity` por `Date.now()` durante render em `PKMedicationGrid`.
- `react-hooks/preserve-manual-memoization` em charts intraday.

Classificacao: `PRE_EXISTING_FAILURE`.

### 7.6 Frontend build

Comando:

```bash
cd frontend && npm run build
```

Resultado: passou.

Observacao:

- O comando escreveu/atualizou `frontend/dist`, que esta ignorado por `.gitignore`.
- Nao houve diff rastreado apos o build.
- Warning de bundle grande permanece.

## 8. Recomendacao de sequenciamento

### Sprint 1 - Fechar risco operacional

Objetivo: reduzir risco real de exposicao e perda de dados.

1. Proteger `/health/api/*` com auth/restricao.
2. Reduzir CORS.
3. Tirar Vite dev da borda publica ou criar unit oficial sem HMR.
4. Ajustar permissao de `/root/GEMINI_API/env.yml` para `600`.
5. Remover token de `.git/config` e rotacionar se necessario.
6. Ajustar `.gitignore` para `*.backup*` e `*.csv.backup*`.

Validacao:

```bash
apache2ctl configtest
systemctl reload apache2
curl -I https://ultrassom.ai/health/
curl -I https://ultrassom.ai/health/api/farma/regimen
git status --short
```

### Sprint 2 - Restaurar rede de seguranca

Objetivo: tornar teste/lint confiaveis antes de mexer em logica clinica.

1. Atualizar fixtures de `date-range.test.ts`.
2. Reescrever/remover teste stale de `pk-convolution.test.ts`.
3. Corrigir lint React sem refactor amplo.
4. Adicionar teste de normalizacao de humor.
5. Adicionar teste de validacao de `POST /farma/doses`.

Validacao:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
cd frontend && npm run test:unit
cd frontend && npm run lint
cd frontend && npm run build
```

### Sprint 3 - Fluidez de logica

Objetivo: reduzir duplicacao e estados paralelos.

1. Extrair helper Gemini comum para Interpolate/Forecast.
2. Centralizar normalizacao de humor intraday.
3. Harmonizar queries de doses.
4. Adicionar banner global de erro/loading de dados reais.
5. Padronizar serializacao Mood para `NaN -> null`.

### Sprint 4 - Performance e extensibilidade frontend

Objetivo: melhorar primeira carga e preparar crescimento de charts.

1. Code-splitting por aba.
2. Opcional: registro de charts/superficies por aba.
3. Smoke Playwright para tela principal.
4. Revisao de dead code frontend.

## 9. Decisoes sugeridas

### Manter como esta

- Estrutura modular por diretorio backend (`Sleep`, `Metrics`, `Mood`, `Farma`, `Interpolate`, `Forecast`).
- `Farma` como nucleo do dominio PK.
- Readiness gates que ignoram dados interpolados/forecasted.
- Fallback linear de interpolacao.
- `medDataBase.json` com `confidence`, `notes`, `sources`.

### Melhorar sem reescrever

- Validacoes de dose.
- Update de dose com custom substances.
- Datas invalidas em IA.
- Normalizacao de humor.
- Erro global de API.
- Testes stale.
- Lint React.
- Logs/permissoes/auth.

### Evitar por enquanto

- Refactor amplo de `App.tsx` antes de estabilizar lint/testes.
- Sistema formal de plugins antes de code-splitting e registro simples por aba.
- Migracao de persistencia para banco antes de resolver auth e escrita atomica. JSON/CSV ainda servem para single-user se protegidos.

## 10. Arquivos criados ou alterados nesta auditoria

Criado:

- `Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md`.

Nao alterado:

- Codigo Python.
- Codigo TypeScript/React.
- Config Apache.
- Config systemd.
- `CLAUDE.md`.
- `ROADMAP.md`.
- Dados CSV/JSON operacionais.

Observacao:

- `npm run build` gerou/atualizou `frontend/dist`, mas esse diretorio esta ignorado e nao gerou diff rastreado.
- `npm run test:unit` pode gerar arquivos em `.tmp/roocode-frontend-tests`; `.tmp/` esta ignorado.

## 11. Estado git observado

Antes da criacao deste relatorio:

```text
## main...origin/main
?? Mood/mood.csv.backup-2026-04-23-1622-mmdd-fix
?? image.png
```

Divergencia com origin:

```text
0 0
```

Leitura:

- A memoria/docs falavam em "22 commits ahead", mas o estado atual observado nao confirma isso.
- Existem untracked pre-existentes, incluindo um backup de CSV potencialmente sensivel.

Depois deste relatorio, espera-se tambem:

```text
?? Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md
```

## 12. Conclusao

O projeto esta solido na parte que importa para uso atual: backend responde, Apache aponta para as portas certas, build frontend passa e o dominio Farma tem uma base consistente. O que mais merece atencao agora nao e uma grande reescrita, e sim uma sequencia conservadora de blindagem e alinhamento:

1. Proteger a API e tirar Vite dev da exposicao publica.
2. Corrigir credenciais/permissoes e `.gitignore` de backups.
3. Restaurar testes/lint como rede de seguranca.
4. Fechar inconsistencias pequenas de Farma e humor intraday.
5. So depois investir em code-splitting e extensibilidade por plugins/registro de charts.

Esse caminho preserva o que ja esta funcionando e ataca os pontos que mais reduzem risco real por hora.
