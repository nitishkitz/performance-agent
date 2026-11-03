# Performance audit report

**Scope:** repository or app, revision if known (or "not a git repository"), workflows inspected, reported symptom.
**Stack:** frameworks, data layer, and hosting as detected and confirmed.
**Evidence level:** static / runtime / mixed.
**Limitations:** missing services, access, instrumentation, data, installed dependencies, network, excluded paths, referenced-but-missing files.

## Summary

Two to four sentences: the most likely cause of the reported symptom, how strong the evidence is, and the single recommended next action.

## Priorities

At most five rows. Status is `measured`, `source-confirmed`, or `suspected`.

| # | Finding | Checks | Status | Evidence | Proposed next step |
|---|---|---|---|---|---|
| 1 | Describe the actual issue | 8, 5 | source-confirmed | `relative/path.ts:42` or measurement artifact | Focused intervention |

## Findings

Repeat for each prioritized finding.

### 1. Short title

- **Observed:** the code, request, or query behavior, with locations.
- **Evidence:** what supports it (source trace, command output, measurement) and its status.
- **Why it matters:** the plausible effect on the reported workflow. Omit numbers unless measured.
- **Intervention:** the smallest change that addresses it, following project conventions.
- **Tradeoffs and risks:** behavior, freshness, accessibility, cost.
- **Verification:** correctness checks and the comparable measurement that would confirm improvement.

## Other findings

Real issues below the top five, one line each: location, checks, status, suggested fix.

## Discarded candidates

Scanner candidates or suspicions that inspection ruled out, one line each with the reason (for example, "module has no importers"). Omit this section if there are none.

## Verification log

Commands actually run and their outcomes. If code changed: baseline, focused diff summary, correctness results, raw measurements, and the `compare-runs` verdict. Never describe an unrun check as passing.

## Checklist coverage

Account for all 45 check IDs. Group IDs that share a status and reason; a few rows are enough for small repositories. A check ID may appear under `finding` once even if several findings cite it.

| Status | Checks | Reason |
|---|---|---|
| finding | ... | Finding numbers |
| no issue found | ... | inspected, and the signal was absent or a false positive |
| already handled | ... | evidence of existing handling |
| not applicable | ... | the feature or layer does not exist |
| not evaluated | ... | missing evidence and how to obtain it |

## Next steps

Smallest useful actions, ordered by evidence and expected relevance. Separate proposals from work already completed.
