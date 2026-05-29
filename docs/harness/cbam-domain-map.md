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

## Calculation Principle

Start from a transparent MVP:

`Total SEE = Direct SEE + Indirect SEE + Precursor SEE`

Then extend toward EU template process attribution:

- Denominator: production process or product output quantity.
- Direct emissions: fuel/process emissions attributable to process.
- Indirect emissions: electricity consumption times electricity EF.
- Precursor emissions: consumed precursor quantity per output unit times precursor SEE.
- Warnings: missing values, negative values, abnormal yield, precursor share anomalies, missing version metadata.
