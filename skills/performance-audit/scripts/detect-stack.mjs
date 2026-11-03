#!/usr/bin/env node
// Read-only stack detector for performance-audit.
// Usage: node detect-stack.mjs [app-root] [--json]
// Reads manifests and config file names only. Executes nothing, uses no network.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { walk, parseArgs, isMainModule } from './lib/walk.mjs';

const CATEGORIES = {
  framework: {
    next: 'Next.js', react: 'React', 'react-dom': 'React DOM', vue: 'Vue', nuxt: 'Nuxt',
    svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit', '@remix-run/react': 'Remix',
    'react-router': 'React Router', astro: 'Astro', '@angular/core': 'Angular', 'solid-js': 'Solid',
    'preact': 'Preact', gatsby: 'Gatsby', expo: 'Expo', 'react-native': 'React Native',
  },
  bundler: {
    vite: 'Vite', webpack: 'webpack', 'react-scripts': 'Create React App', parcel: 'Parcel',
    esbuild: 'esbuild', rollup: 'Rollup', turbo: 'Turborepo', '@rspack/core': 'Rspack',
  },
  server: {
    express: 'Express', fastify: 'Fastify', '@nestjs/core': 'NestJS', hono: 'Hono', koa: 'Koa',
    '@hapi/hapi': 'hapi', '@trpc/server': 'tRPC', 'graphql-yoga': 'GraphQL Yoga',
    '@apollo/server': 'Apollo Server', 'apollo-server': 'Apollo Server',
  },
  data: {
    '@prisma/client': 'Prisma', prisma: 'Prisma CLI', 'drizzle-orm': 'Drizzle', typeorm: 'TypeORM',
    sequelize: 'Sequelize', mongoose: 'Mongoose', knex: 'Knex', pg: 'node-postgres',
    postgres: 'postgres.js', mysql2: 'mysql2', 'better-sqlite3': 'better-sqlite3',
    '@supabase/supabase-js': 'Supabase', mongodb: 'MongoDB driver', '@planetscale/database': 'PlanetScale',
    '@neondatabase/serverless': 'Neon serverless', redis: 'Redis client', ioredis: 'ioredis',
    '@upstash/redis': 'Upstash Redis', dataloader: 'DataLoader',
  },
  fetching: {
    '@tanstack/react-query': 'TanStack Query', 'react-query': 'React Query (legacy)', swr: 'SWR',
    '@apollo/client': 'Apollo Client', urql: 'urql', '@reduxjs/toolkit': 'Redux Toolkit (RTK Query)',
    axios: 'axios', ky: 'ky', 'graphql-request': 'graphql-request',
  },
  monitoring: {
    'web-vitals': 'web-vitals', '@vercel/speed-insights': 'Vercel Speed Insights',
    '@vercel/analytics': 'Vercel Analytics', newrelic: 'New Relic', 'dd-trace': 'Datadog APM',
    '@datadog/browser-rum': 'Datadog RUM', '@opentelemetry/api': 'OpenTelemetry',
    '@opentelemetry/sdk-node': 'OpenTelemetry Node SDK', 'elastic-apm-node': 'Elastic APM',
    'posthog-js': 'PostHog',
  },
  heavy: {
    lodash: 'lodash', moment: 'moment', 'moment-timezone': 'moment-timezone', 'chart.js': 'Chart.js',
    'echarts': 'ECharts', 'three': 'three.js', 'monaco-editor': 'Monaco', '@monaco-editor/react': 'Monaco',
    'mapbox-gl': 'Mapbox GL', 'leaflet': 'Leaflet', 'pdfjs-dist': 'PDF.js', 'xlsx': 'SheetJS',
    'framer-motion': 'Framer Motion', 'core-js': 'core-js',
  },
  virtualization: {
    'react-window': 'react-window', 'react-virtualized': 'react-virtualized',
    '@tanstack/react-virtual': 'TanStack Virtual', 'react-virtuoso': 'react-virtuoso',
  },
};

const CONFIG_HINTS = [
  ['next.config.js', 'Next.js config'], ['next.config.mjs', 'Next.js config'], ['next.config.ts', 'Next.js config'],
  ['vite.config.js', 'Vite config'], ['vite.config.ts', 'Vite config'], ['vite.config.mjs', 'Vite config'],
  ['webpack.config.js', 'webpack config'], ['nuxt.config.ts', 'Nuxt config'], ['astro.config.mjs', 'Astro config'],
  ['svelte.config.js', 'SvelteKit config'], ['remix.config.js', 'Remix config'],
  ['vercel.json', 'Vercel'], ['netlify.toml', 'Netlify'], ['fly.toml', 'Fly.io'], ['render.yaml', 'Render'],
  ['railway.json', 'Railway'], ['app.yaml', 'Google App Engine'], ['wrangler.toml', 'Cloudflare Workers'],
  ['Dockerfile', 'Docker'], ['docker-compose.yml', 'Docker Compose'], ['compose.yaml', 'Docker Compose'],
  ['serverless.yml', 'Serverless Framework'], ['nginx.conf', 'nginx'], ['Procfile', 'Procfile'],
  ['prisma/schema.prisma', 'Prisma schema'], ['drizzle.config.ts', 'Drizzle config'],
  ['.browserslistrc', 'browserslist'], ['tsconfig.json', 'TypeScript'],
];

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun'], ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'],
];

const OTHER_ECOSYSTEMS = [
  ['requirements.txt', 'Python'], ['pyproject.toml', 'Python'], ['Pipfile', 'Python'],
  ['go.mod', 'Go'], ['Gemfile', 'Ruby'], ['composer.json', 'PHP'], ['pom.xml', 'Java (Maven)'],
  ['build.gradle', 'JVM (Gradle)'], ['Cargo.toml', 'Rust'], ['mix.exs', 'Elixir'],
];

const INTERESTING_SCRIPTS = ['dev', 'build', 'start', 'preview', 'test', 'lint', 'typecheck', 'analyze', 'e2e'];

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function findPackageManager(dir, root) {
  let current = dir;
  while (true) {
    for (const [file, pm] of LOCKFILES) if (existsSync(join(current, file))) return { name: pm, lockfile: join(current, file) };
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function detectStack(rootArg = '.') {
  const root = resolve(rootArg);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);

  const packages = [];
  const configs = [];
  const ecosystems = new Set();
  for (const file of walk(root, { maxDepth: 4 })) {
    const base = file.rel.split('/').pop();
    if (base === 'package.json') packages.push(file);
    for (const [name, label] of CONFIG_HINTS) {
      if (file.rel === name || file.rel.endsWith(`/${name}`)) configs.push({ file: file.rel, label });
    }
    for (const [name, label] of OTHER_ECOSYSTEMS) if (base === name) ecosystems.add(label);
  }

  const apps = packages.map(({ path, rel }) => {
    const pkg = readJson(path) || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
    const devDeps = pkg.devDependencies || {};
    const detected = {};
    for (const [category, table] of Object.entries(CATEGORIES)) {
      const hits = [];
      for (const [dep, label] of Object.entries(table)) {
        if (deps[dep]) hits.push({ package: dep, label, version: deps[dep], dev: false });
        else if (devDeps[dep]) hits.push({ package: dep, label, version: devDeps[dep], dev: true });
      }
      if (hits.length) detected[category] = hits;
    }
    const scripts = {};
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      if (INTERESTING_SCRIPTS.some((s) => name === s || name.startsWith(`${s}:`))) scripts[name] = cmd;
    }
    const dir = dirname(path);
    const pm = findPackageManager(dir, root);
    const has = (rel) => existsSync(join(dir, rel));
    const anyOf = (...rels) => rels.some(has);
    const all = { ...deps, ...devDeps };
    const facts = [];
    const absent = [];
    if (all.next) {
      const appRouter = anyOf('app', 'src/app');
      const pagesRouter = anyOf('pages', 'src/pages');
      facts.push(`Next.js router: ${[appRouter && 'App Router', pagesRouter && 'Pages Router'].filter(Boolean).join(' + ') || 'not found (no app/ or pages/ directory)'}`);
      if (!anyOf('next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs')) absent.push('next.config.* (framework defaults apply)');
      if (all['babel-plugin-react-compiler']) facts.push('React Compiler plugin installed (check before adding manual memoization)');
    }
    if (!pm) absent.push('lockfile (package manager and exact versions unknown)');
    if (Object.keys(all).length && !has('node_modules') && !existsSync(join(root, 'node_modules'))) {
      absent.push('node_modules (dependencies not installed; builds and scripts need an install, which requires user approval)');
    }
    if (all.typescript && !has('tsconfig.json')) absent.push('tsconfig.json');
    if ((all['@prisma/client'] || all.prisma) && !anyOf('prisma/schema.prisma', 'schema.prisma') && !has('prisma')) {
      absent.push('Prisma schema (indexes and relations cannot be checked)');
    }
    if (anyOf('public', 'static')) facts.push(`Static asset directory: ${['public', 'static'].filter(has).join(', ')}`);
    return {
      facts,
      absent,
      manifest: rel,
      name: pkg.name || null,
      private: Boolean(pkg.private),
      workspaces: Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages || null,
      type: pkg.type || 'commonjs',
      engines: pkg.engines || null,
      browserslist: pkg.browserslist || null,
      packageManager: pkg.packageManager || pm?.name || null,
      dependencyCount: Object.keys(deps).length,
      devDependencyCount: Object.keys(devDeps).length,
      detected,
      scripts,
    };
  });

  const notes = [];
  if (!packages.length) notes.push('No package.json found within depth 4. This may not be a JavaScript/TypeScript project.');
  if (apps.length > 1) notes.push('Multiple package.json files found. Confirm which application the user means before auditing.');
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) notes.push('pnpm workspace detected (pnpm-workspace.yaml).');
  const hosting = ['Vercel', 'Netlify', 'Fly.io', 'Render', 'Railway', 'Google App Engine', 'Cloudflare Workers', 'Docker', 'Docker Compose', 'Serverless Framework', 'nginx', 'Procfile'];
  if (packages.length && !configs.some((c) => hosting.includes(c.label))) {
    notes.push('No hosting or deployment configuration found; CDN, compression, caching-header, and placement checks (6, 9, 19, 27, 28) need deployment evidence from the user.');
  }
  for (const app of apps) {
    if (app.scripts.start && /\b(next dev|vite(?!\s+(build|preview))|react-scripts start|nodemon)\b/.test(app.scripts.start)) {
      notes.push(`${app.manifest}: "start" script appears to run a development server (check 44).`);
    }
  }

  return { root, apps, configs, otherEcosystems: [...ecosystems], notes };
}

function toMarkdown(result) {
  const lines = [`# Stack detection`, '', `Root: \`${result.root}\``, ''];
  if (!result.apps.length) lines.push('_No JavaScript/TypeScript manifests found._', '');
  for (const app of result.apps) {
    lines.push(`## ${app.name || '(unnamed)'} — \`${app.manifest}\``, '');
    lines.push(`- Package manager: ${app.packageManager || 'unknown'}`);
    lines.push(`- Dependencies: ${app.dependencyCount} runtime, ${app.devDependencyCount} dev`);
    if (app.workspaces) lines.push(`- Workspaces: ${app.workspaces.join(', ')}`);
    if (app.browserslist) lines.push(`- browserslist: ${JSON.stringify(app.browserslist)}`);
    for (const [category, hits] of Object.entries(app.detected)) {
      const list = hits.map((h) => `${h.label} (${h.package}@${h.version}${h.dev ? ', dev' : ''})`).join('; ');
      lines.push(`- ${category}: ${list}`);
    }
    for (const f of app.facts) lines.push(`- ${f}`);
    if (app.absent.length) lines.push(`- Not found: ${app.absent.join('; ')}`);
    const scripts = Object.entries(app.scripts);
    if (scripts.length) {
      lines.push('- Scripts (inspect before running; they execute arbitrary code):');
      for (const [name, cmd] of scripts) lines.push(`  - \`${name}\`: \`${cmd}\``);
    }
    lines.push('');
  }
  if (result.configs.length) {
    lines.push('## Config and deployment hints', '');
    for (const c of result.configs) lines.push(`- ${c.label}: \`${c.file}\``);
    lines.push('');
  }
  if (result.otherEcosystems.length) lines.push(`Other ecosystems present: ${result.otherEcosystems.join(', ')}`, '');
  if (result.notes.length) {
    lines.push('## Notes', '');
    for (const n of result.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  lines.push('_Detected from manifests and file names only. Presence of a dependency or config file is not proof of runtime behavior._');
  return lines.join('\n');
}

if (isMainModule(import.meta.url)) {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log('Usage: node detect-stack.mjs [app-root] [--json]');
    process.exit(0);
  }
  try {
    const result = detectStack(positional[0] || '.');
    console.log(flags.json ? JSON.stringify(result, null, 2) : toMarkdown(result));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
