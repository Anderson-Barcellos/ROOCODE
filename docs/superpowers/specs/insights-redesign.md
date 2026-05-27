# Insights Redesign — Design Doc

**Status:** spec aprovada · pronta pra writing-plans/execução
**Brainstorm:** 2026-05-26 (pausado na Q#7) → retomado e fechado em 2026-05-27
**Origem do checkpoint:** `.superpowers/brainstorm/RESUME_INSIGHTS.md`
**Sprint mãe:** redesign da aba Insights pós-onda de 26-05 (`CHART_TOKENS` + Panorama exploração)

---

## Objetivo

Transformar a aba Insights de painel multivariado denso em **cockpit narrativo curto** que responde à pergunta operacional *"Quem mexeu no meu humor essa semana?"*. Reduz fricção cognitiva, prioriza interpretação opinativa, e move detalhes técnicos pra segundas dobras controladas.

## Não-objetivos

- Tornar Insights um substituto do `MoodDriverBoard` atual em todas as funções — algumas (rede de drivers, correlações laterais) ficam pra sprints futuras.
- Detectar eventos discretos heuristicamente (dose esquecida, mudança de regime). Espera infraestrutura formalizada (ticket #1 do BACKLOG).
- Refatorar PK Variability Lab. Os 4 PKs saem do view mas os arquivos ficam preservados pra eventual retorno (decisão #5).
- Mexer em algoritmos de Pearson, baseline ou aggregation. Só renderização e composição.

---

## Estado atual (baseline)

A aba Insights hoje (`App.tsx:864-935`) renderiza 3 `LabGroup` empilhados + um `<details>` final:

1. **"Hipóteses acionáveis"** — `CorrelationHeatmap` + `TempHumorCorrelation`
2. **"PK × Humor (variabilidade)"** — `PKVariabilityReportCard` + `PKVariabilityHumorLab`
3. **"Modo laboratório"** — `PKMoodScatterChart` + `LagCorrelationChart`
4. **`<details>`** — `ForecastAccuracyCard` colapsado

O `MoodDriverBoard` (`mood-driver-board.tsx:253`) vive *dentro* do `CorrelationHeatmap` (linha 191) como container/conteúdo acoplado — relação que precisa ser quebrada nesta sprint.

Limitações do estado atual:
- 5 drivers fixos hardcoded em grade rígida, sem ranking
- Pearson lag0 é apenas badge de coerência, não ordenação
- Tudo aparece sempre, mesmo com pareamento zero
- Heatmap multivariado disputa atenção com cards interpretativos
- 4 PKs aprofundam variabilidade mas saem do escopo narrativo "humor da semana"

---

## Quadro consolidado de decisões (12)

### Decisões fundacionais (1–7) — consolidadas no brainstorm de 26-05

1. **Alvo central** — cockpit narrativo "Quem mexeu no meu humor essa semana". Curto prazo, opinativo.
2. **Matéria-prima** — fisiológicos contínuos + eventos discretos. PK fora desta sprint.
3. **Tom** — interpretação clínica + pergunta investigativa. Sem prescrição de ação.
4. **Janela temporal** — segue o seletor global do app (coerência com outras abas).
5. **Conteúdo da aba** — cockpit absorve `MoodDriverBoard`. `CorrelationHeatmap` + `TempHumorCorrelation` viram detalhes expansíveis dentro dos cards de driver (não no rodapé). 4 PKs (`PKVariabilityReportCard`, `PKVariabilityHumorLab`, `PKMoodScatterChart`, `LagCorrelationChart`) removidos do view; arquivos preservados em `components/charts/` pra eventual retorno.
6. **Topo da aba** — headline narrativo curto + 3 chips compactos: `N robustas`, `X% cobertura`, `n=Y dias`.
7. **Anatomia do card de driver** — minimalista. Sparkline 14d com baseline pontilhada. Pergunta investigativa **não fica no card principal** — migra pro "ver detalhes".

### Decisões de fechamento (8–12) — consolidadas em 2026-05-27

8. **Granularidade do ranking (Q#7).** Top 3 destacados + accordion "ver outros (N)" colapsado. Ordenação por |r| absoluto. Critério de qualificação: n≥10. Critério de "robusto" (pro chip do topo): |r|≥0.3 **e** n≥10. Driver `medicação` (`polarity: 'context'`) **não entra no ranking** — vira faixa contextual (decisão #9).

9. **Eventos discretos (Q#8).** Deferir nesta sprint. Não há fonte formalizada de eventos no domínio (só `medications.count` agregado). Implementar agora seria construir UI sem dado ou inventar heurísticas que vão competir com o que o ticket #1 do BACKLOG (PK Coverage 3-camadas) gerar formalmente. Substituição mínima: **faixa contextual de medicação** abaixo do top 3, formato `💊 Doses logadas · X/Y esperadas · timing médio +Zh vs mediana`. Não é ranking, não é evento — é uma faixa contextual sempre presente, separada visualmente dos drivers.

10. **Conteúdo do "ver detalhes" do card (Q#9).** Trio enxuto:
    - **Pergunta investigativa** no topo (1-2 linhas conversacionais, ex: *"Tu dormiu 6.2h em média essa semana — 1.2h abaixo do baseline. Quer ver SleepStages dos últimos 7 dias?"*)
    - **Mini-scatter driver × humor** (últimos 14d, eixo Y = valência crua -1 a +1, linha de regressão tracejada se n≥10)
    - **Link/CTA pro chart natural** (`chartHint` atual: "Sono · SleepStages/SleepDebt" → botão "Ver SleepStages na aba Recuperação →")

    **Divergência consciente da recomendação inicial:** descartado o painel "Números crus" (r, p, n, delta, baseline, tabela de 7d) que o atual "Evidência" expõe. Anders escolheu cortar pra preservar foco narrativo. Quem quiser número absoluto usa o link pro chart natural ou inspeciona o badge Pearson no card principal. Decisão deliberada, não esquecimento.

11. **Estado vazio / dados insuficientes (Q#10).** Drivers que não atingem n≥10 ficam **sempre visíveis em cinza**, com chip "n=7 (insuf.)" e CTA "aumentar janela". Top 3 qualificados em destaque colorido; não-qualificados em estado dessaturado. Não há "tela vazia absoluta" — os 5 cards (sono · HRV · ativação · circadiano + faixa contextual de medicação) sempre estão lá. Quando nenhum qualifica, todos aparecem cinzas com CTA de janela.

12. **`ForecastAccuracyCard` (Q#11).** Removido do Insights. Migra pro **rodapé do Panorama em accordion**, junto dos 3 accordions já existentes lá (`PillarMiniCharts`, `PKTimelineChart`, `IndexRadarSnapshot`). Padrão visual reusado, custo zero, conceitualmente correto (confiança no forecast é parte da decisão "estado de hoje" do Panorama).

13. **`CorrelationHeatmap` no novo Insights.** `<details>` próprio do cockpit, fora do ranking, label "Ver matriz de correlação completa". Mantém transparência sem distorcer arquitetura (heatmap multivariado não cabe dentro de card de driver individual). `TempHumorCorrelation` segue o mesmo padrão — `<details>` separado, label "Temperatura corporal × humor".

14. **Geração de texto narrativo (headline + pergunta investigativa).** Templates determinísticos pra MVP. Regras `if/then` com placeholders, ex: `"Tu {dormiu|dormistes} {valor}h em média essa semana — {delta_abs}h {acima|abaixo} do baseline. Quer ver {chartHint}?"`. Previsível, testável, sem custo de latência ou tokens. Evolução pra LLM (gpt-5.1 ou Gemini) fica fora de escopo desta sprint — pode ser reavaliada depois se templates soarem rasos.

---

## Anatomia da nova aba Insights

```
┌─ Insights ────────────────────────────────────────────────────┐
│ kicker · title · description                                   │
│ metaPanel: Dados usados (janela, histórico, cobertura)         │
├────────────────────────────────────────────────────────────────┤
│ [Banner exploratório amarelo — preservar texto atual]          │
│                                                                │
│ ┌─ Cockpit: "Quem mexeu no meu humor essa semana" ──────────┐ │
│ │ Headline narrativo (1-2 linhas opinativas)                 │ │
│ │ Chips: [3 robustas] [78% cobertura] [n=42 dias]            │ │
│ │                                                            │ │
│ │ ┌─ Top 3 ─────────────────────────────────────────────────┐│ │
│ │ │ ┌─ Driver A ─┐ ┌─ Driver B ─┐ ┌─ Driver C ─┐            ││ │
│ │ │ │ Icon Title │ │ Icon Title │ │ Icon Title │            ││ │
│ │ │ │ 6.2h (med.)│ │ 32ms (med.)│ │ 8.4k (med.)│            ││ │
│ │ │ │ sparkline  │ │ sparkline  │ │ sparkline  │            ││ │
│ │ │ │ 14d + base │ │ 14d + base │ │ 14d + base │            ││ │
│ │ │ │ [Detalhes] │ │ [Detalhes] │ │ [Detalhes] │            ││ │
│ │ │ └────────────┘ └────────────┘ └────────────┘            ││ │
│ │ └─────────────────────────────────────────────────────────┘│ │
│ │                                                            │ │
│ │ 💊 Doses logadas · 12/14 esperadas · +2h3min vs mediana    │ │
│ │ ▼ Ver outros drivers (2 — n insuficiente)                  │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ▼ Ver matriz de correlação completa (CorrelationHeatmap)      │
│ ▼ Temperatura corporal × humor (TempHumorCorrelation)         │
│                                                                │
│ [Estado vazio extremo: 0 drivers qualificados]                 │
│ Mensagem CTA "Aumente a janela ou aguarde mais logs de humor" │
└────────────────────────────────────────────────────────────────┘
```

### Detalhe expandido de um card

```
┌─ Driver A: Sono ──────────────────────────────────────────────┐
│ ⚡ Tu dormiu 6.2h em média essa semana — 1.2h abaixo do       │
│    baseline. Quer ver SleepStages dos últimos 7 dias?         │
│                                                                │
│ Mini-scatter sono × humor (14d)                                │
│ ┌────────────────────────────────────────────┐                │
│ │ valência                                    │                │
│ │  +1│       ·                                │                │
│ │    │   ·       ·      · (regressão tracej.) │                │
│ │   0│ ·     ·       ·                         │                │
│ │    │      ·                                  │                │
│ │  -1│___________________________              │                │
│ │     4h    6h    8h    10h                   │                │
│ └────────────────────────────────────────────┘                │
│                                                                │
│ [→ Ver SleepStages na aba Recuperação]                        │
└────────────────────────────────────────────────────────────────┘
```

---

## Componentes novos / alterados

### Componentes novos

| Componente | Arquivo | Responsabilidade |
|------------|---------|------------------|
| `InsightsCockpit` | `frontend/src/components/insights/insights-cockpit.tsx` | Container principal do cockpit. Compõe headline, chips do topo, ranking, faixa contextual de medicação. |
| `DriverRankingCard` | `frontend/src/components/insights/driver-ranking-card.tsx` | Card individual de driver no ranking. Anatomia minimalista (icon, métrica, sparkline 14d com baseline, botão Detalhes). Aceita estado `qualified` vs `dim`. |
| `DriverDetailPanel` | `frontend/src/components/insights/driver-detail-panel.tsx` | Painel expandido do card: pergunta investigativa + mini-scatter + link pro chart natural. |
| `MedicationContextStrip` | `frontend/src/components/insights/medication-context-strip.tsx` | Faixa de 1 linha abaixo do top 3 com contagem de doses + timing médio. Lê `medications.count` + `/farma/doses`. |
| `RankingMetadataChips` | `frontend/src/components/insights/ranking-metadata-chips.tsx` | 3 chips do topo (`N robustas`, `X% cobertura`, `n=Y dias`). |

### Componentes alterados

| Componente | Arquivo | Mudança |
|------------|---------|---------|
| `MoodDriverBoard` | `frontend/src/components/charts/mood-driver-board.tsx` | **Deletado**. Lógica de derivação por driver (`DRIVERS` array, `buildDriverCard`, `describeCorrelationCue`) migra pra novo módulo `utils/driver-ranking.ts`. |
| `CorrelationHeatmap` | `frontend/src/components/charts/correlation-heatmap.tsx` | Remove `<MoodDriverBoard>` da linha 191. Componente continua existindo isolado e vira `<details>` próprio do cockpit (decisão #13), label "Ver matriz de correlação completa". Fora do ranking, fora da hierarquia de cards. |
| `TempHumorCorrelation` | `frontend/src/components/charts/temp-humor-correlation.tsx` | Mesmo padrão do heatmap — `<details>` próprio do cockpit, label "Temperatura corporal × humor". |
| `App.tsx` (bloco `activeTab === 'insights'`) | `frontend/src/App.tsx:864-935` | Reorganização completa. Remove 3 `LabGroup`. Adiciona `<InsightsCockpit>`. Remove `<details>` do `ForecastAccuracyCard`. |
| `App.tsx` (bloco `activeTab === 'panorama'`) | `frontend/src/App.tsx` (seção Panorama) | Adiciona `<ForecastAccuracyCard>` em novo accordion no rodapé, padrão dos 3 accordions existentes. |

### Componentes removidos do view (arquivos preservados)

- `PKVariabilityReportCard` — segue existindo em `frontend/src/components/cards/pk-variability-report-card.tsx`, mas sem callsite em `App.tsx` na aba Insights.
- `PKVariabilityHumorLab` — idem, em `frontend/src/components/charts/pk-variability-humor-lab.tsx`.
- `PKMoodScatterChart` — idem.
- `LagCorrelationChart` — idem.

### Módulos utilitários novos

| Módulo | Arquivo | Responsabilidade |
|--------|---------|------------------|
| `driver-ranking` | `frontend/src/utils/driver-ranking.ts` | Migra `DRIVERS`, `buildDriverCard`, `MIN_MOOD_PAIRS`, `RECENT_WINDOW`. Adiciona: `rankDrivers(snapshots, opts)` retornando `{ top3, others, total, robustCount, coveragePct, pairedDays }`. Filtra `medicação` automaticamente. |
| `insights-narrative` | `frontend/src/utils/insights-narrative.ts` | Templates determinísticos pra headline + pergunta investigativa (decisão #14). Funções puras `buildCockpitHeadline(ranking)` e `buildInvestigativePrompt(driver)`. Regras `if/then` com placeholders, sem LLM. Testável via fixtures. |

---

## Contratos e thresholds

```ts
// utils/driver-ranking.ts (novo)

export const MIN_PAIRED_DAYS_FOR_RANKING = 10
export const ROBUST_R_THRESHOLD = 0.3
export const TOP_N = 3

export type DriverRankingState = 'qualified' | 'dim'

export interface RankedDriver {
  id: string
  state: DriverRankingState
  pearson: { r: number; pValue: number; n: number; direction: 'positive' | 'negative' | 'flat' } | null
  recentValue: number | null
  baselineValue: number | null
  sparkline14d: Array<{ date: string; value: number | null }>
  baselineForSparkline: number  // referência pontilhada
  // ... demais campos derivados
}

export interface RankingResult {
  top3: RankedDriver[]
  others: RankedDriver[]  // pode estar vazio
  total: number
  robustCount: number
  coveragePct: number
  pairedDays: number
}
```

**Decisões de threshold registradas:**
- `MIN_PAIRED_DAYS_FOR_RANKING = 10` — abaixo disso, driver não entra como `qualified`
- `ROBUST_R_THRESHOLD = 0.3` — define "robusto" pro chip do topo
- `TOP_N = 3` — quantidade no destaque
- `RECENT_WINDOW = 7` — manter o atual pra `recentValue` e sparkline (não mudar nesta sprint)
- Driver `medicação` é **excluído** do array `DRIVERS` que entra no ranking; suas métricas migram pro `MedicationContextStrip`

---

## Estados visuais

### Card de driver — 4 estados

1. **`qualified` ativo** — top 3, destaque colorido (tom positivo/atenção/neutro conforme delta vs baseline)
2. **`qualified` no accordion "ver outros"** — mesma renderização, mas dentro do accordion
3. **`dim` (n insuficiente)** — bordas/bg cinzas, métrica esmaecida, chip "n=7 (insuf.)", botão "Detalhes" desabilitado ou com mensagem de bloqueio
4. **`dim` (driver inteiramente sem dado)** — placeholder mais agressivo, "sem dado nesta janela" + CTA

### Faixa contextual de medicação — sempre presente

Renderiza mesmo se contagem = 0 (com mensagem "Sem doses logadas nesta janela"). Não desaparece — é parte da arquitetura visual do cockpit, não dado condicional.

### Cockpit todo vazio (extremo)

Top 3 todos `dim`, faixa de medicação sem dado, chips do topo zerados. Banner CTA "Aumente a janela ou aguarde mais logs de humor — n mínimo = 10 dias pareados por driver." Não é tela vazia — é tela com 5 placeholders + mensagem.

---

## Riscos identificados

1. **Acoplamento `MoodDriverBoard` ↔ `CorrelationHeatmap`** — a remoção da linha 191 do heatmap precisa ser feita com cuidado: `CorrelationHeatmap` pode ter dependências internas no board (passagem de `snapshots`, sincronização). Verificar antes de deletar.

2. **`MedicationContextStrip` precisa de dado intra-dia** pra calcular "timing médio +Xh vs mediana". O endpoint `/farma/doses` retorna timestamps individuais — agregação pode ser feita no front. Mas se a janela for 90d e tiver 270 doses, processamento pode pesar. **Mitigação:** lazy-compute com `useMemo`; se virar gargalo, mover pra hook dedicado com Web Worker (fora desta sprint).

3. **Mini-scatter no detalhe** precisa de espaço vertical — ~180px só pro chart. O detalhe inteiro vai consumir ~320-380px. Considerar limitar altura do expandido com scroll interno em mobile.

4. ~~**Heatmap como detalhe órfão do cockpit.**~~ **Resolvido pela decisão #13** — heatmap fica em `<details>` próprio do cockpit, fora do ranking, com label "Ver matriz de correlação completa". `TempHumorCorrelation` segue mesmo padrão.

5. **Migração `ForecastAccuracyCard` → Panorama** envolve sincronizar `snapshots` e props. O componente espera `snapshots: DailySnapshot[]` que no Panorama vem de `ranged`. Compatível, sem refactor de contrato.

6. **`medications` driver hoje aparece no view** — usuários acostumados podem estranhar a ausência. **Mitigação:** faixa contextual cobre o caso de uso "ver minha adesão da semana". Se faltar algo, comportamento se ajusta em iteração seguinte.

---

## Métricas de sucesso

Esta spec não define métricas quantitativas (não há instrumentação de uso). Sucesso qualitativo:

- Anders consegue ler o cockpit em <10s e identificar os 3 drivers principais da semana sem ambiguidade
- O "ver detalhes" responde "por que esse driver entrou no top" sem precisar ir pra outra aba
- Nenhum dia tem driver sumindo da UI por falta de qualificação (sempre visível em cinza)
- Aba Insights deixa de competir com Panorama por "ser tela de decisão" — Insights vira tela de **interpretação**, Panorama segue como tela de **decisão**

---

## Fora de escopo (próximas sprints)

- Detecção heurística de eventos discretos ("dose esquecida", "noite atípica", "salto de horário")
- Integração com PK Coverage 3-camadas (depende ticket #1 do BACKLOG)
- "Rede de drivers" — correlações laterais entre drivers (driver A correlaciona com B?)
- Reintrodução dos 4 PKs de variabilidade em superfície dedicada (Lab PK separado?)
- Heatmap multivariado em formato narrativo (hoje fica como `<details>` próprio do cockpit, decisão #13 — estado considerado final pra esta sprint, mas pode evoluir)
- Migração de templates de texto pra LLM (gpt-5.1 ou Gemini) — decisão #14 fica em templates pra MVP; reavaliação possível em sprint futura se o tom rebobinado parecer raso

---

## Próximos passos

1. **User review desta spec** — Anders aprova/ajusta antes da execução
2. **Transição pra `superpowers:writing-plans`** OU plano direto inline (Anders decide ritmo)
3. **Execução em micro-commits** seguindo modo manutenção do projeto (BACKLOG.md, sem sprint formal)
4. **Atualização do AGENTS.md** após execução com entrada cronológica

---

*Spec consolidada em 2026-05-27 a partir de brainstorm pausado em 2026-05-26.*
