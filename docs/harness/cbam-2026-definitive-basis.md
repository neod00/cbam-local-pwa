# CBAM 2026 Definitive Basis

This document fixes the regulatory baseline for the app after the 2026 definitive period started. It is a product and engineering guide, not legal advice. Where a rule affects calculation logic, keep the rule traceable to an official source and keep the local calculation engine separate from UI wording.

## Baseline

- As of 2026-05-31, CBAM is in the definitive regime, not the transitional period.
- The transitional period ran from 2023-10-01 to 2025-12-31.
- The free local PWA should treat transitional-period materials as historical/reference material only unless a user explicitly imports old supplier data for migration or comparison.
- Live calculation logic for 2026 and later must be based on Regulation (EU) 2023/956 as amended and the definitive-period implementing regulations.

## Official Source Priority

| Priority | Source | App use |
| --- | --- | --- |
| 1 | Regulation (EU) 2023/956 | Scope, authorised CBAM declarant obligations, embedded emissions, certificate surrender, carbon price paid, free allocation adjustment, Annex I, Annex II, Annex IV. |
| 2 | Commission Implementing Regulation (EU) 2025/2547 | Definitive-period embedded-emissions calculation method, system boundaries, production processes, functional units, actual-value rules, precursor treatment. |
| 3 | Commission Implementing Regulation (EU) 2025/2620 | Free allocation adjustment and SEFA calculation. |
| 4 | Commission Implementing Regulation (EU) 2025/2621 | Definitive-period default values. |
| 5 | Commission Implementing Regulation (EU) 2025/2548 | CBAM certificate price calculation and publication. |
| 6 | EU Commission CBAM pages, FAQs, communication templates, benchmark/default-value workbooks | Operational guidance and data-transfer templates. These do not replace EUR-Lex legal acts. |
| 7 | Implementing Regulation (EU) 2023/1773 | Transitional-period reporting methodology only. Do not use as the live 2026 calculation basis. |

Useful official links:

- Regulation (EU) 2023/956: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R0956
- Implementing Regulation (EU) 2025/2547: https://eur-lex.europa.eu/legal-content/EN/AUTO/?uri=CELEX%3A32025R2547
- Implementing Regulation (EU) 2025/2620: https://eur-lex.europa.eu/legal-content/en/TXT/?qid=1773196267002&uri=CELEX%3A32025R2620
- Implementing Regulation (EU) 2025/2621: https://eur-lex.europa.eu/legal-content/EN/AUTO/?uri=CELEX%3A32025R2621
- Implementing Regulation (EU) 2025/2548: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32025R2548
- CBAM Registry and Reporting: https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-registry-and-reporting_en
- Price of CBAM certificates: https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en
- CBAM Legislation and Guidance: https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en

## Annex I and Annex II

- Annex I is the CBAM goods scope list. A good must be in Annex I to be in scope, subject to exclusions and later amendments.
- Annex II is not an out-of-scope list. It is the list of goods for which only direct emissions are to be taken into account under Article 7(1).
- For Annex II goods, the final good's own electricity-related indirect emissions should not be treated as part of the CBAM certificate-basis embedded emissions.
- Annex II treatment does not mean indirect emissions data is useless. It can still be useful for evidence, supplier review, LCA-style operational review, and workbook communication fields.
- Annex II treatment also does not mean all precursor indirect emissions are ignored. Definitive-period system-boundary rules require precursor embedded emissions to be evaluated according to the precursor's own classification and the complex-good rules.

## Steel Interpretation

The app must not classify steel with a broad `HS 72/73 = all steel = all direct-only` shortcut.

Required approach:

- Use a CN-code master/reference table.
- Store Annex I status.
- Store Annex II direct-only status.
- Store excluded goods status where applicable.
- Store sector, aggregated goods category, production route, functional unit, GHG scope, and legal-source version.
- Treat Chapter 72 and specific Chapter 73 headings as directed by the official Annex tables and the current imported reference workbooks, not by prefix heuristics alone.

Safe UI wording for Annex II steel:

- "Annex II direct-only: 인증서 산정 기준은 직접배출 중심"
- "간접배출: 인증서 산정 제외, 보고/검토용 별도 관리"
- "CBAM 산정 기준 SEE"
- "참고용 총 SEE"

Avoid:

- "간접배출 없음"
- "철강은 간접 제외" without saying "certificate-basis" or "Annex II direct-only"
- "HS 73 전체 CBAM 대상"

## SEE Values To Separate

The current MVP `total_see` is not enough for the definitive-period app.

The calculation result should separate:

- `see_direct`: specific direct embedded emissions.
- `see_own_indirect`: final-good own electricity-related indirect SEE.
- `see_precursor_contribution`: precursor embedded-emissions contribution to the final good.
- `see_cbam_basis`: SEE basis for CBAM certificate scenario calculations.
- `see_informational_total`: operational/review total SEE.

For an Annex II final good:

```text
see_informational_total = see_direct + see_own_indirect + see_precursor_contribution
see_cbam_basis = see_direct + eligible_precursor_contribution
```

For a non-Annex II final good:

```text
see_informational_total = see_direct + see_own_indirect + see_precursor_contribution
see_cbam_basis = see_direct + see_own_indirect + eligible_precursor_contribution
```

For complex goods, precursor contribution must be computed per precursor, using each precursor's own CN classification, origin, actual/default mode, and direct/indirect applicability. A final Annex II product does not automatically zero out the indirect portion embedded in every precursor.

## SEFA and Certificate Scenario Relationship

The scenario engine should not treat SEFA as a display-only value.

Recommended high-level flow:

```text
gross_embedded_emissions = imported_mass * see_cbam_basis
free_allocation_adjustment = imported_mass * sefa
certificate_quantity = gross_embedded_emissions
                     - free_allocation_adjustment
                     - eligible_carbon_price_paid_reduction
certificate_cost = certificate_quantity * applicable_certificate_price
```

2026 certificate price handling:

- Implementing Regulation (EU) 2025/2548 and the Commission certificate price page state that 2026 prices are quarterly.
- From 2027 onwards, prices are weekly.
- The app should version certificate-price assumptions by year/quarter or week and label estimated prices clearly.

## Communication Template and Export

The `CBAM Communication template for installations` workbook is a data-transfer and communication tool between non-EU installation operators and declarants. It is not the legal act itself.

Export rules:

- Do not bundle EU workbook originals into the app.
- Let users upload the current official workbook they intend to use.
- Preserve sheet names, English labels, formulas, styles, validations, and protected areas.
- Write only confirmed input cells.
- Treat `Summary_Products` formula/output cells as read-only.
- Compare Excel-recalculated workbook results with local app calculation outputs, but do not assume the workbook's `SEE total` is the same concept as the app's `see_cbam_basis`.
- Generate a review report for differences between app values and workbook formula values.

## Immediate App Impact

P0 changes:

- Split transitional-period assumptions from definitive-period logic.
- Replace broad HS prefix indirect-emissions classification with CN master-driven classification.
- Split `total_see` into `see_cbam_basis` and `see_informational_total`.
- Keep own indirect emissions for Annex II goods as report/review data, but exclude them from certificate-basis SEE.
- Model precursor contribution separately and preserve the possibility that non-Annex II precursor indirect emissions flow into an Annex II final good.
- Keep `Summary_Products` formula cells read-only and strengthen the Export comparison report.

P1 changes:

- Implement SEFA/FAA as first-class scenario values.
- Version definitive-period default values from the user's official reference workbook/regulation source.
- Version certificate prices and price assumptions.
- Add carbon-price-paid evidence workflow as pending/estimated/confirmed rather than a hard-coded deduction.

P2 changes:

- Improve UI copy around Annex II, direct-only, certificate-basis SEE, and informational SEE.
- Add template version-lock and mapping review metadata.
- Add de minimis/threshold checks only after the current legal amendment source is confirmed and scoped.
