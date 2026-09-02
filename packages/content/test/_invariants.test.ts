// Learning-content cross-layer invariants (CONTINV).
// Ref: docs/spec/content/00-overview.md §6.
// These tie the six content systems together against the shipped corpus + registries
// (src/lessons.ts) and the real @tierra26/engine + @tierra26/genescript.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCTION_PAGES, pageOf } from '../src/instrpage.ts';
import { KEYWORDS, lookupKeyword, resolveKeywords } from '../src/keyword.ts';
import { CURRICULUM, cumulativeUnlocks, introLessonOf } from '../src/progress.ts';
import { checkGoal } from '../src/goal.ts';
import { createPlayground } from '../src/play.ts';
import { STARTERS } from '../src/lessons.ts';
import type { Goal, PlaygroundConfig } from '../src/types.ts';

import { allVerbs } from '../../genescript/src/vocab.ts';
import { compile } from '../../genescript/src/comp.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { hasErrors } from '../../genescript/src/types.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';
import { Engine } from '../../engine/src/index.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';

const VERBS = allVerbs().map((v) => v.verb);

// Resolve an ActiveSubset to an engine InstructionSet (nop0/nop1 always forced).
function toSet(subset: { kind: 'classic32' } | { kind: 'subset'; name?: string; verbs: readonly string[] }): InstructionSet {
  return subset.kind === 'classic32'
    ? classic32
    : buildSubset(subset.name ?? 'lesson', [...subset.verbs]);
}

describe('Content cross-layer invariants (CONTINV)', () => {
  it('[CONTINV-COVERAGE] every classic-32 verb has a per-instruction page and a keyword entry (no orphans)', () => {
    const pageVerbs = new Set(INSTRUCTION_PAGES.map((p) => p.verb));
    const kwVerbs = new Set(KEYWORDS.filter((k) => k.kind === 'verb').map((k) => k.term));
    const all = new Set(VERBS);

    // exact bijection in both directions — no orphan verb, no page/entry for an unknown verb
    assert.equal(INSTRUCTION_PAGES.length, VERBS.length, '32 pages');
    assert.deepEqual(pageVerbs, all, 'pages cover exactly the classic-32 verbs');
    assert.deepEqual(kwVerbs, all, 'keyword verb entries cover exactly the classic-32 verbs');
    for (const v of VERBS) {
      assert.ok(pageOf(v), `page for ${v}`);
      assert.ok(lookupKeyword(v, KEYWORDS), `keyword entry for ${v}`);
    }
  });

  it('[CONTINV-COMPILE] every shipped playground starter/solution genome compiles under its subset + loads', () => {
    const seen: string[] = [];
    // 1) the shipped starter registry
    for (const [id, s] of Object.entries(STARTERS)) {
      const set = toSet(s.subset);
      const r = compile(s.source, set);
      assert.equal(hasErrors(r.diagnostics), false, `starter ${id} compiles`);
      for (const b of r.bytes) assert.ok(b >= 0 && b < set.n, `starter ${id} legal opcode`);
      const e = new Engine({ seed: 1, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
      assert.doesNotThrow(() => e.inject(r.bytes, { founderId: 1 }), `starter ${id} loads`);
      seen.push(id);
    }
    assert.ok(seen.length > 0, 'at least one shipped starter');
  });

  it('[CONTINV-INTRO-BEFORE-USE] no lesson requires a verb not unlocked by it or a prerequisite (curriculum graph is sound)', () => {
    // For every lesson, everything it USES is already unlocked by its prereq-closure ∪ itself.
    for (const id of Object.keys(CURRICULUM.lessons)) {
      const lesson = CURRICULUM.lessons[id]!;
      const cum = cumulativeUnlocks(CURRICULUM, id);
      const cumVerbs = new Set(cum.verbs);
      const cumConcepts = new Set(cum.concepts);
      for (const v of lesson.uses.verbs) assert.ok(cumVerbs.has(v), `${id} uses verb ${v} before it is unlocked`);
      for (const c of lesson.uses.concepts) assert.ok(cumConcepts.has(c), `${id} uses concept ${c} before it is unlocked`);
    }
    // Every instruction page names the lesson that introduces its verb, soundly.
    for (const v of VERBS) {
      const intro = introLessonOf(v);
      assert.ok(intro, `intro lesson for ${v}`);
      const page = pageOf(v)!;
      assert.equal(page.introLesson, intro, `page ${v} introLesson matches curriculum`);
      assert.ok(CURRICULUM.lessons[intro]!.unlocks.verbs.includes(v), `${intro} actually unlocks ${v}`);
    }
  });

  it('[CONTINV-DET] goal-checkers and playground runs are deterministic per seed', () => {
    const goal: Goal = { id: 'g', kind: 'replicates', params: { within: 5000 }, tier: 'required', title: 'baby' };
    const genome = compile(STARTERS.ancestor.source, classic32).bytes;
    const ctx = { scenario: { seed: 4 }, seed: 4, genome, maxCycles: 200_000 };
    // same (goal, ctx) → identical GoalResult
    assert.deepEqual(checkGoal(goal, ctx), checkGoal(goal, ctx));

    // same PlaygroundConfig → identical run (frame stats at the same cycle)
    const cfg: PlaygroundConfig = {
      scenario: { seed: 9 },
      seed: 9,
      starter: { kind: 'genescript', source: STARTERS.ancestor.source },
      subset: { kind: 'classic32' },
    };
    const a = createPlayground(cfg); a.runTo(50_000);
    const b = createPlayground(cfg); b.runTo(50_000);
    assert.equal(a.state.cycle, b.state.cycle);
    assert.deepEqual(a.state.frame.stats, b.state.frame.stats);
    // two playgrounds on one page share no module-level state
    const c = createPlayground(cfg); // fresh, untouched
    assert.equal(c.state.cycle, 0);
  });

  it('[CONTINV-KEYWORDS] keyword auto-linking only links registry terms and is deterministic', () => {
    const prose =
      'The soup holds each daughter until it can divide; a stray zzzword links to nothing.';
    const s1 = resolveKeywords(prose, KEYWORDS);
    const s2 = resolveKeywords(prose, KEYWORDS);
    assert.deepEqual(s1, s2, 'same (prose, registry) → identical ordered spans');
    // every linked span names a real registry term/alias; the invented word links to nothing
    for (const span of s1) {
      assert.ok(lookupKeyword(span.term, KEYWORDS), `span term ${span.term} is in the registry`);
      assert.notEqual(prose.slice(span.start, span.end).toLowerCase(), 'zzzword');
    }
    assert.ok(s1.some((sp) => sp.term === 'soup'), 'soup linked');
    assert.ok(!s1.some((sp) => prose.slice(sp.start, sp.end).toLowerCase().includes('zzz')), 'unknown word left plain');
    // spans are in ascending, non-overlapping source order
    for (let i = 1; i < s1.length; i++) assert.ok(s1[i]!.start >= s1[i - 1]!.end, 'ordered, non-overlapping');
  });
});
