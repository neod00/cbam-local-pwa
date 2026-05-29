# CBAM Domain Map

This project should follow the EU CBAM communication template structure where practical. The key local reference file is:

`CBAM_documents/CBAM Communication template for installations_en_20241213.xlsx`

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
- `CalculationResult`: early direct/indirect/precursor/total SEE shape.

## Next Domain Concepts To Add

1. Production process
   - Template anchor: `D_Processes`.
   - Needs route, output quantity, market output, internal consumption, direct emissions, electricity, heat/waste gas flags.

2. Purchased precursor
   - Template anchor: `E_PurchPrec`.
   - Needs name, aggregated goods category, purchase quantity, consumption by process, direct SEE, indirect SEE, source/justification.

3. Source stream
   - Template anchor: `B_EmInst`.
   - Needs method, activity data, unit, NCV, EF, carbon content, fossil fraction, biomass fraction, emissions.

4. CN code master
   - Template/reference anchors: `c_CodeLists`, `Parameters_CNCodes`, `CBAM Self Assessment Tool Version 1.1.xlsx`, `CN CBAM codes.pdf`.
   - Needs sector, aggregated category, CN code, description, direct/indirect applicability.

## Calculation Principle

Start from a transparent MVP:

`Total SEE = Direct SEE + Indirect SEE + Precursor SEE`

Then extend toward EU template process attribution:

- Denominator: production process or product output quantity.
- Direct emissions: fuel/process emissions attributable to process.
- Indirect emissions: electricity consumption times electricity EF.
- Precursor emissions: consumed precursor quantity per output unit times precursor SEE.
- Warnings: missing values, negative values, abnormal yield, precursor share anomalies, missing version metadata.
