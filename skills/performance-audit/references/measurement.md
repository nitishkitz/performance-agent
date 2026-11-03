# Measurement playbook

Use the least invasive method that answers the question. Several methods below require a running application, network access, or tools that may not be installed; ask before installing or downloading anything, and never point load or profiling tools at shared or production systems without explicit approval.

## Ground rules

- Measure **production builds**, not development servers. Development mode adds checks, disables optimizations, and (in React Strict Mode) double-invokes effects.
- Hold constant: route, fixture data, user state, cache state (cold or warm, stated explicitly), browser and version, machine, throttling profile, and background load.
- Run each condition **at least 5 times** (10 is better) and keep every raw value. Report medians and spread, not a best run.
- Keep raw results with the command used. Write them to files only with the user's approval; `performance-runs/` is a suggested location and should be git-ignored in the target repository.
- Compare with `scripts/compare-runs.mjs`. Treat its `inconclusive` verdict as final unless more runs change it.
- Lab results are not field results. Say which you have.

## Build output

After the project's own production build has run (with approval), measure emitted assets without extra dependencies:

```bash
node <skill-dir>/scripts/bundle-size.mjs <app-root>                          # totals, largest files, Next.js per-route totals when manifests exist
node <skill-dir>/scripts/bundle-size.mjs <candidate-root> --compare <baseline-root>
```

Sizes include raw, gzip (level 9), and Brotli (quality 11) bytes; servers often compress less aggressively, so check the served `content-encoding` and transfer size too. Byte sizes are deterministic, so one build per condition is enough when build mode and environment match. To compare across a code change, copy the baseline build directory before rebuilding.

| Stack | Command | What it shows |
|---|---|---|
| Next.js | the project's `build` script (usually `next build`) | Route list and, in versions that print it, per-route and shared "First Load JS" |
| Vite | the project's `build` script (usually `vite build`) | Emitted chunks with minified and gzip sizes |
| Any bundler with source maps | `npx source-map-explorer <bundle.js>` (downloads a package; ask first) | Per-module byte attribution |

Bundle analyzers such as `@next/bundle-analyzer` or `rollup-plugin-visualizer` require adding a dependency; propose them rather than installing silently.

## HTTP checks

`measure-http.mjs` takes repeated samples of time to headers, total time, decoded size, and caching or compression headers. It prints raw values ready for `compare-runs.mjs`:

```bash
node <skill-dir>/scripts/measure-http.mjs http://localhost:3000/api/items --runs 10 --warmup 1
node <skill-dir>/scripts/measure-http.mjs http://localhost:3000/ --method HEAD
```

It allows only GET and HEAD, runs sequentially, does not follow redirects, and refuses non-local hosts unless `--allow-remote` is given after the user approves. Node's `fetch` decodes compressed bodies, so `decodedBytes` is the uncompressed size; `content-length` (when present) is the transferred size.

The same checks with curl, for a single request (repeat it; the first run includes DNS and TLS setup):

```bash
curl -s -o /dev/null -w 'ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n' https://example.test/route
```

Compression and caching headers:

```bash
curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://example.test/assets/app.js \
  | grep -i -E '^(content-encoding|cache-control|etag|vary|age|x-cache|cf-cache-status):'
```

Simple repeated sampling for `compare-runs.mjs`:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{time_starttransfer}\n' https://example.test/api/items
done | awk '{ printf "%s%d", (NR>1?",":""), $1*1000 } END { print "" }'
```

The output is a comma-separated list of TTFB values in milliseconds, suitable for `--baseline` or `--candidate`.

## Lighthouse (lab page-load metrics)

```bash
npx lighthouse https://example.test/route --output=json --output-path=performance-runs/lh-1.json \
  --only-categories=performance --chrome-flags="--headless=new"
```

Requires Chrome and downloads the `lighthouse` package on first use; ask first. The default profile emulates a throttled mobile device; `--preset=desktop` switches to desktop. Extract metrics from the JSON, for example `audits['largest-contentful-paint'].numericValue`, `audits['total-blocking-time'].numericValue`, and `audits['cumulative-layout-shift'].numericValue`. Lighthouse scores vary between runs; use repeated runs and medians.

## Browser DevTools (manual, when the user can run them)

- **Network:** enable "Disable cache" for cold runs; count duplicate requests; inspect waterfalls and headers.
- **Performance:** record the slow interaction; read long tasks, INP phases, layout shifts, and the LCP marker.
- **Coverage:** unused JS and CSS bytes on the route.
- **Memory:** take heap snapshots before and after repeating an action several times; compare retained objects.
- **React DevTools Profiler:** commit durations and why each component rendered.

## Database evidence

| Engine / ORM | Method |
|---|---|
| PostgreSQL | `EXPLAIN (ANALYZE, BUFFERS) <query>` — **executes** the query. Read-only queries on non-production data only, unless approved. Plain `EXPLAIN` does not execute. |
| MySQL 8.0.18+ | `EXPLAIN ANALYZE <query>` — also executes the query. |
| Prisma | `new PrismaClient({ log: ['query'] })` to count queries per request |
| Drizzle | `drizzle(client, { logger: true })` |
| Knex | `DEBUG=knex:query` environment variable |
| Sequelize | `logging: console.log` option |
| TypeORM | `logging: ['query']` data-source option |

Count queries for the same request at two list sizes (for example 10 and 100 items). Query count growing with list size is strong evidence for N+1 (check 8).

## Node.js server evidence

- CPU profile: `node --cpu-prof server.js`, exercise the route, stop the process, and open the `.cpuprofile` in DevTools.
- Event-loop delay: `perf_hooks.monitorEventLoopDelay()` sampled while exercising the route.
- Heap: `node --inspect` and DevTools Memory snapshots.

## Field data

Use only data the user can share: existing RUM dashboards, `web-vitals` reports, or the Chrome UX Report for public origins. Do not add telemetry without authorization. Quote field data with its time window, percentile (Core Web Vitals use the 75th percentile), and device segment.

## Recording template

```text
Condition: baseline | candidate (commit or diff description)
Command:   <exact command>
Build:     production | other (explain)
Route/data/cache: ...
Environment: browser/version, machine, throttling
Raw values: v1, v2, v3, ...
```
