# Final-Period Roadmap

This roadmap resets the free PWA scope after reviewing the 2026 final-period CBAM reference materials.

## Product Scope

The PWA remains a single-user, local-first calculation and export tool. It should be usable by both company users and CBAM consultants, but it should not introduce customer/project workspace management in the free PWA edition.

Both user types use the same workflow:

1. Set installation and reporting period.
2. Register CBAM goods and CN codes.
3. Define production processes and product output lines.
4. Enter source streams, electricity, and precursor data.
5. Select allocation bases.
6. Calculate product-level SEE.
7. Compare actual, semi-actual, and default scenarios.
8. Calculate SEFA and CBAM certificate scenarios.
9. Export a copy of the official EU template.

## PWA Boundary

Include in the free PWA:

- Local IndexedDB storage and `.cbam` backup/restore.
- One local company/workspace at a time.
- Installation, reporting period, goods, production processes, source streams, and purchased precursors.
- Local import of official EU template, benchmark workbook, and default-value workbook.
- Product-line allocation inside a production process.
- Product-level SEE.
- First-pass SEFA and CBAM certificate scenario comparison.
- Export-readiness checklist and official EU template copy export.

Exclude from the free PWA:

- Customer/project workspace management.
- Multi-user collaboration.
- Central database or SaaS storage.
- Consultant portfolio dashboard.
- Email automation and supplier portal.
- Approval workflow, role permissions, SSO, and audit-log administration.
- Full document management system.

These excluded features are candidates for a future Docker/on-prem or supported edition.

## Calculation Engine Direction

The next calculation-engine expansion should follow this sequence:

1. Production-process level input.
2. Add product production lines under each process.
3. Select allocation basis per source or process total.
4. Automatically allocate direct and indirect emissions to product lines.
5. Calculate product-level SEE.
6. Feed product-level results into EU Export.

This is not only a UI improvement. It is the core model expansion needed to handle final-period system-boundary and allocation rules without making the PWA too heavy.

## Allocation Model

Start with a pragmatic allocation model:

- Mass-based allocation for product output lines.
- Manual allocation percentage when the user has a justified internal basis.
- Future molar-ratio allocation for cases where the reference materials require it.

The app should show the allocation basis and calculated shares clearly so users can explain the result during verification.

## Scenario Model

After product-level SEE exists, add scenarios:

- Actual data scenario.
- Semi-actual scenario where some precursors use default values.
- Default-value scenario based on country/CN default values.

Then add:

- Benchmark Column A/B lookup.
- SEFA calculation, with Column A used for actual-data scenarios and Column B used for default-value scenarios.
- CBAM factor and CSCF handling.
- Certificate quantity and cost comparison.

## UX Direction

The UI should stay Korean-first and workflow-oriented:

- Avoid spreadsheet-like dense entry screens.
- Use staged input and review screens.
- Show "what needs attention" before "what formula was used".
- Keep official EU terminology visible only where accuracy requires it.
- Make mobile useful for review/checklist tasks, not heavy data entry.
