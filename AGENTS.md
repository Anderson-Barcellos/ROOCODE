# RooCode — Agent Handoff

## Active Rule

Context is expensive. Prefer the smallest useful read, the smallest safe edit, and final output that helps Anders decide what changed.

## Fresh Sequence

1. Read `ROADMAP.md` and `CLAUDE.md`; use `CHARTENDEAVOUR.md` only as historical/technical context.
2. Check runtime before implementation:
   - `systemctl is-active roocode.service`
   - `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8011/sleep`
   - `git status --short`
3. Active sprint after 2026-04-30: **MOOD-IMPACT-1 — Mood Driver Board**.
4. Preserve the completed **MOOD-LOG-1 — Medication Action Center** behavior:
   - `DoseLogger` has **tomar agora** shortcuts for active regimen entries.
   - `DoseCalendarView` can add a dose on the selected day with regimen dose/time auto-fill.
   - `/farma/doses`, `/farma/doses/{id}`, `/farma/regimen`, `/farma/substances`, public schemas, and PK engine are unchanged.

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
