# EU Template Export Map

This note records the current write targets for the official `CBAM Communication template for installations_en_20241213.xlsx`.

The official workbook itself must stay outside the repository. The app should always export into a user-supplied copy of the current EU template.

## Mapping Principles

- Write only to unlocked input cells in the official template.
- Preserve all official sheet names, formulas, protected labels, formatting, and English text.
- Treat calculated totals and control cells as read-only.
- Keep synthetic verification fixtures minimal; they validate workbook mechanics, not every official formula.

## Current Export Targets

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

- `A_InstData` is not yet populated from the local installation/reporting-period records.
- `B_EmInst` and `C_Emissions&Energy` require a more detailed source-stream and energy model before reliable export.
- Production routes and aggregated goods categories should be driven through `A_InstData` and official dropdown/code-list relationships rather than by overwriting protected labels.
