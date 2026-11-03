# 45 performance checks

These are investigation prompts, not mandatory changes. **Inspect** requires repository evidence; **measure** requires runtime evidence. A check without supporting evidence stays `not evaluated`. Database and infrastructure checks often need information that source code does not contain.

Check IDs are stable across releases, so reports remain comparable over time.

## Symptom routing

Start from the reported symptom. Read the linked detail files only for selected checks.

| Symptom | Start with | Then consider |
|---|---|---|
| Slow first load / poor LCP | 2, 15, 20, 22, 33 | 6, 9, 27, 29, 34, 35, 44 |
| Large JavaScript bundle | 11, 22, 35, 44 | 20, 21, 34 |
| Sluggish clicks or typing / poor INP | 26, 36, 4 | 21, 23, 14, 45 |
| Layout jumps / poor CLS | 37, 2, 15 | 1, 29 |
| Slow navigation between pages | 32, 41, 20 | 3, 22, 42 |
| Repeated or excessive network requests | 3, 32, 4 | 10, 16, 42 |
| Slow API endpoint | 8, 16, 18, 24 | 17, 12, 38, 40, 43 |
| Slow database / timeouts under load | 8, 17, 25, 43 | 24, 5, 10, 19 |
| Slow on mobile or poor networks | 31, 2, 22, 9 | 15, 29, 35, 41 |
| Memory growth / tab or process slows over time | 39 | 23, 10, 26 |
| Long scrolling list is janky | 23, 26 | 45, 36 |
| AI or long-running responses feel slow | 13, 7 | 1, 12 |
| Performance regressed recently | 44, 18, 30 | compare commits; then route by new symptom |

## Index

| # | Check | Detail |
|---|---|---|
| 1 | Skeleton/loading states | [rendering](checks-rendering.md#1-skeletonloading-states) |
| 2 | Image formats and sizing | [delivery](checks-delivery.md#2-image-formats-and-sizing) |
| 3 | Duplicate API reads | [requests](checks-requests.md#3-duplicate-api-reads) |
| 4 | Search debouncing | [requests](checks-requests.md#4-search-debouncing) |
| 5 | Pagination | [requests](checks-requests.md#5-pagination) |
| 6 | CDN for static assets | [delivery](checks-delivery.md#6-cdn-for-static-assets) |
| 7 | Background jobs | [backend](checks-backend.md#7-background-jobs) |
| 8 | N+1 queries | [backend](checks-backend.md#8-n1-queries) |
| 9 | Text compression | [delivery](checks-delivery.md#9-text-compression) |
| 10 | Repeated-data caching | [backend](checks-backend.md#10-repeated-data-caching) |
| 11 | Unused shipped dependencies | [delivery](checks-delivery.md#11-unused-shipped-dependencies) |
| 12 | External API timeouts | [requests](checks-requests.md#12-external-api-timeouts) |
| 13 | AI streaming | [requests](checks-requests.md#13-ai-streaming) |
| 14 | Optimistic UI | [rendering](checks-rendering.md#14-optimistic-ui) |
| 15 | Offscreen lazy-loading | [delivery](checks-delivery.md#15-offscreen-lazy-loading) |
| 16 | Independent request concurrency | [requests](checks-requests.md#16-independent-request-concurrency) |
| 17 | Query-specific indexes | [backend](checks-backend.md#17-query-specific-indexes) |
| 18 | Backend tracing | [backend](checks-backend.md#18-backend-tracing) |
| 19 | App/database placement | [backend](checks-backend.md#19-appdatabase-placement) |
| 20 | Server/static rendering | [rendering](checks-rendering.md#20-serverstatic-rendering) |
| 21 | Third-party script timing | [delivery](checks-delivery.md#21-third-party-script-timing) |
| 22 | Route-level code splitting | [delivery](checks-delivery.md#22-route-level-code-splitting) |
| 23 | Long-list virtualization | [rendering](checks-rendering.md#23-long-list-virtualization) |
| 24 | Selected database fields | [backend](checks-backend.md#24-selected-database-fields) |
| 25 | Connection pooling | [backend](checks-backend.md#25-connection-pooling) |
| 26 | Expensive React re-renders | [rendering](checks-rendering.md#26-expensive-react-re-renders) |
| 27 | Browser asset caching | [delivery](checks-delivery.md#27-browser-asset-caching) |
| 28 | Load balancing | [backend](checks-backend.md#28-load-balancing) |
| 29 | Font delivery and weights | [delivery](checks-delivery.md#29-font-delivery-and-weights) |
| 30 | Real-user monitoring | [backend](checks-backend.md#30-real-user-monitoring) |
| 31 | Constrained devices/networks | [rendering](checks-rendering.md#31-constrained-devicesnetworks) |
| 32 | Request waterfalls | [requests](checks-requests.md#32-request-waterfalls) |
| 33 | Render-blocking resources and resource hints | [delivery](checks-delivery.md#33-render-blocking-resources-and-resource-hints) |
| 34 | Hydration and serialized payload size | [rendering](checks-rendering.md#34-hydration-and-serialized-payload-size) |
| 35 | Non-tree-shakeable imports | [delivery](checks-delivery.md#35-non-tree-shakeable-imports) |
| 36 | Main-thread long tasks | [rendering](checks-rendering.md#36-main-thread-long-tasks) |
| 37 | Layout shift sources | [rendering](checks-rendering.md#37-layout-shift-sources) |
| 38 | Server event-loop blocking | [backend](checks-backend.md#38-server-event-loop-blocking) |
| 39 | Memory leaks and unbounded growth | [backend](checks-backend.md#39-memory-leaks-and-unbounded-growth) |
| 40 | Response payload size | [requests](checks-requests.md#40-response-payload-size) |
| 41 | Navigation prefetching | [delivery](checks-delivery.md#41-navigation-prefetching) |
| 42 | Dynamic response caching | [requests](checks-requests.md#42-dynamic-response-caching) |
| 43 | Long transactions and lock contention | [backend](checks-backend.md#43-long-transactions-and-lock-contention) |
| 44 | Production build configuration | [delivery](checks-delivery.md#44-production-build-configuration) |
| 45 | Animation and compositing cost | [rendering](checks-rendering.md#45-animation-and-compositing-cost) |

## Detail format

Each check in the detail files lists:

- **Signals** — what to look for in source, config, or build output (scanner rule IDs in brackets where one exists).
- **Measure** — runtime evidence that would confirm or refute impact.
- **Interventions** — focused options, smallest first.
- **Pitfalls** — conditions under which the intervention is wrong or harmful.

## Useful primary references

- [Web Vitals](https://web.dev/articles/vitals)
- [Lighthouse scoring and variability](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- [Browser-level image lazy loading](https://web.dev/articles/browser-level-image-lazy-loading)
- [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp)
- [Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp)
- [Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls)
- [HTTP caching (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
- [PostgreSQL indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html)

Consult current framework and database documentation when a proposed change depends on version-specific behavior.
