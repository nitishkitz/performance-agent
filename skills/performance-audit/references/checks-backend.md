# Backend, data, and operations checks

Server processing, databases, deployment, and observability. Many of these checks need evidence beyond source code; mark them `not evaluated` when it is unavailable. Scanner rule IDs appear in brackets.

## 7. Background jobs

- **Signals:** request handlers that send email, generate files, call slow third parties, or process uploads before responding.
- **Measure:** handler duration breakdown in traces or logs.
- **Interventions:** move deferrable work to the project's existing job mechanism or platform primitives (for example a queue, cron, or `waitUntil`-style APIs).
- **Pitfalls:** jobs require durability, idempotency, retries, and visible status and error handling. Do not introduce a queue without authorization.

## 8. N+1 queries

- **Signals:** ORM or SQL calls inside loops or `.map` over query results [`await-in-loop`]; lazy-loaded relations accessed per row; GraphQL resolvers without batching.
- **Measure:** query count per request as list size grows (ORM query logging); trace spans.
- **Interventions:** eager loading (`include`/`with`/joins); batched `WHERE id IN (...)`; DataLoader-style batching for resolvers.
- **Pitfalls:** batching must preserve ordering, missing-row handling, and authorization filters. Large `IN` lists and wide joins have their own costs.

## 10. Repeated-data caching

- **Signals:** identical expensive reads on every request (configuration, catalogs, computed aggregates).
- **Measure:** repeated identical query or call frequency and cost from logs or traces.
- **Interventions:** request-scoped memoization; in-process caches with size limits and TTL; framework data caches; shared caches only when justified.
- **Pitfalls:** define freshness, invalidation, and per-user or per-tenant separation before caching. Redis is optional, not a default. Unbounded caches become leaks (check 39).

## 17. Query-specific indexes

- **Signals:** filters, joins, and sorts on columns without indexes in the schema or migrations (for example `prisma/schema.prisma` `@@index`, SQL migrations).
- **Measure:** `EXPLAIN` plans against representative data (sequential scans on large tables, sorts spilling to disk); slow-query logs.
- **Interventions:** propose a specific index for a specific query, including column order and expected selectivity.
- **Pitfalls:** indexes cost writes and storage. Never run migrations automatically. `EXPLAIN ANALYZE` executes the statement; do not run it on writes or production without approval.

## 18. Backend tracing

- **Signals:** OpenTelemetry, APM, or vendor SDKs in dependencies; structured timing logs.
- **Measure:** span breakdown for the slow endpoint (database, outbound calls, serialization, queueing).
- **Interventions:** add spans around suspected hot paths when instrumentation already exists; use traces to choose among other checks.
- **Pitfalls:** tracing locates waiting; it is not an optimization. SDK presence does not prove data is collected.

## 19. App/database placement

- **Signals:** explicit region configuration for the application and database (platform config, infrastructure code).
- **Measure:** per-query network round-trip time; latency difference between co-located and remote calls.
- **Interventions:** co-locate compute with data; reduce round trips per request (checks 8, 16).
- **Pitfalls:** require explicit deployment evidence. Never infer geography from hostnames or resource names.

## 24. Selected database fields

- **Signals:** `SELECT *` [`select-star`]; ORM queries without `select` for wide tables or large text/JSON columns; fetching relations that are not used.
- **Measure:** row width and response size; query time with and without the large columns.
- **Interventions:** select required columns; exclude large columns from list views.
- **Pitfalls:** do not remove fields that downstream code needs. Narrower selection does not automatically speed up scans; covering indexes are a separate decision.

## 25. Connection pooling

- **Signals:** a new database client per request; serverless functions connecting directly to a database without a pooler; pool size configuration.
- **Measure:** connection counts at the database; connection-acquisition time in traces; "too many connections" errors.
- **Interventions:** a single shared client per process; the platform's or database provider's pooler for serverless; tuned pool size.
- **Pitfalls:** total connections equal pool size times instances. Configuration presence is not runtime proof. Transaction-mode poolers may not support every feature (for example some prepared-statement modes).

## 28. Load balancing

- **Signals:** single instance under high concurrency; platform scaling configuration.
- **Measure:** CPU, memory, and queueing at the instance during load; latency versus concurrency.
- **Interventions:** horizontal scaling or autoscaling through the existing platform.
- **Pitfalls:** load balancing addresses capacity and availability. It does not fix an inefficient endpoint or slow database, and it multiplies database connections (check 25).

## 30. Real-user monitoring

- **Signals:** `web-vitals`, vendor RUM SDKs, or platform analytics in dependencies or layout code.
- **Measure:** field LCP, INP, and CLS by route and device class, if the user can share them.
- **Interventions:** report Core Web Vitals with route attribution through the existing tooling.
- **Pitfalls:** distinguish SDK presence, actual production data, and local lab measurements. Respect privacy and consent requirements.

## 38. Server event-loop blocking

- **Signals:** `readFileSync`, `execSync`, or other synchronous I/O in request paths [`sync-fs-server`]; CPU-heavy work (hashing, image processing, large JSON, complex regular expressions) inside handlers.
- **Measure:** event-loop delay (`perf_hooks.monitorEventLoopDelay`); CPU profile (`node --cpu-prof`) under representative load.
- **Interventions:** asynchronous APIs; caching results computed at startup; worker threads or offloading for CPU-bound work.
- **Pitfalls:** synchronous reads at startup or in build scripts are usually acceptable. Verify the code path actually runs per request.

## 39. Memory leaks and unbounded growth

- **Signals:** `setInterval` without `clearInterval` [`interval-no-clear`]; `addEventListener` without cleanup in components [`listener-no-remove`]; subscriptions not unsubscribed; module-level maps or arrays that grow per request.
- **Measure:** heap snapshots compared over repeated actions (browser Memory panel or Node `--inspect`); process memory over time.
- **Interventions:** cleanup in effect return functions or unmount hooks; `AbortController` to remove listeners; bounded caches with eviction.
- **Pitfalls:** file-level scanner heuristics cannot see cleanup in other modules. Confirm with heap evidence before claiming a leak.

## 43. Long transactions and lock contention

- **Signals:** transactions wrapping outbound HTTP calls or slow computation; frequent updates to the same hot rows (counters); `SELECT ... FOR UPDATE` on broad ranges.
- **Measure:** lock waits and long-running transactions in database statistics (for example PostgreSQL `pg_stat_activity` and `pg_locks`); deadlock logs.
- **Interventions:** keep transactions short and free of external calls; batch or shard counters; narrow locking scopes.
- **Pitfalls:** changing transaction boundaries can break consistency guarantees. Involve the data owners before restructuring.
