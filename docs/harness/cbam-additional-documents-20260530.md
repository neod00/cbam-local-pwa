# CBAM Additional Documents Review - 2026-05-30

This note captures the design impact of the additional local reference files in:

`CBAM_documents/additional_documents_20260530`

The files are reference material only and must stay outside git.

## Reviewed Files

- EU CBAM final-period practical manual PDF (`EUCBAM...pdf`): worked supply-chain examples, including SEE, SEFA, and certificate scenarios.
- `CBAMBenchmarks_20260206.xlsx`: CBAM benchmark workbook based on Implementing Regulation (EU) 2025/2620.
- `DVsasadopted_v20260204.xlsx`: country/CN default-value workbook based on Implementing Regulation (EU) 2025/2621.
- 2026 seminar deck PDF: final-period defaults, benchmarks, verification, and business process issues.
- `260204_EUCBAM_TranslationKorean_v5.pdf`: EU CBAM legal translation/reference PDF, version 5, covering product scope, reporting fields, carbon price due, attachments, and final-period data requirements.

The sibling folders `CBAMBenchmarks_20260206` and `DVsasadopted_v20260204` are extracted workbook internals. They do not add independent product requirements beyond the corresponding `.xlsx` files.

## Main Product Implication

The free PWA should not be only a process-level SEE calculator. For final-period CBAM work it must guide users through:

1. CBAM goods and precursor identification by CN code.
2. System boundary definition.
3. Direct emissions, including combustion, process materials, and mass balance.
4. Attribution/allocation to CBAM goods and precursors.
5. Precursor actual/default data checks.
6. Specific embedded emissions (SEE).
7. Specific embedded free allocation (SEFA).
8. CBAM certificate quantity and cost scenarios.

The current MVP formula is useful as a transparent starting point, but it is not sufficient for final-period decision support.

## System Boundary And Allocation

Key domain rules to reflect in the app:

- Within one installation, goods with the same CN code should normally be consolidated into one production process unless there is a defensible commercial reason to split them.
- A production-process boundary can cover multiple internal steps. Intermediate products inside the same boundary may not need separate product-level SEE if they are not marketed/exported separately.
- For iron and steel goods, electricity is generally excluded from embedded emissions, except specific goods such as agglomerated iron ores and concentrates under CN 2601 12 00 where indirect emissions are included.
- Shared emissions must be attributable to goods using measured process data where available. If direct metering is unavailable, allocation may need mass-ratio or molar-ratio logic depending on the process and material relationship.
- Outsourced operations must be reviewed against the production-process boundary. If an outsourced step is in boundary and has direct emissions, the app must ask whether actual/verifiable data exists; otherwise default-value handling may be required.

## Actual, Semi-Actual, And Default Scenarios

The app should support scenario comparison because the lowest-risk/lowest-cost route is not always obvious:

- `AD`: own process and precursor data are based on verified actual values.
- `SAD`: own process data may be actual, but one or more precursor values use default or semi-actual values.
- `DV`: official default value is used for the final good.

For some supply chains, semi-actual can be worse than using the final-good default because precursor defaults carry mark-ups and may dominate the total result.

## Benchmark Workbook

`CBAMBenchmarks_20260206.xlsx` contains:

- Sheet `Benchmarks`.
- 1,810 data rows.
- CN code, CN description, Column A benchmark, Column A production-route indicator, Column B benchmark, and Column B production-route indicator.

Implementation implications:

- Import or parse the user-supplied latest benchmark workbook locally.
- Store benchmark version metadata.
- Select Column A when calculating SEFA with actual data.
- Select Column B when calculating SEFA for default-value scenarios.
- Respect production-route indicators such as BF/BOF, DRI/EAF, scrap/EAF, and aluminium route variants.

## Default-Value Workbook

`DVsasadopted_v20260204.xlsx` contains:

- Country-specific sheets, including `South Korea`.
- Product CN code, description, direct default value, indirect default value, total default value, and mark-up-inclusive values for 2026, 2027, and 2028 onwards.
- A production-route indicator column that links default values to the benchmark route.

Implementation implications:

- Import or parse the user-supplied latest default-value workbook locally.
- Resolve default values by country, CN code, and reporting/production year.
- Keep direct, indirect, total, and mark-up-inclusive values separate.
- Preserve the official distinction between goods where indirect emissions are applicable and goods where they are not.
- Add a fallback workflow for missing country/CN values only after confirming the applicable official rule.

## Legal Translation Reference

`260204_EUCBAM_TranslationKorean_v5.pdf` is useful for validating the app's required data model and pre-submission checks:

- Annex I/II product scope and greenhouse gas lists confirm that CN-code eligibility and direct/indirect applicability must be treated as reference data, not free text.
- Reporting obligations include quantity, CN code, country of origin, installation identity, production route, direct and indirect embedded emissions, electricity consumption, and electricity emission-factor source.
- Steel goods may require a specific steel mill identification number when known.
- Carbon price due fields require separate tracking of instrument type, country, total amount, exchange rate, covered emissions, and emissions covered by free allocation/rebate/compensation.
- Attachments and evidence metadata should be captured as structured evidence records, not only free-text notes.

Implementation implications:

- Add an export-readiness checklist that checks legal/reporting fields separately from calculation completeness.
- Keep Korean UI labels, but map internal fields to the official English/EU reporting concepts.
- Treat carbon price due as its own future module because it affects certificate liability and requires evidence.

## SEFA And Certificate Calculation

The final-period app needs a separate calculation module for SEFA and certificate scenarios:

- CBAM factor by year.
- CSCF by year/period.
- Benchmark lookup by CN code, data mode, and production route.
- Precursor-specific SEFA where precursor actual data is used.
- Default scenario SEFA based on Column B benchmarks.
- Carbon price already paid, certificate price, and resulting certificate quantity.

The worked examples assume zero carbon price already paid. Do not implement paid-carbon-price offsets beyond a clearly labelled input until the exact official formula and reporting treatment are verified.

## Data Model Gaps

Current local stores should eventually be expanded with:

- Reference-factor import metadata for default values, benchmarks, CBAM factor, CSCF, and national emission factors.
- Product/CN master data with direct/indirect applicability and production-route options.
- System boundaries and process-step graphs.
- Input/output material flows for mass balance, including carbon content and output subtraction.
- Allocation rules per shared source stream or material flow.
- Precursor data mode, verification status, supplier country, supplier installation, and source workbook/template version.
- SEFA and certificate scenario results separate from SEE results.

## UX Backlog

Add Korean-first workflow screens for:

- CN/product and precursor identification.
- System boundary builder.
- Mass balance/material-flow entry.
- Allocation review.
- Supplier precursor scenario comparison.
- SEE/SEFA/certificate result comparison.
- Verification readiness and evidence pack checklist.

## Near-Term Development Priority

Before expanding small source-stream dropdown coverage, prioritize the final-period domain model:

1. Add reference workbook import for benchmark and default values.
2. Add CN-specific indirect-emission applicability.
3. Add precursor data modes and supplier-country/default lookup.
4. Add SEFA scenario calculation.
5. Add certificate quantity/cost scenario calculation after formula verification.
