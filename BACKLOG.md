# RooCode — Backlog

App em modo manutenção. Cada ticket = 1 commit focado. Sem sprint formal.
Histórico arquivado em `docs/HISTORY/`.

---

## Pendentes

### Cognição Diária — blindagem da régua + análise (pós-auditoria 2026-06-16)

Auditoria da implementação Codex contra a spec original: fidelidade alta, P0 todos
verdes. Estes itens são reforços que a spec não cobriu ou deixou em aberto.

- **[P1] Reliable Change Index pós-baseline** — banda de mudança confiável após as
  14 sessões de baseline. É o que transforma a série temporal em sinal interpretável
  e testa de fato a hipótese central (desacoplamento humor×cognição). Era P1 da spec.

- **[P2] Snapshot do dia vs baseline no fechamento** — a tela de fechamento mostra os
  números do dia mas não compara com a média do baseline (§8.2 da spec ficou parcial).

- **[P2] Consistência de medição** — registrar device/input method por sessão (latência
  de toque mobile ≠ clique desktop afeta o PVT) e usar `temperature: 0` no scoring se a
  API permitir, pra reduzir jitter de pontuação do mesmo texto.

**Decisões do Codex a ratificar** (perguntas em aberto §13 que ele resolveu sozinho):
baseline=14 (piso de "2–3 semanas"); persistir timings trial-a-trial (era "decisão do
usuário"); `primary_score` do digit = backward; listas de fluência (`F,P,M,C,T,S,L,R` /
categorias com produtividades heterogêneas — revisar "profissões"/"objetos de cozinha").

- **Bug calibração `RESP_DIST_CAP`** — `sleep-quality-score.ts` usa cap=30 (escala
  AHI clínico) que satura o componente respiratório na faixa real (0–4,9), deixando-o
  cego. Recalibrar (cap realista ~5–8 ou percentil pessoal). Trade-off: muda a
  semântica do score histórico de qualidade — commit próprio, com nota de
  comparabilidade temporal. O índice dedicado Respiração Noturna já contorna isso.

---

## Concluídos recentes

- **2026-06-16** — **Cognição: PVT × PK Venvanse + carimbo de scoring** (tickets #1+#2 da
  auditoria). Helper puro `Cognition/pk_enrichment.py` calcula a concentração estimada de
  Venvanse no horário da sessão reusando `Farma.math` (dose real do dose_log ≤24h, fallback
  `vyvanse_taken_at` HH:MM), sem acoplar `Farma.router`. `/complete` carimba `pk_context`
  {venvanse_ng_ml, hours_since_dose, dose_mg, dose_source} + `scoring_model`/`embedding_model`
  (blindagem contra drift de LLM). Frontend: `PKCognitionScatterChart` reusa
  `inferIntradayCorrelation` (Pearson/Spearman+permutation+IC95%) com toggle eixo X
  (concentração ↔ horas desde a dose) e métrica Y (lapses ↔ RT mediana); `DataReadinessGate`
  com `pkCognitionScatter` (robustMin=10). Retrocompat: sessões antigas → null. Gates verdes
  (unittest 9/9, tsc, test:unit, lint, build); QA visual r=-0.82 p=0.006 n=10. Commits
  bae3c58, 7ead5b8.

- **2026-06-15** — **Nova seção Cognição Diária (P0 funcional)**. Entrou um módulo
  independente de aferição cognitiva longitudinal com persistência server-side e
  scoring linguístico por OpenAI. Backend novo em `Cognition/` com rotas
  `/cognition/status`, `/cognition/materials` e `/cognition/complete`; storage
  JSON local (`sessions.json`), rotação A→B→C por última sessão concluída,
  PVT/Span/Fluência/Reading/Flanker com métricas e respostas cruas persistidas.
  Wrapper dedicado em `Cognition/openai_tasks.py` adiciona as categorias
  `generate_reading_passage`, `score_reading_recall` e `score_verbal_fluency`
  com JSON estrito + similaridade semântica por embeddings. Frontend ganhou a
  aba **Cognição** com fluxo completo da sessão (VAS+contexto → PVT → span →
  slot rotativo), gráfico temporal mínimo com overlay de humor e baseline
  sombreado. Integração feita em `App.tsx`, `TabNav.tsx` e `api.ts`.
  Validação verde: `py_compile`, `python -m unittest tests.test_cognition -v`,
  `frontend: tsc`, `test:unit`, `lint`, `build`, `git diff --check`.
  Runtime fechado após restart de `roocode.service` + `roocode-vite.service`,
  com `GET http://localhost:8011/cognition/status` e
  `GET https://ultrassom.ai/health/api/cognition/status` retornando 200.
  Follow-up UX no mesmo dia: Digit Span agora foca automaticamente o campo de
  resposta após a sequência e confirma com Enter, evitando a sensação de precisar
  digitar duas vezes; tentativa errada sem encerramento também reapresenta nova
  sequência do mesmo comprimento.

- **2026-06-13** — **Aba Coração nova (3 fases)**. Fatiamento fisiológico continua no coração.
  (1) `4a989f1` FC de Repouso dedicada (faixas de risco CV ótima<65…alta≥85, tendência,
  respeita período) + aba Coração nova (TabKey, fura modo foco). (2) `efad25b` Pressão Arterial
  **dormente** via gating de readiness ("Coletando N/10", acende quando acumular medições;
  classificação ACC/AHA 2017) — materializa a ideia do Anders de "implementar agora, ativar
  quando houver dados". (3) `b0e7dad` Carga Cardíaca do Estimulante (Venvanse×FC/HRV, Pearson+
  p-value+FDR sobre 2 alvos×4 lags, guarda anti-espúrio por variância de exposição; util
  autocontido, não toca infra PK×Humor). Reconhecimento de dados aplicou a lição do In Bed:
  PA viável só 2%, Recuperação Cardio/VO2/Perfusão mortos → fora. Governança: novo
  `domain: 'coracao'` na matriz (3 ids). Gate verde (tsc/build/lint/test) + QA visual dark
  desktop/mobile sem overflow, 0 erros. Refinamento aplicado em seguida (`e2a3d34`): o card
  do Estimulante passou a usar a série do backend (`useConcentrationSeries`), que expande o
  regime seg-sex e captura a variância natural — com dados reais deu r=-0.41 FC repouso lag 3d,
  q<0.001 (correlação exploratória, provável confound de dia-da-semana). Spec em `docs/superpowers/`.

- **2026-06-13** — **Fix aba Sono (follow-up da frente)**: dois bugs expostos pelos dados
  reais ao mexer no seletor de período. (1) **Eficiência inviável** — usava `asleep/inBed`,
  mas o Watch só registra "In Bed" em **8%** das noites (não usa Sleep Schedule), então o
  card mostrava "0% Pobre" pegando o cochilo de hoje. Redefinida como **Total Sleep ÷
  tempo-na-cama**, com tempo-na-cama = `sleepInBedHours` quando há, senão duração do episódio
  **End−Start**. Noites com Total Sleep <1h viram inválidas (cochilo sai do `latest`).
  (2) **Cards não reagiam ao período** — Respiração/Continuidade/Arquitetura usavam janela
  interna fixa de 14d; removido o `slice`, passam a usar o período inteiro. QA no ar: eficiência
  76% (era 0%), médias mudam 30d→90d. Gate verde. Obs: o `sleep_data.csv` teve flutuação
  transitória do Health Auto Export (11↔110 noites) durante a sessão, mas restaurou sozinho.

- **2026-06-13** — **Sono: Respiração Noturna + Continuidade (frente de 5 commits)**.
  Dois índices novos na aba Sono desdobrando sinais antes cegos no quality-score.
  (1) Respiração Noturna: `respiratory-load.ts` — proxy-apneia (`respiratoryDisturbances`)
  com escala híbrida banda AASM + percentil pessoal p90 (30d reais), co-sinais SpO₂/taxa
  resp, flag de co-ocorrência (atípico + dessaturação), política `visual_only` (interpolado
  não dispara bandeira). (2) Continuidade: `sleep-continuity.ts` — eficiência + WASO em
  faixas AASM, leitura clínica direta sem score. Governança na matriz de evidência (2 ids
  novos, `domain: 'sono'`). HRV descartada por dado empírico (r=+0,28, sentido oposto ao
  esperado da teoria apneia→HRV). Bug do `RESP_DIST_CAP=30` registrado como ticket separado
  acima. Gate verde: tsc/build/lint/test:unit. Brainstorm via superpowers; spec/plan em
  `docs/superpowers/`. QA visual pendente (worktree não-mergeada — fazer pós-merge no ar).

- **2026-06-11** — **Frente "Sono" (6 commits)**: dashboard fatiado por sistema
  fisiológico, começando pelo sono. (0) `d41ba7b` captura de **pressão
  arterial** no pipeline (já vinha no metrics.csv, era descartada; índices ficam
  pra futura seção Coração). (1) `1361d32` aba **Sono** própria + tratamento das
  ilhas claras white/slate que o #5 deixou de fora (cards + `SurfaceFrame`).
  (enxuga `254f3d5` por feedback: aba focada em Eficiência+Arquitetura). (2)
  `5a98829` índice **Arquitetura de estágios** (% deep/REM vs referência, score
  reparador) + card + governança (`domain: 'sono'` novo na matriz). (3)
  `5b0f069` gráfico **Venvanse × atraso do sono** — confound farmacocinético
  detectado nos dados reais (concentração ao deitar acoplada ao horário de
  deitar, r=-0.55 espúrio) e corrigido via âncora fixa no baseline de onset →
  r=-0.04 p=0.89 (sem associação real). (4) `0c8a7f7` hero sensível à aba.
  Gate verde em todas as fases; QA visual desktop+mobile dark, zero ilhas.

- **2026-06-11** — **Ticket #5** (dark mode completo) fechado. Script Python
  de transformação (`dark_transform.py`, regex por família) injetou **458
  variants `dark:` em 48 arquivos**, consistente por construção. Padrões:
  `bg-X-50→dark:bg-X-500/10`, `bg-X-100→/15`, `border-X-200|300→dark:border-X-400/30`,
  `text-X-600|700→dark:text-X-300`, `text-X-800|900|950→dark:text-X-200`
  (opacity preservada). Skip automático de classes já-dark (evita duplicata).
  Heatmaps com escala fixa (`heatmap-cell.tsx`, cor via `style` inline) **não
  tocados** — só células callout viraram dark. Gate verde: `tsc`/`build`/`lint`/
  `test:unit`. CSS bundle emitiu 36 seletores `.dark:` atrelados a
  `[data-theme=graphite]` (nenhuma classe morta). QA visual no browser
  (Playwright + detector de ilhas parseando `oklch()`): callouts pastel agora
  com fundo translúcido escuro + texto `-200/-300` (contraste bom), zero ilhas
  das famílias-alvo. Os badges var-based (`var(--card)` = `#1a1f27`) já eram
  dark; chip de aba ativa claro é design intencional.

- **2026-06-10/11 (validado por Anders em 2026-06-11)** — Tickets **#1**
  (suplementos fora do `DoseLogger`), **#3** (hero condensado) e **#4**
  (auditoria matemática Remédio×Humor) confirmados em validação manual.

- **2026-06-11** — Sessão Claude pós-opencode (5 commits). Cockpit da Farmácia
  finalizado e commitado (`a8013bc`); **bug do tema travado resolvido**
  (`4e8704b` — havia um `style` inline no `index.html` com gradiente creme que
  vencia o CSS e prendia o fundo no claro, independente do `data-theme`; o
  opencode tentou 5 commits de UI sem achar a raiz; conserto = remover o inline
  + script anti-flash no `<head>`); **ticket #2** — `MedicationCatalogEditor`
  órfão removido (`b7d6609`); **tema Graphite virou dark mode real**
  (`1423a03`); faixas de status do shell viraram dark-aware (`a3e4ea7`). QA
  visual desktop + mobile (390×844) em verde: sem overflow horizontal, sem
  texto-fantasma (contraste ≥ 2.2:1), ilhas claras visíveis corrigidas. Resto
  do dark = ticket #5.

- **2026-06-10** — Onda opencode (10 commits). Endereçou os tickets **#1**
  (suplementos fora do `DoseLogger`), **#3** (hero condensado) e **#4**
  (auditoria matemática Remédio×Humor — criou `pearson-reference.test.ts`
  validando p-value e IC95 contra valores de referência do SciPy, delta
  < 5e-12). Também separou janelas/inferência de lag, centralizou dose events
  no backend e refez tema/topbar. **Pendente validação manual do Anders** antes
  de marcar #1/#3/#4 formalmente fechados.

- **2026-05-30** — Reorganização da Farmácia em 2 ondas: (1) escala real por
  droga + fusão Cobertura→card + plot combinado humor×concentração + remoção do
  overlay CV% do humor + heatmap colapsável; (2) convergência dos 3 cards num
  único card "Linha do tempo" com seletor [Humor][Lexapro][Venvanse][Lamictal]
  [Rivotril], status no header + pontinho de cor no seletor, brush zoom.
  Suplementos saíram das views analíticas.
