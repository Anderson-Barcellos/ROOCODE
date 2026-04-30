# RooCode — Handoff Operacional

Pipeline: iPhone AutoExport → FastAPI (8011) → React/Vite (3031) → Apache → `https://ultrassom.ai/health/`

Este arquivo é o handoff curto para uma sessão fresh. A ordem oficial de execução fica em `ROADMAP.md`; a spec histórica/técnica do redesign fica em `CHARTENDEAVOUR.md`; auditorias ficam em `Docs/`.

## Stack

- **Backend:** FastAPI unificado em `main.py` (porta 8011) + pandas + venv local (`/root/RooCode/bin/python`).
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query.
- **Tema:** warm editorial (Fraunces serif + Manrope sans, fundo creme + acentos teal/amber/violet).
- **Módulos backend:** `Sleep/`, `Metrics/`, `Mood/`, `Farma/`, `Forecast/`, `Interpolate/`.
- **PK:** `Farma/math.py` + `Farma/medDataBase.json` no backend; timeline multi-medicação no frontend via `pharmacokinetics.ts` + `medication-bridge.ts`.
- **Medicação:** catálogo built-in + custom, logs reais em `/farma/doses`, defaults read-only em `Farma/regimen_config.json`.

## Comandos

```bash
# Backend
source /root/RooCode/bin/activate
./bin/python main.py
# ou:
/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011

# Frontend
cd /root/RooCode/frontend
npm run dev -- --host 0.0.0.0
npx tsc --noEmit
npm run build
```

**Web:** `https://ultrassom.ai/health/`
**Dev direto:** `http://localhost:3031/health/`

## Endpoints

Todos sob `/health/api/*` via Apache ou `:8011/*` direto:

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/sleep` | GET/POST | AutoExport Sleep CSV |
| `/metrics` | GET/POST | AutoExport Health Metrics CSV |
| `/mood` | GET/POST | AutoExport State of Mind CSV |
| `/farma/substances` | GET | Built-in + custom merged. Use `?full=true` para todos campos PK |
| `/farma/substances/{key}` | POST/PUT/DELETE | CRUD de custom; built-ins imutáveis retornam 409 |
| `/farma/doses` | GET/POST | Log de doses |
| `/farma/doses/{id}` | PUT/DELETE | Edita/remove dose individual |
| `/farma/regimen` | GET | Defaults read-only; `PUT` removido na Fase 9A.3 |
| `/forecast` | POST | Forecasting 5 dias via Gemini |
| `/interpolate` | POST | Interpolação temporal linear/Gemini |

## Apache e Serviços

- Apache: `/health/` → `localhost:3031`; `/health/api/` → `localhost:8011`.
- Config principal: `/etc/apache2/sites-available/ultrassom.ai-optimized.conf`.
- Inventário de portas/regras: consultar `/etc/apache2/APACHE.md` antes de criar serviço ou mudar proxy.
- Backend oficial: `roocode.service` em `/etc/systemd/system/`, `active (running)`, enabled.
- `ExecStart`: `/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011`.
- Serviços antigos `sleep-api.service`, `metrics-api.service`, `mood-api.service` foram removidos; `main.py` é a fonte única.

## Quirks Vivos

- CSVs do iPhone misturam ISO 8601 e PT-BR; backend e frontend já têm normalização defensiva.
- `Mood/mood.csv` foi re-upado em 2026-04-27 com HH:MM:SS preservado nas Emoções Momentâneas.
- `In Bed (hr) = 0.0` no AutoExport é sentinel de ausência; tratar como `null`, nunca como eficiência real.
- `VITE_USE_MOCK=true` pode ficar preso no processo Vite até restart. Se aparecer "Mock · 14 dias", verificar `/proc/<pid-vite>/environ`.
- Evitar `uvicorn --reload` no uso pessoal; se porta 8011 ficar presa, investigar PID órfão antes de relançar.
- Tailwind v4 não escaneia alias `@/` de forma confiável; arquivo novo com classes Tailwind pode precisar de `@source` explícito em `frontend/src/index.css`.
- Peso default PK do Anders: 91 kg (`DEFAULT_PK_BODY_WEIGHT_KG`).

## Estado Atual

- Fases 1-10D concluídas.
- 9E concluída: mood histórico re-upado com hora.
- 11A concluída: limpeza de dead code e deps órfãs.
- CHART-1 e CHART-2 concluídas.
- REDESIGN-1 concluída: 6 tabs narrativas (`Panorama`, `Sono`, `Coração`, `Atividade`, `Farmaco`, `Insights`).
- REDESIGN-2 concluída: FC ao caminhar, esforço/MET, perfil de marcha com comprimento do passo, ratio energia ativa/repouso.
- REDESIGN-3 parcial concluída: SMA(4×t½) nos PKCompactCards + painel `PKHumorCorrelation`.
- Trilha antiga REDESIGN-3/4/5 foi absorvida pela nova fila **Mood Impact**.
- **Próxima sprint oficial: MOOD-IMPACT-1 — Mood Driver Board**, conforme `ROADMAP.md`.

## Roadmap e Docs

- `ROADMAP.md`: Antiga fonte de Historico única de sequência/sprints.
- `CHARTENDEAVOUR.md`: spec histórica/técnica do redesign visual; não define a próxima sprint.
- `Docs/RELATORIO_AUDITORIA_ROOCODE_2026-04-26.md`: auditoria histórica; consultar como evidência, não como roteiro ativo.
- `frontend/docs/README.md`: checklist histórico da Fase 5, sem pendência ativa.

Filtro ativo: não puxar sprints de manutenção pequena por inércia. Só propor próxima tarefa se ela trouxer redesign relevante, dado novo, insight clínico ou layout perceptivelmente melhor.

Política de dado insuficiente: métrica nova pode nascer `data-gated`. Estado vazio deve dizer o critério (`precisa ≥N pares`, cobertura baixa, sem overlap humor+metric), sem mockar insight e sem transformar null em zero.

Política de IA/Superpowers:

- Seções de IA existentes continuam válidas e podem ser melhoradas incrementalmente.
- Não remover Gemini/Forecast existente sem uma sprint explícita de migração.
- Para a IA do produto/protótipo, preferência do Anders: `gpt-5.4-mini`, reasoning `high`, verbosity `high`.
- Como é app pessoal, a IA pode ser mais franca e experimental: hipóteses sobre rotina, sono, métricas, humor e medicação são permitidas.
- Limite prático: não executar mudanças, não editar doses automaticamente e não fingir certeza clínica.

## KICKOFF — MOOD-LOG-1

> Cole este bloco em uma sessão fresh quando for implementar a próxima sprint.

Objetivo: implementar o **Medication Action Center**: deixar o registro de dose mais rápido e menos friccional, preservando endpoints, schemas e PK engine atuais.

Status 2026-04-30: concluído. `DoseLogger` tem atalhos **tomar agora** por regime; `DoseCalendarView` tem ação **adicionar** no dia selecionado com auto-fill de dose/horário do regime e campos manuais diretos. Backend Farma, endpoints, schemas e PK engine não foram alterados.

Sanity inicial:

```bash
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
git status --short
```

Escopo MOOD-LOG-1:

1. Ler `frontend/src/components/DoseLogger.tsx` e `frontend/src/components/DoseCalendarView.tsx`.
2. Usar `/root/CODEX/mood-pharma-tracker/src/features/doses/components/QuickDoseModal.tsx` só como referência de UX.
3. Criar ação rápida **tomar agora** para substâncias do regime.
4. Manter auto-fill de dose/horário padrão com indicação visual de origem.
5. Permitir horário customizado sem abrir fluxo longo.
6. Melhorar o calendário para adicionar/editar dose no dia selecionado com menos atrito.

Cuidados:

- Não alterar endpoint, tipo público, schema ou comportamento de runtime.
- Não migrar arquitetura do `mood-pharma-tracker`; reaproveitar ideia, não copiar app.
- Não reescrever o calendário do zero.
- Tratar PRN/manual como fluxo simples, sem exigir remodelagem completa do catálogo.

Validação esperada:

```bash
cd /root/RooCode/frontend
npx tsc --noEmit
npm run build
```

Ao concluir:

1. Historico `ROADMAP.md`, `CHARTENDEAVOUR.md` e este `CLAUDE.md`. Adicionar observacoes em AGENTS.md
2. Rodar `git diff --check`.
3. Commit + push se tudo estiver verde.

## KICKOFF — MOOD-IMPACT-1

Objetivo: criar o **Mood Driver Board** em fatia pequena, explicando fatores plausíveis que pesam no humor antes de abrir gráficos detalhados.

Cuidados:

- Declarar campos de entrada antes de editar código.
- Começar com poucos drivers de alta cobertura: sono, ativação, autonômico e medicação.
- Cada card precisa ter estado `dados insuficientes` com critério objetivo.
- Não mockar insight, não transformar `null` em zero e não sugerir causalidade clínica.
- Preservar Gemini/Forecast existente.

Validação esperada:

```bash
cd /root/RooCode/frontend
npx tsc --noEmit
npm run build
git diff --check
```
