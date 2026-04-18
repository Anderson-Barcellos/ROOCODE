# Screenshots A/B — Fase 5 Interpolação

Capturas de validação visual dos 3 modos (`off` · `linear` · `claude`) em 3 charts representativos. Usadas pra comparação lado a lado e documentar a diferenciação visual (dashed lines, alpha, hollow dots, badges).

## Convenção de nome

```
fase5-{chart}-{mode}.png
```

Onde:
- `{chart}` ∈ `timeline` · `activity-bars` · `hrv-analysis` · `scatter` · `heatmap` · `mood-timeline` · `sleep-stages` · `spo2` · `heart-rate-bands`
- `{mode}` ∈ `off` · `linear` · `claude`

## Capturas pendentes (pra Anders)

Prioridade alta (3 charts × 3 modos = 9 screenshots):

- [ ] `fase5-timeline-off.png`
- [ ] `fase5-timeline-linear.png`
- [ ] `fase5-timeline-claude.png`
- [ ] `fase5-activity-bars-off.png`
- [ ] `fase5-activity-bars-linear.png`
- [ ] `fase5-activity-bars-claude.png`
- [ ] `fase5-hrv-analysis-off.png`
- [ ] `fase5-hrv-analysis-linear.png`
- [ ] `fase5-hrv-analysis-claude.png`

Bonus:
- [ ] `fase5-interpolation-demo-linear-vs-claude.png` — R² side-by-side
- [ ] `fase5-banner-linear.png` · `fase5-banner-claude.png` — `InterpolationBanner`

## Como capturar

1. Abrir `https://ultrassom.ai/health/#charts-demo` (charts com MOCK_SNAPSHOTS).
2. Usar o toggle de interpolação na TabNav pra alternar `off`/`linear`/`claude`.
3. Screenshot do chart isolado (sem scroll/header), salvar aqui com o nome da convenção.

Modo escuro e P&B ficam pra Sprint 5d (accessibility).
