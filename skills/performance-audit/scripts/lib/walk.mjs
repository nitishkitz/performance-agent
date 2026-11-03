// Shared, read-only file walking helpers. No dependencies, no network.
import { readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IGNORED_DIRS = new Set([
  '.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', '.output', '.vercel', '.netlify',
  '.turbo', '.cache', '.parcel-cache', '.expo', 'dist', 'build', 'out', 'coverage',
  'storybook-static', 'vendor', '__pycache__', '.venv', 'venv', 'target', 'performance-runs',
]);

/**
 * Recursively yield files under `root`, skipping generated and dependency
 * directories and never following symbolic links.
 */
export function* walk(root, { maxDepth = 25, maxFileBytes = 1_000_000, ignore = null } = {}) {
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || ignore?.has(entry.name) || depth >= maxDepth) continue;
        stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        let size = 0;
        try {
          size = lstatSync(full).size;
        } catch {
          continue;
        }
        if (size > maxFileBytes) continue;
        yield { path: full, rel: toPosix(relative(root, full)), size };
      }
    }
  }
}

export function toPosix(p) {
  return p.split(sep).join('/');
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=', 2);
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
      else flags[key] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/** True when the module at `metaUrl` is the script Node was asked to run. */
export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
