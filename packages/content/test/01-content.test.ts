// Content Model & Authoring (CONTENT) — Lesson schema, frontmatter, typed directives, parse → Lesson AST, validation.
// Spec: docs/spec/content/01-content-model-and-authoring.md (§8 acceptance criteria).
// Ref: content/00-overview.md §1 (teaching model) / §2 (pipeline) / §3 (concrete lesson format) / §5 (contracts) / §6 (CONTINV);
//      SPEC.md §11 (content-as-data, embeddable playgrounds). Payload MEANING is downstream: [02] PLAY, [04] KEYWORD, [05] PROGRESS, [06] GOAL.
//
// parse()/validate() live in src/content.ts. Each it() below realises one CONTENT-NNN criterion.
//
// FIXME (C-CON-DATA, CONTENT-020): a lesson is DECLARATIVE data — the grammar admits only prose/directives/references.
//   Any executable form (a <script>/JS/handler or a non-declarative frontmatter value) must be REJECTED; assert the error.  [covered by CONTENT-020]
// FIXME (C-CON-SOURCE, CONTENT-008/009/012-015): parse() records REFERENCES (term/verb/scenario/starter/prereq strings) and
//   resolves nothing. Existence is validate()'s job via a caller-supplied IdResolver — the parser holds no id lists.        [covered below]
// FIXME (error tolerance, CONTENT-016): parse() must NEVER throw. A malformed directive/frontmatter becomes an ErrorNode
//   carrying a Diagnostic; assert the tree is still returned and later blocks parse independently.                          [covered by CONTENT-016]
// FIXME (C-CON-DET, CONTENT-019): parse() is a pure function of source text — no RNG, no wall-clock, no Map-key-order.
//   Assert twice-parsed source yields structurally identical AST + diagnostics in source order.                            [covered by CONTENT-019]
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse, validate } from '../src/content.ts';
import { isVerb } from '../../genescript/src/vocab.ts';
import type { IdResolver, Diagnostic, ProseNode, PlaygroundNode, GoalNode } from '../src/types.ts';

// A small stub IdResolver backed by Sets (the parser holds no id lists — C-CON-SOURCE).
function makeResolver(o: {
  scenarios?: string[];
  starters?: string[];
  lessons?: string[];
  keywords?: string[];
  subsets?: string[];
  verbs?: string[]; // if omitted, delegate to the real classic-32 vocabulary
}): IdResolver {
  const scenarios = new Set(o.scenarios ?? []);
  const starters = new Set(o.starters ?? []);
  const lessons = new Set(o.lessons ?? []);
  const keywords = new Set(o.keywords ?? []);
  const subsets = new Set(o.subsets ?? []);
  const verbs = o.verbs ? new Set(o.verbs) : null;
  return {
    hasScenario: (id) => scenarios.has(id),
    hasStarter: (id) => starters.has(id),
    hasLesson: (id) => lessons.has(id),
    hasKeyword: (t) => keywords.has(t),
    hasSubset: (n) => subsets.has(n),
    isVerb: (v) => (verbs ? verbs.has(v) : isVerb(v)),
  };
}

const errors = (ds: Diagnostic[]) => ds.filter((d) => d.severity === 'error');

// A canonical, fully-valid lesson used by the "clean" criteria.
const VALID_SOURCE = `---
id: ch02-first-copy
chapter: 2
title: "Teach it to copy"
unlocks: { verbs: [copy-byte, make-space], concepts: [daughter, copy-loop] }
requires: [ch01-hello-soup]
mutation: off
---

A creature makes a baby by copying itself one byte at a time into a fresh
{daughter} cell. It asks the soup for space with \`make-space\`, then runs a
{copy-loop} using \`copy-byte\`.

:::playground {scenario: sandbox-small, seed: 7, starter: ch02-starter, subset: ch02}
Try adding a \`copy-byte\`. Watch the daughter cell fill in.
:::goal { kind: replicates, within: 20000 }
Make your creature produce at least one baby.
:::
`;

const FULL_RESOLVER = makeResolver({
  scenarios: ['sandbox-small'],
  starters: ['ch02-starter'],
  lessons: ['ch01-hello-soup'],
  keywords: ['daughter', 'copy-loop'],
  subsets: ['ch02'],
});

describe('Content Model & Authoring (CONTENT)', () => {
  it('[CONTENT-001] Valid frontmatter parses: id, chapter, title, unlocks {verbs, concepts}, requires[], mutation parse to a correctly-typed Frontmatter record (and validate clean)', () => {
    const { frontmatter } = parse(VALID_SOURCE);
    assert.ok(frontmatter, 'frontmatter present');
    assert.equal(frontmatter!.id, 'ch02-first-copy');
    assert.equal(frontmatter!.chapter, 2);
    assert.equal(typeof frontmatter!.chapter, 'number');
    assert.equal(frontmatter!.title, 'Teach it to copy');
    assert.deepEqual(frontmatter!.unlocks.verbs, ['copy-byte', 'make-space']);
    assert.deepEqual(frontmatter!.unlocks.concepts, ['daughter', 'copy-loop']);
    assert.deepEqual(frontmatter!.requires, ['ch01-hello-soup']);
    assert.equal(frontmatter!.mutation, 'off');
    const { ast } = parse(VALID_SOURCE);
    assert.equal(errors(validate(ast, FULL_RESOLVER)).length, 0);
  });

  it('[CONTENT-002] Missing a required frontmatter field (id/chapter/title/unlocks/requires/mutation) → an error diagnostic naming the field; parse still returns a best-effort result', () => {
    // drop `title`
    const src = `---
id: ch02
chapter: 2
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
Body still here.`;
    const { ast, frontmatter } = parse(src);
    assert.ok(frontmatter, 'best-effort frontmatter still returned');
    assert.equal(frontmatter!.id, 'ch02'); // other fields still parsed
    assert.ok(ast.body.length >= 1, 'body still parsed');
    const ds = validate(ast, makeResolver({}));
    const miss = ds.find((d) => d.code === 'missing-field' && d.message.includes('title'));
    assert.ok(miss, 'a missing-field error names the missing field');
    assert.equal(miss!.severity, 'error');
  });

  it('[CONTENT-003] mutation is a closed enum: on/off parse; any other value is an error diagnostic (design→emergence toggle is not free-form)', () => {
    const mk = (m: string) => `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: ${m}
---
x`;
    for (const good of ['on', 'off']) {
      const { ast, frontmatter } = parse(mk(good));
      assert.equal(frontmatter!.mutation, good);
      assert.equal(validate(ast, makeResolver({})).filter((d) => d.code === 'bad-enum').length, 0);
    }
    const { ast } = parse(mk('maybe'));
    const bad = validate(ast, makeResolver({})).find((d) => d.code === 'bad-enum');
    assert.ok(bad, 'a non on/off value is a bad-enum error');
    assert.equal(bad!.severity, 'error');
  });

  it('[CONTENT-004] Scenario defaults parse: optional defaults { scenario, seed, starter, subset } → ScenarioDefaults, and a playground omitting a field inherits it rather than erroring', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
defaults: { scenario: base-scn, seed: 3, starter: base-starter, subset: base-set }
---

:::playground {seed: 9}
Only overrides the seed.
:::`;
    const { frontmatter, ast } = parse(src);
    assert.deepEqual(frontmatter!.defaults, {
      scenario: 'base-scn',
      seed: 3,
      starter: 'base-starter',
      subset: 'base-set',
    });
    const pg = ast.body.find((n) => n.kind === 'playground') as PlaygroundNode;
    assert.equal(pg.config.scenario, 'base-scn'); // inherited
    assert.equal(pg.config.seed, 9); // own override
    assert.deepEqual(pg.config.starter, { kind: 'ref', id: 'base-starter' });
    assert.equal((pg.config.subset as { name: string }).name, 'base-set');
    // inheriting rather than erroring: with defaults resolvable, no unknown-* errors
    const ds = validate(
      ast,
      makeResolver({ scenarios: ['base-scn'], starters: ['base-starter'], subsets: ['base-set'] }),
    );
    assert.equal(errors(ds).filter((d) => d.code.startsWith('unknown-')).length, 0);
  });

  it('[CONTENT-005] A :::playground directive parses into a PlaygroundNode carrying its config (scenario, seed, starter, subset) as shape-only data plus its inner prose', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---

:::playground {scenario: scn, seed: 7, starter: st, subset: sub}
Watch it run.
:::`;
    const { ast } = parse(src);
    const pg = ast.body.find((n) => n.kind === 'playground') as PlaygroundNode;
    assert.ok(pg);
    assert.equal(pg.config.scenario, 'scn');
    assert.equal(pg.config.seed, 7);
    assert.deepEqual(pg.config.starter, { kind: 'ref', id: 'st' });
    assert.deepEqual(pg.config.subset, { kind: 'subset', name: 'sub', verbs: [] });
    assert.equal(pg.prose, 'Watch it run.');
    assert.equal(typeof pg.loc.line, 'number');
  });

  it('[CONTENT-006] A :::goal directive parses into a GoalNode carrying its spec (e.g. { kind: replicates, within: 20000 }) as shape-only data plus its learner-facing prose', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---

:::goal { kind: replicates, within: 20000 }
Make your creature produce at least one baby.
:::`;
    const { ast } = parse(src);
    const g = ast.body.find((n) => n.kind === 'goal') as GoalNode;
    assert.ok(g);
    assert.equal(g.goal.kind, 'replicates');
    assert.equal(g.goal.params.within, 20000);
    assert.equal(g.prose, 'Make your creature produce at least one baby.');
  });

  it('[CONTENT-007] An embedded :::goal after a :::playground nests into that playground block (a playground with its goal), per the concrete lesson format', () => {
    const { ast } = parse(VALID_SOURCE);
    const pg = ast.body.find((n) => n.kind === 'playground') as PlaygroundNode;
    assert.ok(pg);
    assert.ok(pg.goal, 'the embedded goal nests into the playground');
    assert.equal(pg.goal!.kind, 'replicates');
    assert.equal(pg.goal!.params.within, 20000);
    assert.equal(pg.goal!.title, 'Make your creature produce at least one baby.');
    // the playground keeps its own prose separate from the nested goal
    assert.equal(pg.prose, 'Try adding a `copy-byte`. Watch the daughter cell fill in.');
    // there is NO standalone goal node (it nested)
    assert.equal(ast.body.filter((n) => n.kind === 'goal').length, 0);
  });

  it('[CONTENT-008] {term} becomes a KeywordRef: an inline {daughter} span is extracted into ProseNode.refs as KeywordRef{ term: "daughter" } with a Loc — the term string only, no color/tooltip resolved (C-CON-SOURCE)', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
A fresh {daughter} cell.`;
    const { ast } = parse(src);
    const prose = ast.body.find((n) => n.kind === 'prose') as ProseNode;
    const kw = prose.refs.find((r) => r.kind === 'keyword');
    assert.ok(kw);
    assert.equal(kw!.kind, 'keyword');
    assert.equal((kw as { term: string }).term, 'daughter');
    assert.equal(typeof kw!.loc.line, 'number');
    assert.equal(typeof kw!.loc.startCol, 'number');
    // records the string ONLY — no color/tooltip fields
    assert.deepEqual(Object.keys(kw as object).sort(), ['kind', 'loc', 'term']);
  });

  it('[CONTENT-009] `verb` becomes an instruction link (CodeRef): a backtick span whose content is a known verb (`copy-byte`) becomes a CodeRef{ verb }; a non-verb backtick span stays ordinary inline code (no CodeRef)', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
Use \`copy-byte\` but \`not-a-verb\` is just code.`;
    const { ast } = parse(src);
    const prose = ast.body.find((n) => n.kind === 'prose') as ProseNode;
    const codeRefs = prose.refs.filter((r) => r.kind === 'code');
    assert.equal(codeRefs.length, 1, 'only the known verb becomes a CodeRef');
    assert.equal((codeRefs[0] as { verb: string }).verb, 'copy-byte');
  });

  it('[CONTENT-010] Prose is retained verbatim + refs ordered: a ProseNode keeps its raw markdown and lists its inline KeywordRef/CodeRefs in source order with correct Locs', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
First {daughter}, then \`copy-byte\`, then {copy-loop}.`;
    const { ast } = parse(src);
    const prose = ast.body.find((n) => n.kind === 'prose') as ProseNode;
    assert.ok(prose.markdown.includes('First {daughter}, then `copy-byte`, then {copy-loop}.'));
    const kinds = prose.refs.map((r) => (r.kind === 'keyword' ? r.term : r.verb));
    assert.deepEqual(kinds, ['daughter', 'copy-byte', 'copy-loop']); // source order
    // Locs strictly increase in column across the one line
    const cols = prose.refs.map((r) => r.loc.startCol);
    assert.deepEqual(cols, [...cols].sort((a, b) => a - b));
    assert.notEqual(cols[0], cols[1]);
  });

  it('[CONTENT-011] Body order is preserved: body is the ordered list of prose/playground/goal nodes in source (reading) order — a playground keeps its position relative to the prose that motivates it', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
Intro prose.

:::playground {scenario: scn}
run
:::

Middle prose.

:::goal { kind: survive, cycles: 10 }
stay alive
:::

Closing prose.`;
    const { ast } = parse(src);
    assert.deepEqual(
      ast.body.map((n) => n.kind),
      ['prose', 'playground', 'prose', 'goal', 'prose'],
    );
  });

  it('[CONTENT-012] A lesson referencing an unknown scenario id fails validation: a :::playground whose scenario is not in the IdResolver yields a validate error (unknown scenario id)', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
:::playground {scenario: ghost-scn}
x
:::`;
    const { ast } = parse(src);
    const ds = validate(ast, makeResolver({}));
    assert.ok(ds.find((d) => d.code === 'unknown-scenario' && d.severity === 'error'));
  });

  it('[CONTENT-013] An unknown starter-genome id fails validation: a :::playground whose starter is not resolvable yields a validate error', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
:::playground {scenario: scn, starter: ghost-starter}
x
:::`;
    const { ast } = parse(src);
    const ds = validate(ast, makeResolver({ scenarios: ['scn'] }));
    assert.ok(ds.find((d) => d.code === 'unknown-starter' && d.severity === 'error'));
  });

  it('[CONTENT-014] An unknown verb fails validation: an unlocks.verbs entry or a `verb` CodeRef that is not a classic-32 verb yields a validate error', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [copy-byte, made-up-verb], concepts: [] }
requires: []
mutation: off
---
x`;
    const { ast } = parse(src);
    const ds = validate(ast, makeResolver({}));
    const bad = ds.filter((d) => d.code === 'unknown-verb');
    assert.equal(bad.length, 1, 'only the bogus verb is flagged (copy-byte is real)');
    assert.ok(bad[0]!.message.includes('made-up-verb'));
  });

  it('[CONTENT-015] An unknown prerequisite id fails validation: a requires[] id with no matching lesson yields a validate error (unknown prerequisite)', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: [ghost-lesson]
mutation: off
---
x`;
    const { ast } = parse(src);
    const ds = validate(ast, makeResolver({}));
    assert.ok(ds.find((d) => d.code === 'unknown-prereq' && d.severity === 'error'));
  });

  it('[CONTENT-016] A malformed directive → diagnostic-bearing ErrorNode, no crash: an unterminated/mis-braced ::: directive becomes one ErrorNode with a Diagnostic; later blocks parse independently and parse never throws', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
:::playground {scenario: scn
never closed brace, and no ::: close either`;
    let result: ReturnType<typeof parse> | undefined;
    assert.doesNotThrow(() => {
      result = parse(src);
    });
    const err = result!.ast.body.find((n) => n.kind === 'error');
    assert.ok(err, 'a malformed directive becomes an ErrorNode');
    assert.equal(err!.kind, 'error');
    assert.ok((err as { diagnostic: Diagnostic }).diagnostic.code === 'malformed-directive');
    assert.ok(result!.diagnostics.find((d) => d.code === 'malformed-directive'));

    // later blocks parse independently: a good directive after a bad one still parses
    const src2 = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
:::bogus
oops
:::

:::goal { kind: replicates }
fine
:::`;
    const r2 = parse(src2);
    assert.ok(r2.ast.body.find((n) => n.kind === 'error'), 'bogus directive → error node');
    assert.ok(r2.ast.body.find((n) => n.kind === 'goal'), 'the later goal still parsed');
  });

  it('[CONTENT-017] Diagnostics are precise and kid/author-tone (C-CON-KID): every diagnostic carries a stable code, a plain-language message, and a Loc pinpointing the field/span', () => {
    // gather diagnostics from a few failure modes
    const bad = parse('no frontmatter here');
    const { ast } = parse(`---
id: l
chapter: 1
title: t
unlocks: { verbs: [nope], concepts: [] }
requires: [ghost]
mutation: huh
---
:::playground {scenario: ghost-scn}
x
:::`);
    const all: Diagnostic[] = [...bad.diagnostics, ...validate(ast, makeResolver({}))];
    assert.ok(all.length > 0);
    for (const d of all) {
      assert.equal(typeof d.code, 'string');
      assert.ok(d.code.length > 0, 'stable machine code');
      assert.equal(typeof d.message, 'string');
      assert.ok(d.message.length > 0, 'plain-language message');
      assert.ok(d.loc && typeof d.loc.line === 'number', 'a Loc');
      assert.ok(['error', 'warning', 'hint'].includes(d.severity));
    }
  });

  it('[CONTENT-018] Auto-highlight ergonomics: an unmarked known term is left in raw markdown for [04] to auto-link, an explicit {term} forces a KeywordRef, and an explicit {term} not in the registry produces a hint (not an error)', () => {
    const src = `---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
The daughter grows; a {daughter} is marked; a {mystery} is unknown.`;
    const { ast } = parse(src);
    const prose = ast.body.find((n) => n.kind === 'prose') as ProseNode;
    // exactly two explicit {term} refs; the bare "daughter" word is NOT a ref (auto-link is [04]'s job)
    assert.equal(prose.refs.filter((r) => r.kind === 'keyword').length, 2);
    assert.ok(prose.markdown.includes('The daughter grows')); // bare term retained in raw markdown
    // {mystery} not in the registry → a HINT, not an error
    const ds = validate(ast, makeResolver({ keywords: ['daughter'] }));
    const hint = ds.find((d) => d.code === 'unknown-term-hint');
    assert.ok(hint, 'unknown {term} → hint');
    assert.equal(hint!.severity, 'hint');
    assert.equal(errors(ds).length, 0, 'no error for an unknown term');
  });

  it('[CONTENT-019] Parse is deterministic (C-CON-DET): parsing the same source twice yields structurally identical ASTs and diagnostics in the same source order; no RNG, clock, or key-order dependence', () => {
    const a = parse(VALID_SOURCE);
    const b = parse(VALID_SOURCE);
    assert.deepEqual(a.ast, b.ast);
    assert.deepEqual(a.diagnostics, b.diagnostics);
    assert.deepEqual(a.frontmatter, b.frontmatter);
  });

  it('[CONTENT-020] Content carries no executable code (C-CON-DATA): the grammar admits only prose/directives/references, and an injected executable form (<script>/JS/handler or non-declarative frontmatter value) is rejected with an error', () => {
    // executable in the body prose
    const body = parse(`---
id: l
chapter: 1
title: t
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
Hello <script>alert('x')</script> world.`);
    assert.ok(
      body.diagnostics.find((d) => d.code === 'executable-content' && d.severity === 'error'),
      'a <script> in prose is rejected',
    );
    // non-declarative frontmatter value
    const fmExec = parse(`---
id: l
chapter: 1
title: "\${evil()}"
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
x`);
    assert.ok(
      fmExec.diagnostics.find((d) => d.code === 'executable-content' && d.severity === 'error'),
      'a non-declarative frontmatter value is rejected',
    );
  });

  it('[CONTENT-021] A well-formed lesson round-trips to a resolvable content record: with all ids resolvable (scenario, starter, verbs, subset, prereqs) validate returns zero error diagnostics — a fully-resolved record for [02]/[04]/[05]/[06] (CONTINV-VALID)', () => {
    const { ast } = parse(VALID_SOURCE);
    const ds = validate(ast, FULL_RESOLVER);
    assert.equal(errors(ds).length, 0, 'zero error diagnostics when everything resolves');
  });

  it('[CONTENT-022] Absent/empty frontmatter is handled: no frontmatter fence → frontmatter: null + a diagnostic while still parsing the body; empty source → empty body + "frontmatter required" diagnostic, never a throw', () => {
    const noFm = parse('Just some body prose, no fence.');
    assert.equal(noFm.frontmatter, null);
    assert.ok(noFm.diagnostics.find((d) => d.code === 'frontmatter-required'));
    assert.ok(noFm.ast.body.find((n) => n.kind === 'prose'), 'body still parsed');

    let empty: ReturnType<typeof parse> | undefined;
    assert.doesNotThrow(() => {
      empty = parse('   \n  \n');
    });
    assert.equal(empty!.frontmatter, null);
    assert.deepEqual(empty!.ast.body, []);
    assert.ok(empty!.diagnostics.find((d) => d.code === 'frontmatter-required'));
  });
});
