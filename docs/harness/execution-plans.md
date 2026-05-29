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

Next:

- Add explicit CN 8-digit product master support and map `Parameters_CNCodes` values instead of relying on HS-prefix fallback mapping.

## Decision Log

- 2026-05-29: PWA is the primary free distribution channel to avoid installer trust warnings and reduce SaaS data exposure concerns.
- 2026-05-29: Docker/on-prem deployment is deferred as a future paid/supportable edition for multi-user company environments.
- 2026-05-29: `revfactory/harness` is not installed because it is Claude Code native; this repository uses a Codex-native lightweight harness through versioned docs.
