# Performance audit report

**Scope:** selected repository/app, revision if known, inspected workflows.
**Evidence level:** static / runtime / mixed.
**Limitations:** missing services, access, instrumentation, excluded paths.

## Priorities

| Priority | Finding | Status | Evidence location | Proposed next step |
|---|---|---|---|---|
| 1 | Describe actual issue | measured / suspected | relative path:line or measurement artifact | focused intervention |

For each finding explain the behavior, evidence, likely consequence, tradeoffs, and verification. Omit numerical impact unless actually measured.

## Verification

List commands actually run and their outcomes. If changing code, describe the baseline, focused diff, correctness results, comparable measurements, and any inconclusive results. Never describe an unrun check as passing.

## Checklist coverage

Account for all 31 check IDs using: finding / already handled / not applicable / not evaluated. Group identical statuses where concise, but explain why an item cannot be assessed.

## Next steps

Smallest useful actions, ordered by evidence and expected relevance. Distinguish proposals from work already completed.
