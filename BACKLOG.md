# RooCode — Backlog

App em modo manutenção. Cada ticket = 1 commit focado. Sem sprint formal.
Histórico arquivado em `docs/HISTORY/`.

---

## Pendentes

Itens recomendados por Anders em 2026-05-30, após a convergência da Farmácia
num card unificado (commit `feat(farmaco): unifica humor e concentração PK`).

### #1 — Tirar os suplementos do registro de doses
**Contexto:** a reorganização da Farmácia restringiu as views analíticas só às
medicações (regime ativo Lexapro/Venvanse/Lamictal + Rivotril PRN). Mas o
dropdown de substância do `DoseLogger` (`frontend/src/components/DoseLogger.tsx`)
ainda oferece Bacopa, Magnésio, Vitamina D3, Omega-3 e Piracetam pra registro.
**Ação:** filtrar o seletor de substância pra só medicações que vamos logar.
Decidir se some só do front (esconder no dropdown) ou também do catálogo backend
(`Farma/medDataBase.json` + `PK_PRESETS` em `utils/pharmacokinetics.ts`).
Recomendação: esconder no front, preservar o PK no catálogo (reversível).

### #2 — Remover o botão "Catálogo de substâncias" da Farmácia
**Contexto:** a Farmácia tem um botão "Catálogo de substâncias" que abre o
`MedicationCatalogEditor`. Anders não usa.
**Ação:** remover o botão + o `MedicationCatalogEditor` do bloco Farmaco em
`frontend/src/App.tsx`. Avaliar se o componente
(`frontend/src/components/MedicationCatalogEditor.tsx`) fica órfão e pode ser
deletado, ou se ainda é referenciado em outro lugar.

### #3 — Encolher o banner/hero do topo
**Contexto:** o `hero-panel` no topo do `App.tsx` (título grande
"Neuropsiquiatria, farmacocinética e dados de Apple Watch — sob o mesmo teto")
ocupa altura demais. Já existe a variante `hero-panel--compact` usada só no
Panorama.
**Ação:** reduzir a altura/peso do hero nas demais abas — reaproveitar/estender
o `--compact` ou condensar pra uma faixa fina. Markup em `App.tsx` (~linhas
310-330) + CSS `.hero-panel` (procurar em `index.css`/equivalente).

### #4 — Auditar a matemática da seção Remédio × Humor
**Contexto:** o `PKHumorCorrelation`
(`frontend/src/components/charts/pk-humor-correlation.tsx`) faz lag sweep
[-3..+3d], Pearson, p-value via Fisher z-transform (`pValueFromR`/`normCdf`),
FDR Benjamini-Hochberg e EMA por substância (48h Lexapro/Lamictal, 72h Rivotril).
Anders quer verificar se a matemática está correta.
**Ação:** auditar `pValueFromR`, `normCdf`, `pairAtLag`, `buildDailyEmaSamples`
no componente + `pearson`, `benjaminiHochbergFdr`, `fisherCi95` em
`frontend/src/utils/intraday-correlation.ts`. Validar p-values e IC95% contra
implementação de referência (scipy/R), conferir se o pareamento por lag e a
janela EMA estão corretos, e se o FDR cobre exatamente os pares testados.
Há testes em `frontend/tests/` (`statistics.test.ts`, `pk-variability*`) como
ponto de partida.

---

## Concluídos recentes

- **2026-05-30** — Reorganização da Farmácia em 2 ondas: (1) escala real por
  droga + fusão Cobertura→card + plot combinado humor×concentração + remoção do
  overlay CV% do humor + heatmap colapsável; (2) convergência dos 3 cards num
  único card "Linha do tempo" com seletor [Humor][Lexapro][Venvanse][Lamictal]
  [Rivotril], status no header + pontinho de cor no seletor, brush zoom.
  Suplementos saíram das views analíticas.
