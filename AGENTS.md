# RooCode — Agent Handoff

## Active Rule

Context is expensive. Prefer the smallest useful read, the smallest safe edit, and final output that helps Anders decide what changed.

## Fresh Sequence

If Anders starts a fresh session with `/sprint`, treat it as permission to resume the active progressive sprint from this file.

1. Read `ROADMAP.md` and `CLAUDE.md`; use `CHARTENDEAVOUR.md` only as historical/technical context.
2. Check runtime before implementation:
   - `systemctl is-active roocode.service`
   - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep`
   - `git status --short`
3. Active sprint after 2026-04-30: **MOOD-IMPACT-2 — Lag & Hypothesis Lab**.
4. Preserve the completed **MOOD-LOG-1 — Medication Action Center** behavior:
   - `DoseLogger` has **tomar agora** shortcuts for active regimen entries.
   - `DoseCalendarView` can add a dose on the selected day with regimen dose/time auto-fill.
   - `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances`, public schemas, and PK engine are unchanged.
5. Preserve the completed **MOOD-IMPACT-1 — Mood Driver Board** behavior:
   - `MoodDriverBoard` appears at the top of Insights through `CorrelationHeatmap`.
   - It uses existing `DailySnapshot[]` only.
   - Cards require `>=3` humor+metric pairs before interpreting a driver.
6. Preserve the completed first slice of **MOOD-IMPACT-2 — Lag & Hypothesis Lab**:
   - `MoodLagHypothesisLab` appears in Insights through `CorrelationHeatmap`.
   - It uses existing `DailySnapshot[]` only.
   - It compares selected metrics against mood across lags `0d`, `1d`, `2d`, `3d`.
   - Rows expose `n`, signal quality, Pearson `r`, above/below personal metric baseline, and sampling-bias caution.
   - Continue MOOD-IMPACT-2 with Lamictal variance only if it can be wired without destabilizing PK/humor.

## `/sprint` Protocol

When Anders says `/sprint`, run this sequence:

1. Read this `AGENTS.md`, then `ROADMAP.md` and `CLAUDE.md`.
2. Identify the active sprint and the last completed sprint.
3. Run the runtime/worktree sanity checks from Fresh Sequence.
4. Before editing, state the Sprint Gate contract in one compact block.
5. Implement the smallest useful slice.
6. After each completed slice, update the needed handoff docs with only real status:
   - `AGENTS.md`: active sprint, completed behaviors to preserve, and `/sprint` continuity notes.
   - `ROADMAP.md`: status table and sprint section.
   - `CLAUDE.md`: fresh-session kickoff.
   - `CHARTENDEAVOUR.md`: only if visual/redesign historical status changed.
7. Validate with the commands in Validation.
8. Commit and push only the files touched for that slice, preserving unrelated worktree changes.

## Sprint Gate

Before editing code for a new sprint, declare:

1. Input fields: exact CSV/backend hook.
2. Derived feature: formula or explicit no-derivation decision.
3. Target component: exact file/screen.
4. Empty state: objective insufficient-data rule.
5. Validation: `npx tsc --noEmit`, `npm run build`, and `git diff --check`.

## Data Policy

- New metrics may start `data-gated`.
- Empty states must say the criterion: for example `precisa >=N pares`, low coverage, or no humor/metric overlap.
- Do not mock insight, infer clinical causality, or turn `null` into zero.

## IA/Superpowers

- Existing Gemini/Forecast sections stay valid unless a migration sprint explicitly changes them.
- For new product/prototype IA, Anders prefers `gpt-5.4-mini`, reasoning `high`, verbosity `high`.
- The app may use frank personal hypotheses about routine, sleep, metrics, mood, and medication, but must not execute changes, edit doses automatically, or fake clinical certainty.

## Validation

```bash
cd /root/RooCode/frontend
npx tsc --noEmit
npm run build
git diff --check
```
