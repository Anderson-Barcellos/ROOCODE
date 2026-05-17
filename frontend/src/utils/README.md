# Frontend Utils — Data Pipeline Map

This document summarizes the analytical utility modules used by the Insights/PK Variability stack.

## `pk-variability.ts`
- **Input:** `DailySnapshot[]`, PK daily concentration series, PK medication profile, dose events.
- **Output:** `PKVariabilityHypothesis` (lag rows, cross-window replication, cross-lag consistency, censorship flags).
- **Used by:**
  - `components/charts/pk-variability-humor-lab.tsx`
  - `components/cards/pk-variability-report-card.tsx`
  - `components/charts/pk-variability-heatmap.tsx`

## `correlations.ts`
- **Input:** `DailySnapshot[]`, metric keys, lag.
- **Output:** pairwise `CorrelationResult`, top correlations, BH-FDR adjustment helper.
- **Used by:**
  - `components/charts/correlation-heatmap.tsx`
  - `components/charts/pk-variability-humor-lab.tsx` (FDR helper)

## `temp-humor-correlation.ts`
- **Input:** real (non-interpolated/non-forecasted) `DailySnapshot[]`.
- **Output:** lag sweep `[-3..+3]` for temperature-delta vs mood, FDR-adjusted estimates, preregistered-hypothesis check.
- **Used by:**
  - `components/charts/temp-humor-correlation.tsx`

## `intraday-correlation.ts`
- **Input:** mood rows/events, dose logs, PK medication params.
- **Output:** intraday PK×mood pairs, lag correlations, permutation/bootstrap inference, BH-FDR helper.
- **Used by:**
  - `pk-humor-correlation.tsx`, `lag-correlation-chart.tsx`, `pk-mood-scatter-chart.tsx`
  - PK variability components via `toPKDoses` / `substanceToPKMedication`

## `aggregation.ts`
- **Input:** raw bundle rows (`healthRows`, `moodRows`, `medicationRows`).
- **Output:** canonical `DailySnapshot[]`, overview KPIs, timeline series, range selections.
- **Used by:**
  - `hooks/useRooCodeData.ts`
  - `App.tsx` and multiple chart/card components

## `data-readiness.ts`
- **Input:** snapshots + readiness requirement profile.
- **Output:** readiness state (`standby`/`collecting`/`exploratory`/`robust`) with progress labels.
- **Used by:** chart readiness gates across Insights/Sono/Atividade.

## `interpolate.ts`
- **Input:** sparse `DailySnapshot[]`.
- **Output:** deterministic linear interpolated snapshots (`interpolated=true`) for short gaps.
- **Used by:**
  - `hooks/useInterpolation.ts`
  - `pages/InterpolationDemo.tsx`

## Additional derivation utilities used in this pipeline
- `statistics.ts`: Pearson, lag pairing, trend/anomaly helpers.
- `pharmacokinetics.ts`: PK concentration engine and smoothing windows.
- `personal-baselines.ts`: rolling baseline/SD for delta-based metrics.
