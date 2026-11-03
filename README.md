# Performance Agent

**Find what slows your app. Fix it with evidence.**

An installable performance-audit skill for coding agents. Point it at a repository to investigate slow pages, sluggish interactions, repeated requests, large JavaScript payloads, layout shift, and inefficient data access. Every finding comes with a source location or a measurement and is labeled `measured`, `source-confirmed` (certain from code, impact unmeasured), or `suspected`.

[![CI](https://github.com/nitishkitz/performance-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/nitishkitz/performance-agent/actions/workflows/ci.yml)

## The workflow

```text
Your repository + symptom
      ↓
Detect the stack                 scripts/detect-stack.mjs
      ↓
Route the symptom to checks      45 checks, symptom routing table
      ↓
Gather candidates                scripts/scan.mjs (19 read-only heuristics)
      ↓
Inspect callers and data flow    candidates become findings or are discarded
      ↓
Measure when safe                bundle-size.mjs, measure-http.mjs, playbook
      ↓
Prioritized report: findings, evidence, limitations, coverage of all 45 checks
      ↓
Focused fix + re-measure         bundle-size, measure-http, compare-runs (when requested)
```

## What is included

| Component | Purpose |
|---|---|
| [SKILL.md](skills/performance-audit/SKILL.md) | The audit workflow, evidence rules, and fix discipline the agent follows. |
| [Checklist index](skills/performance-audit/references/checklist.md) | 45 checks with stable IDs and a symptom-to-check routing table. |
| Check details: [delivery](skills/performance-audit/references/checks-delivery.md), [rendering](skills/performance-audit/references/checks-rendering.md), [requests](skills/performance-audit/references/checks-requests.md), [backend](skills/performance-audit/references/checks-backend.md) | Signals, measurement, interventions, and pitfalls for each check. |
| [Measurement playbook](skills/performance-audit/references/measurement.md) | Build output, curl, Lighthouse, DevTools, database, and Node.js evidence recipes. |
| [Report template](skills/performance-audit/references/report-template.md) | A consistent report with a verification log and checklist coverage. |
| `scripts/detect-stack.mjs` | Reads manifests and config names to report frameworks, data layer, monitoring, hosting hints, and scripts. |
| `scripts/scan.mjs` | Flags candidate locations (for example `useEffect` fetches, `await` in loops, unbounded queries, lazy hero images, blocking scripts). |
| `scripts/bundle-size.mjs` | Measures an existing production build: raw, gzip, and Brotli sizes, largest files, Next.js per-route totals, and build-to-build comparison. |
| `scripts/measure-http.mjs` | Repeated GET/HEAD timing with compression and caching headers; localhost only unless explicitly allowed. |
| `scripts/compare-runs.mjs` | Compares repeated baseline and candidate measurements with medians, spread, and a Mann-Whitney test; refuses to call small or noisy samples a win. |

All scripts are dependency-free Node.js (18.17 or later) and never modify files. Only `measure-http.mjs` makes network requests, and only to the URL you give it. Run `node skills/performance-audit/scripts/scan.mjs --list-rules` to see every heuristic.

## Install

```bash
npx skills add nitishkitz/performance-agent
```

Select `performance-audit` and your coding agent when prompted. Alternatively, copy `skills/performance-audit/` (including `scripts/` and `references/`) into your agent's skill directory:

- Claude Code: `.claude/skills/performance-audit/` in a project, or `~/.claude/skills/performance-audit/` for all projects.
- Codex: `~/.codex/skills/performance-audit/`.

Restart or refresh skill discovery if your host requires it.

## Use

Ask your coding agent:

> Use performance-audit to review this repository. Identify the most important performance issues, show evidence, and do not modify source files.

For a specific symptom:

> Use performance-audit to investigate why the search page feels slow when typing. Distinguish measured problems from hypotheses.

For fixes:

> Use performance-audit to fix the highest-confidence finding, preserve existing behavior, and verify the result with repeated measurements.

Explicit invocation: `/performance-audit` in Claude Code; `$performance-audit` in Codex.

You can also run the scripts yourself:

```bash
node skills/performance-audit/scripts/detect-stack.mjs path/to/app
node skills/performance-audit/scripts/scan.mjs path/to/app --checks 3,8,22
node skills/performance-audit/scripts/compare-runs.mjs --baseline 812,790,845,801,830 --candidate 640,655,700,630,662 --metric "LCP ms"
```

## What it covers

45 investigation prompts across frontend delivery, rendering and interaction, requests and data fetching, and backend, data, and operations. IDs 1–31 are unchanged from the first release. [Read the checklist →](skills/performance-audit/references/checklist.md)

The primary focus is JavaScript/TypeScript web applications, especially React and Next.js. The checklist and playbook also apply to other stacks, but the scanner heuristics target JavaScript, TypeScript, HTML, CSS, and SQL text.

## Example

[`examples/sample-app`](examples/sample-app) is a small, intentionally flawed source tree. Running the scanner on it surfaces all 14 planted candidates, and [the example report](docs/example-report.md) shows how an agent turns those candidates into a prioritized static audit.

```text
$ npm run -s scan:example
| Rule | Checks | Confidence | Count |
|---|---|---|---|
| `await-in-loop` | 8, 16 | medium | 1 |
| `client-root-layout` | 20, 22, 34 | medium | 1 |
| `effect-fetch` | 3, 32 | medium | 2 |
| `unbounded-findmany` | 5, 24 | medium | 1 |
| `fetch-no-timeout` | 12 | low | 1 |
...
```

## Honest limits

- The scanner is a text heuristic. It produces a reading list, not findings, and it can miss issues or flag acceptable code. The skill instructs the agent to verify every candidate.
- There is no bundled browser runner or benchmark service. Runtime evidence depends on tools available in your environment; the playbook explains how to gather it and when to ask first.
- No performance score is produced, and no speedup is claimed without measurements you can reproduce.
- Effectiveness depends on the coding agent, the repository, and the evidence available.

Audits default to source inspection without edits. Fixes happen only when requested. The package adds no telemetry, credentials, accounts, or hosted service; your coding agent has its own data policies. Application scripts and external tools keep their own execution requirements.

## Development

```bash
npm test
```

The test suite covers the following:

- The scanner against the sample app (exact expected candidates).
- The scanner against clean fixtures (no false positives), plus regression cases for false-positive patterns found on real open-source projects.
- The statistics in `compare-runs`.
- `bundle-size` against a simulated Next.js build.
- `measure-http` against a local server, including its safety refusals.
- Documentation consistency: frontmatter, all 45 check IDs, anchors, relative links, and rule references. CI runs on Linux and macOS with Node.js 18, 20, and 22.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Next

- Optional browser measurement helper that records repeated Lighthouse runs.
- Cross-statement analysis in the scanner (for example, independent requests awaited after unrelated work).
- Additional scanner coverage for Vue, Svelte, and Python backends.
- Before/after case studies backed by retained measurement evidence.
- A tested host and framework compatibility matrix.

## Inspiration

Packaging clarity inspired by [motion-graphics](https://github.com/Barty-Bart/motion-graphics). The original checklist was developed from the performance techniques discussed in [this video](https://www.youtube.com/shorts/8JsFi_ZOvio), with additional conditions and evidence requirements. Original skill instructions; no reference project's code or media is bundled.

## License

MIT. See [LICENSE](LICENSE).
