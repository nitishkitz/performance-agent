# 31 performance checks

These are investigation prompts, not mandatory changes. “Inspect” requires repository evidence; “measure” requires runtime evidence. An unsupported check remains not evaluated. Database and infrastructure checks often need information beyond source code.

| # | Inspect | Important condition / verification |
|---|---|---|
| 1 | Skeleton/loading states | Improve perceived waiting; reserve layout space. Do not claim lower server latency. |
| 2 | Image formats and sizing | Compare bytes and visual quality; WebP/AVIF alone does not fix oversized dimensions. |
| 3 | Duplicate API reads | Check request identity, polling, retries and user-specific data before deduplicating. |
| 4 | Search debouncing | Preserve responsive typing; cancel or ignore stale responses. |
| 5 | Pagination | Bound payloads; verify stable ordering and page boundaries. |
| 6 | CDN for static assets | Check existing hosting first; no provisioning based only on absence in source. |
| 7 | Background jobs | Appropriate for deferred tasks; require durability, idempotency and status/error handling. |
| 8 | N+1 queries | Follow actual query paths; measure query growth and preserve returned data when batching. |
| 9 | Text compression | Verify response encoding for text; avoid redundant compression of compressed media. |
| 10 | Repeated-data caching | Prove expensive repeated reads; define freshness, invalidation and user separation. Redis is optional. |
| 11 | Unused shipped dependencies | Inspect build output/imports; dev-only packages do not necessarily affect browser payload. |
| 12 | External API timeouts | Bound waiting and handle failure; retries of writes require special care. |
| 13 | AI streaming | Separate time to first useful output from total completion time. |
| 14 | Optimistic UI | Use appropriate reversible actions; reconcile errors and server state. |
| 15 | Offscreen lazy-loading | Never blindly defer hero/LCP images; preserve image dimensions. |
| 16 | Independent request concurrency | Establish independence; limit concurrency when necessary. |
| 17 | Query-specific indexes | Inspect query plans where available; account for writes/storage; no automatic migrations. |
| 18 | Backend tracing | Use available spans to locate waiting; tracing itself is not an optimization. |
| 19 | App/database placement | Require explicit deployment evidence; avoid guessing geography from names. |
| 20 | Server/static rendering | Compare initial content, TTFB, hydration and interaction costs; no universal rendering rewrite. |
| 21 | Third-party script timing | Defer nonessential work without breaking dependencies or required behavior. |
| 22 | Route-level code splitting | Compare initial shipped JS and verify deferred features still work. |
| 23 | Long-list virtualization | Establish rendering cost; preserve focus, keyboard use and accessible navigation. |
| 24 | Selected database fields | Reduce over-fetching without removing required data; do not imply faster scans automatically. |
| 25 | Connection pooling | Check deployment/runtime and total DB capacity; presence in config is not runtime proof. |
| 26 | Expensive React re-renders | Profile where possible; do not add blanket memoization. |
| 27 | Browser asset caching | Verify headers and versioned URLs; distinguish cold and warm runs. |
| 28 | Load balancing | Addresses capacity/availability; not a cure for an inefficient endpoint or slow database. |
| 29 | Font delivery and weights | Compare transferred bytes and text visibility; self-hosting is not always faster. |
| 30 | Real-user monitoring | Distinguish SDK presence, actual production data, and local lab measurements. |
| 31 | Constrained devices/networks | Record test profile; desktop emulation is not physical-device or real-user evidence. |

## Useful primary references

- [Web Vitals](https://web.dev/articles/vitals)
- [Lighthouse variability](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- [Image lazy loading](https://web.dev/articles/browser-level-image-lazy-loading)
- [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
- [PostgreSQL indexes](https://www.postgresql.org/docs/current/indexes.html)

Consult current framework/database documentation when the proposed change depends on version-specific behavior.
