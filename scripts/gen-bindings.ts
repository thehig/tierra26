// ============================================================================
// gen-bindings — project the Bible's presentation frontmatter into a committed
// TypeScript module.
//
//   docs/bible/opcodes/*.md  (mnemonic, name, emoji, category, takes_target)
//        |  npm run gen:bindings
//        v
//   packages/genescript/src/bindings.generated.ts   (committed)
//        |
//   vocab.ts  +  app/src/design/bindings.ts
//
// The Bible is the source of truth for how an instruction PRESENTS — its kid
// name, emoji and colour role. But engine/genescript/ui/versus are zero-dep
// packages that run under `node --experimental-strip-types` and cannot read
// markdown at import time, so the facts are checked in as data instead.
//
// Deliberately does NOT import vocab.ts: vocab consumes this file's output, so
// importing it here would make the generator depend on its own product and the
// first run could never bootstrap. The bijection is checked against the engine
// dictionary directly, which is the real authority anyway.
//
// Usage:  node --experimental-strip-types scripts/gen-bindings.ts [--check]
//   --check  verify the committed file is up to date (CI); write nothing.
// ============================================================================

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc } from '../packages/content/src/doclang.ts';
import { DICTIONARY } from '../packages/engine/src/isa.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPCODES_DIR = path.join(ROOT, 'docs', 'bible', 'opcodes');
const CONCEPTS_DIR = path.join(ROOT, 'docs', 'bible', 'concepts');
const OUT = path.join(ROOT, 'packages', 'genescript', 'src', 'bindings.generated.ts');

const COLOUR_ROLES = ['action', 'register', 'marker', 'control', 'value'] as const;
const NAME_RE = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

interface Row {
  mnemonic: string;
  name: string;
  emoji: string;
  category: string;
  takesTarget: boolean;
}

function pagesIn(dir: string, kind: 'opcode' | 'concept') {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('_'))
    .sort()
    .map((f) => {
      const slug = path.basename(f, '.md');
      const rel = path.relative(ROOT, path.join(dir, f)).split(path.sep).join('/');
      const { ast, diagnostics } = parseDoc(readFileSync(path.join(dir, f), 'utf8'), {
        kind,
        slug,
        file: rel,
      });
      for (const d of diagnostics) {
        if (d.severity === 'error') fail(`${rel}:${d.loc.line} ${d.code} — ${d.message}`);
      }
      return { slug, rel, fm: ast.frontmatter ?? {} };
    });
}

// ---- opcodes ---------------------------------------------------------------
const rows: Row[] = [];
const seenNames = new Map<string, string>();

for (const { slug, rel, fm } of pagesIn(OPCODES_DIR, 'opcode')) {
  const get = (k: string) => (k in fm ? String(fm[k]) : '');
  const mnemonic = get('mnemonic');
  const name = get('name');
  const emoji = get('emoji');
  const category = get('category');

  if (mnemonic !== slug) fail(`${rel}: frontmatter mnemonic "${mnemonic}" != filename "${slug}"`);
  if (!name) fail(`${rel}: missing "name"`);
  else if (!NAME_RE.test(name)) fail(`${rel}: name "${name}" must be one word (letters, digits, hyphens)`);
  if (!emoji) fail(`${rel}: missing "emoji" — the Bible is the source of the glyph`);
  if (!COLOUR_ROLES.includes(category as (typeof COLOUR_ROLES)[number])) {
    fail(`${rel}: category "${category}" is not one of ${COLOUR_ROLES.join(', ')}`);
  }

  const clash = seenNames.get(name);
  if (clash) fail(`${rel}: display name "${name}" is already bound to ${clash}`);
  seenNames.set(name, slug);

  rows.push({ mnemonic, name, emoji, category, takesTarget: fm['takes_target'] === true });
}

// A display name must never collide with a mnemonic, or the gene <-> mnemonic
// swap in the editor becomes ambiguous.
const mnemonics = new Set(DICTIONARY.map((e) => e.mnemonic));
for (const r of rows) {
  if (r.name !== r.mnemonic && mnemonics.has(r.name)) {
    fail(`docs/bible/opcodes/${r.mnemonic}.md: display name "${r.name}" collides with another mnemonic`);
  }
}

// ---- the bijection with the engine (the whole point of "engine is king") ----
const pageSet = new Set(rows.map((r) => r.mnemonic));
for (const e of DICTIONARY) {
  if (!pageSet.has(e.mnemonic)) fail(`engine mnemonic "${e.mnemonic}" has no docs/bible/opcodes page`);
}
for (const r of rows) {
  if (!mnemonics.has(r.mnemonic)) fail(`docs/bible/opcodes/${r.mnemonic}.md has no matching engine mnemonic`);
}

// ---- concepts (emoji-bound block kinds only) -------------------------------
const concepts = pagesIn(CONCEPTS_DIR, 'concept')
  .filter((p) => 'emoji' in p.fm)
  .map((p) => ({
    slug: p.slug,
    name: 'title' in p.fm ? String(p.fm['title']).split(' (')[0]! : p.slug,
    emoji: String(p.fm['emoji']),
  }));

// ---- emit ------------------------------------------------------------------
if (problems.length) {
  console.error('gen-bindings: the Bible does not satisfy the binding rules:\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('');
  process.exit(1);
}

const q = (s: string) => JSON.stringify(s);
const body = `// GENERATED by scripts/gen-bindings.ts — DO NOT EDIT.
//
// Source of truth: docs/bible/opcodes/*.md frontmatter (and concept pages that
// bind a glyph). Change a name or an emoji THERE, then run:
//
//     npm run gen:bindings
//
// The mnemonic is the engine's immutable identity; \`name\` is the friendly
// display name shown in simple mode. The engine's own \`gene\` token stays the
// compilable form — a rebind changes what a learner reads, never what compiles.

export type BindingCategory = ${COLOUR_ROLES.map(q).join(' | ')};

export interface OpcodeBinding {
  readonly mnemonic: string;
  readonly name: string;
  readonly emoji: string;
  readonly category: BindingCategory;
  readonly takesTarget: boolean;
}

export const OPCODE_BINDINGS: Readonly<Record<string, OpcodeBinding>> = Object.freeze({
${rows
  .map(
    (r) =>
      `  ${r.mnemonic}: { mnemonic: ${q(r.mnemonic)}, name: ${q(r.name)}, emoji: ${q(r.emoji)}, category: ${q(r.category)}, takesTarget: ${r.takesTarget} },`,
  )
  .join('\n')}
});

export interface ConceptBinding {
  readonly slug: string;
  readonly name: string;
  readonly emoji: string;
}

export const CONCEPT_BINDINGS: Readonly<Record<string, ConceptBinding>> = Object.freeze({
${concepts
  .map((c) => `  ${c.slug}: { slug: ${q(c.slug)}, name: ${q(c.name)}, emoji: ${q(c.emoji)} },`)
  .join('\n')}
});

/** A friendly name is one word: letters, digits and hyphens only. */
export function isValidName(name: string): boolean {
  return /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(name);
}
`;

const existing = (() => {
  try {
    return readFileSync(OUT, 'utf8');
  } catch {
    return null;
  }
})();

if (process.argv.includes('--check')) {
  if (existing !== body) {
    console.error(
      'gen-bindings --check: packages/genescript/src/bindings.generated.ts is out of date.\n' +
        'Run `npm run gen:bindings` and commit the result.',
    );
    process.exit(1);
  }
  console.log(`gen-bindings --check: up to date (${rows.length} opcodes, ${concepts.length} concepts).`);
} else if (existing === body) {
  console.log(`gen-bindings: unchanged (${rows.length} opcodes, ${concepts.length} concepts).`);
} else {
  writeFileSync(OUT, body, 'utf8');
  console.log(`gen-bindings: wrote ${path.relative(ROOT, OUT)} (${rows.length} opcodes, ${concepts.length} concepts).`);
}
