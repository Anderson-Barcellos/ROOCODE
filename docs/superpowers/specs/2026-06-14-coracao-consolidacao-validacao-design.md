# Coração — Consolidação + Validação dos Marcadores — Design Doc

**Status:** spec aprovada · pronta pra writing-plans/execução
**Brainstorm:** 2026-06-14 (superpowers:brainstorming)
**Frente mãe:** continuação direta de `2026-06-13-coracao-indices-design.md` — que criou a aba só com índices novos e deixou a consolidação do cardíaco espalhado como "outro ticket". Este é esse ticket.
**Modo:** manutenção (commits focados; sem KICKOFF/Pós-Sprint Protocol)

---

## Objetivo

Consolidar na aba **Coração** todo o cardíaco hoje espalhado em Recuperação e
Capacidade, **mas só depois de auditar a validade matemática e clínica de cada
marcador**. O princípio que guia (decisão do Anders): os cards servem pra
**criar um baseline pessoal e acompanhar tendência**, com **lastro científico/
populacional mínimo como referência de contexto** — não como veredito. Onde a
banda populacional tem fonte real, ela fica como pano de fundo; onde a banda é
inventada, o marcador vira tendência-pura (sem rótulo "Bom/Ruim") ou sai.

## Não-objetivos

- **Não** mexer no backend/pipeline. Todos os sinais já chegam parseados.
- **Não** trazer VO₂ Máx como protagonista no Coração — cobertura real de 1%
  (esparso, confirmado pelo Anders). Segue como input interno do `FunctionalCapacityIndex`
  na Capacidade.
- **Não** mover SpO₂ nem o Painel respiratório/noturno pra cá — são fisiologia de
  sono, ficam em Recuperação.
- **Não** reescrever a estatística que já está correta (Pearson, FDR, z-scores
  pessoais, baselines que excluem interpolado). A auditoria validou esse núcleo.
- **Não** criar marcadores novos. Esta frente consolida e corrige os existentes.

---

## Parecer de auditoria (validado em 2026-06-14)

Li a matemática dos 11 marcadores cardíacos + as fórmulas-base (Uth-Sørensen
pro VO₂, Fox-Haskell pro HRmax). A essência: **a estatística é honesta e
bem-feita**; os escorregões estão em **bandas classificatórias inventadas sem
referência** e em **proxies com nome clínico forte demais pro que medem**.

| Marcador | Conta | Validade clínica | Veredito |
|---|---|---|---|
| FC de repouso | trivial, correta | marcador prognóstico de ouro | ✅ sólido |
| Carga do estimulante | Pearson+FDR+guarda CV | exploratório honesto (lisdex é simpaticomimético) | ✅ sólido |
| HRR1 (recup. cardíaca) | valor direto Apple | marcador forte | ✅ válido, dado 0% (dormente perpétuo) |
| ABI (balanço autonômico) | z de ln(HRV/RHR), correto | proxy composto *ad-hoc*, não é LF/HF espectral | ✅ ok como tendência pessoal |
| Pressão arterial | ACC/AHA 2017 correta | classifica a média do período | ⚠️ menor; já nasce dormente (dado 2%) |
| HRV (SDNN) | SMA+rolling SD ok | bandas de norma 5min vs SDNN *ultra-short* do Apple | ⚠️ tendência ok, bandas frágeis |
| Reserva de FC (HRR) | Karvonen correta | bandas 100/115/125 bpm **sem referência** | ⚠️ tendência ok, classificação inventada |
| Resposta cronotrópica | z-score correto | nome promete teste de esforço; mede caminhada casual | ⚠️ renomear/recontextualizar |
| Idade cardiovascular | heurística | coef. inventados **+ dupla contagem de RHR** | ❌ descartar |

**Os três problemas estruturais:**

1. **Idade cardiovascular — pior ofensor.** Fórmula `idade + (RHR−58)×0.55 +
   (55−HRV)×0.18 + (42−VO2)×0.42`. Coeficientes e âncoras **fabricados, sem
   referência**. Pior: o VO₂ ali é o proxy Uth-Sørensen (`15×HRmax/RHR`), função
   de RHR — então o RHR entra **duas vezes** (direto + via VO₂), dominando o
   número. Falsa precisão diagnóstica. **Decisão: descartar (opção A).**

2. **HRmax travado em 181 — problema-raiz.** É `220−39` (Fox-Haskell), mas o
   perfil já diz idade 40 (inconsistente). Fox-Haskell tem erro de ±10-12 bpm.
   Esse HRmax frágil propaga pra **reserva de FC, VO₂ estimado e idade CV** ao
   mesmo tempo. **Decisão: destravar e usar Tanaka (208 − 0.7×idade).**

3. **Bandas vs tendência.** HRV, reserva e cronotrópica são honestos como
   tendência pessoal mas frágeis como classificação. **Decisão: tendência
   pessoal como eixo; banda populacional só com fonte real, senão tendência-pura.**

---

## Estado atual (baseline)

**Aba Coração hoje** (`App.tsx:988`) — criada pela spec de 2026-06-13:
- Seção "Coração em repouso": `RestingHeartRateCard` + `BloodPressureCard`
- Seção "Estimulante × coração": `StimulantCardiacLoadCard`

**Cardíaco espalhado a consolidar:**
- **Recuperação Painel 5** (`App.tsx:901-914`): `AutonomicBalanceChart` +
  `CardiovascularAgeCard` + `HrvVariabilityChart` + `HRRangeChart`
- **Capacidade `CapacityCardiovascularPanel`** (`capacity-panels.tsx:239`):
  `Vo2MaxChart` + `HeartRateReserveChart` + `ChronotropicResponseChart` +
  `CardioRecoveryChart`, sob um veredito que integra os 4.

---

## Camada 1 — Correções de validade

A ciência fica honesta antes de qualquer card mudar de casa.

| # | Mudança | Arquivos |
|---|---|---|
| 1.1 | **HRmax**: destravar do `181` fixo → `estimateHrMaxByAge` vira Tanaka `208 − 0.7×idade`, derivado de `USER_PROFILE.age`. `ANDERS_HRMAX_BPM` passa a derivar disso. | `user-profile.ts`, `health-policies.ts` |
| 1.2 | **Idade CV**: remover card, componente, entrada na matriz de evidência e o requirement no `data-readiness`. | `cardiovascular-age-card.tsx` (delete), `index-evidence.ts`, `INDEX_EVIDENCE_MATRIX.md`, `data-readiness.ts`, `App.tsx` |
| 1.3 | **Reserva de FC**: remover `HRR_BANDS` (100/115/125) e `getHrrBand`. Card vira série de tendência + SMA-7, sem rótulo classificatório. | `heart-rate-reserve.ts`, `heart-rate-reserve-chart.tsx` |
| 1.4 | **Cronotrópica**: renomear superfície pra "Aceleração na caminhada" (ou equivalente honesto). Mantém o z-score pessoal; só remove a promessa de teste de esforço. Rename de símbolos exportados exige varrer consumidores (`functional-capacity.ts` usa `computeChronotropicSeries`). | `chronotropic-response.ts`, `chronotropic-response-chart.tsx` |
| 1.5 | **FC repouso + HRV**: anexar **fonte citada** às bandas. HRV troca norma Task-Force-5min por norma de wearable (SDNN ultra-short). **Fallback honesto:** se na implementação não houver fonte sólida pra a banda de HRV de wearable, ela também vira tendência-pura. | `resting-heart-rate.ts`, `hrv-variability.ts` |

**Referências a confirmar na implementação** (lastro mínimo exigido pelo critério):
- HRmax: Tanaka, Monahan, Seals (2001), *JACC* 37:153-156.
- FC repouso ↔ desfecho CV: ancorar bandas <65/65-75/75-85/≥85 numa coorte real
  (candidatas: Jensen 2013 Copenhagen; Cooney 2010). Confirmar antes de citar.
- HRV de wearable: buscar norma de SDNN ultra-short por idade/sexo. Se não houver
  fonte robusta → tendência-pura (sem banda).

---

## Camada 2 — Layout e consolidação

Aba Coração final — 4 seções, do basal ao esforço:

```
🫀 Coração — "Como anda o teu coração?"
│
├── 1. Em repouso
│     FC de repouso · Faixa de FC do dia (HRRange) · Pressão (dormente)
│
├── 2. Variabilidade & tônus autonômico
│     HRV (tendência + banda c/ fonte) · ABI (z-score pessoal)
│
├── 3. Resposta ao esforço
│     Reserva de FC (tendência) · Aceleração na caminhada · HRR1 (dormente)
│
└── 4. Estimulante × coração
      Carga cardíaca do estimulante (exploratório, FDR)
```

**O que esvazia na origem:**

- **Recuperação**: o Painel 5 inteiro sai (ABI, HRV, HRRange; idade CV já
  removida na Camada 1). Renumerar os painéis restantes (1-4, 6). A aba fica
  coesa com sono + fisiologia noturna — exatamente o tema dela.
- **Capacidade**: o `CapacityCardiovascularPanel` perde reserva/cronotrópica/
  HRR1 → **sobra VO₂**. Reescrever o veredito do painel (hoje cita os 4 juntos)
  pra falar só de VO₂/capacidade; o `Vo2MaxChart` fica junto do `FunctionalCapacityIndexCard`.

---

## Sequenciamento

Duas frentes, alinhado ao modo manutenção (1 commit = 1 unidade focada):

1. **Frente Validade** (Camada 1) — conserta a ciência sem mexer em layout.
   Testável isoladamente: `tsc + build + test:unit` + conferir que os cards
   ainda renderizam nas abas atuais com a matemática nova.
2. **Frente Consolidação** (Camada 2) — move os cards pras seções novas do
   Coração e esvazia as origens. Testável visualmente (QA desktop + mobile).

A spec descreve as duas; o plano de implementação (writing-plans) separa em fases
com test gates entre elas.

---

## Riscos / trade-offs aceitos

- **HRmax Tanaka ≈ Fox-Haskell aqui** (208−0.7×40 = 180 vs 181). O ganho é
  conceitual (fórmula com menor viés + destrava da inconsistência idade/HRmax),
  não numérico. Aceito: corrige a raiz e remove o drift de perfil.
- **Reserva e cronotrópica viram tendência-pura.** Perde-se o rótulo
  classificatório, mas ele não tinha lastro. Trade-off a favor da honestidade.
- **HRR1 e Pressão permanecem dormentes** (0% e 2% de cobertura). Ficam no layout
  como placeholders honestos que acendem se o dado aparecer. Não removidos.
- **Rename da cronotrópica** mexe em símbolo consumido pelo FCI — exige varredura
  de consumidores (verificação mecânica delegável a Explore agent antes do gate).

---

## Validação

- `npx tsc --noEmit` + `npm run build` + `npm run lint` + `npm run test:unit`
  verdes ao fim de cada frente.
- Backend não tocado — sem suíte Python necessária.
- QA visual (Frente Consolidação): aba Coração com 4 seções; Recuperação e
  Capacidade sem buracos nem cards órfãos; desktop 1440×1000 e mobile 390×844.
- Conferir que nenhum consumidor quebrou após remover idade CV e renomear a
  cronotrópica (`grep` de referências órfãs + tsc).
