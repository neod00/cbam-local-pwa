# Product Principles

## Positioning

CBAM Local is a free, local-first PWA that helps companies calculate and organize CBAM embedded emissions data without uploading sensitive production data to a central SaaS server.

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

## Non-Goals For The PWA Edition

- Multi-user collaboration.
- Central SaaS database.
- Automatic collection of real company telemetry.
- Replacing official legal verification or accredited third-party assurance.
