# EU Template Export Map

This note records the current write targets for the official `CBAM Communication template for installations_en_20241213.xlsx`.

The official workbook itself must stay outside the repository. The app should always export into a user-supplied copy of the current EU template.

## Mapping Principles

- Write only to unlocked input cells in the official template.
- Preserve all official sheet names, formulas, protected labels, formatting, and English text.
- Treat calculated totals and control cells as read-only.
- Keep synthetic verification fixtures minimal; they validate workbook mechanics, not every official formula.
- Use `npm run verify:local-eu-template -- "<path-to-official-template.xlsx>"` for a local read-only check against a user-supplied official workbook. The official workbook must remain outside Git.

## Current Export Targets

### `A_InstData`

The app writes reporting-period, installation identity, address, location, and contact fields that are stored in the local installation record.

| App field | Official cell | Notes |
| --- | --- | --- |
| `ReportingPeriod.start_date` | `I9` | Start date, written as an Excel serial date. |
| `ReportingPeriod.end_date` | `L9` | End date, written as an Excel serial date. |
| `Installation.local_name` | `I19` | Optional internal/local installation name. |
| `Installation.name` | `I20` | Installation English name field. |
| `Installation.street` | `I21` | Street and number. |
| `Installation.economic_activity` | `I22` | Economic activity. |
| `Installation.postcode` | `I23` | Post code. |
| `Installation.po_box` | `I24` | Optional P.O. Box. |
| `Installation.city` | `I25` | City. |
| `Installation.country` | `I26` | Country code/name field currently stores the local country value. |
| `Installation.unlocode` | `I27` | Optional UN/LOCODE. |
| `Installation.latitude` | `I28` | Optional latitude. |
| `Installation.longitude` | `I29` | Optional longitude. |
| `Installation.authorized_representative_name` | `I30` | Authorized representative name. |
| `Installation.email` | `I31` | Contact email. |
| `Installation.telephone` | `I32` | Contact telephone. |

The app also declares aggregated goods and production process boundaries in the official `A_InstData` input tables:

| App field | Official cell | Notes |
| --- | --- | --- |
| mapped product EU goods category | `E62:E71` | Up to 10 distinct aggregated goods categories from local products. |
| linked production routes | `I62:N71` | Up to 6 production routes per aggregated goods category. |
| process mapped EU goods category | `E83:E92` | Up to 10 local production processes. |
| process included goods/boundary | `F83:K92` | Uses `Only direct production` unless product output lines indicate multiple included categories. |
| `ProductionProcess.name` | `L83:L92` | Production process display name. |

### `D_Processes`

Each production process block starts at row `11 + index * 65`.

| App field | Official cell | Notes |
| --- | --- | --- |
| `output_mass_t` | `L{start + 5}` | First unlocked row under total production levels. |
| `market_output_mass_t` | `L{start + 16}` | Produced for the market. |
| `internal_consumption_mass_t` | `L{start + 21}` | First unlocked row for consumption in other production processes. |
| `direct_attributable_emissions_tco2e` | `L{start + 43}` | Directly attributable emissions. |
| `electricity_mwh` | `L{start + 54}` | Electricity consumption. |
| `electricity_ef_tco2e_per_mwh` | `L{start + 55}` | Electricity emission factor. |

The app does not currently write production process labels or goods-category text into `D_Processes`, because those visible block labels are protected in the official workbook.

Export readiness also checks product output-line consistency before download:

- Product output-line mass totals are compared with the production-process total output.
- Mixed allocation bases inside one production process are reported as warnings.
- Manual allocation lines with no valid manual percentage total are reported as warnings.

These checks are intentionally handled as readiness warnings rather than direct SEE workbook writes, because the current confirmed unlocked `D_Processes` cells accept process-level totals, not a separate product-line allocation result table.

### `B_EmInst`

Each calculation-based source-stream row starts at row `17 + index`. The app currently writes up to 75 source streams.

| App field | Official cell | Notes |
| --- | --- | --- |
| `SourceStream.method` / `stream_type` | `D{row}` | Monitoring approach. Unsupported free-text methods fall back to `Combustion` or `Process Emissions` from `stream_type`. |
| `SourceStream.name` | `E{row}` | Source stream name. |
| `SourceStream.activity_data` | `F{row}` | Activity data. |
| `SourceStream.activity_unit` | `G{row}` | Activity data unit. |
| `SourceStream.ncv_gj_per_unit` | `H{row}` | Net calorific value. |
| `SourceStream.emission_factor_tco2e_per_unit` | `J{row}` | Emission factor. |
| derived EF unit | `K{row}` | `tCO2/TJ` for fuel source streams; otherwise `tCO2/{activity_unit}`. |
| `SourceStream.oxidation_factor` | `N{row}` | Written as percent value. |
| `SourceStream.conversion_factor` | `P{row}` | Written as percent value. |
| `SourceStream.biomass_fraction` | `R{row}` | Written as percent value. |

The app does not overwrite calculated fossil/bio CO2e, energy-content, consistency, or completeness cells in `B_EmInst`.
Before Export, source streams are checked against the currently supported official input shape:
`method` must be `Combustion`, `Process Emissions`, or `Mass balance`; activity unit must be `t` or `Nm3`; fuel streams must use `Combustion`; process-material streams must use `Process Emissions` or `Mass balance`.

### `C_Emissions&Energy`

| App field | Official cell | Notes |
| --- | --- | --- |
| `sum(process.electricity_mwh * process.electricity_ef_tco2e_per_mwh)` | `M26` | Manual total indirect emissions entry. |

Fuel and GHG balance rows that are formula-driven from `B_EmInst` remain read-only.

### `E_PurchPrec`

Each purchased precursor block starts at row `14 + index * 44`.

| App field | Official cell | Notes |
| --- | --- | --- |
| `purchased_mass_t` | `L{start + 3}` | First unlocked row under total purchased levels. |
| `consumed_mass_t` | `L{start + 14}` | First unlocked row for consumption in production processes. |
| `consumed_for_non_cbam_mass_t` | `L{start + 24}` | Consumed for other purposes. |
| `direct_see_tco2e_per_t` | `L{start + 35}` | Specific embedded direct emissions. |
| `source` | `M{start + 35}` | Source for direct SEE. |
| `default_value_justification` | `L{start + 40}` | Justification for use of default values, if relevant. |

The app does not currently write `indirect_see_tco2e_per_t` directly into `E_PurchPrec`, because the official indirect SEE row is formula-driven. A later model should capture specific electricity consumption and electricity emission factor separately before writing those unlocked inputs.

### `Summary_Products`

The app writes the minimum product-line inputs needed for the official workbook to identify products and calculate the formula-driven SEE columns.

Rows start at row `10` and currently support up to 100 local product summary rows.

| App field | Official cell | Notes |
| --- | --- | --- |
| `ProductionProcess.name` | `D{row}` | Must match the process name declared in `A_InstData!L83:L92`. |
| `Product.cn_code` or `Product.hs_code` | `F{row}` | CN code used by the official workbook product row. |
| `Product.name` | `H{row}` | Product name for communication with the reporting declarant. |

The app does not overwrite `I:K` SEE cells in `Summary_Products`; those are official formula cells for direct, indirect, and total SEE. Local product-line SEE is used for app review and scenario analysis, while the workbook formula output should be reviewed after opening the generated copy in Excel.

## Known Gaps

- Product-level allocation result values are still not written directly into official SEE cells; the app now writes the official product identification inputs and leaves formula SEE cells intact.
- Source-stream validation is still intentionally conservative. Additional official unit/dropdown values should be added only after confirming the corresponding workbook formulas and validation lists.
