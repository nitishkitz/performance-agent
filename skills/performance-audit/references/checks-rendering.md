# Rendering and interaction checks

What happens on the main thread and on screen once bytes arrive. Scanner rule IDs appear in brackets.

## 1. Skeleton/loading states

- **Signals:** blank screens or spinners replacing whole pages; Suspense boundaries absent or placed too high; loading UI that does not reserve final layout space.
- **Measure:** filmstrip or screen recording of the workflow; CLS during loading.
- **Interventions:** granular loading boundaries; skeletons that match final dimensions; streaming server rendering where the framework supports it.
- **Pitfalls:** this improves perceived waiting only. Never claim lower server latency from a skeleton.

## 14. Optimistic UI

- **Signals:** simple, reversible mutations (likes, toggles, reordering) that block on a round trip before updating the UI.
- **Measure:** time from interaction to visual feedback.
- **Interventions:** optimistic updates through the existing data layer (for example TanStack Query or SWR mutation helpers, React `useOptimistic`).
- **Pitfalls:** reconcile on failure and show errors. Avoid for payments, irreversible actions, or operations with server-side validation users must see.

## 20. Server/static rendering

- **Signals:** client-only data fetching for content that is identical for all users; `"use client"` at the root layout or page [`client-root-layout`]; `force-dynamic` or `no-store` on cacheable routes [`opt-out-caching`].
- **Measure:** TTFB, time to first meaningful content, hydration cost, and interaction readiness for each rendering mode on the same route.
- **Interventions:** move static or shared data to server or build-time rendering; push `"use client"` down to interactive leaves.
- **Pitfalls:** server rendering can raise TTFB and server cost. Personalized or highly dynamic pages may be correct as they are. No universal rendering rewrite.

## 23. Long-list virtualization

- **Signals:** `.map()` over hundreds or thousands of rows with complex children; tables without pagination or windowing.
- **Measure:** render and scripting time in the Performance panel or React Profiler with realistic data volume; DOM node count.
- **Interventions:** pagination (check 5); windowing with an existing or well-maintained library; CSS `content-visibility: auto` for long static content.
- **Pitfalls:** virtualization can break find-in-page, focus order, keyboard navigation, screen readers, and printing. Verify accessibility.

## 26. Expensive React re-renders

- **Signals:** context providers with object literals as `value`; large components subscribed to frequently changing state; derived data recomputed on every render.
- **Measure:** React DevTools Profiler ("Highlight updates", commit durations) during the slow interaction.
- **Interventions:** move state closer to where it is used; split contexts; stabilize provider values; memoize only measured hot paths.
- **Pitfalls:** do not add blanket `memo`/`useMemo`/`useCallback`. Check whether the React Compiler is enabled before manual memoization.

## 31. Constrained devices/networks

- **Signals:** audience or analytics indicating mobile-heavy usage; no testing profile documented.
- **Measure:** runs with CPU throttling and network throttling, recording the exact profile; physical mid-range devices where available.
- **Interventions:** route by observed bottleneck (usually checks 22, 35, 36, 2).
- **Pitfalls:** desktop emulation is not physical-device or real-user evidence. Always state the profile used.

## 34. Hydration and serialized payload size

- **Signals:** entire database records passed as page props; large `__NEXT_DATA__`, RSC payload, or inline JSON state; server components passing big objects to client components.
- **Measure:** size of the serialized data in the HTML response; hydration time in the Performance panel.
- **Interventions:** pass only fields the client renders; keep large data in server components; paginate.
- **Pitfalls:** removing fields can break client features that read them indirectly. Search all consumers first.

## 36. Main-thread long tasks

- **Signals:** heavy synchronous work in event handlers or render (sorting, filtering, parsing large data, `JSON.parse(JSON.stringify(...))` cloning [`deep-clone-json`]); large synchronous third-party initialization.
- **Measure:** long tasks (over 50 ms) and INP breakdown (input delay, processing, presentation) in the Performance panel.
- **Interventions:** move work off the critical interaction (`startTransition`, `useDeferredValue`, yielding with `scheduler.yield()` where supported or `setTimeout`); precompute on the server; use Web Workers for pure computation; `structuredClone` for cloning.
- **Pitfalls:** workers add serialization cost and complexity. Yielding changes ordering semantics; verify state consistency.

## 37. Layout shift sources

- **Signals:** images and embeds without dimensions [`img-missing-dimensions`]; banners, ads, or consent bars injected above content; late-loading fonts with different metrics; content inserted above the viewport after data loads.
- **Measure:** CLS and layout-shift attribution in Lighthouse or the Performance panel; field CLS if RUM exists.
- **Interventions:** reserve space (`width`/`height`, `aspect-ratio`, `min-height`); overlay rather than push content; font metric overrides.
- **Pitfalls:** fixed heights can clip content on narrow screens or with larger text. Test responsive and zoomed layouts.

## 45. Animation and compositing cost

- **Signals:** transitions or animations on `width`, `height`, `top`, `left`, `margin`, or `transition: all` [`layout-transition`]; scroll handlers that update layout every event; excessive `will-change`.
- **Measure:** frame rate and layout/paint time in the Performance panel during the animation.
- **Interventions:** animate `transform` and `opacity`; use `requestAnimationFrame`; use passive scroll listeners or `IntersectionObserver`.
- **Pitfalls:** overusing `will-change` raises memory use. Respect `prefers-reduced-motion`.
