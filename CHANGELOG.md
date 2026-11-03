# Changelog

## 0.2.0

### Added

- 14 new checks (IDs 32–45): request waterfalls, render-blocking resources and hints, hydration payload size, non-tree-shakeable imports, main-thread long tasks, layout shift sources, server event-loop blocking, memory leaks, response payload size, navigation prefetching, dynamic response caching, long transactions and lock contention, production build configuration, and animation cost.
- Per-check detail files with signals, measurement methods, interventions, and pitfalls for all 45 checks.
- Symptom-to-check routing table.
- Measurement playbook covering build output, curl, Lighthouse, DevTools, database query logging and plans, Node.js profiling, and field data.
- `scripts/detect-stack.mjs`: read-only stack, data-layer, monitoring, hosting, and script detection, including monorepos.
- `scripts/scan.mjs`: 19 read-only candidate heuristics mapped to check IDs, with secret redaction in snippets.
- `scripts/compare-runs.mjs`: baseline versus candidate comparison with medians, IQR, MAD, and an exact or approximate Mann-Whitney U test.
- `scripts/bundle-size.mjs`: raw, gzip, and Brotli sizes of an existing build, Next.js per-route totals, and build comparison with hash-insensitive matching.
- `scripts/measure-http.mjs`: repeated GET/HEAD timing and header sampling, restricted to localhost unless `--allow-remote` is given.
- Evidence label `source-confirmed`, coverage status `no issue found`, and report sections for other findings and discarded candidates.
- Scanner cross-file notes (same URL fetched by several effects; heavy imports in modules with no importers), skipped-file counts, and test files excluded by default (`--include-tests`).
- Stack detector reports router type and notable absences (lockfile, installed dependencies, config, schema, hosting).
- `examples/sample-app`: intentionally flawed fixture and a static example report that cites its real locations.
- Test suite and CI (Linux and macOS, Node.js 18, 20, 22).

### Changed

- `SKILL.md` restructured into an eight-step workflow (scope, detect, route, gather, measure, prioritize, fix, deliver) with explicit honesty rules.
- Report template now includes a summary, per-finding structure, verification log, and coverage table for 45 checks.
- Check IDs 1–31 are unchanged.
- Scanner precision tuned against real open-source repositories; for example, harmless namespace imports such as `import * as React` are no longer flagged.

## 0.1.0

- Initial release: `performance-audit` skill with 31 checks and a report template.
