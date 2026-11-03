# Example: static audit of the sample app

> Illustrative static-audit report for [`examples/sample-app`](../examples/sample-app), an intentionally flawed, non-runnable source tree. Locations are real; no runtime measurement was performed and no speedup is claimed.

**Scope:** `examples/sample-app` (inside this repository; no pre-existing changes), general review with no specific symptom reported. Routes inspected: `/`, `/dashboard`, `GET /api/orders`.
**Stack:** Next.js App Router (`next@^15`), React 19, Prisma 6, lodash. Detected from `package.json` and confirmed by reading it.
**Evidence level:** static.
**Limitations:**
- No lockfile, `node_modules`, `tsconfig.json`, `next.config.*`, Prisma schema, or hosting configuration is present.
- The application was not built or executed, and no database, browser, or field data was available.
- Several referenced files are not in the tree: `/api/profile`, `public/hero.jpg`, and `data/tax-rates.json`.

## Summary

The strongest issue is on `GET /api/orders`. The handler runs an unbounded list query, then one customer query per order, so the code alone shows an N+1 pattern; its impact is unmeasured. The handler also reads a file synchronously and then waits on an outbound call with no timeout. On the home page:

- the likely LCP image is lazy-loaded and has no dimensions;
- fonts arrive through a remote CSS `@import`;
- two components fetch `/api/profile` independently.

The recommended next step is to log Prisma queries for `/api/orders` at two data sizes.

## Priorities

| # | Finding | Checks | Status | Evidence | Proposed next step |
|---|---|---|---|---|---|
| 1 | One customer query per order over an unbounded list | 8, 5, 24 | source-confirmed | `app/api/orders/route.ts:6`, `:9-10` | Log queries at 10 and 100 orders; batch with `include` or `where: { id: { in } }`; add `take` and `select` |
| 2 | Per-request sync file read, then an untimed outbound call that waits for all database work | 38, 12, 16 | source-confirmed | `app/api/orders/route.ts:5`, `:14` | Load rates once per process; start the FX request early with `AbortSignal.timeout` and a fallback |
| 3 | Likely LCP image lazy-loaded without dimensions | 15, 2, 37 | suspected | `app/page.tsx:7`, `styles/globals.css:7-9` | Load eagerly, add `width`/`height`, confirm the LCP element in a lab trace |
| 4 | Remote font `@import` with six weights | 29, 33 | source-confirmed | `styles/globals.css:1` | Use `next/font` (or `<link>` + `preconnect`) with only the weights in use |
| 5 | `/api/profile` fetched by two effects after hydration | 3, 32 | source-confirmed | `components/Header.tsx:8`, `components/Profile.tsx:9` | Fetch once (server-side or a shared owner keyed by user) and pass it down |

## Findings

### 1. One customer query per order over an unbounded list

- **Observed:** `prisma.order.findMany()` with no `take`, `where`, or `select` (`route.ts:6`), then `await prisma.customer.findUnique(...)` inside `for (const order of orders)` (`route.ts:9-10`).
- **Evidence:** source-confirmed: the code issues 1 + N sequential queries for N orders. Latency and query time are unmeasured, and table width is unknown because there is no schema.
- **Why it matters:** endpoint latency, database load, and payload size would grow with order count.
- **Intervention:** `findMany({ include: { customer: true } })`, or one `customer.findMany({ where: { id: { in: ids } } })` joined in memory. Then add cursor pagination on a stable unique order, and `select` for the fields consumers need.
- **Tradeoffs and risks:**
  - Keep `customer: null` behavior for missing customers.
  - Pagination and narrower fields change the response contract, so confirm the consumers first.
- **Verification:** enable `log: ['query']` outside production, then confirm a constant query count at 10 and 100 orders and identical bodies for a fixed fixture. Compare 10 or more timing samples per condition with `compare-runs.mjs`.

### 2. Blocking read and a serialized, untimed outbound call

- **Observed:** `readFileSync('./data/tax-rates.json')` inside the handler (`route.ts:5`). `fetch('https://fx.example.test/latest')` with no signal (`route.ts:14`), even though it does not depend on the order data, starts only after the loop.
- **Evidence:** source-confirmed for the sequencing and the missing timeout. The cost of the read and the FX latency are unmeasured. The scanner flagged lines 5 and 14 separately. It cannot see that line 14 is parallelizable, because the awaits are not adjacent; that came from reading the handler.
- **Why it matters:** the synchronous read blocks the event loop for concurrent requests, and a slow FX provider would hold every request open.
- **Intervention:** read and parse the rates once (module scope or lazy memo). Start the FX request alongside the database work, with `AbortSignal.timeout(ms)` and a defined fallback.
- **Tradeoffs and risks:** cached rates need a refresh policy, and the fallback semantics are a product decision.
- **Verification:**
  - Event-loop delay under repeated requests.
  - `measure-http.mjs` against a stubbed slow FX endpoint, before and after the change.

Findings 3–5 follow the same structure and are omitted here for brevity. For finding 5, note that `app/layout.tsx:1` is a client component, which keeps `Header` client-rendered. Server components passed to it as `children` can remain server-rendered, so moving `'use client'` down to `Header` mainly restores server rendering of the layout and its `metadata` export. That behavior is version-specific: confirm it against current Next.js documentation.

## Other findings

- `app/dashboard/page.tsx:4-5`: two independent `count()` calls awaited sequentially (check 16, source-confirmed). Fix: `Promise.all` or `prisma.$transaction([...])`.
- `lib/format.ts:1`: whole-lodash import reachable from the client component `components/Profile.tsx:4` (checks 11, 35, suspected until build output shows the chunk). Fix: `lodash/startCase` and `lodash/toLower`, or a small local helper.
- `components/LiveClock.tsx:9`: `setInterval` with no cleanup, so the timer keeps running after unmount (check 39, source-confirmed). Fix: return `() => clearInterval(id)` from the effect.
- `app/layout.tsx:1`: client root layout (checks 20, 22, 34, suspected); see the note under the findings.

## Discarded candidates

- `styles/globals.css:9` `transition: all` (check 45): nothing in the tree changes `.hero` styles, so the transition never runs.

## Verification log

```text
node skills/performance-audit/scripts/detect-stack.mjs examples/sample-app   → Next.js App Router, React, Prisma, lodash; absences listed above
node skills/performance-audit/scripts/scan.mjs examples/sample-app           → 14 candidates; 13 kept, 1 discarded
```

No install, build, test, or runtime measurement was run. No source was modified.

## Checklist coverage

| Status | Checks | Reason |
|---|---|---|
| finding | 2, 3, 5, 8, 11, 12, 15, 16, 20, 22, 24, 29, 32, 33, 34, 35, 37, 38, 39 | Priorities 1–5 and Other findings |
| no issue found | 45 | Transition is never triggered |
| already handled | 25 | `lib/db.ts:3` shares one `PrismaClient` per process. Serverless pooling is unknown without hosting information |
| not applicable | 4, 7, 13, 14, 21, 23, 41, 43 | No search input, deferrable work, AI calls, mutations, third-party scripts, long lists, internal links, or transactions |
| not evaluated | 1, 6, 9, 10, 17, 18, 19, 26, 27, 28, 30, 31, 36, 40, 42, 44 | These need runtime, build, hosting, schema, or field evidence that a non-runnable fixture cannot provide |

## Next steps

1. Measure query count on `/api/orders` at two data sizes, then batch and paginate (finding 1).
2. Move the rates read out of the request path, and parallelize the FX call with a timeout and fallback (finding 2).
3. With approval, install and build, then run `bundle-size.mjs` and five or more Lighthouse runs on `/` to confirm findings 3–5 and the lodash cost.
4. Fix the `LiveClock` cleanup and the duplicate profile request.
5. Confirm the missing `/api/profile`, `public/hero.jpg`, and `data/tax-rates.json` with the team.
