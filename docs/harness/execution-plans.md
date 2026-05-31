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
- Added `npm run verify` as the standard local quality gate combining Export verification, lint, and production build.
- Added Export success feedback that shows the generated copy filename, timestamp, and verified cell counts after download starts.
- Corrected EU Export writes to target unlocked official template input cells and documented the current export map.
- Added first-pass `A_InstData` export for reporting-period dates and basic installation identity.
- Expanded the installation model and UI for `A_InstData` address/contact fields, including local/internal and English installation names.
- Added the source-stream data model and Korean-first `배출원 자료` screen for future `B_EmInst` and `C_Emissions&Energy` export work.
- Added first-pass source-stream export writes into `B_EmInst` and manual total indirect emissions into `C_Emissions&Energy`.
- Added conservative source-stream validation for EU-supported monitoring approaches, activity units, and source-stream type/method combinations.
- Aligned source-stream on-screen emission estimates with the EU template combustion structure and added a focused calculation verification gate.
- Added source-stream energy-content previews so fuel rows show the same audit concept used by `B_EmInst` energy calculations.
- Added source-stream direct-emissions mismatch warnings to Results and EU Export readiness checks.
- Added a production-process edit helper that shows linked source-stream totals and lets users apply the total to direct attributable emissions.
- Added source-stream review status to the production-process list so mismatch cases are visible before opening the edit form.
- Connected the dashboard to local calculation results so readiness, warnings, and next tasks reflect the user's current browser-local data.
- Linked dashboard next-task items to the relevant local edit screens so warnings can be resolved from the dashboard.
- Added structured calculation warning targets and linked Results warnings to the relevant process or precursor edit screen.
- Included source-stream data in the Export preview calculation summary so Export warning totals match dashboard and Results.
- Added a local calculation verification gate to assert source-stream totals and warning targets are included in calculation results.
- Reviewed the additional 2026 final-period CBAM materials, including `EUCBAM배산인수.pdf`, benchmark values, and country/CN default values. Captured the need to extend the app from SEE-only MVP logic toward system-boundary, allocation, SEFA, and certificate scenario support.
- Added the first product-line allocation model: production processes can store product output lines, choose mass/manual allocation, and calculate product-level SEE from allocated direct, indirect, and precursor emissions.
- Added local reference workbook import for CBAM benchmark and country/CN default-value files so future SEFA/default scenarios can use user-supplied official workbooks without server upload.
- Added first-pass CN-specific indirect-emissions applicability so HS 72/73 iron and steel products exclude electricity from SEE unless an explicit included CN rule applies.
- Added precursor data modes, supplier country/installation fields, verification status, and local country/CN default-value lookup for purchased precursor SEE entry.
- Added first-pass SEFA and CBAM certificate scenario screen comparing product SEE, default values, benchmark Column A, and certificate quantity/cost indicators.
- Added shared product-line allocation summary checks, including mixed allocation-basis warnings and an in-form line-total review box.
- Connected product-line allocation checks to EU Export readiness so submission prep warns about output-total differences and mixed allocation bases before workbook download.
- Added default-value scenario SEFA and certificate indicators using Benchmark Column B, while keeping actual-data indicators on Benchmark Column A.
- Added actual-vs-default certificate comparison fields so the scenario screen can show which basis has the lower certificate cost indicator.
- Surfaced actual-vs-default certificate basis decisions in dashboard tasks and the EU Export checklist.
- Clarified scenario assumption displays with origin country, CSCF, and a visible notice that paid-carbon-price offsets are not included yet.
- Added EU Export readiness warnings for default precursor justification gaps and unverified actual/semi-actual precursor data.
- Added EU Export readiness warnings when process direct emissions have no linked source-stream evidence.
- Surfaced missing source-stream evidence in local calculation warnings so Results and Dashboard show the issue before Export.
- Restored Korean-first copy on the source-stream entry screen so B_EmInst/C_Emissions&Energy data entry is usable for domestic operators.
- Updated dashboard progress logic so missing or mismatched source-stream evidence marks the direct-emissions step as requiring review.
- Updated the production-process screen so the source-stream review count and lists flag missing source-stream evidence, not only emission-total mismatches.
- Added a production-process edit notice that directs users to add source-stream evidence when direct emissions exist without linked B_EmInst data.
- Added precursor evidence review indicators for default-value justification, SEE source, and unverified actual/semi-actual data.
- Added precursor form notices for unverified actual/semi-actual data and missing default-value justification.
- Improved the EU Export readiness review with area summaries, error-first ordering, and clearer edit actions.
- Linked Export checklist error and warning items to the first editable readiness issue.
- Replaced the default Next.js README with Korean project documentation covering local-first PWA usage, data safety, EU template handling, verification commands, and MVP limits.
- Updated the PWA manifest and service-worker app shell to cover the current MVP routes and Korean local-first positioning.
- Removed unused default Next.js public SVG assets so the public folder only keeps app-relevant PWA assets.
- Added an MVP release checklist covering verification, excluded reference documents, user notices, license decisions, and deferred post-MVP scope.
- Added `npm run verify:pwa` to assert PWA manifest metadata, service-worker app-shell routes, README release guidance, and absence of unused default assets.
- Added an in-app settings notice clarifying that CBAM Local supports calculation and submission preparation but does not replace legal advice, official verification, or final filing responsibility.
- Added a security policy for public repository use, warning users not to share company CBAM data, `.cbam` backups, or EU template files in issues or pull requests.
- Updated release documentation for the private-source distribution strategy: keep GitHub private, distribute the free PWA by URL, and defer protected logic to future server/API or Docker/on-premise editions.
- Added a free PWA terms draft covering free-use scope, redistribution limits, local data handling, liability notice, and source-protection limits.
- Added a PWA deployment guide for private-source URL distribution, with Vercel as the lowest-friction MVP path and explicit exclusions for local reference documents, official EU templates, and company data.
- Clarified the Export screen and checklist so users can see the current written sheets and understand that product-line allocation results are reviewed/calculated but not directly written into a separate EU product-line table before official cell confirmation.
- Ran local Chrome-based route and screenshot checks for dashboard, Export, settings, and mobile dashboard; fixed stale dashboard copy that described Export as `D_Processes`/`E_PurchPrec` only.
- Added a reusable local official-template verification script and fixed EU Export cell replacement for self-closing official workbook cells while preserving cell style IDs.
- Extended EU Export writes into `A_InstData` aggregated-goods and production-process boundary tables so the official workbook receives product category, route, process boundary, and process name declarations before process-level totals.
- Added first-pass `Summary_Products` export writes for production process, CN code, and product name while preserving official direct/indirect/total SEE formula cells.
- Added an Export-page `Summary_Products` review table that shows the target EU row, process, CN code, product name, allocation share, and app-calculated SEE before workbook download.
- Restored Korean-first copy on the EU Export page, including template selection, validation status, checklist, Export principles, readiness issues, and SEE preview labels.
- Restored Korean-first copy on the Results page, including allocation labels, SEE table headers, loading/empty states, and warning actions.
- Added synthetic EU Export verification that `Summary_Products` direct, indirect, and total SEE formula cells remain intact while the app writes only product-identification inputs.
- Extended local official-template verification to report and assert the presence of `Summary_Products` SEE formulas after Export copy generation.
- Verified the local official EU installation communication template dated 2024-12-13: 19 sheets, 569 CN rows, 42 planned/written/checked cells, and preserved `Summary_Products` I/J/K formulas.
- Added local SEE review values to the official-template verification report so Export copies can be manually compared against Excel-recalculated `Summary_Products` formulas before submission.
- Restored Korean-first SEFA/certificate scenario messages and review actions while keeping the current certificate indicator formula as a labelled review aid.
- Added an MVP user-notices document covering legal/verification limits, local data and `.cbam` backup handling, latest EU template use, Excel formula review, and deferred free-license/admin scope.
- Restored Korean-first global navigation/topbar labels and added `npm run verify:mvp-flow` to guard the MVP flow from dashboard through results, scenarios, Export, and backup notices.
- Established the post-MVP productization plan with `DESIGN.md`, a guided CBAM workflow, free-license strategy, update policy, admin-console plan, and `npm run verify:design-system`.
- Added a settings-page free-license placeholder with local mock registration, explicit server non-transfer notice for CBAM data/templates/backups, and `.cbam` backup inclusion through the existing settings store.
- Reworked the dashboard toward a guided submission workspace with current status, next action, workflow steps, fix-list tasks, evidence checklist, local backup status, and Export formula-review reminders.
- Added a free-PWA update manifest, app-shell update notice, service-worker cache entry, and `npm run verify:update-policy` so optional/recommended/required update behavior can be managed without collecting CBAM calculation data.
- Refined the settings free-license area with registration status, update status, a local-only data-boundary card, and a manual update status check backed by the static update manifest.
- Reworked the EU Export page entry state into a submission gate with export-blocking status, first-issue navigation, template/readiness/backup summary, and clearer final copy generation CTA.
- Added production-process next-action guidance that surfaces product-line allocation review and source-stream evidence gaps before users reach the dense process table.
- Added source-stream next-action guidance for production-process linking, evidence-source completion, unsupported type review, and process comparison.
- Added purchased-precursor next-action guidance for default-value justification, actual/semi-actual verification status, evidence source gaps, and scenario handoff.
- Added a reusable action item card and applied it to production-process, source-stream, precursor, and SEFA/certificate priority-action areas so guided-workflow cards can move toward one consistent design system.
- Applied the shared action item card to dashboard tasks, Results calculation warnings, and EU Export checklist/readiness issues for a more consistent guided workflow.
- Documented `ActionItemCard` as a core design-system pattern and added it to the design-system verification guard.
- Added a mobile card fallback for Results SEE rows so users do not have to read the dense calculation table on small PWA screens.
- Added reusable empty states with direct add actions for core input screens so first-time users can start products, processes, source streams, and precursors from the empty list view.
- Expanded the admin-console plan with minimal license/update/announcement tables, API routes, and required-update flow while preserving the no-CBAM-data server boundary.
- Added an EU Export submission review procedure covering latest-template upload, readiness errors, Excel recalculation, formula preservation, SEE comparison, warning review, and `.cbam` backup.
- Updated the free PWA terms draft to cover free-license registration data, update notices, and the rule that license/update checks do not collect CBAM calculation data or `.cbam` backups.
- Documented `EmptyState` as a design-system pattern and added it to the design-system verification guard.
- Added `FormSection` as a design-system pattern and used it to split the production-process form into basic information, product-line allocation, and emissions/production sections.
- Split the purchased-precursor form into guided sections for basic information, data mode/verification, process links, default-value quantity inputs, and SEE evidence.
- Split the source-stream form into guided sections for process linkage, activity/emission factors, and evidence coefficients with a visible estimated-emissions panel.
- Improved the product form with CN-code guidance and an empty search-result message so users understand that EU Export prioritizes CN 8-digit matching.
- Added MVP flow verification guards for the guided process, source-stream, and precursor form sections.
- Added `필수`, `선택`, and `검토용` priority badges to guided form sections so first-time users can distinguish required calculation inputs from review/supporting fields.
- Added mobile card fallbacks for EU Export `Summary_Products` and SEE preview rows so submission review is readable without horizontal table scrolling in the PWA.
- Added a mobile card fallback for SEFA/certificate scenario review so users can compare actual/default SEE and certificate cost indicators without reading the full desktop table.
- Detailed the free-license/admin rollout with client API contracts, forbidden server fields, phased implementation, and the rule that license/update controls must not block local `.cbam` backup access.
- Split the installation form into required identification, optional address/location, and contact sections, and added a guided empty state for first-time setup.
- Clarified the upload screen so official reference workbook imports are marked as available while internal activity-data templates and bulk upload are clearly labelled as post-MVP.
- Added an MVP rehearsal plan that walks a company user from Dashboard through installation, period, products, process allocation, source streams, precursors, reference uploads, results, scenarios, EU Export, Excel formula review, and `.cbam` backup.
- Added `npm run verify:local-references` so local benchmark and country/CN default-value workbooks can be checked with the same parser used by the PWA without committing reference files to Git.
- Recorded the current MVP rehearsal report: full `npm.cmd run verify`, local EU template verification, local benchmark/default-value verification, and remaining manual Excel/browser walkthrough blockers.
- Strengthened the free PWA terms draft with license-scope, official-material rights, support limits, warranty disclaimer, access restriction, and pre-release legal review placeholders.
- Added `npm run verify:deployment` to guard private-source deployment readiness, including forbidden tracked local files, package privacy, deployment docs, release checklist, and rehearsal report coverage.
- Added a fictional MVP rehearsal dataset so browser walkthroughs can use repeatable non-company inputs for installation, period, products, allocation, source streams, precursors, scenarios, Export, Excel review, and `.cbam` backup.
- Added `npm run verify:routes` so the full verification gate builds the app, starts a local production server, and checks the main PWA routes before release.
- Added an Excel recalculation review checklist so generated EU workbook copies can be compared against app SEE review values before public MVP distribution.
- Added a first private PWA deployment runbook covering local verification, Git hygiene, Vercel settings, post-deploy checks, network data-boundary review, fictional-data rehearsal, and rollback criteria.
- Added a free PWA release announcement draft covering local-first data handling, latest EU template upload, `.cbam` backups, Excel formula review, support limits, and source/bundle visibility.
- Added an in-app EU Export final review card so users see latest-template, Excel recalculation, responsibility, and `.cbam` backup reminders before using the generated copy.
- Added a settings-page local-use safety checklist covering no server upload, browser-local storage, `.cbam` backup timing, and official Excel review before submission.
- Added `npm run release:status` to summarize remaining manual release blockers, required docs, and first-deployment operator actions without running a deployment.
- Added an in-app release notes page and connected the update manifest/notice to it so update communications do not point to a missing route.
- Added the 2026 definitive-period basis document and updated the domain map to split informational SEE from CBAM certificate-basis SEE, including Annex II direct-only and precursor-treatment implications.
- Added the app impact plan for 2026 definitive-period changes, covering calculation fields, UI wording, Export comparison, scenario calculations, and verification updates.
- Split local calculation and scenario outputs into `see_cbam_basis` and `see_informational_total` while keeping legacy `total_see` as an informational alias.
- Updated Results, Scenarios, and EU Export UI labels so users see `CBAM 기준 SEE` separately from `참고용 총 SEE`.
- Updated the local EU template verification report and Export map so `Summary_Products` formulas remain read-only while app review values are compared as separate CBAM-basis and informational totals.

Pending product decisions:

- Review and finalize the free-use terms with legal wording before public distribution.

Next:

- Complete the remaining manual browser walkthrough in `docs/mvp-rehearsal-plan.md` using `docs/mvp-fictional-dataset.md`.
- Open an exported workbook copy in Microsoft Excel and compare recalculated `Summary_Products` formula outputs with the app's local SEE review values using `docs/excel-recalculation-review.md`.
- Review and finalize `docs/free-pwa-terms-draft.md` and `docs/free-pwa-release-announcement-draft.md` with legal/operational wording before public distribution.
- Prepare the first private-source PWA deployment run using `docs/pwa-deployment-guide.md` and `docs/first-deployment-runbook.md`.

## Decision Log

- 2026-05-29: PWA is the primary free distribution channel to avoid installer trust warnings and reduce SaaS data exposure concerns.
- 2026-05-29: Docker/on-prem deployment is deferred as a future paid/supportable edition for multi-user company environments.
- 2026-05-29: `revfactory/harness` is not installed because it is Claude Code native; this repository uses a Codex-native lightweight harness through versioned docs.
- 2026-05-31: MVP free PWA hosting defaults to Vercel with a Private GitHub repository; Cloudflare Pages, Netlify, self-hosted static hosting, and Docker/on-premise remain fallback or paid-edition channels.
