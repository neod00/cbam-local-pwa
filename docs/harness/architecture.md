# Architecture

## Current Stack

- Next.js App Router.
- React client components for local browser workflows.
- Tailwind CSS for styling.
- IndexedDB wrapper in `src/lib/local-db.ts`.
- Pure TypeScript calculation module in `src/lib/calculation-engine.ts`.
- PWA assets in `public/manifest.webmanifest` and `public/sw.js`.

## Boundary Rules

- UI components can call local browser persistence APIs through `src/lib/local-db.ts`.
- Calculation logic should stay in pure TypeScript modules and avoid direct DOM, React, or storage dependencies.
- Persistent domain data must be represented in `src/lib/local-db.ts` until a more formal storage layer is introduced.
- Adding a new IndexedDB store requires updating:
  - Store name union.
  - Entity type.
  - Backup export/import shape.
  - Demo seed behavior if relevant.

## Supabase Status

Supabase was part of the original SaaS-oriented scaffold. For the PWA edition, Supabase is not on the critical path. Keep `supabase/schema.sql` as reference material for future Docker/on-prem database design, but do not build new free PWA features that require Supabase SaaS.

## PWA Rules

- Service worker must not create hidden server data flows.
- App shell should continue to load offline after first visit.
- External runtime dependencies such as remote fonts should be avoided.
- Local backups must remain a first-class UX because browser storage can be cleared by users or enterprise policies.

## Future Refactors

When domain complexity increases, split storage by domain:

- `src/lib/storage/*`
- `src/lib/cbam/*`
- `src/lib/calculation/*`
- `src/lib/export/*`

Do this only when the current single-file storage layer becomes materially hard to maintain.
