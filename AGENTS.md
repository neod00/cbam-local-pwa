# CBAM Local Agent Guide

This repository is a local-first PWA for CBAM embedded emissions calculation. Treat this file as the map, not the full manual. Read the linked docs only when they are relevant to the task.

## Product Direction

- Default product: free local-first PWA.
- Sensitive company data must stay in the browser/local project backup by default.
- Public SaaS is for demos and sample data only.
- Future paid edition: Docker/on-prem deployment for multi-user internal company use.

See:
- `docs/harness/product-principles.md`
- `docs/harness/data-safety.md`

## Architecture Map

- Frontend: Next.js App Router, React, Tailwind CSS.
- Local data: IndexedDB through `src/lib/local-db.ts`.
- PWA shell: `public/manifest.webmanifest`, `public/sw.js`, and `src/components/ServiceWorkerRegistration.tsx`.
- Calculation engine: pure TypeScript in `src/lib/calculation-engine.ts`.
- Supabase schema is historical/reference only for now; do not add new PWA features that depend on Supabase SaaS.

See:
- `docs/harness/architecture.md`
- `docs/harness/cbam-domain-map.md`

## Working Rules

- Keep company data flows local-first unless a task explicitly says otherwise.
- Prefer small, verifiable changes with clear user-facing behavior.
- Keep calculation logic separate from UI so the future Docker edition can reuse it.
- When adding persistent data, update backup/export/import support in `src/lib/local-db.ts`.
- When adding CBAM domain concepts, map them to the EU communication template where possible.

## Quality Gates

Before finishing code changes, run:

```bash
npm.cmd run lint
npm.cmd run build
```

If a change touches backup/import, manually reason through backwards compatibility with existing `.cbam` files.

See:
- `docs/harness/quality-gates.md`

## Execution Plans

Use `docs/harness/execution-plans.md` for active and completed high-level work. Keep it brief and update it when a milestone changes product direction, data shape, or release readiness.
