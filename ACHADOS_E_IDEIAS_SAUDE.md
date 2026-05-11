# RooCode — Achados e Ideias de Saúde

> Auditoria exploratória de produto/código em 2026-05-11.
> Objetivo: mapear o repositório atual, identificar redundâncias e propor cards/derivações úteis para saúde longitudinal usando dados do Apple Watch, humor, medicação e forecast.

## 1. Resumo executivo

O RooCode já deixou de ser um dashboard de métricas cruas e virou um sistema bem interessante de **fenotipagem longitudinal pessoal**: sono, humor, farmacocinética, atividade, sistema autonômico e previsão IA conversam entre si.

A principal oportunidade agora não parece ser “adicionar mais gráfico por adicionar”. O maior ganho clínico/UX está em:

1. **Transformar métricas soltas em sinais compostos acionáveis**.
2. **Reduzir redundância visual** entre charts que repetem a mesma história.
3. **Criar cards de decisão diária**, não apenas séries históricas.
4. **Separar claramente observação, hipótese e alerta**.
5. **Aproveitar campos já coletados, mas subexplorados**, como `physicalEffort`, `walkingStepLengthCm`, `standingMinutes`, `restingEnergyKcal`, `daylightMinutes`, `distanceKm`, `runningSpeedKmh` e `sixMinuteWalkMeters`.

Minha sugestão de próxima sprint: **Sprint D — Daily Health Decision Layer**, com 3 a 5 cards de alto valor, antes de abrir mais uma leva grande de gráficos.

## 2. Mapa real do projeto

### Stack e fluxo

- **Backend:** FastAPI em `main.py`, porta 8011.
- **Frontend:** React 19 + Vite + TypeScript + Tailwind + Recharts + TanStack Query.
- **Pipeline:** iPhone AutoExport → FastAPI → React/Vite → Apache em `/health/`.
- **Fonte de snapshots:** `useRooCodeData` combina `/sleep`, `/metrics`, `/mood`, `/farma/doses` e `/farma/regimen`.
- **Derivações centrais:** `aggregation.ts`, `recovery-score.ts`, `autonomic-balance.ts`, `heart-rate-reserve.ts`, `chronotropic-response.ts`, `hrv-variability.ts`, `sleep-debt.ts`, `personal-baselines.ts`, `intraday-correlation.ts`.

### Endpoints principais

- **Sono:** `GET/POST /sleep`.
- **Métricas Apple Watch:** `GET/POST /metrics`.
- **Humor:** `GET/POST /mood`.
- **Farmacocinética:** `/farma/substances`, `/farma/regimen`, `/farma/doses`, `/farma/concentration-series`.
- **Interpolação:** `POST /interpolate`.
- **Forecast:** `POST /forecast`, `/forecast/summary`, `/forecast/accuracy`, `/forecast/report`, `/forecast/reports`.

## 3. Inventário das abas atuais

### Panorama

Hoje contém:

- **KPIs executivos:** recuperação, sono, HRV, FC repouso, FR, temperatura de pulso, passos, exercício, energia ativa, VO2, velocidade de marcha, humor.
- **WeekdayWeekendCard:** diferença dia útil vs fim de semana.
- **ForecastAccuracyCard:** qualidade histórica do forecast.
- **RecoveryScoreChart:** score composto 0-100.

Avaliação:

- É a aba mais próxima de um cockpit clínico.
- O `RecoveryScoreChart` é um avanço grande, mas ainda é mais retrospectivo do que prescritivo.
- O Panorama poderia virar a aba de “o que faço hoje?”.

### Farmaco

Hoje contém:

- **MoodTimeline.**
- **PKMedicationGrid.**
- **PKHumorCorrelation.**
- **DoseLogger.**
- **DoseCalendarView.**
- **MedicationCatalogEditor.**

Achado importante:

- `CLAUDE.md` menciona `PKStandardDoseComparison`, mas esse arquivo não apareceu no diretório atual de charts nem no consumo real do `App.tsx`. Isso parece documentação stale ou arquivo removido. Vale revisar antes de considerar essa feature ativa.

Avaliação:

- É a aba mais madura metodologicamente: pré-registro de janela, lag sweep simétrico, FDR e controles negativos.
- Existe risco de excesso cognitivo: muitos gráficos PK podem responder perguntas parecidas.
- O maior ganho seria transformar correlações em **estado do regime**: cobertura, falha, rebote, janela de vulnerabilidade.

### Sono

Hoje contém:

- **SleepStagesChart.**
- **SleepDebtChart.**
- **Spo2Chart.**
- **RespiratoryDisturbancesChart.**
- **VitalSignsTimeline.**

Avaliação:

- É uma aba clinicamente rica.
- O risco é fragmentação: arquitetura do sono, débito, SpO2, distúrbios respiratórios, FR e temperatura podem virar muita informação sem síntese.
- Falta um card integrador de **qualidade de noite**.

### Coração

Hoje contém:

- **AutonomicBalanceChart.**
- **HrvVariabilityChart.**
- **HRRangeChart.**
- **HeartRateReserveChart.**
- **ChronotropicResponseChart.**
- **CardioRecoveryChart.**

Avaliação:

- A aba ficou forte depois da Sprint M7.
- É a área com maior risco de redundância, porque vários cards contam versões da mesma história autonômica: HRV, RHR, ABI, HRR, resposta cronotrópica e recuperação cardio.
- Pode ser excelente para análise aprofundada, mas o Panorama deveria receber só o sinal consolidado.

### Atividade

Hoje contém:

- **ActivityBars:** energia ativa, exercício e luz do dia.
- **StepsChart:** passos e distância.
- **Vo2MaxChart:** VO2 estimado por Uth-Sørensen usando RHR.
- **WalkingVitalityChart:** velocidade de marcha, FC ao caminhar e assimetria.

Avaliação:

- A aba tem dados valiosos, mas ainda há campos pouco explorados.
- `physicalEffort`, `walkingStepLengthCm`, `standingMinutes`, `runningSpeedKmh` e `sixMinuteWalkMeters` estão no pipeline, mas não são protagonistas.
- Há potencial grande para derivar **eficiência locomotora**, **carga de esforço** e **sinal psicomotor**.

### Insights

Hoje contém:

- **MoodDriverBoard.**
- **MoodLagHypothesisLab.**
- **CorrelationHeatmap.**
- **SleepDebtHrvCard.**
- **ScatterCorrelation.**
- **PKMoodScatterChart.**
- **PkRemSuppression.**
- **LagCorrelationChart.**

Avaliação:

- É uma aba poderosa, mas pode ficar com cara de “laboratório estatístico”.
- Faz sentido manter como área exploratória, com avisos de causalidade e readiness.
- Para uso diário, parte dos melhores achados deveria subir para o Panorama como cartões resumidos.

## 4. Achados de redundância e limpeza

### 4.1. Documentação divergente

- `CLAUDE.md` lista `PKStandardDoseComparison` como componente ativo em Farmaco.
- O arquivo não apareceu em `frontend/src/components/charts` e não está renderizado no `App.tsx` atual.
- Recomendo checar histórico/git antes de decidir se é:
  - feature removida e doc stale;
  - arquivo perdido;
  - componente que deveria ser recriado.

### 4.2. Componente órfão provável

- `ForecastSignalsPanel.tsx` aparece como componente existente, mas a busca apontou ausência de consumidores atuais.
- Como o relatório IA verbose virou modal fullscreen, esse painel pode ter ficado obsoleto.
- Recomendo uma sprint pequena de limpeza: confirmar zero consumers, decidir se remove ou reintegra dentro do modal.

### 4.3. Métricas cruas demais no Panorama

O Panorama exibe muitos KPIs isolados. Isso é útil, mas pode diluir a pergunta principal: “como estou hoje?”.

Sugestão:

- Manter KPIs, mas adicionar um card superior de síntese:
  - **Pronto para carga?**
  - **Risco de fadiga?**
  - **Sono foi limitante?**
  - **Autonômico está compensado?**

### 4.4. Coração com muita sobreposição fisiológica

Possível redundância parcial entre:

- `AutonomicBalanceChart`.
- `HrvVariabilityChart`.
- `HRRangeChart`.
- `HeartRateReserveChart`.
- `ChronotropicResponseChart`.
- `CardioRecoveryChart`.

Não recomendo remover agora. Recomendo reorganizar:

- **Camada 1:** ABI como resumo.
- **Camada 2:** HRV/RHR/HR range como explicação.
- **Camada 3:** HRR e resposta cronotrópica como resposta ao esforço.

### 4.5. Dados coletados mas subutilizados

Campos com potencial ainda pouco usado:

- `physicalEffort`.
- `walkingStepLengthCm`.
- `standingMinutes`.
- `restingEnergyKcal`.
- `distanceKm` além do tooltip de passos.
- `runningSpeedKmh`.
- `sixMinuteWalkMeters`.
- `recordCount` e `placeholderRestingEnergyRows` como qualidade de dados.

## 5. Novos cards recomendados por prioridade

## Prioridade 1 — Alto valor, baixo/médio esforço

### 5.1. Card “Hoje: usar energia ou poupar?”

Aba sugerida: **Panorama**.

Pergunta que responde:

- Hoje parece um dia bom para treinar/trabalhar forte, ou convém reduzir carga?

Inputs:

- Recovery Score.
- ABI.
- Sono total/eficiência.
- Sleep debt 7d.
- HRV z-score.
- RHR z-score invertido.
- Mood valence.
- Temperatura de pulso deviation.

Saída:

- `Carga liberada`, `Carga moderada`, `Poupar`, `Investigar`.

Valor clínico:

- Transforma 8 métricas em uma recomendação operacional simples.

Cuidado:

- Não chamar de diagnóstico; chamar de “sinal de prontidão”.

### 5.2. Card “Limitante principal da recuperação”

Aba sugerida: **Panorama**, junto do `RecoveryScoreChart`.

Pergunta que responde:

- Se o recovery caiu, foi por sono, autonômico, humor ou débito acumulado?

Inputs:

- Componentes já calculados em `recovery-score.ts`: HRV, sleepEff, RHR, sleepDebt, mood.

Saída:

- Ranking dos 1-2 componentes que mais puxaram o score para baixo.

Valor clínico:

- Evita olhar um score 48/100 sem saber o motivo.
- Implementação tende a ser barata porque os componentes já existem.

### 5.3. Card “Noite boa, média ou ruim?”

Aba sugerida: **Sono** e resumo no **Panorama**.

Pergunta que responde:

- A noite foi reparadora ou fisiologicamente ruim?

Inputs:

- Sleep efficiency.
- Deep sleep.
- REM.
- Awake time.
- Respiratory disturbances.
- SpO2.
- FR noturna.
- Wrist temp deviation.

Saída:

- Score simples 0-100 ou classes: `reparadora`, `fragmentada`, `respiratória ruim`, `alerta autonômico`.

Valor clínico:

- Integra os cinco charts da aba Sono em uma leitura diária.

### 5.4. Card “Dose coverage / janela de vulnerabilidade”

Aba sugerida: **Farmaco** e resumo no **Panorama**.

Pergunta que responde:

- Houve buraco farmacocinético relevante nas últimas 24-48h?

Inputs:

- Dose log.
- Regimen fallback.
- Série PK por substância.
- Humor valence nos dias seguintes.

Saída:

- `Cobertura adequada`, `queda de cobertura`, `janela de vulnerabilidade`, `dose não registrada`.

Valor clínico:

- Mais acionável que r/p-value para uso cotidiano.
- Conecta diretamente ao achado clínico já pré-registrado: perda de efeito ~48h após falha de dose.

### 5.5. Card “Consistência circadiana”

Aba sugerida: **Sono** ou **Panorama**.

Pergunta que responde:

- O horário/rotina está estável ou bagunçado?

Inputs possíveis:

- Datas/horários de sono se disponíveis no AutoExport.
- Daylight minutes.
- Exercise minutes.
- Mood.
- Sleep total/efficiency.

Se horário de início/fim do sono não estiver disponível atualmente:

- Começar com proxy: luz do dia + exercício + estabilidade de sono total.

Valor clínico:

- Para humor/energia, regularidade costuma ser tão importante quanto duração total.

## Prioridade 2 — Muito úteis, mas exigem mais desenho metodológico

### 5.6. Card “Carga fisiológica diária”

Aba sugerida: **Atividade**.

Pergunta que responde:

- A carga física do dia foi leve, moderada ou alta para o corpo?

Inputs:

- `physicalEffort`.
- activeEnergyKcal.
- exerciseMinutes.
- steps.
- walkingHeartRateAvg.
- HRR.
- RHR/HRV no dia seguinte.

Saída:

- Carga diária + “resposta no dia seguinte”.

Valor clínico:

- Diferencia “andei bastante mas leve” de “pouco volume com alto esforço fisiológico”.

### 5.7. Card “Eficiência locomotora”

Aba sugerida: **Atividade**.

Pergunta que responde:

- Estou andando com boa eficiência ou com custo cardíaco alto?

Inputs:

- walkingSpeedKmh.
- walkingHeartRateAvg.
- walkingStepLengthCm.
- walkingAsymmetryPct.
- restingHeartRate.

Derivações possíveis:

- FC ao caminhar ajustada por velocidade.
- Comprimento do passo vs velocidade.
- Assimetria como penalizador.

Valor clínico:

- Pode capturar fadiga, sedação, dor, descondicionamento ou efeito medicamentoso.

### 5.8. Card “Sinal precoce de doença/inflamação”

Aba sugerida: **Sono** ou **Panorama**.

Pergunta que responde:

- Há um padrão compatível com início de doença, inflamação ou estresse fisiológico?

Inputs:

- Wrist temp deviation.
- Respiratory rate.
- FR variability.
- RHR acima da baseline.
- HRV abaixo da baseline.
- SpO2/respiratory disturbances.

Saída:

- `sem sinal`, `atenção`, `alerta fisiológico`.

Valor clínico:

- Muito útil para Apple Watch, mas precisa thresholds conservadores para evitar falso alarme.

### 5.9. Card “Ativação psicomotora vs humor”

Aba sugerida: **Insights** e depois **Panorama** se ficar bom.

Pergunta que responde:

- Movimento antecipa melhora/piora de humor ou só acompanha?

Inputs:

- Steps.
- Distance.
- Exercise minutes.
- Daylight minutes.
- Mood valence.
- Lag 0..3 dias.

Valor clínico:

- Pode diferenciar apatia/fadiga/depressão de simples variação de rotina.

Cuidado:

- Usar lags negativos como controle, igual PK×Humor, para evitar narrativa causal falsa.

### 5.10. Card “Sono REM vs medicação / alerta de supressão”

Aba sugerida: **Farmaco** ou **Sono**.

Estado atual:

- Já existe `PkRemSuppression`, mas o próprio backlog fala em adicionar lag toggle e AUC trapezoidal precisa.

Melhoria:

- Trocar Cmax simples por AUC noturna ou concentração média durante janela de sono.
- Adicionar toggle lag 0/+1.
- Mostrar efeito por substância.

Valor clínico:

- Excelente para ver impacto de estimulantes/ISRS/benzodiazepínicos na arquitetura do sono.

## Prioridade 3 — Bons, mas eu deixaria para depois

### 5.11. Card “Gasto energético total aproximado”

Inputs:

- activeEnergyKcal.
- restingEnergyKcal.
- steps/distance.

Valor:

- Útil para balanço energético, peso e fadiga.

Por que depois:

- `restingEnergyKcal` pode ter linhas placeholder e precisa checagem de qualidade (`placeholderRestingEnergyRows`).

### 5.12. Card “Treino real vs incidental”

Inputs:

- exerciseMinutes.
- activeEnergy.
- steps.
- physicalEffort.
- runningSpeedKmh.

Valor:

- Diferencia exercício planejado de movimentação leve.

Por que depois:

- Requer bom entendimento dos dados do AutoExport para não superinterpretar.

### 5.13. Card “6-minute walk / capacidade funcional”

Inputs:

- sixMinuteWalkMeters.

Valor:

- Clinicamente forte quando existe.

Por que depois:

- Provavelmente raro/ausente. Melhor tratar como opportunistic card: aparece só quando houver dados.

## 6. O que eu eliminaria ou fundiria

Eu não sairia deletando grandes charts agora, mas faria uma etapa de “curadoria”.

### Candidatos a remover se forem realmente órfãos

- **`ForecastSignalsPanel.tsx`:** parece sem consumer atual. Remover ou reintegrar no modal de Análise IA.
- **Documentação de `PKStandardDoseComparison`:** corrigir `CLAUDE.md` ou restaurar componente se ele deveria existir.

### Candidatos a fundir ou rebaixar na UI

- **Vários charts autonômicos:** manter na aba Coração, mas criar um resumo superior e esconder detalhes em accordions.
- **ScatterCorrelation genérico:** útil para exploração, mas talvez menos útil no dia a dia. Pode ficar em Insights como laboratório.
- **PKMoodScatterChart + LagCorrelationChart + PKHumorCorrelation:** revisar se todos continuam respondendo perguntas distintas. Se não, consolidar em “PK × humor lab”.
- **ActivityBars + StepsChart:** ambos mostram atividade; manter se ActivityBars continuar carregando luz/exercício/energia, mas evitar que passos apareçam repetidos como mensagem principal.

## 7. Ideias de reorganização de UX

### 7.1. Separar “uso diário” de “laboratório”

Proposta:

- **Panorama:** decisão diária e alertas.
- **Sono:** investigação da noite.
- **Coração:** fisiologia autonômica detalhada.
- **Atividade:** carga, marcha e condicionamento.
- **Farmaco:** adesão, PK e hipóteses medicação-humor/sono.
- **Insights:** exploração estatística, scatter, lags, controles, IA.

### 7.2. Criar cards com três camadas

Para cada card novo:

1. **Headline:** “bom / atenção / ruim”.
2. **Motivo:** 1-3 drivers principais.
3. **Detalhe:** gráfico expandido ou tooltip.

Isso reduz fadiga cognitiva.

### 7.3. Padronizar confiança dos sinais

Muitos charts já usam `DataReadinessGate`. O próximo passo seria todo card ter:

- `dados insuficientes`.
- `exploratório`.
- `robusto`.
- `inclui interpolação`.
- `inclui forecast`.

## 8. Backlog técnico-metodológico recomendado

### 8.1. Config pessoal centralizada

Hoje há hardcodes importantes:

- Peso corporal: frontend 91 kg vs backend 70 kg em pontos PK.
- HRmax: 182 bpm hardcoded por idade.
- Sexo/faixa etária para bandas VO2/HRV.

Criar algo como `user-profile.ts`/backend config:

- peso.
- idade/data de nascimento.
- sexo biológico para bandas populacionais.
- HRmax medido ou estimado.
- timezone.

Valor:

- Evita divergências silenciosas e melhora todos os cálculos.

### 8.2. Política unificada de interpolação

O roadmap de maturação já apontou isso. A base atual tem múltiplos usos de `interpolated`/`forecasted`.

Recomendação:

- Definir uma política por tipo de consumo:
  - visualização descritiva;
  - derivação composta;
  - correlação estatística;
  - forecast.
- Mostrar `n_real / n_total` em correlações.

### 8.3. Auditoria de qualidade de dados

Criar um card técnico, talvez discreto, com:

- dias reais vs interpolados;
- cobertura por métrica;
- campos ausentes;
- `recordCount`;
- `placeholderRestingEnergyRows`;
- qualidade de mood.

Valor:

- Ajuda a não confiar demais em gráfico bonito com dado fraco.

## 9. Sprint D sugerida

### Sprint D — Daily Health Decision Layer

### Objetivo

Transformar dados já existentes em 4 cards acionáveis de uso diário, sem expandir demais o backend.

### Escopo sugerido

1. **Panorama: “Hoje: usar energia ou poupar?”**
2. **Panorama: “Limitante principal da recuperação”**
3. **Sono: “Noite boa/média/ruim”**
4. **Farmaco: “Dose coverage / janela de vulnerabilidade”**
5. **Limpeza:** resolver `ForecastSignalsPanel` órfão e divergência `PKStandardDoseComparison` na documentação.

### Por que essa ordem

- Aproveita muito código já existente.
- Melhora a tomada de decisão diária.
- Evita virar “cem gráficos sem síntese”.
- Fecha pequenas dívidas documentais junto com feature útil.

## 10. Perguntas para decidir com Anders antes de codar

1. **O RooCode deve priorizar alerta conservador ou sensibilidade alta?**
   - Conservador: menos falsos alarmes.
   - Sensível: detecta mais cedo, mas incomoda mais.

2. **O Panorama deve ser mais médico ou mais coaching diário?**
   - Médico: sinais, hipóteses, caveats.
   - Coaching: “faz isso hoje”, “pega leve”, “vai treinar”.

3. **Recovery Score deve exigir 5/5 inputs ou aceitar score parcial?**
   - 5/5 é rigoroso, mas pode ficar esparso.
   - Parcial é mais contínuo, mas precisa confidence score.

4. **Quer manter Insights como laboratório completo ou simplificar?**
   - Eu manteria, mas com organização em seções/accordions.

5. **Farmaco deve focar mais em estatística ou adesão/cobertura?**
   - Para uso diário, adesão/cobertura parece mais útil.
   - Para pesquisa pessoal, estatística continua valiosa.

## 11. Minha recomendação final

Não adicionaria mais 10 charts agora, tchê. O projeto já tem bastante matéria-prima. Eu faria uma sprint curta e cirúrgica para criar uma **camada de interpretação diária**, usando os sinais compostos já disponíveis.

A sequência que eu faria:

1. Corrigir pequenas divergências/órfãos.
2. Centralizar perfil pessoal mínimo: peso, idade, HRmax, timezone.
3. Criar card de prontidão diária.
4. Criar card de limitante da recuperação.
5. Criar card de qualidade integrada do sono.
6. Criar card de cobertura farmacocinética.
7. Só depois voltar para novos gráficos exploratórios.

Isso deve deixar o RooCode menos “painel de avião” e mais “copiloto clínico pessoal”.
