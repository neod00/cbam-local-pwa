# MVP Rehearsal Report

Date: 2026-06-01

This report records the current MVP rehearsal status before public free PWA distribution.

## Automated Checks

Standard project verification passed:

```bash
npm.cmd run verify
```

This includes calculation, source-stream, scenario, dashboard, synthetic EU Export, backup, PWA release, MVP flow, design-system, update-policy, deployment-readiness, lint, build, and production route checks.

## Local EU Template Check

Command:

```bash
npm.cmd run verify:local-eu-template -- "CBAM Communication template for installations_en_20241213.xlsx"
```

Result:

- Status: passed
- Sheet count: 19
- CN code count: 569
- Planned cell writes: 47
- Written cell count: 47
- Checked cell count: 47
- Warning count: 1
- `Summary_Products` formula cells preserved:
  - `I10`
  - `J10`
  - `K10`
- Generated workbook artifact: `artifacts/local-eu-template-verification.xlsx`
- Microsoft Excel recalculation check:
  - `Summary_Products!I10`: 1.32
  - `Summary_Products!J10`: 0.485
  - `Summary_Products!K10`: 1.805
  - Result: `K10` matches the app's informational total SEE for the sample product after purchased precursor mapping.

Review note:

- Excel formula recalculation has been checked with Microsoft Excel COM for the sample Export copy.
- Continue requiring the same Excel review whenever a real company creates a submission workbook.

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

- Production route verification now checks rendered page content, not only HTTP 200 responses.
- Rendered route checks confirm the Results, Scenarios, and EU Export pages show `CBAM 기준 SEE` separately from `참고용 총 SEE`.
- Rendered route checks confirm EU Export still shows `Summary_Products` review and official formula guidance.
- Rendered route checks confirm Dashboard and Settings still show `.cbam` backup guidance.
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
  - `/design-preview`

## Beta Browser Rehearsal

Command:

```bash
CBAM_EU_TEMPLATE_PATH="CBAM Communication template for installations_en_20241213.xlsx" npm.cmd run rehearse:beta-browser
```

Result:

- Status: passed
- Run artifact: `artifacts/beta-browser-rehearsal/20260601T105614`
- Checked routes: 13/13 passed
- IndexedDB seeded local data:
  - installations: 1
  - products: 2
  - periods: 1
  - processes: 1
  - product output lines: 1
  - source streams: 1
  - purchased precursors: 1
- EU template upload: passed
- Export copy download: passed
- `.cbam` backup download: passed
- External network requests while entering/reviewing data: 0
- Screenshot artifacts:
  - `dashboard.png`
  - `results.png`
  - `scenarios.png`
  - `export-after-upload.png`
  - `export-after-download.png`
  - `settings.png`

Downloaded Export workbook:

- `artifacts/beta-browser-rehearsal/20260601T105614/downloads/CBAM Communication template for installations_en_20241213_cbam-local-copy_20260601.xlsx`

Microsoft Excel recalculation result:

- `Summary_Products!I10`: 1.32
- `Summary_Products!J10`: 0.485
- `Summary_Products!K10`: 1.805
- Result: `K10` matches the app's informational total SEE for the fictional product after purchased precursor mapping.

## Additional Excel Recalculation Cases

Command:

```bash
npm run verify:excel-recalc-cases -- "CBAM Communication template for installations_en_20241213.xlsx"
```

Result:

- Status: passed
- Case count: 3
- Report artifact: `artifacts/excel-recalculation-cases/report.json`

| Case | Written cells | `I10` direct | `J10` indirect | `K10` total | App CBAM basis SEE | App informational total SEE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| no-precursor | 36 | 0.12 | 0.235 | 0.355 | 0.12 | 0.355 |
| precursor-direct-only | 47 | 1.32 | 0.235 | 1.555 | 1.32 | 1.555 |
| precursor-direct-indirect | 47 | 1.32 | 0.485 | 1.805 | 1.57 | 1.805 |

Review conclusion:

- In all three cases, Excel `Summary_Products!K10` matches the app's informational total SEE.
- For steel/iron sample goods, the app's `CBAM 기준 SEE` remains the certificate-scenario basis and may intentionally differ from Excel `K10` when final-good own indirect emissions are shown only as informational review values.
- The purchased-precursor indirect SEE bridge in `E_PurchPrec!L50:L51` is covered by the `precursor-direct-indirect` case.
- Operator Excel review procedure: `docs/excel-recalculation-review.md`

Finding fixed during rehearsal:

- The previous fictional `Steel Pipe` CN code `73063000` is not present in the official EU template CN list.
- The seed data and fictional dataset now use `73063080`, which exists in the EU template and keeps the beta rehearsal Export path unblocked.

## Vercel Deployment Browser Rehearsal

Deployment URL:

- `https://cbam-local-pwa.vercel.app/`

Command:

```bash
CBAM_REHEARSAL_URL="https://cbam-local-pwa.vercel.app" CBAM_EU_TEMPLATE_PATH="CBAM Communication template for installations_en_20241213.xlsx" npm.cmd run rehearse:beta-browser
```

Result:

- Status: passed
- Latest run artifact: `artifacts/beta-browser-rehearsal/20260601T115159`
- Checked routes: 14/14 passed, including `/terms`
- IndexedDB seeded local data:
  - installations: 1
  - products: 2
  - periods: 1
  - processes: 1
  - product output lines: 1
  - source streams: 1
  - purchased precursors: 1
- EU template upload: passed
- Export copy download: passed
- `.cbam` backup download: passed
- External network requests while entering/reviewing data: 0
- Downloaded Export workbook: `artifacts/beta-browser-rehearsal/20260601T115159/downloads/CBAM Communication template for installations_en_20241213_cbam-local-copy_20260601.xlsx`
- Downloaded backup: `artifacts/beta-browser-rehearsal/20260601T115159/downloads/cbam-local-backup-20260601115231.cbam`

Deployment note:

- The first deployed rehearsal attempt used an older Vercel deployment because GitHub `main` had not yet received the latest local MVP commits. After pushing `main` from `7f4f247` to `b8af5ce`, the deployment HTML contained the latest `CBAM 기준 SEE`, `참고용 총 SEE`, and `반영 셀 검증` copy, and the browser rehearsal passed.

## Release Blockers

Not blocking code verification, but required before public distribution:

- Finalize free-use terms wording with legal review.
