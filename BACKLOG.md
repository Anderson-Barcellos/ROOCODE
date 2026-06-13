# RooCode — Backlog

App em modo manutenção. Cada ticket = 1 commit focado. Sem sprint formal.
Histórico arquivado em `docs/HISTORY/`.

---

## Pendentes

- **Bug calibração `RESP_DIST_CAP`** — `sleep-quality-score.ts` usa cap=30 (escala
  AHI clínico) que satura o componente respiratório na faixa real (0–4,9), deixando-o
  cego. Recalibrar (cap realista ~5–8 ou percentil pessoal). Trade-off: muda a
  semântica do score histórico de qualidade — commit próprio, com nota de
  comparabilidade temporal. O índice dedicado Respiração Noturna já contorna isso.

---

## Concluídos recentes

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
