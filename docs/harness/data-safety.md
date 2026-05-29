# Data Safety

## Core Rule

In the free PWA edition, installation data, production activity data, precursor data, calculation runs, and results must stay local by default.

## Sensitive Data

Treat these as confidential:

- Installation identity and location.
- Production processes and routes.
- Product CN/HS codes linked to company products.
- Energy and fuel usage.
- Source streams and emission factors.
- Purchased precursor quantities and SEE values.
- Product-level direct, indirect, precursor, and total SEE.

## Local Storage Model

The app uses browser local storage mechanisms, currently IndexedDB. This is acceptable for a local-first PWA, but it is not a long-term archival system by itself.

Required safeguards:

- Export a `.cbam` backup file.
- Import and preview `.cbam` backups before restore.
- Show last backup time.
- Warn users that browser data deletion can remove local project data.
- Keep EU Excel export separate from full project backup.

## Network And Telemetry

- Do not add telemetry that sends company data.
- Any future update check or usage analytics must be opt-in and documented.
- Public demo deployments must instruct users not to enter real company data.

## Backup Compatibility

`.cbam` files are currently JSON with:

- `manifest`
- `data.installations`
- `data.products`
- `data.periods`
- `data.settings`

If the format changes, increment `format_version` and support migration or provide a clear incompatibility error.
