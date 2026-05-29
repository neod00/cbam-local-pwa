# Execution Plans

## Active Plan

### PWA Local-First MVP

Status: in progress.

Completed:

- Converted core Products, Periods, and Installations pages from Supabase-driven demo behavior to IndexedDB local storage.
- Added PWA manifest, icon, service worker, and registration component.
- Removed remote Google Fonts dependency for offline-friendly builds.
- Added Settings & Data Safety page with `.cbam` backup export/import and local data clearing.
- Created this harness documentation set for agent-first development.
- Added Production Processes local data model and UI, mapped to EU template `D_Processes`.
- Added Purchased Precursors local data model and UI, mapped to EU template `E_PurchPrec`.
- Set Korean-first UI direction for domestic SME/mid-market users while preserving original EU submission template language and workbook structure.
- Connected the Results page to local production process, purchased precursor, product, and reporting period data for process-level SEE calculation.
- Added the EU template Export entry point with browser-local validation of required official sheets and copy-download flow.
- Added a Korean-first completed-product design preview page for dashboard, workflow, calculation, validation, and export states.
- Added controlled browser-side value injection into EU template `D_Processes` and `E_PurchPrec` copies using local process and precursor data.
- Added EU Export readiness checks for goods category mapping, CN/HS code precision, linked products, precursor sources, and current template row limits.
- Added optional CN 8-digit product code support and wired it into product entry, calculation results, and EU Export readiness checks.
- Added uploaded-template `Parameters_CNCodes` parsing so CN 8-digit codes resolve against the user's current EU template before Export.
- Added representative CN 8-digit search/select helpers on the product entry form while keeping final validation tied to the uploaded EU template.
- Added product-page import of full CN code options from an uploaded EU template, stored locally for reusable product search/selection.
- Added product edit/update support so existing products can be corrected after CN code reference import.
- Added the first-pass Clean Compliance Dashboard redesign with shared layout, sidebar/topbar, UI primitives, and refreshed dashboard/product/result/export/settings screens.
- Extended the Clean Compliance Dashboard redesign to reporting periods, installations, production processes, purchased precursors, and upload screens, including mobile card-list layouts.
- Added delete safeguards for products, production processes, and purchased precursors so linked records are not removed without dependency checks.
- Added edit/update support for production processes and purchased precursors so users can correct inputs after validation warnings.
- Added edit/update support for reporting periods and installations, and connected key form labels to inputs for accessibility-oriented testing.
- Added inline validation guidance for products, reporting periods, installations, production processes, and purchased precursors before local save.
- Added readiness-linked navigation from EU Export validation warnings to the exact product, process, or precursor edit form.
- Added an EU Export pre-submission checklist so users can see template, data, error, and warning readiness before downloading a copy.
- Added generated workbook cell-write planning and post-injection verification for `D_Processes` and `E_PurchPrec`.
- Linked and repaired default sample process/precursor records to the sample product so first-run Export readiness demonstrates a valid workflow.
- Added `npm run verify:export`, a synthetic workbook verification script for EU template validation and `D_Processes`/`E_PurchPrec` cell injection.

Next:

- Expand EU template coverage beyond the first MVP cells once more official workbook sections are mapped.

## Decision Log

- 2026-05-29: PWA is the primary free distribution channel to avoid installer trust warnings and reduce SaaS data exposure concerns.
- 2026-05-29: Docker/on-prem deployment is deferred as a future paid/supportable edition for multi-user company environments.
- 2026-05-29: `revfactory/harness` is not installed because it is Claude Code native; this repository uses a Codex-native lightweight harness through versioned docs.
