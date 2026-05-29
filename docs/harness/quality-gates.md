# Quality Gates

## Required Checks

Run before finishing code changes:

```bash
npm.cmd run verify
```

This runs the synthetic EU Export workbook verification, lint, and production build. Use `npm.cmd` on Windows because PowerShell execution policy can block `npm.ps1`.

## PWA Checks

For changes touching PWA behavior:

- Confirm `manifest.webmanifest` still exists and is valid JSON.
- Confirm service worker does not cache sensitive generated user data.
- Avoid external font or script dependencies unless explicitly justified.

## Storage And Backup Checks

For changes touching `src/lib/local-db.ts`:

- Existing stores remain exportable.
- Import validates file format before replacing local data.
- New stores are included in backup counts.
- Deletion/clear operations require explicit user confirmation in UI.

## CBAM Domain Checks

For changes touching calculation or domain data:

- Inputs should map to an EU template concept when possible.
- Calculation outputs should include enough metadata for reproducibility.
- Warnings should be explicit rather than silently accepting suspicious data.

## EU Export Checks

For changes touching `src/lib/eu-template-export.ts` or EU template mapping:

- Run `npm.cmd run verify:export` during focused iteration.
- Keep the official EU workbook out of the repository.
- Synthetic fixtures may cover workbook structure and cell injection, but must not replace final manual checks against the current official EU template before release.
- Generated workbook copies must preserve official sheet names, formulas, field labels, and English text.

## UI Checks

- Text must fit in common desktop widths.
- Avoid marketing-style landing pages; this is an operational tool.
- Prefer dense but readable forms/tables for ESG, production, and compliance users.
- Keep data safety messaging visible where users handle local data.
- User-facing app UI should be Korean-first. Keep English only for official EU terms, acronyms, or labels that are intentionally shown for mapping.
- Do not translate or alter official EU submission template sheets or field labels in exported workbook files.
