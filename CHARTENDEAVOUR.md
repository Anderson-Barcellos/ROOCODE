# RooCode Health Dashboard — Redesign Spec v1.0

> Spec para reorganização do dashboard de saúde pessoal.
> Princípio: cada seção responde uma **pergunta clínica**, não uma lista de métricas.
> Documento de referência para Claude Code implementar incrementalmente.

---

## Status de Implementação (atualizado 2026-04-28)

| Sprint | Estado | Commits / Notas |
|---|---|---|
| **Sprint 1 — Reorganização Estrutural** | ✅ | `60578fa` → `ae8ee00` (6 commits). Tabs reorganizadas, KPI clusters, syncId pulado |
| **Sprint 2 — Charts & Métricas Novos** | 🚧 próxima | FC caminhar, Índice Cronotrópico, MET, Perfil Marcha, Ratio Energia |
| **Sprint 3 — PK × Humor** | ⏳ parcial | `004b0f5` (SMA overlay) + `04ae4c2` (PKHumorCorrelation panel). **Pendente:** variância Lamictal (Sec 6.5). Score contínuo de humor descartado por Anders ("valência tá funcionando bem"). |
| **Sprint 4 — Gemini Insights** | ⏸ pendente | Lembrete: prompt deve clamp recomendação a comportamento (sono/exercício/luz), nunca medicação |
| **Sprint 5 — Polish** | ⏸ pendente | Tooltips enriquecidos, summary cards por tab, syncId se valer |

---

## 0. Contexto do Projeto

### Stack atual
- **Frontend:** React + TypeScript + Recharts
- **Backend:** Python (FastAPI), dados via Auto Export (iPhone/Apple Watch)
- **IA:** Gemini para projeções (5d) e análise descritiva
- **Dados:** ~594 dias coletados, janela analítica configurável (7d/30d/90d/1y/all)

### Dados disponíveis por dia (Auto Export)

**Métricas diárias (metrics endpoint):**
- Comprimento do Passo ao Caminhar (cm)
- Contador de Passos (passos)
- Distância de Caminhada + Corrida (km)
- Distúrbios Respiratórios (contagem)
- Energia Ativa (kcal)
- Energia em Repouso (kcal)
- Esforço Físico (kcal/hr·kg) — proxy de MET
- Frequência Cardíaca [Min] (bpm)
- Frequência Cardíaca [Max] (bpm)
- Frequência Cardíaca [Avg] (bpm)
- Frequência Cardíaca em Repouso (bpm)
- Hora de Ficar em Pé da Apple (hr)
- Média de Frequência Cardíaca ao Caminhar (bpm)
- Porcentagem de Assimetria ao Andar (%)
- Saturação de Oxigênio no Sangue (%)
- Taxa Respiratória (contagem/min)
- Temperatura do Pulso ao Dormir Apple (ºC)
- Tempo de Exercício da Apple (min)
- Tempo em Pé do Apple (min)
- Tempo à Luz do Dia (min)
- Teste de Caminhada de Seis Minutos - Distância (m) — frequentemente null
- VO2 Máx (ml/(kg·min)) — esporádico
- Variabilidade da Frequência Cardíaca (ms) — SDNN
- Velocidade de Caminhada (km/hr)
- Velocidade de Corrida (km/hr) — null quando sem corrida

**Sono (sleep endpoint):**
- Total Sleep (hr)
- Asleep Unspecified (hr)
- In Bed (hr) — frequentemente 0.0 (limitação Auto Export)
- Core (hr)
- Deep (hr)
- REM (hr)
- Awake (hr)

**Humor (mood endpoint):**
- Date/Time
- Valência: Agradável / Neutro / Desagradável
- Associações: float contínuo (0-100) — score composto, usar como variável contínua

**Farmacologia (dose log):**
- Substância, Dose (mg), Horário, Nota
- Substâncias ativas: Venvanse, Lexapro, Lamictal, Clonazepam, Bacopa, Piracetam, Magnésio

---

## 1. Estrutura de Navegação Proposta

### Tabs (5 seções narrativas + 1 IA)

```
┌──────────────────────────────────────────────────────────────────┐
│  📊 Panorama  │  🌙 Sono  │  ❤️ Coração  │  🏃 Atividade  │  💊 Farmaco  │  🤖 Insights  │
└──────────────────────────────────────────────────────────────────┘
```

Cada tab responde UMA pergunta:
- **Panorama** → "Como estou no geral?"
- **Sono** → "Como foram minhas noites?"
- **Coração** → "Como está meu sistema nervoso autônomo?"
- **Atividade** → "Estou me movendo bem?"
- **Farmaco** → "A medicação está funcionando?"
- **Insights** → "O que a IA vê nos meus dados?"

**Toolbar superior:** mantém PERÍODO (7d/30d/90d/1y/all), INTERPOLAÇÃO, PROJEÇÃO como está hoje.

---

## 2. Tab: Panorama (ex-Executivo)

### Pergunta: "Como estou no geral?"

### 2.1 Hero Section (mantém)
O header atual ("Neuropsiquiatria, farmacocinética e dados de Apple Watch...") com janela analítica e status dias. Funciona bem, manter.

### 2.2 KPI Cards — Reorganizados em Clusters

Agrupar os cards existentes em 3 clusters visuais com mini-título:

```
┌─ 🌙 SONO & RECUPERAÇÃO ─────────────────────────────────┐
│  Sono Total 7D    │  HRV 7D       │  FC Repouso 7D      │
│  7.15h         ✅  │  25.6ms    ⚡  │  77.8bpm        ⚠   │
│                    │               │                      │
│  SpO2 7D          │  Temp Pulso 7D │                     │
│  —             —   │  35.9°C    ✅  │                     │
└──────────────────────────────────────────────────────────┘

┌─ 🏃 ATIVIDADE & ENERGIA ────────────────────────────────┐
│  Passos 7D        │  Exercício 7D  │  Energia Ativa 7D   │
│  2571          ⚠   │  17min     ⚡  │  336.6kcal      ✅  │
│                    │               │                      │
│  Vel. Marcha 7D   │  Luz do Dia 7D │                     │
│  3.72km/h      ✅  │  —         —   │                     │
└──────────────────────────────────────────────────────────┘

┌─ 💊 HUMOR & MEDICAÇÃO ──────────────────────────────────┐
│  Humor 7D         │  Aderência 7D  │                     │
│  45%           ⚠   │  85%       ✅  │                     │
└──────────────────────────────────────────────────────────┘
```

**Regras dos indicadores de status:**
- ✅ Verde: dentro do baseline pessoal (média ± 1 SD dos últimos 90d)
- ⚠ Amarelo: fora de 1 SD
- ⚡ Vermelho: fora de 2 SD ou fora de range clínico
- — Cinza: sem dados suficientes
- Tooltip no ícone explica o critério ("Baseline pessoal: média 7.3h ± 0.8h nos últimos 90d")

**Novo KPI: "Aderência 7D"** — % de doses registradas vs doses esperadas na semana. Dado já existe no dose log.

### 2.3 Timeline Multi-eixo (mantém)
O chart multi-série atual (FC Repouso, HRV, Sono) funciona bem como overview. Manter, mas:
- Adicionar `syncId="panorama"` pra sincronizar crosshair com os charts abaixo (se houver)

### 2.4 Remover do Panorama
Os charts individuais (HRV isolado, FC Repouso isolado, Energia e Movimento isolado, Passos & Distância isolado) saem do Panorama e vão para suas tabs específicas. O Panorama é resumo, não detalhe.

---

## 3. Tab: Sono 🌙

### Pergunta: "Como foram minhas noites?"

### 3.1 Summary Card
```
┌─ RESUMO DA SEMANA ──────────────────────────────────┐
│  Média: 7.15h │ Profundo: 14% │ REM: 18% │ Eff: —  │
│  Tendência: ▼ 8% vs semana anterior                 │
└─────────────────────────────────────────────────────┘
```

### 3.2 Estágios por Noite (mantém)
O stacked bar chart atual tá bom. Manter com:
- Linha tracejada de referência 7h (já existe)
- Tooltip mostrando proporções %

### 3.3 Cluster Respiratório Noturno (NOVO agrupamento)
Agrupar num card visual único:

**SpO2 + Distúrbios Respiratórios + Temperatura do Pulso**

Esses 3 contam a mesma história: qualidade respiratória noturna e regulação circadiana.
- SpO2: chart de área com banda de referência (já existe)
- Distúrbios Respiratórios: bar chart (já existe)
- Temp. Pulso: line chart COM contexto circadiano

Nota clínica: Temperatura do Pulso ao Dormir está atualmente em "Sinais Vitais" na tab Sono+Fisiologia, desconectada do sono. Mover pra cá — ela SÓ tem sentido clínico ao lado da arquitetura do sono.

### 3.4 Exposição à Luz do Dia (mover pra cá)
Chart de "Tempo à Luz do Dia (min)" — atualmente no Executivo dentro de Energia e Movimento.
Clinicamente pertence ao eixo sono/circadiano: luz diurna é o principal zeitgeber que regula melatonina.
Mostrar como bar chart simples com referência mínima (30min).

### 3.5 Sincronização de Charts
Todos os charts desta tab devem ter `syncId="sono"` para crosshair sincronizado.
Quando o usuário hover no dia 15/abr no chart de estágios, todos os outros charts destacam o mesmo dia.

---

## 4. Tab: Coração ❤️

### Pergunta: "Como está meu sistema nervoso autônomo?"

### 4.1 Summary Card
```
┌─ TÔNUS AUTONÔMICO ──────────────────────────────────┐
│  HRV: 25.6ms (↓12%) │ FC Rep: 77.8bpm (↑3%)        │
│  Balanço simpático/parassimpático: SIMPÁTICO ⚠       │
└─────────────────────────────────────────────────────┘
```

Lógica do balanço: HRV caindo + FC subindo = shift simpático. HRV subindo + FC caindo = shift parassimpático. Cálculo simples com z-scores das duas séries.

### 4.2 HRV (SDNN) — chart principal (já existe)
- SMA 7d em linha sólida
- Faixa de referência pessoal (30d) como banda sombreada
- Manter "Contexto clínico" colapsável

### 4.3 FC Repouso (já existe)
- SMA 7d
- Faixas clínicas: bradicardia <60, normal 60-80, elevado >80

### 4.4 Frequência Cardíaca — Range Diário (já existe — HRRangeChart da Sprint CHART-2)
- Min-Max diário com média, SMA 7d tracejado
- Faixas: bradicardia, normal, taquicardia

### 4.5 FC ao Caminhar (NOVO)
- Campo disponível: "Média de Frequência Cardíaca ao Caminhar (bpm)"
- Atualmente NÃO tem chart
- Proxy de reserva cardíaca: FC caminhar / FC repouso = índice cronotrópico simplificado
- Chart: line com SMA 7d + ratio FC_caminhar/FC_repouso no eixo Y direito

### 4.6 Frequência Respiratória (já existe, mover de Sinais Vitais pra cá)
- Complementa tônus autonômico: respiração lenta = maior tônus vagal
- Chart line com SMA 7d
- Referência clínica: 12-20 rpm normal

### 4.7 Sincronização
`syncId="coracao"` em todos os charts.

---

## 5. Tab: Atividade 🏃

### Pergunta: "Estou me movendo bem?"

### 5.1 Summary Card
```
┌─ ATIVIDADE SEMANAL ─────────────────────────────────┐
│  Passos: 2571/dia │ Exercício: 17min/dia │ MET: 3.2 │
│  Nível: Sedentário ⚠ (meta: >5000 passos)           │
└─────────────────────────────────────────────────────┘
```

### 5.2 Energia e Movimento (reformular)
Atualmente: Energia Total + Exercício (min) + Luz do Dia no mesmo chart.
Proposta: separar.

**Chart 1: Atividade Diária**
- Stacked bar: Energia Ativa (kcal) + Energia em Repouso (kcal)
- Ratio ativa/repouso como percentual — mais informativo que kcal absoluto
- Exercício (min) como linha no eixo Y direito

**Chart 2: Esforço Físico (MET)**
- Campo disponível: "Esforço Físico (kcal/hr·kg)"
- Atualmente NÃO tem chart
- Mais relevante clinicamente que kcal absoluto porque normaliza por peso
- Line chart com SMA 7d + faixas: sedentário <3, leve 3-6, moderado 6-9

### 5.3 Perfil de Marcha (NOVO — agrupar dados existentes)
Card visual unificado com:
- Velocidade de Caminhada (km/h) — já tem chart
- Comprimento do Passo (cm) — disponível, sem chart
- Assimetria ao Andar (%) — disponível, esporádico
- Velocidade de Corrida (km/hr) — disponível quando há corrida

Significância clínica: deterioração de marcha (velocidade caindo, assimetria subindo, passo encurtando) é marcador precoce de declínio cognitivo e risco de queda. Com 594 dias de dados, tendências de longo prazo são visíveis.

Chart: multi-série com velocidade (eixo Y esquerdo), comprimento do passo (eixo Y direito), assimetria como pontos quando disponível.

### 5.4 Passos & Distância (já existe, simplificar)
- Bar chart de passos com SMA 7d
- Remover distância (redundante com passos + comprimento do passo)
- Meta visual: linha tracejada em 5000 ou 10000 (configurável)

### 5.5 VO2 Máx (já existe, manter)
- Esporádico, mas quando disponível é o gold standard de capacidade cardiorrespiratória
- Manter como está com faixas de referência por idade/sexo

### 5.6 Sincronização
`syncId="atividade"` em todos.

---

## 6. Tab: Farmaco 💊

### Pergunta: "A medicação está funcionando?"

Essa tab é a fusão da atual "Humor + Medicação" com novas features de correlação PK.

### 6.1 Header Section (mantém)
"Farmacocinética e estado afetivo" — concentração plasmática sobreposta ao humor.

### 6.2 Humor — Valência ao longo do tempo (mantém)
Chart atual com pontos categóricos (Agradável/Neutro/Desagradável) + Média 7d.

**MELHORIA:** Adicionar um toggle "Score contínuo" que usa o campo Associações (0-100) em vez da valência trinária.
Quando ativado:
- Eixo Y: 0-100 (score contínuo)
- Pontos: tamanho fixo, cor por valência
- SMA 7d calculada sobre o score contínuo

Isso dá resolução muito maior pra correlação downstream.

### 6.3 Mini-charts PK por Substância (mantém)
Os cards de Bacopa, Lamictal, Lexapro, Magnésio, Piracetam, Venvanse estão bons.
Manter badges (na faixa, experimental, sobre).

**MELHORIA:** Adicionar uma linha SMA com janela = 4× meia-vida sobreposta à curva PK.
Visualmente: curva PK original em opacidade reduzida, SMA em linha sólida grossa.

Janelas por substância:
| Substância | t½ estimada | Janela SMA (4×t½) |
| ---------- | ----------- | ----------------- |
| Venvanse   | ~11h        | ~2 dias           |
| Lexapro    | ~30h        | ~5 dias           |
| Lamictal   | ~29h        | ~5 dias           |
| Clonazepam | ~35h        | ~6 dias           |
| Bacopa     | ~5h*        | ~1 dia            |
| Piracetam  | ~5h         | ~1 dia            |
| Magnésio   | ~12h*       | ~2 dias           |

*valores aproximados, ajustar conforme modelo PK atual

### 6.4 Correlação SMA × Humor (NOVO — feature principal)

**Conceito:** Para cada substância, calcular Pearson r entre a SMA(4×t½) da concentração estimada e o score de humor (contínuo, campo Associações).

**Visualização:**

```
┌─ CORRELAÇÃO PK-HUMOR ───────────────────────────────┐
│                                                      │
│  Substância    │ r (lag 0) │ r (lag +1d) │ p-value   │
│  ─────────────┼───────────┼─────────────┼──────────  │
│  Venvanse      │  0.42*    │  0.18       │  0.03     │
│  Lexapro       │  0.11     │  0.08       │  0.61     │
│  Lamictal      │ -0.05     │  0.31*      │  0.04     │
│  Clonazepam    │  0.22     │  0.14       │  0.19     │
│                                                      │
│  * p < 0.05                                          │
│                                                      │
│  ℹ️ Nota: Lexapro opera por neuroplasticidade        │
│  serotonérgica (semanas). Correlação diária não      │
│  captura o efeito real. Vide janela de 30-60d.       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Scatter plot:** Abaixo da tabela, scatter interativo (como o que já existe em Padrões) mas pré-configurado com eixo X = SMA concentração, eixo Y = score humor, seletor de substância.

### 6.5 Correlação de Variância (NOVO — insight para Lamotrigina)

Lamotrigina é mood-stabilizer: o efeito esperado não é humor MAIS ALTO, mas humor MAIS ESTÁVEL.
Calcular desvio padrão rolling (janela 7d) do score de humor e correlacionar com SMA Lamictal.

Hipótese: SMA Lamictal alta → SD humor baixo (r negativo = estabilização).

Chart: dual-axis com SMA Lamictal (eixo Y esquerdo) e SD rolling 7d do humor (eixo Y direito, invertido).

### 6.6 Dose Log + Calendário (mantém)
Funciona bem como está.

### 6.7 Catálogo de Substâncias (mantém)
O botão "Catálogo de substâncias" atual está bom.

---

## 7. Tab: Insights 🤖 (NOVA)

### Pergunta: "O que a IA vê nos meus dados?"

Essa tab substitui/absorve a atual "Descritivo e Insights" e adiciona análise estruturada.

### 7.1 Briefing Semanal (NOVO)

Gemini recebe os dados dos últimos 7 dias e gera um relatório narrativo estruturado.

**Prompt template para o Gemini:**
```
Analise os seguintes dados de saúde dos últimos 7 dias de um homem de 39 anos,
com TDAH e TOC em tratamento farmacológico.

Dados: {json_7d}

Gere um briefing conciso respondendo:

1. SONO: Qualidade geral, tendência, proporção de sono profundo vs REM.
   Flag se sono profundo < 15% ou REM < 20%.

2. AUTONÔMICO: Tendência HRV e FC repouso. Há shift simpático ou
   parassimpático vs semana anterior?

3. ATIVIDADE: Nível de atividade geral. Sedentário/leve/moderado?
   Dias sem exercício?

4. MEDICAÇÃO: Aderência ao regime. Doses faltantes?
   Alguma substância fora da faixa terapêutica?

5. HUMOR: Tendência do score contínuo. Variância alta ou baixa?
   Correlação notável com alguma métrica?

6. ALERTAS: Qualquer combinação atípica nos dados
   (ex: HRV caiu + sono piorou + humor caiu = investigar).

7. RECOMENDAÇÃO: Uma sugestão concreta e acionável para a semana.

Tom: clínico mas acessível. Sem alarmismo. Observações, não diagnósticos.
Máximo 400 palavras.
```

**Visualização:** Card com o texto gerado, timestamp, e botão "Regenerar".

**Frequência:** Gerar automaticamente toda segunda-feira, ou on-demand.

### 7.2 Análise Exploratória Intraday (mantém da tab atual)
"Concentração × Valência (emoções momentâneas)" — mover pra cá.
O scatter PK×humor intraday com seletor de lag horário.

### 7.3 Lag Analysis (mantém)
"Correlação PK×humor por lag horário" — mover pra cá.

### 7.4 Anomaly Detection (FUTURO)
Placeholder para: detecção automática de dias atípicos (z-score > 2 em qualquer métrica).
Lista de "dias de atenção" com link para o detalhe do dia.

---

## 8. Tab: Padrões (absorvida/redistribuída)

A tab Padrões atual tem:
- Matriz de correlação N×N
- Scatter interativo

**Proposta:** Mover a matriz de correlação para a tab Insights (faz mais sentido como ferramenta analítica).
O scatter interativo vai junto.

A correlação PK-específica (SMA × humor) fica na tab Farmaco (seção 6.4).

Isso elimina uma tab, simplificando a navegação de 6 para 5+1:

```
📊 Panorama │ 🌙 Sono │ ❤️ Coração │ 🏃 Atividade │ 💊 Farmaco │ 🤖 Insights
```

---

## 9. Melhorias Transversais

### 9.1 Crosshair Sincronizado (syncId)
Todos os charts dentro de uma tab compartilham `syncId` do Recharts.
Hover em qualquer chart destaca o mesmo dia em todos os outros.

### 9.2 Tooltip Enriquecido
Ao hover num ponto, o tooltip mostra:
- Valor da métrica
- Delta vs dia anterior (↑ / ↓ / =)
- Z-score vs baseline pessoal 90d
- Dose(s) registrada(s) naquele dia (se tab Farmaco ou Panorama)

### 9.3 Critérios de Status (KPI badges)
Documentar e expor os critérios:
- **Baseline pessoal:** média ± SD dos últimos 90 dias
- **Range clínico:** valores fixos da literatura (bradicardia <60, etc.)
- Tooltip no ícone de status explica qual critério está sendo usado

### 9.4 Score Contínuo de Humor
Em todas as correlações e análises, usar o campo "Associações" (float 0-100) como variável contínua.
Manter a valência categórica apenas para visualização no chart de humor (cores dos pontos).

### 9.5 Métricas Derivadas (calcular no adapter/backend)
Novas métricas computadas a partir dos dados brutos:

| Métrica derivada      | Fórmula                             | Uso                          |
| --------------------- | ----------------------------------- | ---------------------------- |
| Índice Cronotrópico   | FC_caminhar / FC_repouso            | Tab Coração                  |
| Ratio Energia Ativa   | E_ativa / (E_ativa + E_repouso)     | Tab Atividade                |
| Sleep Efficiency      | Total_Sleep / In_Bed * 100          | Tab Sono (quando In_Bed > 0) |
| Proporção Profundo    | Deep / Total_Sleep * 100            | Tab Sono                     |
| Proporção REM         | REM / Total_Sleep * 100             | Tab Sono                     |
| Balanço Autonômico    | z(HRV) - z(FC_repouso)              | Tab Coração                  |
| Aderência Medicação   | doses_registradas / doses_esperadas | Tab Farmaco                  |
| Variância Humor 7d    | rolling SD do score contínuo        | Tab Farmaco                  |
| SMA PK por substância | rolling_mean(conc, window=4*t½)     | Tab Farmaco                  |

---

## 10. Ordem de Implementação Sugerida

### Sprint 1 — Reorganização Estrutural
- [ ] Criar nova estrutura de tabs (renomear, reordenar)
- [ ] Mover charts existentes para suas novas tabs (sem criar nada novo)
- [ ] Agrupar KPI cards em clusters no Panorama
- [ ] Implementar syncId por tab
- [ ] Remover charts duplicados do Panorama

### Sprint 2 — Novos Charts & Métricas
- [ ] FC ao Caminhar + Índice Cronotrópico (tab Coração)
- [ ] Esforço Físico / MET (tab Atividade)
- [ ] Perfil de Marcha unificado (tab Atividade)
- [ ] Comprimento do Passo chart (tab Atividade)
- [ ] Ratio Energia Ativa/Repouso (tab Atividade)

### Sprint 3 — Feature PK×Humor
- [ ] SMA com janela 4×t½ por substância (backend)
- [ ] Overlay SMA nos mini-charts PK existentes
- [ ] Tabela de correlação SMA×humor (tab Farmaco)
- [ ] Scatter PK×humor com seletor (tab Farmaco)
- [ ] Toggle score contínuo no chart de humor
- [ ] Correlação de variância para Lamictal

### Sprint 4 — Gemini Insights
- [ ] Briefing semanal: prompt template + endpoint
- [ ] Card de visualização com timestamp
- [ ] Mover análise intraday e lag analysis para tab Insights
- [ ] Mover matriz de correlação e scatter para tab Insights

### Sprint 5 — Polish
- [ ] Tooltips enriquecidos (delta, z-score, doses)
- [ ] Critérios de status documentados e expostos
- [ ] Summary cards por tab
- [ ] Responsive / mobile adjustments

---

## 11. Notas Clínicas para o Modelo

Estas notas ajudam o Claude Code a entender o PORQUÊ das decisões:

- **Lexapro (escitalopram):** SSRI. Steady-state PK em ~5 dias, mas efeito terapêutico em 4-6 semanas. Correlação diária PK×humor NÃO captura o efeito real. Precisa de janela de 30-60d ou variável binária em_uso/não_em_uso.

- **Lamictal (lamotrigina):** Mood-stabilizer. Efeito esperado: MENOR VARIÂNCIA do humor, não humor mais alto. Correlacionar com SD rolling, não com média.

- **Venvanse (lisdexanfetamina):** Estimulante. Efeito quase imediato. Correlação concentração×humor deve aparecer com lag curto (0-2h intraday, lag 0 diário).

- **HRV + FC Repouso:** São espelhos do balanço autonômico. HRV sobe quando FC cai (parassimpático). Mostrar juntos sempre.

- **Temperatura do Pulso ao Dormir:** Marcador circadiano. Só faz sentido ao lado de dados de sono. Valor isolado em "sinais vitais" perde contexto.

- **Luz do Dia:** Zeitgeber principal. Regula melatonina → regula sono. Pertence ao eixo circadiano/sono, não ao eixo atividade.

- **Velocidade de Marcha:** Biomarcador funcional validado. Declínio ao longo de meses/anos é clinicamente significativo (risco cognitivo, risco de queda).

- **In Bed (hr) = 0.0:** Limitação do Auto Export iPhone. Tratar 0 como null/sentinel, NUNCA dividir por zero na eficiência do sono.

---

## 12. Decisões em Aberto

- [ ] Nome final das tabs (emojis? só texto? ícones custom?)
- [ ] Onde colocar Hora de Ficar em Pé / Tempo em Pé: Atividade ou Panorama?
- [ ] Catálogo de substâncias: mantém como modal ou vira sub-tab?
- [ ] Briefing Gemini: automático toda segunda ou só on-demand?
- [ ] Formato do score contínuo de humor: normalizar 0-1 ou manter 0-100?
- [ ] Adicionar notificações/alertas push quando métrica sai do baseline?
