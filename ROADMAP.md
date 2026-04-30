# RooCode — Roadmap Mestre

> Última atualização: 2026-04-30 · Fonte única de sequência/sprints.
> Próxima sprint oficial: **MOOD-LOG-1 — Medication Action Center**.
> Spec histórica do redesign visual: `CHARTENDEAVOUR.md`.
> Auditoria bruta: `Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md` — consulta histórica, não roteiro ativo.

## Contrato documental

| Documento | Papel |
|-----------|-------|
| `ROADMAP.md` | Ordem oficial de execução, filas e status das sprints. |
| `CHARTENDEAVOUR.md` | Spec detalhada/histórica do redesign visual; não define mais a próxima sprint. |
| `CLAUDE.md` | Handoff operacional compacto e kickoff da próxima sessão fresh. |
| `Docs/RELATORIO_*` | Auditorias e evidências históricas. Não mandam na sequência. |
| `frontend/docs/README.md` | Checklist histórico da Fase 5, sem pendência ativa. |

RooCode é app de **uso pessoal exclusivo do Anders**. Decisão de 2026-04-30: daqui pra frente só vira sprint o que aumentar a utilidade real do diário de humor: **log mais fácil**, **mais dados extraídos**, **insights sobre humor**, **redesign complementar** ou **layout que reduza atrito**. Manutenção pequena, lint, DRY e higiene operacional ficam estacionados até virarem dor real.

## Opinião de produto

O app não precisa de mais gráficos soltos. Ele precisa virar um **laboratório pessoal de fatores que mexem no humor**.

Os CSVs já dão sinais suficientes para isso:

| Cobertura atual | Sinais | Decisão |
|-----------------|--------|---------|
| Alta | sono completo `131/131`, passos/distância `272/272`, marcha `247/272` | Usar como base forte de rotina, ativação comportamental e recuperação. |
| Boa | energia `68-71%`, esforço físico `65%`, HR min/max/avg `65%`, HRV `60%`, RHR `55%`, SpO2 `60%`, respiração `52%` | Usar em scorecards e correlações com qualidade explícita. |
| Média | luz do dia `43%` | Usar como eixo circadiano, com aviso de cobertura. |
| Esparsa | distúrbios respiratórios `24%`, temperatura de pulso `25%`, caminhada 6 min `8%` | Mostrar só como contexto quando houver dado; não guiar sprint principal. |
| Fraca/agora inútil | VO2 `2/272`, corrida `0/272` | Estacionar até aparecer densidade real. |

Gargalo real: `Mood/mood.csv` tem 35 entradas. Então o roadmap prioriza **reduzir atrito de logging** e **cruzar sinais por janela/lag** antes de inventar painel decorativo.

## Contrato anti-lazy

Toda sprint nova precisa declarar, antes de editar código:

1. Campo(s) de entrada: CSV/backend/hook exato.
2. Feature derivada: fórmula simples ou decisão de não derivar.
3. Componente alvo: arquivo/tela exata onde aparece.
4. Estado vazio: como a UI se comporta com dado insuficiente.
5. Validação: pelo menos `npx tsc --noEmit`, `npm run build`, e `git diff --check`.

Sem esse contrato, a sprint não começa. Chega de implementação bonita que só encosta na superfície, meu velho.

## Política de dados insuficientes

É aceitável implementar métricas que ainda precisem de mais registros para aparecer. O comportamento correto é:

- Mostrar estado `dados insuficientes` com critério objetivo (`precisa ≥N pares`, `cobertura <X%`, `sem sobreposição humor+metric`).
- Não preencher insight com mock, não inferir causalidade e não transformar null em zero.
- A métrica deve aparecer automaticamente quando a densidade ficar suficiente.
- Priorizar componentes que também incentivem mais logging real, especialmente humor e medicação.

## Trilha ativa: Mood Impact

| Ordem | Sprint | Escopo | Gate de valor |
|-------|--------|--------|---------------|
| 1 | **MOOD-LOG-1 — CONCLUÍDA** | Medication Action Center: log de dose mais rápido, calendário mais fluido e atalhos por regime/PRN | Reduz atrito e melhora a densidade dos dados que alimentam PK/humor. |
| 2 | **MOOD-IMPACT-1 — PRÓXIMA** | Mood Driver Board: cards diários de sono, autonômico, ativação, luz/circadiano e medicação | Explica "o que pode estar pesando no humor" antes de abrir gráficos. |
| 3 | MOOD-IMPACT-2 | Lag & Hypothesis Lab: métrica → humor com lags 0-3d, qualidade do sinal e Lamictal variance | Transforma correlação em hipótese testável, não em afirmação clínica. |
| 4 | MOOD-IMPACT-3 | Circadian + Autonomic Deep Dive: luz, sono, HRV/RHR, respiração, SpO2 e temperatura quando houver | Usa sinais fisiológicos com narrativa clínica mais clara. |
| 5 | MOOD-AI-1 | IA/Superpowers: manter IA atual e adicionar briefing OpenAI com evidências e limites explícitos | Resume padrões, inclusive hipóteses pessoais sobre medicação, sem executar ação automática. |
| 6 | MOOD-LAYOUT-1 | Polish de layout: summary cards, tooltips ricos, responsivo e sync se valer | Só entra depois dos insights principais existirem. |
| Operação | Push | `git push origin main` ao fim de sprint concluída | Nenhum risco funcional. |

## MOOD-LOG-1 — Medication Action Center

Objetivo: tornar o registro de medicação tão rápido que o dado fique bom por padrão.

Status 2026-04-30: concluída em fatia conservadora. `DoseLogger` ganhou botões **tomar agora** para entradas ativas do regime; `DoseCalendarView` ganhou ação **adicionar** no dia selecionado com auto-fill de dose/horário do regime e edição manual direta. Endpoints, schemas públicos e PK engine foram preservados.

Referências:

- RooCode atual: `frontend/src/components/DoseLogger.tsx` e `frontend/src/components/DoseCalendarView.tsx`.
- Inspiração UX: `/root/CODEX/mood-pharma-tracker/src/features/doses/components/QuickDoseModal.tsx`.
- Backend atual preservado: `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances`.

Escopo desejado:

1. [x] Botões de **tomar agora** para substâncias ativas no regime.
2. [x] Auto-fill de dose e horário padrão, com indicação visual de que veio do regime.
3. [x] Horário customizado direto via `datetime-local`, sem fluxo longo.
4. [x] Registro PRN/manual sem atrito quando a substância existe no catálogo.
5. [x] Calendário mantendo edição/delete, com ação rápida para adicionar dose no dia selecionado.
6. [x] Nenhuma mudança de endpoint, schema público ou PK engine.

Fora de escopo:

- Notificações push.
- Reforma completa do catálogo.
- Reescrever o calendário do zero.
- Migrar UI inteira do `mood-pharma-tracker`.

Validação:

```bash
cd /root/RooCode/frontend
npx tsc --noEmit
npm run build
git diff --check
```

## MOOD-IMPACT-1 — Mood Driver Board

Objetivo: criar uma leitura diária de fatores plausíveis que impactam humor, com qualidade do sinal explícita.

Drivers iniciais:

- **Sono/recuperação:** sono total, REM, profundo, desperto, déficit vs referência pessoal.
- **Autonômico:** HRV, FC repouso, HR range, FC ao caminhar.
- **Ativação comportamental:** passos, distância, energia ativa, esforço físico, exercício.
- **Circadiano:** luz do dia, sono, temperatura de pulso quando houver.
- **Medicação:** doses registradas, regularidade, exposição PK e gaps.

Regra: cada card precisa responder "isso ajuda a entender meu humor hoje?" Se não ajuda, vira dado auxiliar ou fica fora.

Estado vazio é parte do produto: cards com `n` baixo devem explicar qual dado falta e continuar prontos para ativar quando o log amadurecer.

## MOOD-IMPACT-2 — Lag & Hypothesis Lab

Objetivo: cruzar sinais com humor em janelas interpretáveis.

Escopo:

- Selector de métrica contra humor.
- Lags `0d`, `1d`, `2d`, `3d`.
- `n` de pares, qualidade do sinal e aviso de sampling bias.
- Baseline pessoal: mood quando métrica está acima/abaixo da própria média.
- Absorve o antigo **REDESIGN-3 resto**: variância Lamictal vs SD rolling 7d do humor.

## MOOD-IMPACT-3 — Circadian + Autonomic Deep Dive

Objetivo: separar gráficos fisiológicos por pergunta clínica, não por coluna CSV.

Painéis:

- Luz do dia → sono → humor no dia seguinte.
- HRV/RHR/respiração como carga autonômica.
- SpO2/distúrbios respiratórios/temperatura de pulso como contexto noturno quando houver dado.
- Marcha/energia como sinal de ativação, não só performance física.

## MOOD-AI-1 — IA/Superpowers

Objetivo: manter as seções de IA que já existem e melhorar a camada de análise on-demand dos padrões recentes.

Decisão do Anders:

- As seções de IA atuais continuam como estão até haver motivo real para mexer.
- Gemini/Forecast existente não deve ser removido só por troca de stack.
- Nova IA do produto/protótipo deve preferir `gpt-5.4-mini`, reasoning `high` e verbosity `high`.
- Como é app pessoal, as regras podem ser mais frouxas: a IA pode levantar hipóteses francas sobre rotina, sono, métricas, humor e medicação.
- Limite prático: a IA não executa mudanças, não edita doses automaticamente e não finge certeza clínica.

Regras:

- Usar evidências explícitas: datas, métricas, `n`, cobertura.
- Separar "hipótese pessoal" de "achado robusto".
- Pode comentar medicação como hipótese exploratória quando houver dado, mas sempre com linguagem de protótipo pessoal.
- Preservar análise exploratória existente na tab Insights; melhorar em cima dela, não substituir por vazio bonito.

## Absorvido ou estacionado

| Item antigo | Decisão |
|-------------|---------|
| REDESIGN-3 resto | Absorvido por MOOD-IMPACT-2; Lamictal variance continua útil, mas não manda sozinho na fila. |
| REDESIGN-4 | Absorvido por MOOD-AI-1. |
| REDESIGN-5 | Absorvido por MOOD-LAYOUT-1. |
| 11B Bugs + QoL | Estacionado até bloquear uso real. |
| 11C Infra/DRY | Estacionado; frontend permanente/systemd só se reboot resilience virar dor. |
| Light Clonazepam PRN | Entra em MOOD-LOG-1 se melhorar logging/PK real. |
| 11D TODOs Anders | Estacionado salvo se afetar insight ou qualidade de dado. |
| Cinza | Estacionado: validações Farma, permissão env, escrita atômica JSON. |

## Concluído

| Sprint | Resultado |
|--------|-----------|
| 10D | Charts clínicos: RespiratoryDisturbances, VitalSigns, CardioRecovery. |
| 9E | Re-upload CSV mood histórico com HH:MM:SS preservado. |
| 11A | Limpeza de dead code: ~2.035 LOC removidas e 4 deps órfãs removidas. |
| CHART-1 | Remoção de charts de baixo signal e limpeza visual. |
| CHART-2 | 4 bugs de adapter corrigidos + `HRRangeChart`. |
| REDESIGN-1 | Reorganização 5→6 tabs narrativas, KPI clusters, Farmaco com ícone Pill. |
| REDESIGN-2 | FC ao caminhar, esforço/MET, perfil de marcha com comprimento do passo, ratio energia ativa/repouso. |
| REDESIGN-3 parcial | SMA(4×t½) nos PKCompactCards + painel `PKHumorCorrelation`. |

## Arquivado

Itens da auditoria de 2026-04-26 que não entram em sprint no contexto atual:

| Achado da auditoria | Decisão |
|---------------------|---------|
| Auth básica em `/health/api/*` | Arquivado: single-user em domínio pessoal. |
| Vite dev → `dist` estático via Apache | Rebaixado: só entra se a trilha 11C escolher essa rota por reboot resilience. |
| `roocode.service` rodar como user não-root | Arquivado: baixo ganho prático no host pessoal. |
| Code-splitting `React.lazy` por aba | Arquivado: ganho pequeno frente ao custo de manutenção. |
| Suite Playwright completa | Arquivado: overhead alto para app pessoal. |
| Rename `claude` → `gemini` | Arquivado: cosmético. |
| Harmonizar todos `useDoses(window)` | Arquivado até virar dor de UX. |
| Reescrever testes frontend stale | Arquivado: melhor recriar testes quando houver necessidade real. |
| Remover token de `.git/config` | Higiene boa, mas fora da fila ativa. |
| `GET /farma/regimen` side effect | Aceito e documentado. |
| LRU em cache IA | Arquivado: crescimento lento em uso single-user. |

## Sequenciamento fresh

Próxima sessão:

1. Ler `ROADMAP.md` e `CLAUDE.md`; `CHARTENDEAVOUR.md` só como contexto histórico.
2. Implementar **MOOD-IMPACT-1** em fatia pequena.
3. Preservar o Medication Action Center já implementado em `DoseLogger` e `DoseCalendarView`.
4. Validar com `npx tsc --noEmit`, `npm run build` e `git diff --check`.
5. Atualizar docs apenas com status real do que foi concluído.

Depois:

- MOOD-IMPACT-1 vira a primeira sprint de insight sobre fatores que pesam no humor.
- Manutenção só volta se bloquear uso ou se for necessária para entregar insight.
