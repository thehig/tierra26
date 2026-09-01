// ============================================================================
// tierra:content — the build-time docs pipeline.
//
// Reads docs/**/*.md with node:fs, runs them through the pure doclang parser +
// validator, and serves the result as the virtual module `virtual:tierra-content`.
// An error diagnostic FAILS the build, so a broken cross-reference can never
// reach a learner.
//
// Why a plugin rather than import.meta.glob: docs/ sits OUTSIDE the Vite root
// (packages/app). A glob would need server.fs.allow, would ship the raw markdown
// to the browser, and would move parse cost and validation failures to runtime.
// Reading with fs and inlining JSON keeps all three where they belong.
//
// ---------------------------------------------------------------------------
// THREE RULES THIS FILE MUST KEEP (each one is a real failure mode, verified
// against Vite 6.4.3 — they are not stylistic):
//
// 1. RELATIVE IMPORTS ONLY, always with the .ts extension.
//    Vite bundles this file into the config with esbuild, which does NOT apply
//    resolve.alias and treats every BARE specifier as external. So
//    `@tierra26/content/docload.ts` would survive to runtime as an un-strippable
//    .ts import that Node 22 cannot load.
//
// 2. THIS FILE MUST BE .ts, NEVER .tsx.
//    The config bundler picks its loader by extension (`endsWith("ts") ? "ts" : "js"`),
//    so a .tsx config dependency is parsed as JavaScript and dies on the first
//    type annotation.
//
// 3. KEEP THE VALUE-IMPORT GRAPH TINY.
//    Every file esbuild bundles here becomes a `configFileDependency`, and
//    editing one restarts the dev server. The graph is deliberately shallow:
//    docload -> doclang -> {parseval, manifest}, and vocab -> isa. `import type`
//    is erased and costs nothing. A stray value import of content.ts would drag
//    in goal.ts -> the whole engine, and every engine edit would restart the server.
// ============================================================================

import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';

import { loadDocs, formatFailures, type LoadedDoc } from '../../content/src/docload.ts';

const VIRTUAL_ID = 'virtual:tierra-content';
// The \0 prefix is Rollup's "this id is private" convention: no other plugin
// will try to resolve or transform it, and Vite URL-encodes it as __x00__ in dev.
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export interface TierraContentOptions {
  /** Absolute path to the repo's docs/ directory (outside the Vite root). */
  docsDir: string;
  /** Treat warnings as build failures too. */
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// JSON safety. JSON.stringify is lossy in ways that would ship WRONG DATA
// rather than fail: it drops `undefined` keys (and packages/content runs with
// exactOptionalPropertyTypes, so an explicit undefined is meaningful), maps
// NaN/Infinity to null, renders a Date as a string and a typed array as an
// index object, and throws on BigInt. Walk the tree first and name the path.
// ---------------------------------------------------------------------------
function auditJson(v: unknown, at: string, bad: string[], seen = new Set<object>()): void {
  if (v === null) return;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(v as number)) bad.push(`${at} is ${String(v)}`);
    return;
  }
  if (t === 'undefined') {
    bad.push(`${at} is undefined (JSON.stringify drops the key)`);
    return;
  }
  if (t === 'bigint' || t === 'function' || t === 'symbol') {
    bad.push(`${at} is a ${t}`);
    return;
  }
  const o = v as object;
  if (seen.has(o)) {
    bad.push(`${at} is circular`);
    return;
  }
  seen.add(o);
  if (Array.isArray(o)) o.forEach((x, i) => auditJson(x, `${at}[${i}]`, bad, seen));
  else if (o instanceof Map || o instanceof Set) bad.push(`${at} is a ${o.constructor.name}`);
  else if (ArrayBuffer.isView(o)) bad.push(`${at} is a ${o.constructor.name}`);
  else if (o instanceof Date) bad.push(`${at} is a Date`);
  else for (const [k, x] of Object.entries(o)) auditJson(x, `${at}.${k}`, bad, seen);
  seen.delete(o);
}

// JSON is not a strict subset of JS module source. U+2028/U+2029 are legal in a
// JSON string but were illegal in a JS string literal, and a literal `</script`
// in prose can terminate an inline script if this is ever inlined into HTML.
// Both escapes are still valid JSON.
function literal(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/</g, '\\u003c');
}

export function tierraContent(opts: TierraContentOptions): Plugin {
  const { docsDir, strict = false } = opts;

  const watchDirs = ['lessons', 'bible/opcodes', 'bible/concepts', 'snapshots'].map((s) =>
    path.join(docsDir, ...s.split('/')),
  );
  // Watcher paths can differ from ours in drive-letter case on Windows.
  const norm = (p: string) => {
    const s = p.split(path.sep).join('/');
    return process.platform === 'win32' ? s.toLowerCase() : s;
  };
  const prefixes = watchDirs.map((d) => norm(d) + '/');
  const isDocsFile = (file: string) => {
    const n = norm(file);
    return (n.endsWith('.md') || n.endsWith('.json')) && prefixes.some((p) => n.startsWith(p));
  };

  return {
    name: 'tierra:content',
    // 'pre' puts resolveId ahead of vite:resolve so the bare-looking `virtual:`
    // specifier is never handed to node resolution. No `apply` filter: this must
    // run in dev, build, Storybook, and both Vitest projects alike.
    enforce: 'pre',

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_ID) return null;

      const { docs, files, failures } = loadDocs(docsDir, { strict });

      // REGISTER THE WATCH BEFORE ANYTHING CAN THROW.
      // Vite commits the module-graph edges addWatchFile records only on load()'s
      // SUCCESS path — there is no try/finally. If we errored on a bad document
      // first, fixing the markdown would never re-trigger load() and the dev
      // server would sit behind a permanent error overlay until restarted.
      // In dev this also chokidar-adds each file, which is the only reason an
      // out-of-root dependency is watchable at all.
      for (const f of files) this.addWatchFile(f);

      if (failures.length) {
        const n = failures.reduce((a, f) => a + f.diagnostics.length, 0);
        this.error(
          `${n} problem(s) in ${failures.length} document(s):\n\n${formatFailures(failures)}\n`,
        );
      }

      const buckets: Record<string, LoadedDoc[]> = {
        LESSON_DOCS: docs.filter((d) => d.kind === 'lesson'),
        OPCODE_DOCS: docs.filter((d) => d.kind === 'opcode'),
        CONCEPT_DOCS: docs.filter((d) => d.kind === 'concept'),
      };

      const bad: string[] = [];
      auditJson(buckets, 'content', bad);
      if (bad.length) {
        this.error(`parser output is not JSON-safe:\n  - ${bad.join('\n  - ')}`);
      }

      const code = [
        '// generated by tierra:content from docs/ — do not edit',
        ...Object.entries(buckets).map(([name, v]) => `export const ${name} = ${literal(v)};`),
      ].join('\n');

      // map: null — generated source, no meaningful mapping (silences Vite's warning).
      // moduleSideEffects: false — lets Rollup drop whichever bucket a chunk never uses.
      return { code, map: null, moduleSideEffects: false };
    },

    configureServer(server) {
      // The dev watcher is chokidar.watch([root, ...configFileDependencies, ...]),
      // and docs/ is outside root. addWatchFile covers the files that existed when
      // load() ran; watching the DIRECTORIES is what catches a newly created or
      // deleted document. Vite sets chokidar `disableGlobbing: true`, so a
      // '**/*.md' pattern here would be a literal path that matches nothing —
      // directories only.
      for (const d of watchDirs) if (existsSync(d)) server.watcher.add(d);
    },

    // Vite 6's per-environment hook. Unlike the older handleHotUpdate it also
    // fires for 'create' and 'delete', which is what a new lesson file needs.
    // Returning the virtual module hands it to normal HMR propagation, so the
    // page hot-updates through react-refresh instead of doing a full reload.
    hotUpdate({ file }) {
      if (!isDocsFile(file)) return;
      const mod = this.environment.moduleGraph.getModuleById(RESOLVED_ID);
      if (!mod) return; // nothing has imported it in this environment yet
      this.environment.moduleGraph.invalidateModule(mod);
      return [mod];
    },
  };
}
