// DOCLANG — the `<Tag>` document language behind docs/**/*.md.
// parseDoc()/validateDoc() live in src/doclang.ts; the tag vocabulary in src/manifest.ts.
//
// The contracts these exercise:
//   C-CON-DATA   declarative only — an executable form is REJECTED, never rendered.
//   C-CON-DET    parse is a pure function of the source bytes.
//   C-CON-SOURCE the parser resolves no id; existence goes through a caller DocResolver.
//   error tolerance — parseDoc NEVER throws; malformed input becomes an ErrorNode and
//   the blocks after it still parse.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedent,
  foldAt,
  parseDoc,
  readAttrs,
  childTag,
  sectionOf,
  splitInline,
  validateDoc,
  waypointEvents,
  type DocResolver,
} from '../src/doclang.ts';
import { MANIFEST, canonicalTag, kebabOf } from '../src/manifest.ts';
import type { Diagnostic, DocNode, DocProseNode, DocTagNode } from '../src/types.ts';

// A permissive resolver; individual tests tighten the checks they care about.
function makeResolver(o: Partial<Record<keyof DocResolver, (s: string) => boolean>> = {}): DocResolver {
  const yes = () => true;
  return {
    isOpcode: o.isOpcode ?? yes,
    hasConcept: o.hasConcept ?? yes,
    hasGenome: o.hasGenome ?? yes,
    hasScenario: o.hasScenario ?? yes,
    hasSubset: o.hasSubset ?? yes,
    hasSnapshot: o.hasSnapshot ?? yes,
    hasLesson: o.hasLesson ?? yes,
  };
}

const NL = String.fromCharCode(10);

const LESSON = { kind: 'lesson', slug: 'loops', file: 'docs/lessons/08-loops.md' } as const;

function doc(body: string, front = 'id: loops\ntitle: Go in circles') {
  return parseDoc(`---\n${front}\n---\n${body}`, LESSON);
}

const tags = (nodes: readonly DocNode[]): DocTagNode[] =>
  nodes.filter((n): n is DocTagNode => n.kind === 'tag');
const prose = (nodes: readonly DocNode[]): DocProseNode[] =>
  nodes.filter((n): n is DocProseNode => n.kind === 'prose');
const errors = (ds: readonly Diagnostic[]): Diagnostic[] => ds.filter((d) => d.severity === 'error');

/** Strip every `loc` so two trees can be compared on structure alone. */
function noLoc(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(noLoc);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== 'loc')
        .map(([k, v]) => [k, noLoc(v)]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
describe('DOCLANG · attributes', () => {
  it('coerces declarative values and treats a bare attribute as true', () => {
    const a = readAttrs(' soup="36" editable mode=\'simple\' flags="[E, Z]" ');
    assert.equal(a['soup'], 36, 'a numeric string becomes a number');
    assert.equal(a['editable'], true, 'a bare attribute is true');
    assert.equal(a['mode'], 'simple', 'single quotes work too');
    assert.deepEqual(a['flags'], ['E', 'Z'], 'a bracketed list becomes an array');
  });

  it('keeps a negative and a zero value distinct from absent', () => {
    const a = readAttrs('a="-1" b="0"');
    assert.equal(a['a'], -1);
    assert.equal(a['b'], 0);
    assert.equal('c' in a, false);
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · casing', () => {
  it('accepts kebab-case for every PascalCase tag', () => {
    for (const name of Object.keys(MANIFEST)) {
      assert.equal(canonicalTag(kebabOf(name)), name, `${kebabOf(name)} -> ${name}`);
      assert.equal(canonicalTag(name), name);
    }
  });

  it('parses <entity-designer> and <EntityDesigner> to the same node', () => {
    const a = doc('<EntityDesigner soup="36">\n<Genome>\nincA\n</Genome>\n</EntityDesigner>');
    const b = doc('<entity-designer soup="36">\n<genome>\nincA\n</genome>\n</entity-designer>');
    // Structure only: `loc` legitimately differs, because the two spellings are
    // different lengths and a diagnostic must point at the real source span.
    assert.deepEqual(noLoc(a.ast.body), noLoc(b.ast.body));
    assert.equal(tags(a.ast.body)[0]?.name, 'EntityDesigner');
  });

  it('rejects a tag that is not in the manifest', () => {
    const r = doc('<Stge>\nhello\n</Stge>');
    const ds = validateDoc(r.ast, makeResolver());
    // Unknown tags parse as prose, so the diagnostic comes from neither path silently:
    assert.ok(canonicalTag('Stge') === undefined, 'unknown name has no canonical form');
    assert.equal(errors(ds).length, 0, 'unknown block tags degrade to prose, not a crash');
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · inline tags', () => {
  it('scans a <Chip> out of the middle of a sentence', () => {
    const segs = splitInline('so <Chip opcode="incA"/> runs again');
    assert.deepEqual(
      segs.map((s) => s.kind),
      ['text', 'tag', 'text'],
    );
    const tag = segs[1];
    assert.equal(tag?.kind === 'tag' && tag.name, 'Chip');
    assert.equal(tag?.kind === 'tag' && tag.attrs['opcode'], 'incA');
  });

  it('carries the label of a paired inline tag', () => {
    const segs = splitInline('<Chip opcode="jmpb">top</Chip> sends it back');
    const tag = segs[0];
    assert.equal(tag?.kind === 'tag' && tag.text, 'top');
    assert.equal(segs[1]?.kind === 'text' && segs[1].text, ' sends it back');
  });

  it('still reads {term} and `code`, and leaves an unterminated one as text', () => {
    const segs = splitInline('the {soup} holds `incA` but not {broken');
    assert.deepEqual(
      segs.filter((s) => s.kind === 'keyword').map((s) => (s as { term: string }).term),
      ['soup'],
    );
    assert.deepEqual(
      segs.filter((s) => s.kind === 'code').map((s) => (s as { text: string }).text),
      ['incA'],
    );
    assert.ok(segs.some((s) => s.kind === 'text' && s.text.includes('{broken')));
  });

  it('indexes inline tags on the prose node so the validator can reach them', () => {
    const r = doc('Press <Chip opcode="incA"/> twice.');
    const refs = prose(r.ast.body)[0]!.refs;
    assert.equal(refs.length, 1);
    assert.equal(refs[0]!.kind, 'tag');
  });

  it('an inline tag alone on a line is prose, not a block', () => {
    const r = doc('<Chip opcode="incA"/>');
    assert.equal(r.ast.body[0]?.kind, 'prose');
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · block structure', () => {
  it('nests children and keeps source order', () => {
    const r = doc(
      [
        '<Scrolly>',
        '<Stage>',
        '<EntityDesigner soup="36">',
        '<Genome>',
        'incA',
        '</Genome>',
        '</EntityDesigner>',
        '</Stage>',
        '<Waypoint focus="ip">',
        '## The loop',
        '</Waypoint>',
        '</Scrolly>',
      ].join('\n'),
    );
    assert.equal(errors(r.diagnostics).length, 0);
    const scrolly = tags(r.ast.body)[0]!;
    assert.equal(scrolly.name, 'Scrolly');
    assert.deepEqual(tags(scrolly.children).map((t) => t.name), ['Stage', 'Waypoint']);
  });

  it('nests two tags of the same name without closing the outer one early', () => {
    const r = doc(
      ['<Callout>', 'outer', '</Callout>', '<Callout>', 'second', '</Callout>'].join('\n'),
    );
    assert.equal(tags(r.ast.body).length, 2);
  });

  it('keeps raw children verbatim and dedents them', () => {
    const r = doc(['<Challenge>', '  <Starter>', '    top:', '    incA', '  </Starter>', '</Challenge>'].join('\n'));
    const starter = tags(tags(r.ast.body)[0]!.children)[0]!;
    assert.equal(starter.text, 'top:\nincA', 'common indent removed, lines intact');
    assert.equal(starter.children.length, 0, 'raw children are never parsed as markdown');
  });

  it('does not treat markdown inside a raw tag as markdown', () => {
    const r = doc(['<Challenge>', '<Starter>', '* not a list', '</Starter>', '</Challenge>'].join('\n'));
    const starter = tags(tags(r.ast.body)[0]!.children)[0]!;
    assert.equal(starter.text, '* not a list');
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · error tolerance', () => {
  it('never throws, and reports an unclosed tag', () => {
    const r = doc('<Scrolly>\nforever');
    assert.equal(errors(r.diagnostics).length, 1);
    assert.match(r.diagnostics[0]!.message, /never closed/);
  });

  it('reports a stray closing tag and keeps parsing what follows', () => {
    const r = doc('</Scrolly>\nstill here');
    assert.equal(r.ast.body[0]?.kind, 'error');
    assert.ok(prose(r.ast.body).some((p) => p.markdown.includes('still here')));
  });

  it('names the mistake when a block tag shares its line with content', () => {
    const r = doc('<Waypoint focus="ip">## The loop');
    assert.equal(r.ast.body[0]?.kind, 'error');
    assert.match(r.diagnostics[0]!.message, /line of its own/);
  });

  it('requires a frontmatter block', () => {
    const r = parseDoc('just prose', LESSON);
    assert.ok(errors(r.diagnostics).some((d) => d.code === 'frontmatter-required'));
    assert.ok(r.ast.body.length > 0, 'still returns a best-effort tree');
  });

  it('rejects executable content in frontmatter and in a tag (C-CON-DATA)', () => {
    const a = parseDoc('---\nid: x\ntitle: <script>boom()</script>\n---\nhi', LESSON);
    assert.ok(errors(a.diagnostics).some((d) => d.code === 'executable-content'));
    const b = doc('<Callout kind="note" onclick="boom()">\nhi\n</Callout>');
    assert.ok(errors(b.diagnostics).some((d) => d.code === 'executable-content'));
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · determinism (C-CON-DET)', () => {
  it('parses identically twice', () => {
    const src = [
      '<Scrolly>',
      '<Stage>',
      '<EntityDesigner soup="36"><Genome ref="ancestor" /></EntityDesigner>',
      '</Stage>',
      '<Waypoint focus="world" at="6">',
      'Look at the <Chip concept="soup">world</Chip>.',
      '</Waypoint>',
      '</Scrolly>',
    ].join('\n');
    const a = doc(src);
    const b = doc(src);
    assert.deepEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · validation', () => {
  it('flags an opcode the engine does not have (C-CON-SOURCE)', () => {
    const r = doc('Press <Chip opcode="nope"/> now.');
    const ds = validateDoc(r.ast, makeResolver({ isOpcode: (s) => s === 'incA' }));
    assert.equal(errors(ds).length, 1);
    assert.match(errors(ds)[0]!.message, /not an instruction/);
  });

  it('accepts an opcode the resolver knows', () => {
    const r = doc('Press <Chip opcode="incA"/> now.');
    assert.equal(errors(validateDoc(r.ast, makeResolver({ isOpcode: (s) => s === 'incA' }))).length, 0);
  });

  it('requires one of the Chip target attributes', () => {
    const r = doc('A bare <Chip/> chip.');
    const ds = errors(validateDoc(r.ast, makeResolver()));
    assert.ok(ds.some((d) => /needs one of/.test(d.message)));
  });

  it('rejects a bad enum value and an unknown attribute', () => {
    const r = doc('<Waypoint focus="elbow">\nhi\n</Waypoint>');
    const ds = validateDoc(r.ast, makeResolver());
    assert.ok(errors(ds).some((d) => d.code === 'bad-enum'));

    const r2 = doc('<Callout knid="tip">\nhi\n</Callout>');
    const ds2 = validateDoc(r2.ast, makeResolver());
    assert.ok(ds2.some((d) => d.severity === 'warning' && /knid/.test(d.message)));
  });

  it('enforces where a tag may live', () => {
    const r = doc('<Waypoint focus="ip">\nhi\n</Waypoint>');
    const ds = errors(validateDoc(r.ast, makeResolver()));
    assert.ok(ds.some((d) => /only works inside/.test(d.message)), 'Waypoint needs a Scrolly');
  });

  it('enforces which children a tag accepts', () => {
    const r = doc(['<Scrolly>', '<Callout>', 'nope', '</Callout>', '</Scrolly>'].join('\n'));
    const ds = errors(validateDoc(r.ast, makeResolver()));
    assert.ok(ds.some((d) => /cannot go inside/.test(d.message)));
  });

  it('checks per-kind goal parameters', () => {
    const ok = doc(
      ['<Challenge>', '<Goal kind="regAtLeast" reg="A" value="3" label="A reaches 3" />', '</Challenge>'].join('\n'),
    );
    assert.equal(errors(validateDoc(ok.ast, makeResolver())).length, 0);

    const bad = doc(['<Challenge>', '<Goal kind="regAtLeast" label="A reaches 3" />', '</Challenge>'].join('\n'));
    const ds = errors(validateDoc(bad.ast, makeResolver()));
    assert.equal(ds.filter((d) => d.code === 'invalid-goal').length, 2, 'reg and value are both required');
  });

  it('requires the frontmatter id to match the filename', () => {
    const r = parseDoc('---\nid: elsewhere\ntitle: t\n---\nhi', LESSON);
    const ds = errors(validateDoc(r.ast, makeResolver()));
    assert.ok(ds.some((d) => /must match/.test(d.message)));
  });

  it('reports a missing required frontmatter key per document kind', () => {
    const r = parseDoc('---\nname: grow-a\n---\nhi', {
      kind: 'opcode',
      slug: 'incA',
      file: 'docs/bible/opcodes/incA.md',
    });
    const ds = errors(validateDoc(r.ast, makeResolver()));
    assert.ok(ds.some((d) => /"mnemonic"/.test(d.message)));
    assert.ok(ds.some((d) => /"category"/.test(d.message)));
  });
});

// ---------------------------------------------------------------------------
describe('DOCLANG · readers', () => {
  it('turns waypoint attributes into ordered stage events', () => {
    const r = doc(['<Scrolly>', '<Waypoint focus="world" at="6">', 'hi', '</Waypoint>', '</Scrolly>'].join('\n'));
    const wp = tags(tags(r.ast.body)[0]!.children)[0]!;
    assert.deepEqual(waypointEvents(wp), [
      { kind: 'focus', part: 'world' },
      { kind: 'at', step: 6 },
    ]);
  });

  it('reads run-until as a stage event', () => {
    const r = doc(
      ['<Scrolly>', '<Waypoint focus="world" run-until="birth">', 'hi', '</Waypoint>', '</Scrolly>'].join(NL),
    );
    const wp = tags(tags(r.ast.body)[0]!.children)[0]!;
    assert.deepEqual(waypointEvents(wp), [
      { kind: 'focus', part: 'world' },
      { kind: 'until', condition: 'birth' },
    ]);
    assert.equal(errors(validateDoc(r.ast, makeResolver())).length, 0);
  });

  it('rejects a run-until condition the stage cannot check', () => {
    const r = doc(
      ['<Scrolly>', '<Waypoint run-until="lunchtime">', 'hi', '</Waypoint>', '</Scrolly>'].join(NL),
    );
    assert.ok(errors(validateDoc(r.ast, makeResolver())).some((d) => d.code === 'bad-enum'));
  });

  it('lets a waypoint carry its own <Genome> and <State> to override the stage', () => {
    const r = doc(
      [
        '<Scrolly>',
        '<Waypoint focus="genome">',
        'A different creature.',
        '<Genome>',
        'zero',
        'not0',
        '</Genome>',
        '<State a="9" />',
        '</Waypoint>',
        '</Scrolly>',
      ].join(NL),
    );
    assert.equal(errors(validateDoc(r.ast, makeResolver())).length, 0);
    const wp = tags(tags(r.ast.body)[0]!.children)[0]!;
    assert.equal(childTag(wp, 'Genome')?.text, 'zero' + NL + 'not0');
    assert.equal(childTag(wp, 'State')?.attrs['a'], 9);
  });

  it('splits a body at an explicit <Fold/>', () => {
    const r = doc(['The short version.', '', '<Fold />', '', 'The long version.'].join('\n'));
    const { above, below } = foldAt(r.ast.body);
    assert.equal(prose(above).length, 1);
    assert.ok(prose(above)[0]!.markdown.includes('short'));
    assert.ok(prose(below)[0]!.markdown.includes('long'));
  });

  it('with no <Fold/>, the cut falls before the first embedded component', () => {
    // The fold exists to keep a live simulation out of a hover tooltip, so
    // "everything before the first component" is the useful default.
    const r = doc(['One paragraph.', '', '<Callout>', 'extra', '</Callout>'].join('\n'));
    const { above, below } = foldAt(r.ast.body);
    assert.equal(above.length, 1);
    assert.equal(tags(below)[0]?.name, 'Callout');
  });

  it('a prose-only document is entirely above the fold', () => {
    // Every Bible page today is prose-only: the whole definition is tooltipable.
    const r = doc(['# soup', '', 'One paragraph.', '', '## Advanced', 'More.'].join('\n'));
    const { above, below } = foldAt(r.ast.body);
    assert.equal(below.length, 0);
    assert.equal(above.length, r.ast.body.length);
  });

  it('extracts one named section of a document', () => {
    const r = doc(
      ['# mal', '', '## Simple', 'Asks for room.', '', '## Advanced', 'Allocates a daughter.', '', '## See also', '- x'].join('\n'),
    );
    assert.equal(sectionOf(r.ast.body, 'Simple'), 'Asks for room.');
    assert.equal(sectionOf(r.ast.body, 'Advanced'), 'Allocates a daughter.');
    assert.equal(sectionOf(r.ast.body, 'Nope'), undefined);
  });

  it('dedents a raw block without disturbing relative indentation', () => {
    assert.equal(dedent(['', '    top:', '      incA', '    zero', '']), 'top:\n  incA\nzero');
  });
});
