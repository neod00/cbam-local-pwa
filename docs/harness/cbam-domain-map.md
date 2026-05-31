# CBAM Domain Map

This project should follow the EU CBAM communication template structure where practical. The key local reference file is:

`CBAM_documents/CBAM Communication template for installations_en_20241213.xlsx`

The app UI may localize these concepts into Korean, but any EU submission/export workbook must preserve the original template structure, sheet names, formulas, and official English labels.

## EU Template Sheets

- `A_InstData`: installation, reporting period, verifier, aggregated goods, production routes, purchased precursors.
- `B_EmInst`: source streams, emission sources, activity data, NCV, emission factors, oxidation/conversion factors.
- `C_Emissions&Energy`: fuel balance, GHG balance, indirect emissions, data quality and QA.
- `D_Processes`: production process production levels, market output, internal consumption, directly attributable emissions, heat, waste gas, electricity.
- `E_PurchPrec`: purchased precursor purchase quantities, consumption by process, direct and indirect SEE values.
- `Summary_Processes`: summary of installation and process-level results.
- `Summary_Products`: product-level CN code, product name, direct SEE, indirect SEE, total SEE.
- `Summary_Communication`: reporting-declarant-facing summary.

## Current App Concepts

- `Installation`: early version of installation master data.
- `ReportingPeriod`: period lifecycle, currently DRAFT/READY/CALCULATED.
- `Product`: HS72/HS73 product master data.
- `ProductionProcess`: early `D_Processes` model for output quantity, direct attributable emissions, electricity, and production route.
- `SourceStream`: early `B_EmInst`/`C_Emissions&Energy` model for source-stream activity data, units, NCV, emission factors, correction factors, fractions, and evidence source.
- `PurchasedPrecursor`: early `E_PurchPrec` model for consumed precursor quantities and direct/indirect SEE values.
- `CalculationResult`: early direct/indirect/precursor/total SEE shape.

## Next Domain Concepts To Add

1. CN code master
   - Template/reference anchors: `c_CodeLists`, `Parameters_CNCodes`, `CBAM Self Assessment Tool Version 1.1.xlsx`, `CN CBAM codes.pdf`.
   - Needs sector, aggregated category, CN code, description, direct/indirect applicability.

2. Process refinements
   - Template anchor: `D_Processes`.
   - Needs heat, waste gas, internal consumption matrix, and quality warnings.

3. Source-stream export mapping
   - Template anchors: `B_EmInst`, `C_Emissions&Energy`.
   - Needs official unlocked-cell mapping before writing source stream data into the EU workbook.

4. Final-period reference values
   - Local reference anchors: `additional_documents_20260530/CBAMBenchmarks_20260206.xlsx`,
     `additional_documents_20260530/DVsasadopted_v20260204.xlsx`, and the EU CBAM final-period practical manual PDF.
   - Needs browser-local import of benchmark/default-value workbooks, version metadata, country/CN/year lookup,
     production-route indicators, and direct/indirect applicability.

5. SEFA and certificate scenarios
   - Needs CBAM factor, CSCF, benchmark Column A/Column B selection, precursor-specific free allocation,
     paid carbon price handling, certificate price, and certificate quantity calculation.
   - Must compare actual, semi-actual, and default-value scenarios because precursor defaults can materially change the
     optimal reporting strategy.

6. System boundary and allocation
   - Needs production-process boundaries that can cover multiple process steps and intermediate products.
   - Needs material-flow and mass-balance support with output subtraction.
   - Needs allocation rules for shared source streams or material flows, including mass-ratio and molar-ratio logic.

## Calculation Principle

The initial MVP started from a transparent review formula:

`Total SEE = Direct SEE + Indirect SEE + Precursor SEE`

For 2026 definitive-period work, this must be split into at least two outputs:

- `see_informational_total`: operational/review total SEE.
- `see_cbam_basis`: CBAM certificate-basis SEE after Annex II direct-only treatment and eligible precursor contribution.

Then extend toward EU template process attribution:

- Denominator: production process or product output quantity.
- Direct emissions: fuel/process emissions attributable to process.
- Indirect emissions: electricity consumption times electricity EF.
- Precursor emissions: consumed precursor quantity per output unit times precursor SEE.
- Warnings: missing values, negative values, abnormal yield, precursor share anomalies, missing version metadata.

Definitive-period extension:

- Product/CN rules determine whether indirect emissions are included.
- Annex II means direct-only for the final good's certificate-basis treatment; it is not an out-of-scope flag.
- The final good's own indirect emissions can be excluded from `see_cbam_basis` while still being kept as report/review data.
- Precursor contribution must be classified per precursor; a final Annex II good does not automatically exclude every precursor indirect component.
- Actual/semi-actual/default data modes affect both SEE and SEFA.
- SEFA is not a display-only field; it changes certificate quantity and the user's reporting strategy.
- Reference values must be imported from the user's current official workbooks rather than hard-coded into the app.
