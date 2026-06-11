# RooCode — Backlog

App em modo manutenção. Cada ticket = 1 commit focado. Sem sprint formal.
Histórico arquivado em `docs/HISTORY/`.

---

## Pendentes

### #5 — Completar o dark mode (tema Graphite) nas superfícies ainda claras

**Contexto:** em 2026-06-11 o tema Graphite virou dark mode real (commits
`1423a03`, `a3e4ea7`). O dark **visível** da Farmaco está limpo, mas restam
~50 arquivos com cores Tailwind pastel fixas (`bg-X-50 border-X-200
text-X-900`) que viram ilhas claras no escuro. Todas estão **fora do campo de
visão atual** — atrás do accordion fechado "Remédio × Humor" (callouts do
`pk-humor-correlation`: Veredito/Impacto em emerald/amber/sky/violet) ou nas
abas **"Em revisão" desabilitadas** (Panorama/Recuperação/Capacidade/Insights).
Precisam virar dark-aware **antes** de reativar essas abas.

**Infra já pronta:** `@custom-variant dark` configurado em `index.css`,
atrelado a `[data-theme='graphite']`. Basta acrescentar variants `dark:` a
cada callout — não precisa configurar nada.

**Abordagem decidida — script de transformação, NÃO agentes pra editar:**
a mudança é mecânica e regular; um script regex (sed/Python) aplica o padrão
em lote, consistente por construção. Padrão por família de cor:

- `bg-{cor}-50`            → acrescentar ` dark:bg-{cor}-500/10`
- `border-{cor}-200|300`   → acrescentar ` dark:border-{cor}-400/30`
- `text-{cor}-800|900`     → acrescentar ` dark:text-{cor}-200`
- `text-{cor}-700/NN` (soft) → acrescentar ` dark:text-{cor}-300/NN`

Famílias em jogo: amber, violet, indigo, emerald, rose, sky, teal, red, green,
fuchsia. **Cuidados:** (1) opacity modifiers tipo `text-amber-700/80` — a
classe gerada inclui o `/80`, casar o regex com isso; (2) pular classes que já
têm `dark:`; (3) nem todo `bg-X-50` é callout — gerar **dry-run** e revisar
antes de aplicar; (4) heatmaps com `text-slate-900` sobre células coloridas
são caso à parte (escala de cor fixa, não temática) — não mexer.

**Verificação obrigatória:** após o script, `npx tsc --noEmit` + `npm run
build` + `npm run test:unit`; depois QA visual por aba no browser em Graphite.
A varredura de ilhas claras precisa parsear **`oklch()`**, não só `rgba()` —
Tailwind v4 emite cores em oklch e foi o que escondeu 3 ilhas no primeiro QA
desta sessão.

**Por que não agentes pra esta tarefa:** editar arquivo existente fere a regra
de `~/.claude/rules/subagents.md`, e fan-out de edição mecânica multiplica
inconsistências (um agente esquece o `border`, outro erra a família). Agentes
Claude valem aqui **só pra explorar em paralelo (read-only)** — ex.: 4 agentes
mapeando as 4 abas e devolvendo o patch plan, que o orquestrador aplica via
script. O gargalo real é a conferência visual por aba (serial, no browser),
que agente não resolve.

---

## Concluídos recentes

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
