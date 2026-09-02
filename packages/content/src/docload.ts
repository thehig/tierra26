// ============================================================================
// DOCLOAD — read docs/**/*.md off disk, parse and validate the whole corpus.
//
// This lives here, and NOT inside the Vite plugin, for one reason: the virtual
// module the plugin emits is a Vite-only artifact, so this package's own
// `node --test` suite could never see it. With loadDocs() exported, the corpus
// is validated by a plain node test — CI catches a broken doc before the app
// build even starts, and the plugin becomes a thin wrapper.
//
// Node-only (fs/path). The PARSER (doclang.ts) stays browser-safe; only this
// orchestration layer touches the filesystem.
//
// IMPORT RULE: this module is bundled into the Vite config graph, where every
// value import becomes a config dependency that restarts the dev server when
// edited. The graph is deliberately three files deep — docload -> doclang, and
// vocab -> isa. Do not widen it (see doclang.ts header).
// ============================================================================

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDoc, validateDoc, type DocResolver } from './doclang.ts';
import { isVerb, mnemonicToVerb } from '../../genescript/src/vocab.ts';
import type { Diagnostic, DocAst, DocKind } from './types.ts';

export interface LoadedDoc {
  kind: DocKind;
  slug: string;
  file: string; // repo-relative, forward slashes
  ast: DocAst;
  /** The markdown exactly as it is on disk. Kept because an authoring surface
   *  needs the SOURCE, not the parse of it — the AST is lossy and there is no
   *  serializer back. The app's main content module strips this; only the
   *  editor's own lazily-imported module carries it. */
  source: string;
}

export interface DocFailure {
  file: string; // absolute
  rel: string; // repo-relative, forward slashes
  source: string;
  diagnostics: Diagnostic[];
}

export interface LoadResult {
  docs: LoadedDoc[];
  /** Absolute paths of every file read — the plugin registers each for watching. */
  files: string[];
  /** Documents carrying at least one diagnostic at or above the strictness bar. */
  failures: DocFailure[];
  /** Every diagnostic, including the ones below the bar (warnings by default). */
  diagnostics: (Diagnostic & { rel: string })[];
}

export interface LoadOptions {
  /** Fail on warnings too, not just errors. */
  strict?: boolean;
  /** Named starter genomes a doc may reference (`<Genome ref="…">`). */
  genomes?: readonly string[];
  /** Named scenario presets (`<Simulation scenario="…">`). */
  scenarios?: readonly string[];
  /** Named instruction subsets. */
  subsets?: readonly string[];
}

const GROUPS: readonly { kind: DocKind; sub: string; recursive: boolean }[] = [
  { kind: 'lesson', sub: 'lessons', recursive: true },
  { kind: 'opcode', sub: 'bible/opcodes', recursive: false },
  { kind: 'concept', sub: 'bible/concepts', recursive: false },
];

const DEFAULT_GENOMES = ['ancestor'];
const DEFAULT_SCENARIOS = ['soup-small', 'soup-standard', 'soup-evolve'];

/** Files that are documentation ABOUT the corpus, not part of it. */
function isCorpusFile(name: string): boolean {
  return name.endsWith('.md') && name !== 'README.md' && !name.startsWith('_');
}

function collect(dir: string, recursive: boolean): string[] {
  // docs/lessons/ does not exist until the migration lands — a missing group is
  // an empty group, not a crash.
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (recursive) walk(p);
        continue;
      }
      if (e.isFile() && isCorpusFile(e.name)) out.push(p);
    }
  };
  walk(dir);
  // Sort explicitly: readdir order is filesystem-dependent, and it differs
  // between a Windows dev box and the Alpine container. Unsorted output means a
  // different emitted module — and a different content hash — for identical input.
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function snapshotIds(docsDir: string): string[] {
  const dir = path.join(docsDir, 'snapshots');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.basename(e.name, '.json'))
    .sort();
}

/**
 * Build the existence-checking resolver. The parser holds no id lists
 * (C-CON-SOURCE), so this is where the corpus meets the engine: opcodes come
 * from the engine dictionary via VOCAB, concepts from the concept pages that
 * were actually loaded, and the rest from the caller.
 */
export function makeDocResolver(
  loaded: readonly LoadedDoc[],
  snapshots: readonly string[],
  opts: LoadOptions = {},
): DocResolver {
  const concepts = new Set(loaded.filter((d) => d.kind === 'concept').map((d) => d.slug));
  const lessons = new Set(loaded.filter((d) => d.kind === 'lesson').map((d) => d.slug));
  const genomes = new Set(opts.genomes ?? DEFAULT_GENOMES);
  const scenarios = new Set(opts.scenarios ?? DEFAULT_SCENARIOS);
  const subsets = new Set(opts.subsets ?? []);
  const snaps = new Set(snapshots);
  return {
    // A doc may name an instruction either way round: the real mnemonic (incA)
    // or its bound display name (grow-a). Docs prefer the mnemonic.
    isOpcode: (t) => isVerb(t) || mnemonicToVerb(t) !== undefined,
    hasConcept: (s) => concepts.has(s),
    hasGenome: (s) => genomes.has(s),
    hasScenario: (s) => scenarios.has(s),
    hasSubset: (s) => subsets.has(s),
    hasSnapshot: (s) => snaps.has(s),
    hasLesson: (s) => lessons.has(s),
  };
}

/**
 * Parse every doc, then validate them against a resolver built from the corpus
 * itself. Two passes, because a lesson may reference a concept page and a
 * concept page may reference another — neither exists until everything is read.
 */
export function loadDocs(docsDir: string, opts: LoadOptions = {}): LoadResult {
  const repoRoot = path.resolve(docsDir, '..');
  const rel = (f: string) => path.relative(repoRoot, f).split(path.sep).join('/');

  // -- pass 1: read + parse ---------------------------------------------------
  const files: string[] = [];
  const parsed: { doc: LoadedDoc; abs: string; source: string; diagnostics: Diagnostic[] }[] = [];

  for (const g of GROUPS) {
    for (const abs of collect(path.join(docsDir, ...g.sub.split('/')), g.recursive)) {
      files.push(abs);
      const source = readFileSync(abs, 'utf8');
      // Lessons carry a numeric filename prefix so `docs/lessons/` reads in
      // curriculum order on disk; the prefix is ordering metadata, not identity,
      // so `08-loops.md` has the id `loops`.
      const base = path.basename(abs, '.md');
      const slug = g.kind === 'lesson' ? base.replace(/^\d+[-_]/, '') : base;
      const file = rel(abs);
      const r = parseDoc(source, { kind: g.kind, slug, file });
      parsed.push({
        doc: { kind: g.kind, slug, file, ast: r.ast, source },
        abs,
        source,
        diagnostics: r.diagnostics,
      });
    }
  }

  // -- pass 2: validate against the corpus ------------------------------------
  const loaded = parsed.map((p) => p.doc);
  const resolver = makeDocResolver(loaded, snapshotIds(docsDir), opts);

  const bar = opts.strict ? ['error', 'warning'] : ['error'];
  const failures: DocFailure[] = [];
  const diagnostics: (Diagnostic & { rel: string })[] = [];
  const docs: LoadedDoc[] = [];

  for (const p of parsed) {
    const all = [...p.diagnostics, ...validateDoc(p.doc.ast, resolver)];
    for (const d of all) diagnostics.push({ ...d, rel: p.doc.file });
    const blocking = all.filter((d) => bar.includes(d.severity));
    if (blocking.length) {
      failures.push({ file: p.abs, rel: p.doc.file, source: p.source, diagnostics: blocking });
    } else {
      docs.push(p.doc);
    }
  }

  return { docs, files, failures, diagnostics };
}

/**
 * Render diagnostics as a readable, editor-clickable report:
 *
 *   docs/bible/opcodes/mal.md:12:3  error  unknown-verb
 *       <Chip> opcode: "nope" is not an instruction this engine has.
 *       12 | Press <Chip opcode="nope"/> now.
 *          |       ^^
 */
export function formatFailures(failures: readonly DocFailure[]): string {
  return failures
    .map((f) => {
      const lines = f.source.split(/\r?\n/);
      return f.diagnostics
        .map((d) => {
          const ln = d.loc?.line ?? 1;
          const col = d.loc?.startCol ?? 1;
          const end = Math.max(col + 1, d.loc?.endCol ?? col + 1);
          const gutter = String(ln);
          return [
            `${f.rel}:${ln}:${col}  ${d.severity}  ${d.code}`,
            `    ${d.message}`,
            `    ${gutter} | ${lines[ln - 1] ?? ''}`,
            `    ${' '.repeat(gutter.length)} | ${' '.repeat(Math.max(0, col - 1))}${'^'.repeat(Math.max(1, end - col))}`,
          ].join('\n');
        })
        .join('\n\n');
    })
    .join('\n\n');
}
