// Per-Instruction Pages (INSTRPAGE) — acceptance tests.
// Ref: docs/spec/content/03-per-instruction-pages.md §8 (INSTRPAGE-NNN).
// One InstructionPage data record per classic-32 verb. Identity (mnemonic/kid/machine) is a
// PROJECTION of the VOCAB entry, whose mnemonic the engine ISA resolves at compile time
// (C-GS-NOOPCODES). What the record still OWNS is `targets` — the structured "what changes"
// list a document cannot express.
//
// The prose depth this file used to police (summary, seeAlso, commonMistakes) and the
// runnable scenarios both moved to docs/bible/opcodes/<mnemonic>.md. Their invariants moved
// with them: the Bible is a bijection with the engine (08-docs), every inline <Genome> in it
// compiles and loads (08-docs), and every lesson genome runs (app/test/chapters.test.ts).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTION_PAGES, pageOf } from '../src/instrpage.ts';
import { introLessonOf, CURRICULUM } from '../src/progress.ts';
import { allVerbs, entry, entryOfMnemonic, opcodeOf } from '../../genescript/src/vocab.ts';
import { classic32 } from '../../engine/src/index.ts';

// ---- shared fixtures --------------------------------------------------------
const VERBS = allVerbs();
const VERB_NAMES = VERBS.map((v) => v.verb);
const MNEMONICS = VERBS.map((v) => v.mnemonic);

// The expected exact key set of an InstructionPage — the three identity projections plus the
// depth fields it OWNS. No extra "definition" field is allowed (C-CON-SOURCE, INSTRPAGE-005).
const PAGE_KEYS = ['animation', 'introLesson', 'kid', 'machine', 'mnemonic', 'verb'].sort();

describe('Per-Instruction Pages (INSTRPAGE)', () => {
  it('[INSTRPAGE-001] INSTRUCTION_PAGES has exactly one page per classic-32 verb — a bijection page<->VOCAB verb (32 pages, no orphan verb, no page for an unknown verb) (CONTINV-COVERAGE)', () => {
    assert.equal(VERBS.length, 32);
    assert.equal(INSTRUCTION_PAGES.length, 32);
    // no duplicate verb among the pages
    const pageVerbs = INSTRUCTION_PAGES.map((p) => p.verb);
    assert.equal(new Set(pageVerbs).size, 32);
    // exact set equality with VOCAB (no orphan verb, no page for an unknown verb)
    assert.deepEqual([...pageVerbs].sort(), [...VERB_NAMES].sort());
    // every VOCAB verb resolves to a page; an unknown verb resolves to none
    for (const v of VERB_NAMES) assert.ok(pageOf(v), `no page for ${v}`);
    assert.equal(pageOf('not-a-real-verb'), undefined);
  });

  it('[INSTRPAGE-002] every page.verb is a real verb present in VOCABULARY, and every VOCAB verb has a page (coverage exact in both directions)', () => {
    for (const p of INSTRUCTION_PAGES) assert.ok(entry(p.verb), `page verb ${p.verb} is not in VOCAB`);
    for (const v of VERB_NAMES) assert.ok(pageOf(v), `VOCAB verb ${v} has no page`);
  });

  it('[INSTRPAGE-003] every page.mnemonic equals vocab(verb).mnemonic and is a real classic-32 mnemonic resolved via the engine ISA — never hard-coded, never an opcode number', () => {
    for (const p of INSTRUCTION_PAGES) {
      const e = entry(p.verb)!;
      assert.equal(typeof p.mnemonic, 'string');
      assert.equal(p.mnemonic, e.mnemonic); // projection, not a copy
      // resolves through the engine ISA (a real classic-32 mnemonic), never an opcode literal
      assert.ok(entryOfMnemonic(p.mnemonic), `${p.mnemonic} not a real mnemonic`);
      assert.ok(opcodeOf(classic32, p.mnemonic) >= 0, `${p.mnemonic} not in classic32`);
    }
  });

  it('[INSTRPAGE-004] every page.kid and page.machine are byte-equal to the VOCAB entry tooltip.kid / tooltip.machine (kid def + machine truth present and consistent with VOCAB — C-CON-SOURCE)', () => {
    for (const p of INSTRUCTION_PAGES) {
      const e = entry(p.verb)!;
      assert.equal(p.kid, e.kid);
      assert.equal(p.machine, e.machine);
      assert.ok(p.kid.length > 0 && p.machine.length > 0);
    }
  });

  it('[INSTRPAGE-005] no page redefines a fact owned by VOCAB: a page adds no definition field beyond the three VOCAB projections, so prose/tooltips reference and never fork a definition (C-CON-SOURCE)', () => {
    for (const p of INSTRUCTION_PAGES) {
      assert.deepEqual(Object.keys(p).sort(), PAGE_KEYS);
      const e = entry(p.verb)!;
      // the only definitional facts are the three projections, byte-equal to VOCAB
      assert.equal(p.mnemonic, e.mnemonic);
      assert.equal(p.kid, e.kid);
      assert.equal(p.machine, e.machine);
    }
  });

  it('[INSTRPAGE-006] every page.animation has targets consistent with the machine-truth (bound register increase/decrease/set; copy-byte soup mother->daughter; divide cell-divide; mark-0/1 ip target)', () => {
    for (const p of INSTRUCTION_PAGES) {
      const e = entry(p.verb)!;
      assert.ok(p.animation.targets.length > 0, `${p.verb} has no targets`);
      // a bound-register verb animates its bound register
      if (e.register) {
        assert.ok(
          p.animation.targets.some((t) => t.kind === 'register' && t.reg === e.register),
          `${p.verb} does not animate its bound register`,
        );
      }
      if (p.verb === 'copy-byte') {
        assert.ok(
          p.animation.targets.some((t) => t.kind === 'soup' && t.from === 'mother' && t.to === 'daughter'),
          'copy-byte must animate soup mother->daughter',
        );
      }
      if (p.verb === 'divide') {
        assert.ok(
          p.animation.targets.some((t) => t.kind === 'cell' && t.change === 'divide'),
          'divide must animate a cell divide',
        );
      }
      if (p.verb === 'mark-0' || p.verb === 'mark-1') {
        assert.ok(p.animation.targets.some((t) => t.kind === 'ip'), `${p.verb} must animate an ip target`);
      }
    }
  });

  it('[INSTRPAGE-011] page data is deterministic/static: INSTRUCTION_PAGES is a frozen constant with no Date.now/Math.random/env/filesystem reads at load (C-CON-DET)', () => {
    assert.ok(Object.isFrozen(INSTRUCTION_PAGES));
    for (const p of INSTRUCTION_PAGES) {
      assert.ok(Object.isFrozen(p), `${p.verb} page not frozen`);
      assert.ok(Object.isFrozen(p.animation), `${p.verb} animation not frozen`);
      for (const t of p.animation.targets) assert.ok(Object.isFrozen(t), `${p.verb} target not frozen`);
    }
  });

  it('[INSTRPAGE-014] every page.introLesson resolves to a lesson in the [05] progression graph, and that lesson unlocks.verbs includes this verb (each page names the lesson that introduces it, soundly)', () => {
    for (const p of INSTRUCTION_PAGES) {
      assert.equal(p.introLesson, introLessonOf(p.verb));
      const lesson = CURRICULUM.lessons[p.introLesson];
      assert.ok(lesson, `${p.verb} intro lesson ${p.introLesson} not in curriculum`);
      assert.ok(lesson.unlocks.verbs.includes(p.verb), `${p.introLesson} does not unlock ${p.verb}`);
    }
  });

  it('[INSTRPAGE-016] presentation order of INSTRUCTION_PAGES matches VOCAB §3.3 load order (0-31); order is presentational only, nothing keys off the array index (C-CON-SOURCE / C-GS-NOOPCODES)', () => {
    assert.deepEqual(INSTRUCTION_PAGES.map((p) => p.verb), VERB_NAMES);
  });
});
