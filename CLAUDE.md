# RooCode — Handoff Operacional

Pipeline: iPhone AutoExport → FastAPI (8011) → React/Vite (3031) → Apache → `https://ultrassom.ai/health/`

App em **modo manutenção**: tickets pontuais em `BACKLOG.md`, sem sprint formal.

## Modo operacional

**Modo manutenção ativo.** `~/.claude/rules/sprint-system.md` NÃO se aplica aqui (Locality Principle). Cada mudança = 1 ticket de `BACKLOG.md` resolvido em 1 commit focado. Sem KICKOFF, sem Pós-Sprint Protocol, sem ROADMAP novo. Histórico de sprints concluídas em `docs/HISTORY/` + `git log`.

## Stack

- **Backend:** FastAPI unificado em `main.py` (porta 8011), pandas, venv local (`/root/RooCode/bin/python`).
- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4 + Recharts + TanStack Query.
- **Módulos backend:** `Sleep/`, `Metrics/`, `Mood/`, `Farma/`, `Forecast/`, `Interpolate/`, `Profile/`, `Cognition/`.
- **Farmacocinética:** `Farma/math.py` + `Farma/medDataBase.json` (backend) e `frontend/src/utils/pharmacokinetics.ts` (frontend).
- **Perfil canônico:** `Profile/__init__.py` (backend) e `frontend/src/utils/user-profile.ts` (front) — peso 91 kg, idade 40, sexo M, timezone America/Sao_Paulo. HRmax estimado via **Tanaka** (208 − 0,7×idade ≈ 180 bpm), fonte única `ANDERS_HRMAX_BPM` derivada da idade; o literal `hrMaxBpm` (Fox-Haskell 220−39) foi removido em 2026-06-14.

## Runtime e serviços

- Backend oficial: `roocode.service` (`/etc/systemd/system/roocode.service`). Nunca subir manual via uvicorn/nohup.
- Proxy Apache:
  - `/health/` → frontend (`localhost:3031`)
  - `/health/api/` → backend (`localhost:8011`)
- Forecast backend é OpenAI-only com hardening de saída (dedupe/ordem por data futura, clamp de faixa, erro HTTP explícito). Runtime atual: `OPENAI_MODEL=gpt-5.1`, `OPENAI_REASONING_EFFORT=high`, `OPENAI_TIMEOUT_SECONDS=300`. Validação real em 2026-05-14: `gpt-5.1` rejeita `xhigh`; `gpt-5.1/high` respondeu `/forecast` em ~48s.
- Logging de trace do forecast é opt-in via `FORECAST_DEBUG=true`.
- PK coverage: `queda` só deve alertar quando a concentração está perto do piso terapêutico (`<1.2× min`) e projeta cruzar o mínimo em até 12h; substância confortavelmente em faixa fica `adequada`. Cards PK com faixa usam escala `% do teto terapêutico` e mantêm ng/mL no tooltip.

## Comandos principais

```bash
# Backend (debug local)
source /root/RooCode/bin/activate
/root/RooCode/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8011

# Frontend
cd /root/RooCode/frontend
npm run dev -- --host 0.0.0.0

# Qualidade frontend
npx tsc --noEmit
npm run build
npm run lint
npm run test:unit

# Backend tests
cd /root/RooCode
/root/RooCode/bin/python -m unittest tests.test_farma -v
/root/RooCode/bin/python -m unittest tests.test_forecast -v
/root/RooCode/bin/python -m unittest tests.test_mood -v
git diff --check
```

## Endpoints principais

- `/sleep`, `/metrics`, `/mood` (GET/POST cada)
- `/farma/substances` (GET; `?full=true` pra campos PK completos)
- `/farma/substances/{key}` (POST/PUT/DELETE custom)
- `/farma/regimen` (GET)
- `/farma/doses` (GET/POST) · `/farma/doses/{id}` (PUT/DELETE)
- `/farma/concentration-series` (GET)
- `/interpolate` (POST)
- `/forecast` (POST) · `/forecast/accuracy` (POST) · `/forecast/report` (POST)
- `/cognition/status` · `/cognition/materials` · `/cognition/complete` (módulo Cognição — feature independente, ver AGENTS.md 2026-06-15)

## Componentes ativos por aba

| Aba | Componentes |
|---|---|
| **Panorama** | PillarGaugeBars · PanoramaCompositeChart · RecoveryIndexChart · PillarMiniCharts · PKTimelineChart · IndexRadarSnapshot · PanoramaWeeklyRegimeCard · MetricGrid · RecoveryWeekCard |
| **Farmaco** | MoodTimeline · PKMedicationGrid · PKHumorCorrelation · PKCoverageCard · DoseLogger · DoseCalendarView · MedicationCatalogEditor |
| **Recuperação** | NightQualityCard · RecoveryIndexCard · SleepStagesChart · SleepRegularityCard · SleepDebtChart · Spo2Chart · RespiratoryDisturbancesChart · VitalSignsTimeline · RecoveryWeekCard · RecoveryIndexChart |
| **Capacidade** | ActivityReadinessCard · CapacityPanels (FCI + Carga real + Cardiorrespiratório[VO2] + CRI + Movement Efficiency) · ActivityBars · StepsChart · Vo2MaxChart · WalkingVitalityChart |
| **Sono** | SleepStagesChart · SleepArchitectureCard · RespiratoryLoadCard · SleepContinuityCard · VenvanseSleepOnsetChart |
| **Coração** | RestingHeartRateCard · BloodPressureCard (dormente) · HRRangeChart · HrvVariabilityChart · AutonomicBalanceChart · HeartRateReserveChart · ChronotropicResponseChart (Aceleração na caminhada) · CardioRecoveryChart (dormente) · StimulantCardiacLoadCard |
| **Insights** | MoodDriverBoard · CorrelationHeatmap · TempHumorCorrelation · PKVariabilityReportCard · PKVariabilityHumorLab (grade 4×3) · PKMoodScatterChart · LagCorrelationChart · PkRemSuppression · ForecastAccuracyCard (colapsada) |
| **Cognição** | CognitionDailySection — fluxo de sessão independente (VAS+contexto → PVT → span → fluência → flanker); backend `Cognition/`, scoring linguístico OpenAI |

## Baseline funcional a preservar

- `DoseLogger` mantém atalhos "tomar agora" para entradas ativas do regime.
- `DoseCalendarView` mantém fluxo rápido de adicionar/editar/remover dose no dia selecionado.
- Contrato Farma sem mudança de schema público: `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances`.
- `MoodDriverBoard` no topo de Insights via `CorrelationHeatmap`.
- `MoodDriverBoard` deve permanecer investigável: cada driver tem botão "Evidência" com sourcePath, janela recente, baseline, delta, n pareado, últimos valores usados e destino natural de gráfico.
- `CorrelationHeatmap` filtra `forecasted`/`interpolated` antes de correlacionar (alinhado com MoodDriverBoard e PKVariabilityHumorLab); FDR Benjamini-Hochberg sobre todos os pares testados.
- `PKVariabilityHumorLab` em grade 4×3 (lag × métrica) com FDR sobre as 12 células e observações textuais por lag.
- Visualizações largas devem preservar leitura em viewport estreita: tabela do `ForecastReportModal` e matriz do `PKVariabilityHumorLab` usam scroll horizontal local em vez de comprimir/cortar conteúdo.
- Heatmaps compartilhados com `HeatmapCell` devem ser touch-friendly: quando a célula representa um resultado real, renderizar como botão acessível e mostrar "Detalhe selecionado" persistente no consumidor.
- `CorrelationHeatmap` e `TempHumorCorrelation` seguem o mesmo padrão touch-friendly: células reais são botões com `aria-label`, estado selecionado e painel "Detalhe selecionado".
- Insights deve evitar duplicar a família `PKVariability*`: o resumo forte (`PKVariabilityReportCard`) fica dentro do bloco "PK × Humor (variabilidade)" e o heatmap panorâmico separado fica fora da renderização principal enquanto `PKVariabilityHumorLab` já mostra substância × métrica × lag. `LagCorrelationChart` deve explicar que melhora de valência inclui sair de negativa para menos negativa.
- `CorrelationHeatmap` deve manter uma seção "Leitura clínica rápida" antes da matriz, destacando a maior associação positiva e negativa para ajudar a interpretar Humor vs fisiologia sem tratar correlação como causalidade.
- Labs PK intraday (`PKMoodScatterChart`, `LagCorrelationChart`) usam `DEFAULT_PK_BODY_WEIGHT_KG`; não reintroduzir peso literal `91` em cálculos novos.
- Gráficos Recharts que aparecem no primeiro render auditado (`RecoveryScoreChart`, `PKMoodScatterChart`, `LagCorrelationChart`) usam `initialDimension={{ width: 1, height: 1 }}` para evitar warning de dimensão `-1` na montagem.
- Política de janela no `App`: `ranged` para leitura histórica filtrada, `rangedWithForecast` para gráficos com projeção futura, `data.snapshots` para baseline/dia atual. Em Recuperação, `NightQualityCard` recebe `ranged` e os gráficos fisiológicos usam `rangedWithForecast`; em Capacidade, `ActivityReadinessCard` recebe `ranged` + `baselineSnapshots={data.snapshots}`; no Farma, `PKMedicationGrid` deriva `hoursWindow` de `PK_HOURS_BY_RANGE`.
- Lamictal sem `therapeutic_range` (TDM não padrão em bipolar); `PKCoverageCard` mostra concentração corrente sem badge de status (`klass: 'sem_faixa'`).
- Estado "dados insuficientes" explícito em correlações; sem causalidade clínica.
- O pipeline de sono agora preserva `Start/End` ou `Iniciar/Fim`; `sleepStartAt` e `sleepEndAt` fazem parte de `DailyHealthMetrics` e sustentam `SleepRegularityCard` e `Social Jet Lag`.
- `Recovery Index` é o índice basal novo para Panorama/Recuperação. O `Recovery Score` legado continua existindo no código para consumidores antigos, mas não é mais a superfície principal dessas abas.
- Índices da aba Capacidade (`Functional Capacity Index`, `Circadian Robustness`, `Movement Efficiency`) e da aba Recuperação declaram fonte, proxy aceito e política de interpolação na matriz central `frontend/src/utils/index-evidence.ts` + `INDEX_EVIDENCE_MATRIX.md`. Novos índices ou mudança de política devem entrar nessa matriz, não em ifs espalhados.
- Panorama é tela de decisão: `Estado geral` composto por pesos fixos (recovery=0.40, capacity=0.35, chronobiology=0.25) com renormalização por pilar ausente, EMA curta e modulação PK por cap progressivo. Motor único em `frontend/src/utils/panorama-model.ts` — não duplicar fórmula em componentes.
- Recharts: novos charts devem nascer com `ResponsiveContainer` + `minWidth={0}` + `minHeight={0}` + `initialDimension={{ width: 1, height: 1 }}`. Padrão aplicado em 20 charts no QA de 2026-05-18.
- Paleta visual centralizada em `frontend/src/components/charts/shared/chart-tokens.ts` (`CHART_TOKENS`). Charts novos devem importar daqui em vez de hardcodar hex/rgba; isso evita drift quando charts são editados isoladamente. Heatmaps e charts de Insights já consomem essa fonte; charts antigos podem migrar gradualmente.
- Zoom horizontal sobre Recharts usa `useChartBrush` em `frontend/src/components/charts/shared/useChartBrush.tsx` — brush D3 montado como overlay SVG sobre `ResponsiveContainer`; D3 captura o drag, Recharts mantém o hover. Consumidor controla `BrushIndexSelection` e filtra `data` antes do chart.
- Panorama virou tela de exploração aditiva: a trinca clicável (decisão) continua no topo intacta, mas abaixo dela `PanoramaCompositeChart` (histórico longo com brush + overlay de humor), `PillarGaugeBars` (substituiu o sparkline antigo), `RecoveryIndexChart` v2 (zoom sincronizado + sleep debt) e três accordions colapsados por padrão (`PillarMiniCharts`, `PKTimelineChart`, `IndexRadarSnapshot`) entregam camada exploratória. `panorama-model.ts` segue como motor único — novos componentes só visualizam séries já calculadas.
- **Coração consolidado + validado (2026-06-14):** a aba agrega todo o cardíaco em 4 seções (Em repouso · Variabilidade & tônus · Resposta ao esforço · Estimulante). O cardíaco saiu de Recuperação (Painel 5) e Capacidade (painel cardiovascular, que ficou só com VO2). Validade auditada: **idade cardiovascular removida** (coef. fabricados + dupla contagem de RHR); **reserva de FC e HRV viraram tendência-pura** (bandas sem lastro removidas — HRR absoluto depende de HRmax estimado; SDNN do Apple é ultra-short sem norma de wearable); **cronotrópica renomeada** "Aceleração na caminhada" (não é teste de esforço); FC repouso mantém bandas com fonte citada (Framingham/12-coortes). VO2 fica na Capacidade (dado esparso). Spec/plano em `docs/superpowers/specs/2026-06-14-coracao-consolidacao-validacao-design.md` + plano correspondente.
- **Tooltip global + gap "liso+sinalizado" (2026-06-14):** comportamento do tooltip centralizado em `frontend/src/components/charts/shared/ChartTooltip.tsx` (embute `TOOLTIP_DEFAULTS` de `tooltip-helpers.ts` — posição fixa no topo, x segue o cursor). Charts novos devem usar `<ChartTooltip>` em vez de `<Tooltip>` pra herdar o comportamento. Séries diárias entrecortadas usam uma linha-ponte pontilhada tênue (`connectNulls`, opacidade baixa, atrás da linha sólida) que conecta gaps sem inventar dado — sólido = medição real, pontilhado = ligação visual.
- **Cognição é feature independente (2026-06-15, onda Codex):** módulo `Cognition/` (backend) + aba Cognição (frontend) NÃO interferem no resto do app. Specs boladas no Claude desktop, implementadas pelo Codex. Tratar como subsistema isolado; não acoplar a Panorama/Recuperação/etc.

## Fresh start

```bash
systemctl is-active roocode.service
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep
git status --short
```

Depois: revisar `AGENTS.md` (registro cronológico de cada onda Codex/Claude no projeto) ou abrir nova frente. Backlog histórico arquivado em `docs/HISTORY/BACKLOG.md`.

## Próxima sessão

- ⚠️ **PUSH PENDENTE:** a frente Coração + polimento (2026-06-14) tem ~14 commits na `main` local **não enviados** pro origin (8 de consolidação/validação cardíaca + 2 docs spec/plano + 4 de polimento visual). Validar e então `git push origin main` quando o Anders autorizar explicitamente (push direto na main exige aval claro).
- ⚠️ **Cognição NÃO-COMMITADA no working tree:** o módulo `Cognition/` + aba (onda Codex, 2026-06-15, feature independente) está presente mas **sem commit** — `git status` mostra `Cognition/`, `frontend/src/components/cognition/`, `cognition*.ts`, `main.py`, `api.ts`, `TabNav.tsx`, `App.tsx`, `BACKLOG.md` modificados/novos. **Antes de abrir frente nova de código, decidir o destino dela** (commitar como onda própria OU `git stash`) — senão fica boiando junto com o trabalho novo. Specs originais ficaram no Claude desktop do Anders. Detalhe da onda em `AGENTS.md` (2026-06-15).
- QA visual feito (desktop): tooltip fixo no topo + gap "liso+sinalizado" validados na aba Coração (ABI via screenshot). Falta passar o olho nas demais abas e no mobile.
- Próximos dados: o Anders vai trazer **dados novos** numa sessão fresca — frente nova, começar com contexto limpo.
- Pendência honesta antiga: a aba Recuperação mostra o desvio noturno de temperatura, mas **não** calcula amplitude diária da temperatura do pulso (o pipeline ainda não recebe o dado bruto intradia).
- Decisão já tomada: `Sleep Regularity Index` e `Social Jet Lag` são leitura exploratória de `sleepStartAt/sleepEndAt` — não tratar como cálculo minuto-a-minuto definitivo.
- 4 PKs preservados (`PKVariabilityReportCard`, `PKVariabilityHumorLab`, `PKMoodScatterChart`, `LagCorrelationChart`) seguem como arquivos sem callsite, candidatos a um Lab PK dedicado.

## Histórico

- 2026-05-16: auditoria frontend consolidou viewport/heatmaps/janelas/Insights. QA visual em `https://ultrassom.ai/health/` validou desktop 1440×1000 e mobile 390×844 sem overlay, sem tela em branco, sem warning/erro de console, com `Leitura clínica rápida`, `PK × Humor (variabilidade)` consolidado e zero duplicidade de "Substância × métrica de variabilidade" na tela principal.
- 2026-05-16: REBUILD phase 1 aplicado. Taxonomia mudou para `Panorama`, `Recuperação`, `Capacidade`, `Farmaco`, `Insights`; backend de sono preserva horários brutos; frontend ganhou `RecoveryIndex`, `SleepRegularityCard`, `Social Jet Lag`, `CardiovascularAgeCard` e a migração de `HeartRateReserveChart`/`ChronotropicResponseChart`/`CardioRecoveryChart` para `Capacidade`. Validação em verde com `npm run test:unit`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, restart do `roocode.service` e `curl` 200 em `http://localhost:8011/sleep`, `https://ultrassom.ai/health/` e `https://ultrassom.ai/health/api/sleep`.
- 2026-05-17: refactor da aba Capacidade. 6 painéis (Prontidão, Functional Capacity Index, Cardio, Carga real, CRI, Movement Efficiency); FCI usa último valor válido por componente; CRI proxy térmica `Temp. pulso vs baseline` (não amplitude pico-nadir, que aguarda dado intradia); `RecoveryIndex` filtra inputs ausentes em vez de ranquear como zero.
- 2026-05-18: 3 ondas — governance formal de evidência de índices (matriz central em `index-evidence.ts` + `INDEX_EVIDENCE_MATRIX.md`, 11 índices cobertos), Panorama refactor final em tela de decisão (`panorama-model.ts` único motor, pesos 40/35/25, modulação PK por cap progressivo, trinca clicável navega pras abas), e QA visual mobile (overflow TabNav corrigido + 20 charts ganharam `initialDimension` Recharts).
- 2026-05-26: 13 commits em 3 frentes coordenadas. (1) Foundation: `CHART_TOKENS` + `useChartBrush` em `components/charts/shared/`. (2) Panorama virou tela de exploração aditiva — `PillarGaugeBars` substitui sparkline; `PanoramaCompositeChart` (com brush) substitui `panorama-history-chart.tsx`; `RecoveryIndexChart` ganhou zoom sincronizado + sleep debt; três accordions novos colapsados por padrão (`PillarMiniCharts`, `PKTimelineChart`, `IndexRadarSnapshot`). (3) Insights migrou pra paleta `CHART_TOKENS` (heatmap-helpers, `PKMoodScatterChart`, `LagCorrelationChart`, `TempHumorCorrelation`) como polimento visual antes de reestruturação narrativa maior — esta última segue em brainstorm pausado (checkpoint `/root/RooCode/.superpowers/brainstorm/RESUME_INSIGHTS.md`, parou na Q#7).
- 2026-06-14: frente **Coração** — consolidação + validação dos marcadores cardíacos. Auditoria dos 11 marcadores; idade CV removida, HRmax→Tanaka, reserva/HRV tendência-pura, cronotrópica renomeada; cardíaco migrou de Recuperação/Capacidade pra aba Coração (4 seções); polimento visual (tooltip global `ChartTooltip` + gap "liso+sinalizado"). 14 commits na main local (push pendente). Spec/plano em `docs/superpowers/`.
- 2026-06-15: onda **Codex** — módulo Cognição (aferição cognitiva longitudinal, feature independente). Specs no Claude desktop, implementação pelo Codex. **Não-commitada** no working tree na data deste handoff. Detalhe em `AGENTS.md`.

10 sprints concluídas até 2026-05-11: REG-0..5, Cross-Domain Insights (A/B/C), Codex Cleanup, PK×Humor Methodology, M1-M7, R, D, D-patch1. Detalhes em `docs/HISTORY/ROADMAP_maturation.md`, `docs/HISTORY/ROADMAP.md`, `docs/HISTORY/AGENTS.md` ou `git log --oneline`.
