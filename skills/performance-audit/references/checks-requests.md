# Request and data-fetching checks

How many requests the application makes, in what order, and how large and fresh they are. Scanner rule IDs appear in brackets.

## 3. Duplicate API reads

- **Signals:** several components fetching the same resource on mount [`effect-fetch`]; fetches in `useEffect` without a shared cache layer; React Strict Mode double-invocation in development mistaken for production behavior.
- **Measure:** request timeline for the route in a production build; count identical requests (same method, URL, and identity).
- **Interventions:** lift the fetch to a shared owner; use the project's existing data layer (TanStack Query, SWR, Apollo, RTK Query) keyed by resource and user; server-side request deduplication where the framework provides it.
- **Pitfalls:** confirm request identity, polling, retries, and user-specific data. Never share caches across users or tenants.

## 4. Search debouncing

- **Signals:** a request fired on every keystroke; no cancellation of stale requests.
- **Measure:** request count per typed query; out-of-order responses in the timeline.
- **Interventions:** debounce requests (not the input value itself); cancel stale requests with `AbortController` or ignore them by request ID; cache recent queries.
- **Pitfalls:** typing must stay responsive. Excessive debounce delay feels slow; tune with users in mind.

## 5. Pagination

- **Signals:** list endpoints returning all rows; queries without `LIMIT`/`take` [`unbounded-findmany`]; client-side pagination of a full dataset.
- **Measure:** response size and query time as data volume grows; row counts in realistic environments.
- **Interventions:** server-side limits with cursor or keyset pagination for large or frequently changing sets; offset pagination for small, stable sets.
- **Pitfalls:** require a stable, unique sort order. Verify page boundaries, deletion during paging, and export features that expect full data.

## 12. External API timeouts

- **Signals:** outbound `fetch`/HTTP client calls without a timeout or `AbortSignal` [`fetch-no-timeout`]; retries without backoff.
- **Measure:** outbound call durations in traces or logs; behavior when the dependency is slow.
- **Interventions:** explicit timeouts (`AbortSignal.timeout(ms)` where supported); bounded retries with backoff and jitter; fallbacks or degraded responses.
- **Pitfalls:** retrying non-idempotent writes can duplicate side effects; use idempotency keys. Timeouts must exceed legitimate slow responses.

## 13. AI streaming

- **Signals:** model responses awaited in full before display; buffering middleware or proxies that defeat streaming.
- **Measure:** time to first token or first useful output versus total completion time.
- **Interventions:** stream responses through the provider SDK and the framework's streaming primitives; render incrementally.
- **Pitfalls:** streaming does not reduce total time or cost. Handle partial output, cancellation, and mid-stream errors.

## 16. Independent request concurrency

- **Signals:** consecutive `await` calls that do not depend on each other [`sequential-await`]; `await` inside loops over independent items [`await-in-loop`].
- **Measure:** span or waterfall showing serialized independent waits.
- **Interventions:** `Promise.all` / `Promise.allSettled` for independent work; bounded concurrency for large fan-outs.
- **Pitfalls:** establish true independence (ordering, transactions, rate limits, shared connections). Unbounded concurrency can exhaust pools or trigger rate limiting.

## 32. Request waterfalls

- **Signals:** parent component fetches, renders a child, which then fetches (fetch-on-render chains) [`effect-fetch`]; client fetch that waits for a client-side auth or config call; lazy-loaded component that itself loads data.
- **Measure:** network waterfall showing sequential dependent requests on the critical path.
- **Interventions:** hoist data loading to the route or server; fetch in parallel with code; preload data in route loaders; combine dependent calls on the server.
- **Pitfalls:** some dependencies are genuine (the second request needs the first response). Do not over-fetch to break a chain.

## 40. Response payload size

- **Signals:** endpoints returning full records or nested relations when the client uses a few fields; large base64 blobs inside JSON.
- **Measure:** response sizes per endpoint (compressed and uncompressed); serialization time on the server.
- **Interventions:** field selection (check 24); pagination (check 5); serve binary data via separate URLs.
- **Pitfalls:** public API consumers may depend on fields. Version or coordinate changes.

## 42. Dynamic response caching

- **Signals:** API or SSR responses identical for many users but sent with `no-store` or no caching [`opt-out-caching`]; missing `ETag`/`Last-Modified`; framework caching or revalidation disabled globally.
- **Measure:** response headers; server load and TTFB for repeated identical requests.
- **Interventions:** `Cache-Control` with `s-maxage` and `stale-while-revalidate` for shared public data; framework revalidation (for example Next.js `revalidate`); conditional requests with `ETag`.
- **Pitfalls:** never cache personalized or authorized responses in shared caches. Check `Vary` and cookies. Define freshness requirements with the owners.
