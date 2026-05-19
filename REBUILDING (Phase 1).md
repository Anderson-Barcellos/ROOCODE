# Aba Recuperação — Spec de Refatoração

> Documento orientativo para refatoração via Codex.
> Foco: *o quê* e *por quê*. Implementação concreta (fórmulas, queries, layout final) fica a cargo de quem implementa.

---

## 1. Conceito

A aba responde à pergunta **"Meu corpo se reparou?"**.

Combina, numa única narrativa fisiológica, tudo que mede o organismo **em repouso**: arquitetura e regularidade do sono + fisiologia noturna (SpO₂, FR, temperatura) + tônus autonômico basal (HRV, FC repouso, ABI).

Substitui a aba Sono inteira e absorve os cards autonômicos-basais da aba Coração atual. Os cards de **resposta a esforço** (reserva cardíaca, cronotrópica, recuperação cardio) migram para a aba Capacidade.

### Por que essa fusão faz sentido

Sono e tônus autonômico de repouso não são dois sistemas — são **dois ângulos do mesmo capítulo fisiológico**: como o corpo se restaurou. Separá-los hoje em duas abas força o usuário a fazer a integração mental que o dashboard deveria fazer por ele.

---

## 2. Princípios de design

- **Narrativa descendente**: qualitativo (veredito) → quantitativo sintético (índice composto) → componentes detalhados → contexto longitudinal.
- **Headers em pergunta natural**, não em rótulo de métrica.
- **Sub-headers em frase clínica curta**, não em jargão.
- **Cada painel responde uma sub-pergunta clara**. Nenhuma métrica aparece em dois painéis.
- **Índices compostos vêm com bandeira de confiança** quando algum input está incompleto (padrão já usado pelo Recovery Score atual — preservar).
- **Manter o registro visual atual**: tipografia serif para headlines, palette quente, badges de categoria, veredito em prosa, cards com bordas suaves.

---

## 3. Estrutura da aba (ordem vertical)

### Painel 1 — Headline noturna

**Pergunta**: *"Como foi minha última noite?"*

Reaproveita praticamente intacto o card atual `QUALIDADE DA NOITE` da aba Sono. Score grande, classificação categórica ("Mediana — nem reparou, nem prejudicou"), badge de regime ("Regular" / "Boa" / "Ruim"), seção colapsável `Detalhe médico`.

**Não tocar**: esse card já está calibrado e funciona bem.

---

### Painel 2 — Recovery Index (composto)

**Pergunta**: *"Quanto recuperei?"*

Score 0-100 grande, com barra de componentes mostrando qual está puxando para baixo.

**Conceito**: proxy de **Allostatic Load invertido** — síntese do estresse fisiológico crônico em repouso.

**Componentes (inputs conceituais — pesos a calibrar)**:
- Arquitetura de sono (eficiência + Deep + REM da última noite + média 7d)
- Débito de sono (saldo 7d acumulado vs meta pessoal)
- HRV (SDNN, com referência ao baseline pessoal 30d)
- FC de repouso (delta vs baseline pessoal)
- Temperatura do pulso noturna (desvio da baseline pessoal)

**Referências para o Claude Code consultar**:
- McEwen & Seeman 1999 (formulação original de Allostatic Load)
- Juster, McEwen & Lupien 2010 (revisão de operacionalizações)
- Implementações wearable-friendly modernas tipo Whoop Recovery, Garmin Body Battery (proprietárias, mas o conceito é público)

**Diretrizes de implementação**:
- Começar com combinação linear de z-scores pessoais (cada componente normalizado contra a própria baseline 30-90d, não contra populacional).
- Inverter os componentes "ruins quando altos" (FC repouso, débito sono, temp pulso elevada).
- Marcar **confiança parcial** quando inputs faltam — não calcular sobre 1-2 inputs, faz mais mal que bem.
- Bandeira "exploratório" enquanto baseline pessoal não atingiu N mínimo (sugestão: 30d).

---

### Painel 3 — Sono: arquitetura e regularidade

**Pergunta**: *"Como dormi?"*

Funde os atuais `Eficiência e arquitetura` + `Débito de sono cumulativo` + adiciona dois índices novos.

**Componentes do painel**:

(a) **Stacked bars de arquitetura** (já existe, manter): Deep + Core + REM + Awake por noite, eixo esquerdo em horas; curva de eficiência no eixo direito em %. Linha de meta 7,5h e alvo de eficiência 85%.

(b) **Sleep Regularity Index** (NOVO) — sub-card lateral. Escala 0-100. Mede *consistência* dos horários de sono ao longo dos dias. Mais robusto e clinicamente relevante que "média de horas dormidas".

  Referência: **Phillips et al., 2017, *Scientific Reports*** — "Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing". Validado contra mortalidade em coortes posteriores (Windred et al., 2024).

  Inputs: onset e offset diários nos últimos 7-14 dias.

(c) **Social Jet Lag** (NOVO) — sub-card lateral. Diferença em horas entre midsono dos dias úteis e midsono de fim de semana.

  Referência: **Roenneberg / Munich ChronoType Questionnaire (MCTQ)** — Wittmann et al., 2006; Roenneberg et al., 2019.

  Inputs: onset e offset diários, separados por dia da semana. Anders já tem o sinal forte disso no card atual "Semana × Fim de semana" do Panorama — aqui formaliza como índice único.

(d) **Débito de sono** — agora vira **rodapé** desse painel, não card separado. Curvas 7d e 30d como hoje, mas compactadas. Faixa rosa de zona crítica preservada.

**Veredito clínico curto** acima do painel, padrão atual.

---

### Painel 4 — Fisiologia da noite

**Pergunta**: *"Como meu corpo se comportou enquanto eu dormia?"*

Funde os atuais `SpO₂` + `Distúrbios Respiratórios` + `Sinais Vitais` num painel só.

**Layout sugerido**: grid 2x2 compacto com micro-gráficos.
- SpO₂ (linha contínua, faixas operacionais como hoje)
- Frequência respiratória + variabilidade SD 7d (como hoje)
- Wrist temp deviation (como hoje)
- IAH proxy / Distúrbios respiratórios (como hoje)

**Acréscimo**: **amplitude diária da temperatura do pulso** — diferença entre pico diurno e nadir noturno. É um marcador de robustez circadiana e também alimenta o índice de Cronobiologia no Panorama. Pode entrar como uma linha adicional no painel de wrist temp, ou como sub-card.

**Disclaimer atual a preservar**: "este painel não fecha diagnóstico de apneia e não substitui PSG/laudo médico".

---

### Painel 5 — Autonômico em repouso

**Pergunta**: *"Meu sistema nervoso autônomo tá em equilíbrio?"*

Funde os atuais `Autonomic Balance Index` + `Variabilidade da Frequência Cardíaca` + `Frequência cardíaca · Range diário` numa narrativa única.

**Componentes**:

(a) **ABI** como leitura geral no topo do painel — z-score com bandas, igual ao atual. Veredito clínico em prosa.

(b) **HRV (SDNN)** com bandas SD 7d (dispersão pessoal) + bandas populacionais por idade. Manter o gráfico atual da aba Coração.

(c) **FC de repouso** — range diário Min-Max-Avg, SMA 7d em linha. Manter o atual.

(d) **Cardiovascular Age** (NOVO) — sub-card lateral interpretativo. Estimativa de "idade cardiovascular" a partir de FC repouso + HRV + VO₂ + idade cronológica.

  Referência: vários modelos públicos. Sugestões para o Claude Code consultar:
  - Jensen et al., 2013 (resting HR e mortalidade)
  - Nauman et al., 2017 (fitness age, baseado em VO₂max equation)
  - Implementação simples possível: comparar HRV/FC do usuário contra normativas etárias e devolver "idade equivalente".

  **IMPORTANTE**: marcar explicitamente como **estimativa com intervalo amplo de confiança**. É leitura interpretativa, não diagnóstica. Tipo de métrica que gera engajamento mas precisa de honestidade epistêmica — Anders preza isso (vide o tom "exploratório" usado nos lags da aba Insights).

---

### Painel 6 — Veredito da semana

**Pergunta**: *"Quanto a semana me reparou?"*

Painel-síntese de fechamento.

**Conteúdo**:
- Frase clínica curta com tendência (melhora / piora / estável) e foco recomendado para a próxima semana.
- Mini-gráfico de Recovery Index nos últimos 30d com banda de confiança.
- Highlights: melhor e pior noite da semana (links para o calendário de doses na aba Farmaco, se possível — porque carga farmacológica diferente em dias diferentes é insight cruzado relevante).

---

## 4. Migração: o que sai, o que entra, o que muda

### Da aba Sono atual

| Card atual | Destino |
|---|---|
| `Leitura rápida` (texto cinza) | Absorver no Painel 6 como abertura, ou eliminar |
| `Qualidade da noite` (score 45) | **Painel 1** (intacto) |
| `Eficiência e arquitetura` | **Painel 3** (compõe) |
| `Débito de sono cumulativo` | **Painel 3** (rodapé, não card próprio) |
| `SpO₂` | **Painel 4** (compõe) |
| `Distúrbios Respiratórios` | **Painel 4** (compõe) |
| `Sinais Vitais` (FR + wrist temp) | **Painel 4** (compõe) |

### Da aba Coração atual

| Card atual | Destino |
|---|---|
| `Autonomic Balance Index` | **Painel 5** (compõe) |
| `Variabilidade da Frequência Cardíaca` | **Painel 5** (compõe) |
| `Frequência cardíaca · Range diário` | **Painel 5** (compõe) |
| `Reserva Cardíaca` | **MIGRA para aba Capacidade** |
| `Resposta Cronotrópica` | **MIGRA para aba Capacidade** |
| `Recuperação Cardíaca` | **MIGRA para aba Capacidade** (vira componente do Functional Capacity Index quando tiver dados) |

### Painéis e componentes novos

| Novidade | Painel | Status |
|---|---|---|
| Recovery Index (composto 0-100) | Painel 2 | Implementar (orientação na seção 3) |
| Sleep Regularity Index | Painel 3 | Implementar (Phillips 2017) |
| Social Jet Lag formalizado | Painel 3 | Implementar (MCTQ / Roenneberg) |
| Amplitude diária temp pulso | Painel 4 | Calcular a partir de dado já existente |
| Cardiovascular Age | Painel 5 | Implementar com IC explícito |
| Recovery Index histórico 30d | Painel 6 | Derivado do Painel 2 |

---

## 5. Notas de implementação

### Consistência com o resto do dashboard

- **Mesmo padrão visual** dos cards atuais: badge de seção em maiúsculas pequenas, pergunta-headline em serif, veredito em prosa cinza, gráfico abaixo, contexto colapsável (`▶ Contexto clínico`).
- **Mesmas bandas e zonas de cor** das versões atuais (verde/amarelo/vermelho para ranges, salmão para zonas críticas, etc.).
- **Mesma forma de marcar robustez**: badge `● Robusto · N dias válidos`, `● Exploratório · N/M dias`, `⚠ Coletando`.
- **Mesma cautela epistêmica**: índices novos devem aparecer com `experimental` ou `preliminar` enquanto não houver baseline pessoal madura.

### Cuidados

- **Não recalcular HRV / FC repouso / arquitetura em vários módulos** — buscar do mesmo serviço/calculador. Se o Recovery Index e o Painel 5 usam HRV, vem do mesmo lugar.
- **Baselines pessoais 30-90d** são o referencial preferido para z-scores. Populacionais ficam como contexto, não como linha de corte clínica.
- **Bandeira de confiança parcial** quando inputs faltam — preservar o padrão do Recovery Score atual ("3/35 dias completos · 9%").
- **Linguagem clínica honesta**: nunca "diagnóstico", sempre "estimativa", "indicativo", "sugere acompanhamento".

### Acessibilidade aos dados

O Claude Code deve verificar que os seguintes campos já estão sendo coletados/calculados antes de cada painel:

- Painel 3 (SRI, SJL): timestamps de onset/offset de sono diário.
- Painel 4 (amplitude temp): temp pulso diurna + noturna ou pelo menos amplitude derivada.
- Painel 5 (Cardiovascular Age): VO₂ estimado (já existe), HRV SDNN (já existe), FC repouso (já existe), idade do usuário (constante).

Se algum input faltar, o painel/índice deve **se degradar graciosamente** (mostrar parcial, marcar exploratório) — não quebrar.

---

## 6. Critério de pronto

A refatoração da aba Recuperação está pronta quando:

1. A pergunta "Meu corpo se reparou?" pode ser respondida em **15 segundos** olhando só o Painel 1 + Painel 2.
2. Nenhuma métrica aparece em dois painéis da mesma aba.
3. Nenhuma métrica está repetida entre Panorama e Recuperação — Panorama mostra **índices**, Recuperação mostra **componentes**.
4. Os índices novos (Recovery Index, SRI, SJL, Cardiovascular Age) têm bandeira de confiança visível.
5. O usuário entende, sem ler documentação, que sono e autonômico-basal são *o mesmo capítulo fisiológico*.

---

*Próximas specs: `capacidade-spec.md` e `panorama-spec.md`, após validação desta.*
