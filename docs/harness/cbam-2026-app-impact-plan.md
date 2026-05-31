# CBAM 2026 App Impact Plan

This plan translates `cbam-2026-definitive-basis.md` into concrete app changes. It should be updated when calculation fields or export behavior change.

## Current Risk

The MVP currently uses `total_see` as the main actual-data result:

```text
total_see = direct_see + indirect_see + precursor_see
```

That is useful as an operational review total, but it is not always the same as the 2026 CBAM certificate-basis SEE. Annex II direct-only goods, especially iron and steel goods, need a separate certificate-basis view.

## Required Field Split

Keep existing fields during migration for backwards compatibility, but introduce explicit final-period fields:

| Field | Meaning | Initial mapping |
| --- | --- | --- |
| `direct_see` | Final-good specific direct embedded emissions | Existing direct SEE. |
| `own_indirect_see` | Final-good own electricity-related indirect SEE | Gross electricity SEE, even when excluded from certificate basis. |
| `indirect_see` | Backwards-compatible included indirect SEE | Keep for now; equals included indirect SEE. |
| `indirect_see_excluded` | Final-good own indirect SEE excluded from certificate-basis treatment | Gross electricity SEE when Annex II direct-only applies. |
| `precursor_see` | Eligible precursor contribution used in current result | Existing precursor contribution until precursor CN classification is added. |
| `see_informational_total` | Review total: direct + own indirect + precursor | New preferred UI field for operational review. |
| `see_cbam_basis` | Certificate-basis SEE | New preferred field for scenarios and certificate indicators. |
| `total_see` | Legacy field | Keep as alias of `see_informational_total` during migration. |

## Calculation Engine Changes

Files:

- `src/lib/cbam-product-rules.ts`
- `src/lib/calculation-engine.ts`
- `src/lib/scenario-calculation.ts`

Required changes:

- Rename the user-facing indirect rule from "excluded" to "certificate-basis excluded".
- Return both gross own indirect emissions and certificate-basis included indirect emissions.
- For Annex II final goods, set own indirect to zero only in `see_cbam_basis`, not in `see_informational_total`.
- Keep precursor contribution in both fields for now, with a `precursor_treatment_status` or warning that per-precursor Annex II classification is not fully implemented yet.
- Use `see_cbam_basis` for actual certificate quantity/cost indicators.
- Use `see_informational_total` only for operational review and comparison.

## UI Changes

Files:

- `src/app/results/page.tsx`
- `src/app/scenarios/page.tsx`
- `src/app/export/page.tsx`
- `src/app/processes/page.tsx`
- `src/components/ScenarioAssumptionSummary.tsx`

Required copy changes:

- Replace "간접 제외" with "인증서 산정 제외" or "Annex II direct-only".
- Show "보고/검토용 간접배출" separately where gross electricity emissions exist.
- Show both:
  - `CBAM 산정 기준 SEE`
  - `참고용 총 SEE`
- Add helper text that Annex II direct-only excludes the final good's own indirect emissions from certificate-basis calculations, but not necessarily every precursor indirect component.

## Export Changes

Files:

- `src/lib/eu-template-export.ts`
- `src/app/export/page.tsx`
- `docs/harness/eu-template-export-map.md`
- `docs/excel-recalculation-review.md`

Required changes:

- Continue preserving `Summary_Products` formulas.
- Rename the app-side comparison from "총 SEE" to the exact concept being shown:
  - `CBAM 산정 기준 SEE`
  - `참고용 총 SEE`
  - `Excel 공식 수식 결과`
- Do not treat the workbook's `Summary_Products!K` result as equivalent to `see_cbam_basis` without mapping proof.
- Record differences as expected/reviewable until the official input-cell chain is fully mapped.

## Scenario Changes

Files:

- `src/lib/scenario-calculation.ts`
- `scripts/verify-scenario-risks.mjs`

Required changes:

- `actual_see` should use `see_cbam_basis`, not legacy `total_see`.
- Add `informational_total_see` to scenario rows for context.
- Keep default-value comparison based on official default values.
- SEFA/FAA should reduce certificate quantity, not be described as a simple display indicator.

## Verification Changes

Files:

- `scripts/verify-local-calculation.mjs`
- `scripts/verify-scenario-risks.mjs`
- `scripts/verify-eu-export.mjs`
- `scripts/verify-local-eu-template.mjs`
- `scripts/verify-mvp-flow.mjs`

Required checks:

- Annex II steel example keeps own indirect emissions visible as review data.
- Annex II steel example excludes own indirect emissions from `see_cbam_basis`.
- `see_informational_total` includes direct + own indirect + precursor.
- Scenario certificate indicator uses `see_cbam_basis`.
- Export preview labels distinguish app certificate-basis SEE, app informational SEE, and Excel formula outputs.
- Existing `Summary_Products` formula preservation checks remain mandatory.

## Migration Order

1. Add calculation fields without removing legacy `total_see`.
2. Update scenario calculations to use `see_cbam_basis`.
3. Update results and export UI labels.
4. Update verification scripts.
5. Later: replace broad prefix classification with imported/versioned CN master classification.
6. Later: classify every precursor with its own Annex I/II status and origin treatment.
