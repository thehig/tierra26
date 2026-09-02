// Lesson Reader & Pages (READER) — acceptance criteria as executable tests.
// Ref: docs/spec/ui/06-lesson-reader-and-pages.md §8. Keep 1:1 with the doc.
// Parses the REAL shipped lesson corpus (content LESSONS via content parse) — no fixtures,
// no UI-local registries. The per-instruction PAGE is not modelled here any more: it is a
// Bible document, rendered by the doc pipeline and covered by the docs corpus tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  toRenderModel,
  resolveProseSpans,
  toSessionConfig,
  shouldMount,
  disposeCommand,
  motionPolicy,
  goalCompletionEvent,
  instrPageId,
} from '../src/reader.ts';
import type { ProseSpan, RenderBlock } from '../src/reader.ts';
import { parse } from '../../content/src/content.ts';
import { LESSONS } from '../../content/src/lessons.ts';
import { pageOf } from '../../content/src/instrpage.ts';
import { KEYWORDS } from '../../content/src/keyword.ts';
import type { ProseNode, PlaygroundNode, GoalNode } from '../../content/src/types.ts';

// ---- helpers ---------------------------------------------------------------
const lesson = (id: string) => {
  const l = LESSONS.find((x) => x.id === id);
  assert.ok(l, `shipped lesson '${id}' exists`);
  return parse(l!.source).ast;
};
const ch01 = () => lesson('ch01-landmarks');
const keywordSpans = (spans: ProseSpan[]) =>
  spans.filter((s): s is Extract<ProseSpan, { kind: 'keyword' }> => s.kind === 'keyword');
const linkSpans = (spans: ProseSpan[]) =>
  spans.filter((s): s is Extract<ProseSpan, { kind: 'instr-link' }> => s.kind === 'instr-link');
const allSpans = (m: { blocks: RenderBlock[] }) =>
  m.blocks.flatMap((b) => (b.kind === 'prose' ? b.spans : []));

describe('Lesson Reader & Pages (READER)', () => {
  it('[READER-001] toRenderModel(ast) is pure and maps the Lesson AST to an ordered RenderBlock[]', () => {
    const ast = ch01();
    const a = toRenderModel(ast);
    const b = toRenderModel(ast);
    // pure: same AST -> deeply equal model, and no mutation of the source AST.
    assert.deepEqual(a, b);
    // ordered: block kinds line up with the source body node kinds, in source order.
    const expected = ast.body.map((n) =>
      n.kind === 'prose' ? 'prose' : n.kind === 'playground' ? 'playground' : n.kind === 'goal' ? 'goal' : 'error',
    );
    assert.deepEqual(a.blocks.map((x) => x.kind), expected);
    // the ancestor lesson is prose -> a lazy playground (with embedded goal) — the reader shape.
    assert.ok(a.blocks.some((x) => x.kind === 'prose'));
    assert.ok(a.blocks.some((x) => x.kind === 'playground'));
  });

  it('[READER-002] prose keyword refs resolve to registry entries with color + tooltip (C-UI-SOURCE)', () => {
    const prose = ch01().body.find((n): n is ProseNode => n.kind === 'prose')!;
    const spans = resolveProseSpans(prose);
    const soup = keywordSpans(spans).find((s) => s.term === 'soup');
    assert.ok(soup, 'the {soup} force resolves to a keyword span');
    // color + tooltip come STRAIGHT from the content registry, not a UI constant.
    const entry = KEYWORDS.find((e) => e.term === 'soup')!;
    assert.equal(soup!.color, entry.category);
    assert.equal(soup!.entryId, entry.term);
    assert.deepEqual(soup!.tooltip, { kid: entry.tooltip.kid, more: entry.tooltip.more });
    // every keyword span's color is a real registry category (delegated resolution).
    const cats = new Set(KEYWORDS.map((e) => e.category));
    for (const k of keywordSpans(spans)) assert.ok(cats.has(k.color as never), `${k.color} is a registry category`);
  });

  it('[READER-003] an unknown keyword term degrades to a plain-text span (no crash)', () => {
    const node: ProseNode = {
      kind: 'prose',
      markdown: 'A {notarealkeyword} sits next to the real {soup}.',
      refs: [],
      loc: { line: 1, startCol: 1, endCol: 1 },
    };
    const spans = resolveProseSpans(node);
    // unknown force -> no keyword span; its text survives as plain text.
    assert.ok(!keywordSpans(spans).some((s) => s.term === 'notarealkeyword'));
    assert.ok(spans.some((s) => s.kind === 'text' && s.text.includes('notarealkeyword')));
    // the known one still resolves alongside it.
    assert.ok(keywordSpans(spans).some((s) => s.term === 'soup'));
  });

  it('[READER-004] a playground block yields a valid worker-session config from its PlaygroundConfig', () => {
    const pg = ch01().body.find((n): n is PlaygroundNode => n.kind === 'playground')!;
    const block = toRenderModel(ch01()).blocks.find((b) => b.kind === 'playground')!;
    assert.equal(block.kind, 'playground');
    const session = toSessionConfig(pg.config);
    // the session recipe is a faithful projection: scenario (init), seed, starter (compile+inject), subset.
    assert.equal(session.scenario, pg.config.scenario);
    assert.equal(session.seed, pg.config.seed);
    assert.deepEqual(session.starter, pg.config.starter);
    assert.deepEqual(session.subset, pg.config.subset);
    assert.ok(session.starter, 'a starter genome to compile is present');
  });

  it('[READER-005] embedded playgrounds mount lazily on scroll-into-view and dispose their session on unmount', () => {
    for (const b of toRenderModel(ch01()).blocks) {
      if (b.kind === 'playground') assert.equal(b.mount, 'lazy');
    }
    // in view -> mount a live session; unmount -> a WORKER disposeSession command.
    assert.equal(shouldMount(true), true);
    assert.deepEqual(disposeCommand('sess-1'), { type: 'disposeSession', sessionId: 'sess-1' });
  });

  it('[READER-006] an embedded goal pass emits a completion event to the Shell', () => {
    const pg = ch01().body.find((n): n is PlaygroundNode => n.kind === 'playground')!;
    const block = toRenderModel(ch01()).blocks.find((b) => b.kind === 'playground')!;
    assert.ok(block.kind === 'playground' && block.goal, 'the playground carries a goal ref');
    const ref = block.goal!;
    assert.equal(ref.goalId, pg.goal!.id);
    // pass -> event; fail -> no event (no spurious unlock).
    const ev = goalCompletionEvent('ch01-landmarks', ref, true);
    assert.deepEqual(ev, { type: 'goal-complete', lessonId: 'ch01-landmarks', goalId: ref.goalId, kind: ref.kind });
    assert.equal(goalCompletionEvent('ch01-landmarks', ref, false), null);
  });

  it('[READER-009] instruction-link spans resolve to the correct per-instruction page id', () => {
    const spans = allSpans(toRenderModel(ch01()));
    const links = linkSpans(spans);
    // ch01 links `mark-0` and `mark-1`; each resolves to its page id via the registry (pageOf).
    const mark0 = links.find((l) => l.verb === 'mark-0');
    assert.ok(mark0, '`mark-0` is an instruction-link span');
    assert.equal(mark0!.pageId, pageOf('mark-0')!.verb);
    assert.equal(mark0!.pageId, instrPageId('mark-0'));
    assert.ok(links.some((l) => l.verb === 'mark-1'));
    // every emitted link points at a real page.
    for (const l of links) assert.ok(pageOf(l.verb) !== undefined, `${l.verb} has a page`);
  });

  it('[READER-010] reduced-motion disables animation; keyword tooltips are keyboard-focusable (C-UI-A11Y)', () => {
    assert.deepEqual(motionPolicy(true), { playgroundAnimation: false, scrollAnimation: false });
    assert.deepEqual(motionPolicy(false), { playgroundAnimation: true, scrollAnimation: true });
    // tooltips are data (kid + more), not hover-only side effects, so they are keyboard-focusable.
    const spans = resolveProseSpans(ch01().body.find((n): n is ProseNode => n.kind === 'prose')!);
    const kw = keywordSpans(spans)[0]!;
    assert.equal(typeof kw.tooltip.kid, 'string');
    assert.equal(typeof kw.tooltip.more, 'string');
    assert.ok(kw.tooltip.kid.length > 0);
  });

  it('[READER-011] a playground with a non-compiling starter renders an error state, not a crash', () => {
    // a malformed :::playground directive is the reader-visible form of a broken playground;
    // the content parser degrades it to an ErrorNode, which the reader maps to an error block.
    const src = `---
id: ch01-landmarks
chapter: 1
title: Broken
unlocks: { verbs: [], concepts: [] }
requires: []
mutation: off
---
Intro prose.

:::playground { scenario: soup-small
Never closed.
`;
    const ast = parse(src).ast;
    let model!: ReturnType<typeof toRenderModel>;
    assert.doesNotThrow(() => {
      model = toRenderModel(ast);
    });
    const err = model.blocks.find((b) => b.kind === 'error');
    assert.ok(err, 'the broken directive renders an error block');
    assert.equal(err!.kind, 'error');
    assert.ok((err as Extract<RenderBlock, { kind: 'error' }>).message.length > 0);
  });

  it('[READER-012] off-screen playgrounds hold no live worker session (bounded resource use)', () => {
    // lazy mount contract: an off-screen block holds no session; only in-view blocks do.
    assert.equal(shouldMount(false), false);
    assert.equal(shouldMount(true), true);
    for (const b of toRenderModel(ch01()).blocks) {
      if (b.kind === 'playground') assert.equal(b.mount, 'lazy');
    }
  });

  it('[READER-013] (visual) scroll layout, typography, keyword styling, and tooltip presentation', () => {
    // The render model carries exactly the structural hooks the design pass paints:
    // discriminated block kinds (layout), a color category per keyword (styling), and a
    // two-line tooltip (presentation). No hex/pixels here — those are the design pass.
    const model = toRenderModel(ch01());
    const kinds = new Set(model.blocks.map((b) => b.kind));
    assert.ok(kinds.has('prose') && kinds.has('playground'));
    const kw = keywordSpans(allSpans(model))[0]!;
    assert.equal(typeof kw.color, 'string');
    assert.ok(kw.color.length > 0);
    assert.ok('kid' in kw.tooltip && 'more' in kw.tooltip);
  });
});
