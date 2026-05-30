# Product Principles

## Positioning

CBAM Local is a free, local-first PWA that helps companies calculate and organize CBAM embedded emissions data without uploading sensitive production data to a central SaaS server.

The PWA can be used by company users and CBAM consultants, but both use the same single-workspace workflow. The free PWA should not introduce separate customer/project workspace management.

## Distribution Strategy

1. Free PWA edition
   - Browser-installable.
   - Local storage through IndexedDB and `.cbam` backup files.
   - Suitable for single-user and small company workflows.
   - Real company data should remain local.

2. Demo web deployment
   - Public website for sample data, education, and feature exploration.
   - Must clearly warn users not to enter real confidential company data.

3. Future Docker/on-prem edition
   - Paid or supported option.
   - Internal company network deployment.
   - Multi-user access, role controls, Postgres, and admin operations.

## Product Promises

- No server storage for sensitive company data in the PWA edition.
- Calculation results must be reproducible from input snapshots and version metadata.
- EU template compatibility is a core workflow, not an export afterthought.
- The app should be understandable by non-IT environmental, ESG, production, and sales support teams.
- The app UI is Korean-first for domestic SME/mid-market users. English should appear only for official EU terms, abbreviations, or template references where it improves accuracy.
- EU submission templates must preserve the original workbook structure, sheet names, field labels, formulas, and language. Localized UI labels must not modify official EU template artifacts.

## Non-Goals For The PWA Edition

- Multi-user collaboration.
- Customer/project workspace management for consultant portfolios.
- Central SaaS database.
- Automatic collection of real company telemetry.
- Replacing official legal verification or accredited third-party assurance.
