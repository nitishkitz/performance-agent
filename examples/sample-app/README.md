# Sample app (intentionally flawed)

A small, **non-runnable** Next.js-style source tree with deliberate performance problems. It exists so that:

- the bundled scripts have a reproducible fixture for automated tests, and
- [the example report](../../docs/example-report.md) can cite real file locations.

No dependencies are installed and there is no lockfile; do not deploy or copy this code.

| File | Planted issue | Checks |
|---|---|---|
| `components/Header.tsx`, `components/Profile.tsx` | Both fetch `/api/profile` on mount | 3, 32 |
| `app/api/orders/route.ts` | Unbounded `findMany()`, per-order query in a loop, outbound fetch without timeout, synchronous file read per request | 5, 8, 12, 38 |
| `app/dashboard/page.tsx` | Independent awaits run sequentially | 16 |
| `app/layout.tsx` | `"use client"` on the root layout | 20, 22, 34 |
| `app/page.tsx` | Hero image lazy-loaded and missing dimensions | 2, 15, 37 |
| `lib/format.ts` (imported by `components/Profile.tsx`) | Whole-library lodash import in client code | 11, 35 |
| `styles/globals.css` | Remote font `@import`, `transition: all` | 29, 33, 45 |
| `components/LiveClock.tsx` | `setInterval` without cleanup | 39 |
