# MVP Rehearsal Report

Date: 2026-05-31

This report records the current MVP rehearsal status before public free PWA distribution.

## Automated Checks

Standard project verification passed:

```bash
npm.cmd run verify
```

This includes calculation, source-stream, scenario, dashboard, synthetic EU Export, backup, PWA release, MVP flow, design-system, update-policy, lint, and build checks.

## Local EU Template Check

Command:

```bash
npm.cmd run verify:local-eu-template -- "CBAM Communication template for installations_en_20241213.xlsx"
```

Result:

- Status: passed
- Sheet count: 19
- CN code count: 569
- Planned cell writes: 42
- Written cell count: 42
- Checked cell count: 42
- Warning count: 1
- `Summary_Products` formula cells preserved:
  - `I10`
  - `J10`
  - `K10`

Manual follow-up:

- Open the generated workbook copy in Microsoft Excel.
- Let Excel recalculate workbook formulas.
- Compare recalculated `Summary_Products` SEE values with the app's local SEE review values before relying on the file.

## Local Reference Workbook Check

Command:

```bash
npm.cmd run verify:local-references -- "CBAMBenchmarks_20260206.xlsx" "DVsasadopted_v20260204.xlsx"
```

Result:

- Status: passed
- Benchmark workbook:
  - Sheets: 3
  - Parsed rows: 1,808
  - CN codes: 570
  - Sample CN: `25070080`
- Default-value workbook:
  - Sheets: 122
  - Parsed rows: 10,904
  - CN codes: 261
  - Countries: 115
  - Sample country: `South Korea`
  - Sample CN: `25231000`

## UI Rehearsal Status

Completed in this pass:

- Installation setup form split into required and optional sections.
- Installation empty state added for first-time setup.
- Upload screen clarified so available reference workbook imports are separated from post-MVP activity-data bulk upload.
- Mobile review cards already exist for results, scenarios, and EU Export review tables.
- Local production route check passed for:
  - `/`
  - `/installations`
  - `/periods`
  - `/products`
  - `/processes`
  - `/source-streams`
  - `/precursors`
  - `/results`
  - `/scenarios`
  - `/upload`
  - `/export`
  - `/settings`

Remaining manual UI rehearsal:

- Run the app in a browser.
- Follow `docs/mvp-rehearsal-plan.md` from Dashboard through `.cbam` backup.
- Confirm Korean copy, button labels, empty states, and mobile layout are understandable without developer context.

## Release Blockers

Not blocking code verification, but required before public distribution:

- Complete manual Excel formula recalculation review.
- Complete full browser walkthrough using a fictional company dataset.
- Finalize free-use terms wording with legal review.
