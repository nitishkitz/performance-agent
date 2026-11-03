# Example: repeated profile reads

> Illustrative static-audit report. This is not a real benchmark or measured customer result.

**Scope:** hypothetical React app, profile screen.
**Evidence level:** static.
**Limitations:** app not executed; no latency or request counts measured.

| Priority | Finding | Status | Example location | Next step |
|---|---|---|---|---|
| 1 | Multiple components independently fetch the current profile | Suspected | `src/Header.tsx:12`, `src/Profile.tsx:18` | Inspect shared data ownership and deduplication |

Both components appear to read the same profile resource on mount. Confirm request identity, caching, retries, and intended refresh behavior before sharing the request. The source suggests duplicated work; it does not prove that two network requests occur in production.

**Suggested fix:** use the project's existing shared data layer, keyed by user identity. Preserve loading and error states and prevent cross-user cache reuse.

**Verification to perform:** run the screen, inspect its request timeline, then test shared loading, failure, sign-out/sign-in, and refresh behavior. Compare equivalent runs before claiming improvement.

**Checks actually run:** none; this is an illustrative report.

**Coverage:** check 3 has a suspected finding. Checks 1–2 and 4–31 were not evaluated in this illustration.
