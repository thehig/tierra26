// THE CORPUS — every authored document under docs/ must parse and validate.
//
// This is the check that makes docs/ the source of truth rather than a folder of
// prose: it runs the real files through the real parser, with no Vite anywhere,
// so CI catches a broken document before the app build starts. It also pins the
// two structural claims the pipeline rests on:
//   - the Bible is a bijection with the engine's instruction dictionary, and
//   - every Bible page carries the frontmatter the bindings codegen reads.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocs, formatFailures } from '../src/docload.ts';
import { compile } from '../../genescript/src/comp.ts';
import { toGeneSource } from '../../genescript/src/langswap.ts';
import { hasErrors } from '../../genescript/src/types.ts';
import { classic32, Engine } from '../../engine/src/index.ts';
import type { DocNode } from '../src/types.ts';
import { DICTIONARY } from '../../engine/src/isa.ts';
import { OPCODE_BINDINGS } from '../../genescript/src/bindings.generated.ts';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs');

const loaded = loadDocs(DOCS);
const opcodes = loaded.docs.filter((d) => d.kind === 'opcode');
const concepts = loaded.docs.filter((d) => d.kind === 'concept');
const lessons = loaded.docs.filter((d) => d.kind === 'lesson');

describe('docs corpus', () => {
  it('found the Bible', () => {
    assert.ok(loaded.files.length >= 46, `expected the Bible on disk, saw ${loaded.files.length} files`);
  });

  it('every document parses and validates clean', () => {
    assert.equal(
      loaded.failures.length,
      0,
      loaded.failures.length ? '\n\n' + formatFailures(loaded.failures) + '\n' : '',
    );
  });

  it('raises no warnings either', () => {
    const warnings = loaded.diagnostics.filter((d) => d.severity === 'warning');
    assert.deepEqual(
      warnings.map((w) => `${w.rel}:${w.loc.line} ${w.code} ${w.message}`),
      [],
    );
  });
});

/** Every inline <Genome> in a document, with the tag path that holds it. */
function genomesIn(nodes: readonly DocNode[], path: string[] = []): { where: string; source: string }[] {
  const out: { where: string; source: string }[] = [];
  for (const n of nodes) {
    if (n.kind !== 'tag') continue;
    if (n.name === 'Genome' && n.text && !('ref' in n.attrs)) {
      out.push({ where: [...path, 'Genome'].join(' > '), source: n.text });
    }
    out.push(...genomesIn(n.children, [...path, n.name]));
  }
  return out;
}

describe('a Bible page that shows a creature', () => {
  // The `## Try it` stage is authored in the document now. The invariant that
  // used to cover INSTRPAGE's scenarios has to live where the genomes do, or a
  // mistyped mnemonic in a reference page renders a broken creature instead of
  // failing the build. (Lesson genomes are covered by app/test/chapters.test.ts,
  // which also runs each challenge's solution to its goal.)
  it('every inline <Genome> compiles under classic-32 and loads in the engine', () => {
    let seen = 0;
    for (const d of [...opcodes, ...concepts]) {
      for (const g of genomesIn(d.ast.body)) {
        const r = compile(toGeneSource(g.source), classic32);
        assert.equal(hasErrors(r.diagnostics), false,
          `${d.file} ${g.where} does not compile: ${r.diagnostics.map((x) => x.message).join('; ')}`);
        for (const b of r.bytes) {
          assert.ok(b >= 0 && b < classic32.n, `${d.file} ${g.where} emitted an illegal opcode`);
        }
        const e = new Engine({ seed: 1, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
        assert.doesNotThrow(() => e.inject(r.bytes, { founderId: 1 }), `${d.file} ${g.where} does not load`);
        seen++;
      }
    }
    // Not asserted to be non-zero: a Bible page is not required to show a
    // creature. This guards the ones that do.
    assert.ok(seen >= 0);
  });
});

describe('the Bible is a bijection with the engine', () => {
  it('has exactly one opcode page per engine mnemonic', () => {
    const pages = new Set(opcodes.map((d) => d.slug));
    const engine = new Set(DICTIONARY.map((e) => e.mnemonic));
    assert.deepEqual([...engine].filter((m) => !pages.has(m)), [], 'mnemonics with no Bible page');
    assert.deepEqual([...pages].filter((m) => !engine.has(m)), [], 'Bible pages with no engine mnemonic');
  });

  it('every opcode page carries the frontmatter the bindings codegen reads', () => {
    for (const d of opcodes) {
      const fm = d.ast.frontmatter;
      assert.ok(fm, `${d.file} has no frontmatter`);
      for (const key of ['mnemonic', 'name', 'category']) {
        assert.ok(key in fm!, `${d.file} is missing "${key}"`);
      }
    }
  });

  it('binds a unique display name to each mnemonic', () => {
    const names = opcodes.map((d) => String(d.ast.frontmatter!['name']));
    assert.equal(new Set(names).size, names.length, 'two opcodes share a display name');
    for (const n of names) {
      assert.match(n, /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/, `"${n}" is not a valid one-word name`);
    }
  });

  it('uses only the five colour-role categories', () => {
    const roles = new Set(['action', 'register', 'marker', 'control', 'value']);
    for (const d of opcodes) {
      const cat = String(d.ast.frontmatter!['category']);
      assert.ok(roles.has(cat), `${d.file}: category "${cat}" is not a colour role`);
    }
  });
});

describe('concept pages', () => {
  it('are present and slugged by filename', () => {
    assert.ok(concepts.length >= 14, `expected the concept pages, saw ${concepts.length}`);
    for (const d of concepts) {
      assert.equal(String(d.ast.frontmatter!['slug']), d.slug);
    }
  });
});

describe('the generated bindings are in step with the Bible', () => {
  // gen-bindings projects the Bible into a committed TS module. If someone edits
  // a name or an emoji in docs/ and forgets `npm run gen:bindings`, the app would
  // silently keep showing the old glyph — so drift is a test failure, not a
  // surprise in the UI.
  it('name, emoji and category match the frontmatter for every opcode', () => {
    const drift: string[] = [];
    for (const d of opcodes) {
      const fm = d.ast.frontmatter!;
      const b = OPCODE_BINDINGS[d.slug];
      if (!b) {
        drift.push(`${d.slug}: no generated binding`);
        continue;
      }
      for (const key of ['name', 'emoji', 'category'] as const) {
        const want = String(fm[key]);
        const got = String(b[key]);
        if (want !== got) drift.push(`${d.slug}.${key}: generated "${got}" != docs "${want}"`);
      }
      const target = fm['takes_target'] === true;
      if (b.takesTarget !== target) drift.push(`${d.slug}.takesTarget: ${b.takesTarget} != ${target}`);
    }
    assert.deepEqual(drift, [], 'run `npm run gen:bindings` and commit the result');
  });
});

describe('lessons', () => {
  // The curriculum used to be a TypeScript array; these are the structural
  // guarantees that array gave for free and a folder of markdown does not.
  it('is the whole curriculum, in filename order', () => {
    assert.ok(lessons.length >= 22, `expected the chapters, saw ${lessons.length}`);
    assert.deepEqual(
      lessons.map((d) => String(d.ast.frontmatter!['no'])),
      lessons.map((_, i) => String(i)),
      'chapter numbers must match document order',
    );
  });

  it('carries the frontmatter the chapter map reads', () => {
    for (const d of lessons) {
      const fm = d.ast.frontmatter!;
      for (const key of ['id', 'no', 'title', 'phase', 'lede', 'ready']) {
        assert.ok(key in fm, `${d.file} is missing "${key}"`);
      }
      assert.equal(String(fm['id']), d.slug, `${d.file}: id must match the filename`);
    }
  });

  it('forms one unbroken prerequisite chain', () => {
    // The map gates chapters linearly, so a gap would silently strand a learner.
    lessons.forEach((d, i) => {
      const requires = d.ast.frontmatter!['requires'];
      if (i === 0) {
        assert.equal(requires, undefined, 'the first chapter requires nothing');
        return;
      }
      assert.ok(Array.isArray(requires), `${d.file} has no requires`);
      assert.equal((requires as string[])[0], lessons[i - 1]!.slug, `${d.file} prerequisite`);
    });
  });

  it('gives every ready chapter something to show', () => {
    for (const d of lessons) {
      if (d.ast.frontmatter!['ready'] !== true) continue;
      const hasStage = JSON.stringify(d.ast.body).includes('"EntityDesigner"');
      assert.ok(hasStage, `${d.file} is ready but has no stage`);
    }
  });
});
