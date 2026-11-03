# Frontend delivery checks

Assets, bundles, and the bytes and requests needed before a page is usable. Scanner rule IDs appear in brackets.

## 2. Image formats and sizing

- **Signals:** large files in `public/` or `static/`; `<img>` without `width`/`height` [`img-missing-dimensions`]; one large source served to every viewport (no `srcset`/`sizes`); framework image component unused where the project already uses it elsewhere.
- **Measure:** transferred bytes and intrinsic versus rendered dimensions in the DevTools Network panel or Lighthouse "Properly size images"; LCP element identity.
- **Interventions:** resize to rendered dimensions; add `srcset`/`sizes`; use the framework's image component; convert to WebP/AVIF where supported by the delivery pipeline.
- **Pitfalls:** format conversion alone does not fix oversized dimensions. Compare visual quality. Do not re-encode images a CDN already optimizes.

## 6. CDN for static assets

- **Signals:** hosting config (`vercel.json`, `netlify.toml`, `fly.toml`, Dockerfile, nginx config); assets served by the application server process.
- **Measure:** response headers (`server`, `via`, `x-cache`, `cf-cache-status`, `age`) and latency from distant regions.
- **Interventions:** use the existing platform CDN; serve hashed assets from it with long-lived caching.
- **Pitfalls:** many platforms already include a CDN. Never recommend provisioning based only on absence in source.

## 9. Text compression

- **Signals:** custom servers (Express/Fastify) without compression middleware; reverse-proxy config.
- **Measure:** `content-encoding` on HTML, JS, CSS, JSON, and SVG responses requested with `Accept-Encoding: br, gzip` (see the measurement playbook).
- **Interventions:** enable Brotli/gzip at the CDN or proxy first, then in the app server only if no upstream layer compresses.
- **Pitfalls:** do not compress already-compressed media (JPEG, PNG, WebP, video, zip). Double compression wastes CPU. Streaming responses may need flush support.

## 11. Unused shipped dependencies

- **Signals:** dependencies imported by client code but used trivially; packages in `dependencies` with no imports; polyfill packages for features the target browsers support.
- **Measure:** bundle analyzer output or build chunk sizes; DevTools Coverage tab for unused bytes on the target route.
- **Interventions:** remove dead imports; replace heavy utilities with platform APIs; move server-only code out of client bundles.
- **Pitfalls:** dev-only packages and server-only imports do not affect browser payload. Confirm with build output, not `package.json` alone.

## 15. Offscreen lazy-loading

- **Signals:** below-the-fold images, iframes, or embeds loaded eagerly; `loading="lazy"` on hero or LCP images [`lazy-image`].
- **Measure:** LCP element and its load delay in a Lighthouse trace or the Performance panel.
- **Interventions:** add `loading="lazy"` to offscreen media; ensure the LCP image loads eagerly and, where justified, with `fetchpriority="high"`.
- **Pitfalls:** never defer the LCP image. Preserve `width`/`height` to avoid layout shift. Carousels and tabs may need eager loading for the first visible item.

## 21. Third-party script timing

- **Signals:** analytics, chat, A/B testing, or tag-manager scripts in the document head without `async`/`defer` [`blocking-script`]; Next.js `<Script strategy="beforeInteractive">` for nonessential tags.
- **Measure:** third-party main-thread time and blocking time (Lighthouse "Reduce the impact of third-party code"); waterfall position.
- **Interventions:** `defer`/`async`; load after interaction or idle; framework script strategies (`afterInteractive`, `lazyOnload`); remove unused tags.
- **Pitfalls:** some scripts must run early (consent managers, anti-flicker for experiments, fraud detection). Confirm dependencies and legal requirements with the owning team.

## 22. Route-level code splitting

- **Signals:** a single large entry chunk; heavy components (editors, charts, maps) imported statically on routes that rarely use them; no `import()` / `React.lazy` / `next/dynamic` usage.
- **Measure:** initial JS per route from build output or the bundle analyzer; DevTools Coverage on first load.
- **Interventions:** lazy-load rarely used heavy features; split by route where the framework does not already do so.
- **Pitfalls:** over-splitting adds requests and loading states. Verify deferred features still work, including error and offline states.

## 27. Browser asset caching

- **Signals:** `Cache-Control` config in hosting files, server middleware, or framework headers; asset filenames without content hashes.
- **Measure:** response headers for HTML, hashed assets, and unhashed assets; repeat-visit transfer size with cache enabled.
- **Interventions:** `Cache-Control: public, max-age=31536000, immutable` for content-hashed assets; short or revalidated caching for HTML.
- **Pitfalls:** long-lived caching of unhashed URLs serves stale code after deploys. Distinguish cold and warm runs in every measurement.

## 29. Font delivery and weights

- **Signals:** many font families or weights; CSS `@import` of remote font stylesheets [`css-import-font`]; missing `font-display`; framework font helpers unused.
- **Measure:** font bytes transferred, request chain depth, and text visibility (FOIT/FOUT) in the waterfall.
- **Interventions:** reduce weights; subset; use `font-display: swap` or `optional`; use the framework font helper; preload only the critical font file.
- **Pitfalls:** self-hosting is not always faster. Font swaps can cause layout shift (check 37); consider metric overrides.

## 33. Render-blocking resources and resource hints

- **Signals:** synchronous scripts and large stylesheets in `<head>` [`blocking-script`]; CSS `@import` chains [`css-import-font`]; critical third-party origins without `preconnect`; LCP resources discovered late.
- **Measure:** Lighthouse "Eliminate render-blocking resources"; waterfall discovery time of the LCP resource.
- **Interventions:** `defer` scripts; inline only small critical CSS; `preconnect` to critical origins; `preload` a late-discovered LCP resource.
- **Pitfalls:** excess preloads compete for bandwidth and can delay LCP. Each hint must have a measured reason.

## 35. Non-tree-shakeable imports

- **Signals:** `import _ from 'lodash'`, `moment`, or `import * as` from large libraries in client code [`heavy-import`]; barrel files (`index.ts` re-exporting a whole package) imported from client components.
- **Measure:** chunk contents in the bundle analyzer; size delta of the route chunk.
- **Interventions:** per-function imports (`lodash/debounce` or `lodash-es`); lighter libraries or platform APIs (`Intl`, `Date`); framework options such as Next.js `optimizePackageImports` where supported.
- **Pitfalls:** modern bundlers tree-shake many ESM namespace imports correctly. Confirm with build output before changing imports.

## 41. Navigation prefetching

- **Signals:** plain `<a>` instead of the framework link component for internal routes; prefetching disabled globally; very large prefetch fan-out on link-heavy pages.
- **Measure:** time from click to rendered route; network activity on hover/viewport.
- **Interventions:** use the framework link component; prefetch on hover/intent for heavy routes; disable prefetch for rarely visited link lists.
- **Pitfalls:** aggressive prefetch wastes bandwidth on metered connections and can increase server load. Respect `Save-Data`.

## 44. Production build configuration

- **Signals:** production builds using development mode; `NODE_ENV` overrides; `productionBrowserSourceMaps: true` or exposed source maps [`prod-source-maps`]; minification disabled; old `browserslist` targets that force large polyfills; `start` script that runs a dev server.
- **Measure:** compare build output and served JS size against expectations; verify `NODE_ENV=production` in the runtime.
- **Interventions:** correct the build/start scripts; restore minification; update browser targets after confirming the support policy.
- **Pitfalls:** public source maps can be intentional for error monitoring; hidden source maps uploaded to the monitoring service are an alternative. Confirm the supported-browser policy before changing targets.
