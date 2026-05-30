# EU Template Export Map

This note records the current write targets for the official `CBAM Communication template for installations_en_20241213.xlsx`.

The official workbook itself must stay outside the repository. The app should always export into a user-supplied copy of the current EU template.

## Mapping Principles

- Write only to unlocked input cells in the official template.
- Preserve all official sheet names, formulas, protected labels, formatting, and English text.
- Treat calculated totals and control cells as read-only.
- Keep synthetic verification fixtures minimal; they validate workbook mechanics, not every official formula.

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

These checks are intentionally handled as readiness warnings rather than direct workbook writes, because the current confirmed unlocked `D_Processes` cells accept process-level totals, not a separate product-line allocation table.

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

## Known Gaps

- Production routes and aggregated goods categories should be driven through `A_InstData` and official dropdown/code-list relationships rather than by overwriting protected labels.
- Product-level output and allocation mapping still needs official-cell confirmation before the app writes product-line summaries into the template.
- Source-stream validation is still intentionally conservative. Additional official unit/dropdown values should be added only after confirming the corresponding workbook formulas and validation lists.
