# Performance Agent

**Find what slows your app. Fix it with evidence.**

An installable performance-audit skill for coding agents. Point it at your repository to investigate slow pages, repeated requests, large JavaScript payloads, and inefficient data access.

## The workflow

```text
Your repository
      ↓
Inspect the stack and relevant code
      ↓
Evaluate 31 performance checks
      ↓
Prioritized findings + evidence + limitations
      ↓
Focused fixes and verification, when requested
```

## Skill

| Skill | What you get |
|---|---|
| [performance-audit](skills/performance-audit/SKILL.md) | A repository performance review with actionable findings, source locations, tradeoffs, and verification steps. |

## Install

```bash
npx skills add nitishkitz/performance-agent
```

Select `performance-audit` and your coding agent when prompted. Alternatively, install manually:

Copy `skills/performance-audit/` into your coding agent's skill directory:

- Codex: `~/.codex/skills/performance-audit/`
- Claude Code: `.claude/skills/performance-audit/` in your project.

Restart or refresh skill discovery if your host requires it. No additional dependency is required by this skill; runtime checks use tools already available in your project and agent environment.

## Use

Ask your coding agent:

> Use performance-audit to review this repository. Identify the most important performance issues, show evidence, and do not modify source files.

For an investigation:

> Use performance-audit to investigate why the search page feels slow. Distinguish measured problems from hypotheses.

For fixes:

> Use performance-audit to fix the highest-confidence finding, preserve existing behavior, and verify the result using available project tools.

Host-specific explicit invocation: `$performance-audit` in Codex; `/performance-audit` in Claude Code where supported. Agent host behavior has not yet been independently compatibility-tested for this release.

## What it covers

31 investigation prompts across frontend delivery, requests, rendering, database access, caching, and infrastructure. [Read the checklist →](skills/performance-audit/references/checklist.md)

The initial focus is JavaScript/TypeScript web applications, especially React/Next.js. Backend and infrastructure findings depend on available evidence; the checklist does not provide universal automated detection.

## Example output

```text
Finding: repeated profile reads
Status: suspected from source
Evidence: Header.tsx + Profile.tsx fetch the same resource
Next step: verify request behavior; share data if appropriate
Verification: request timeline + loading/error/user-switch checks
```

Illustration only—no measured speedup is claimed. [Read the sample report →](docs/example-report.md)

## Honest limits

This first release is an agent skill with references—not a bundled analyzer or benchmark service. Its effectiveness depends on the coding agent, repository, and available tooling. It does not include an automated browser runner, guaranteed fixes, performance scores, or real benchmark demos yet.

Audits default to source inspection without edits. Fixes happen when requested. No telemetry, credentials, accounts, or hosted service is added by the package; your chosen coding agent has its own data policies. App scripts and external tools retain their own execution requirements.

## Next

- Reproducible duplicate-request, code-splitting, and N+1 examples.
- Before/after GIFs backed by retained measurement evidence.
- Optional browser measurement helpers and portable reports.
- Tested host and framework compatibility matrix.

## Inspiration

Packaging clarity inspired by [motion-graphics](https://github.com/Barty-Bart/motion-graphics). The checklist was developed from the performance techniques discussed in [this video](https://www.youtube.com/shorts/8JsFi_ZOvio), with additional conditions and evidence requirements. Original skill instructions; no reference project's code or media is bundled.

## License

MIT. See [LICENSE](LICENSE).
