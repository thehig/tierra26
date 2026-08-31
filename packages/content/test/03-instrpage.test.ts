// Per-Instruction Pages (INSTRPAGE) — acceptance tests.
// Ref: docs/spec/content/03-per-instruction-pages.md §8 (INSTRPAGE-NNN).
// One InstructionPage data record per classic-32 verb — the single source of instruction
// DEPTH feeding three surfaces: the wiki page, the keyword tooltip [04], and the playground
// "try this" scenarios [02]. Identity (mnemonic/kid/machine) is a PROJECTION of the VOCAB
// entry, whose mnemonic the engine ISA resolves at compile time (C-GS-NOOPCODES). Instruction
// facts live ONLY in VOCAB [04] + this record; prose references, never redefines (C-CON-SOURCE).
// Every scenario is a valid PlaygroundConfig whose genome compiles under its subset and loads in
// the engine (C-CON-COMPILES) and is deterministic (C-CON-DET).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTION_PAGES, pageOf } from '../src/instrpage.ts';
import { introLessonOf, CURRICULUM } from '../src/progress.ts';
import {
  allVerbs,
  entry,
  entryOfMnemonic,
  opcodeOf,
  verbInSet,
  verbToMnemonic,
} from '../../genescript/src/vocab.ts';
import { compile } from '../../genescript/src/comp.ts';
import { hasErrors } from '../../genescript/src/types.ts';
import { classic32, buildSubset, Engine } from '../../engine/src/index.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';
import type { ActiveSubset, PlaygroundConfig, EditableScenario } from '../src/types.ts';

// ---- shared fixtures --------------------------------------------------------
const VERBS = allVerbs();
const VERB_NAMES = VERBS.map((v) => v.verb);
const MNEMONICS = VERBS.map((v) => v.mnemonic);

// The expected exact key set of an InstructionPage — the three identity projections plus the
// depth fields it OWNS. No extra "definition" field is allowed (C-CON-SOURCE, INSTRPAGE-005).
const PAGE_KEYS = [
  'animation',
  'commonMistakes',
  'introLesson',
  'kid',
  'machine',
  'mnemonic',
  'scenarios',
  'seeAlso',
  'verb',
].sort();

function setOf(subset: ActiveSubset): InstructionSet {
  if (subset.kind === 'classic32') return classic32;
  return buildSubset(subset.name ?? 'subset', subset.verbs.map((v) => verbToMnemonic(v) ?? v));
}

function engineFor(config: PlaygroundConfig): Engine {
  const spec =
    config.subset.kind === 'classic32'
      ? ('classic32' as const)
      : { base: 'classic32' as const, include: config.subset.verbs.map((v) => verbToMnemonic(v) ?? v) };
  return new Engine({ instructionSet: spec, seed: config.seed });
}

function starterSource(config: PlaygroundConfig): string {
  assert.equal(config.starter.kind, 'genescript');
  return (config.starter as { kind: 'genescript'; source: string }).source;
}

// Every scenario across every page, tagged with its owning verb (for exercising checks).
const ALL_SCENARIOS: { verb: string; scenario: EditableScenario }[] = INSTRUCTION_PAGES.flatMap((p) =>
  p.scenarios.map((s) => ({ verb: p.verb, scenario: s })),
);

// commonMistakes must stay plain (C-CON-KID, INSTRPAGE-015): no engine mnemonic, no register-letter
// jargon, never the word "opcode".
const MNEMONIC_WORD = new RegExp(
  `\\b(${MNEMONICS.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);
const REGISTER_LETTER = /\b[A-D]\b/; // a bare register letter (case-sensitive)
const REGISTER_WORD = /\b(register|reg)\b/i;
const OPCODE_WORD = /\bopcode\b/i;

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

  it('[INSTRPAGE-006] every page.animation has a non-empty plain-language summary (C-CON-KID) and targets consistent with the machine-truth (bound register increase/decrease/set; copy-byte soup mother->daughter; divide cell-divide; mark-0/1 ip target)', () => {
    for (const p of INSTRUCTION_PAGES) {
      const e = entry(p.verb)!;
      assert.ok(p.animation.summary.trim().length > 0, `${p.verb} empty summary`);
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

  it('[INSTRPAGE-007] every page has >= 1 EditableScenario, each with a non-empty "try: change X" prompt (C-CON-KID) and spotlight equal to the page verb', () => {
    for (const p of INSTRUCTION_PAGES) {
      assert.ok(p.scenarios.length >= 1, `${p.verb} has no scenario`);
      for (const s of p.scenarios) {
        assert.ok(s.prompt.trim().length > 0, `${p.verb} empty prompt`);
        assert.match(s.prompt, /try/i);
        assert.equal(s.spotlight, p.verb);
      }
    }
  });

  it('[INSTRPAGE-008] every EditableScenario.config is a valid PlaygroundConfig [02] (complete scenario + seed + starter genome + active subset [+ optional goal])', () => {
    for (const { scenario } of ALL_SCENARIOS) {
      const c = scenario.config;
      assert.ok(c.scenario, 'missing scenario');
      assert.ok(Number.isInteger(c.seed), 'seed must be an integer');
      assert.equal(c.starter.kind, 'genescript');
      assert.ok(starterSource(c).length > 0, 'starter source empty');
      assert.ok(c.subset && typeof c.subset.kind === 'string', 'missing active subset');
    }
  });

  it('[INSTRPAGE-009] every EditableScenario starter genome compiles under its config.subset (@tierra26/genescript) and loads in @tierra26/engine, and that subset contains this verb mnemonic so the spotlight is runnable (C-CON-COMPILES)', () => {
    for (const { verb, scenario } of ALL_SCENARIOS) {
      const c = scenario.config;
      const set = setOf(c.subset);
      // the spotlighted verb is in the active subset (runnable)
      assert.ok(verbInSet(set, verb), `${verb} not in the scenario subset`);
      // compiles under the subset (no diagnostics errors)
      const result = compile(starterSource(c), set);
      assert.ok(!hasErrors(result.diagnostics), `${verb} starter does not compile`);
      assert.ok(result.bytes.length > 0, `${verb} starter produced no bytes`);
      // loads in the engine
      const engine = engineFor(c);
      const id = engine.inject(result.bytes, { founderId: 1 });
      assert.ok(id >= 0, `${verb} starter did not load`);
    }
  });

  it('[INSTRPAGE-010] every EditableScenario genuinely exercises the page verb: its starter genome contains this verb (or, for mark-0/1, a label compiling to it) — no scenario spotlights an instruction it never runs', () => {
    for (const { verb, scenario } of ALL_SCENARIOS) {
      const c = scenario.config;
      const set = setOf(c.subset);
      const result = compile(starterSource(c), set);
      const op = opcodeOf(set, entry(verb)!.mnemonic);
      assert.ok(op >= 0);
      // the compiled genome actually emits this verb's opcode (it truly runs it)
      assert.ok([...result.bytes].includes(op), `${verb} genome never emits ${verb}`);
    }
  });

  it('[INSTRPAGE-011] page data is deterministic/static: INSTRUCTION_PAGES is a frozen constant with no Date.now/Math.random/env/filesystem reads at load, and each config is a complete reproducible recipe (C-CON-DET)', () => {
    assert.ok(Object.isFrozen(INSTRUCTION_PAGES));
    for (const p of INSTRUCTION_PAGES) {
      assert.ok(Object.isFrozen(p), `${p.verb} page not frozen`);
      for (const s of p.scenarios) {
        assert.ok(Object.isFrozen(s.config), `${p.verb} config not frozen`);
        // a complete recipe: scenario + seed + starter + subset
        assert.ok(s.config.scenario);
        assert.ok(Number.isInteger(s.config.seed));
        assert.equal(s.config.starter.kind, 'genescript');
        assert.ok(s.config.subset);
      }
    }
  });

  it('[INSTRPAGE-012] every scenario config is deterministic per seed: re-running the same config yields the identical engine run (reproduces as a RunDescriptor)', () => {
    for (const { scenario } of ALL_SCENARIOS) {
      const c = scenario.config;
      const set = setOf(c.subset);
      const bytes = compile(starterSource(c), set).bytes;
      const run = (): string => {
        const e = engineFor(c);
        e.inject(bytes, { founderId: 1 });
        e.run(500);
        return JSON.stringify(e.stats());
      };
      assert.equal(run(), run());
    }
  });

  it('[INSTRPAGE-013] every page.seeAlso list contains only verbs that resolve to a page in this table (related-verb links resolve; no dangling see-also)', () => {
    for (const p of INSTRUCTION_PAGES) {
      for (const v of p.seeAlso) {
        assert.ok(pageOf(v), `${p.verb} see-also '${v}' does not resolve to a page`);
        assert.notEqual(v, p.verb, `${p.verb} lists itself in see-also`);
      }
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

  it('[INSTRPAGE-015] every page.commonMistakes entry is non-empty plain language (C-CON-KID: no mnemonic string, no register-letter jargon, no word "opcode")', () => {
    for (const p of INSTRUCTION_PAGES) {
      assert.ok(p.commonMistakes.length > 0, `${p.verb} has no common mistakes`);
      for (const m of p.commonMistakes) {
        assert.ok(m.trim().length > 0, `${p.verb} empty mistake`);
        assert.doesNotMatch(m, MNEMONIC_WORD, `${p.verb} mistake leaks a mnemonic: ${m}`);
        assert.doesNotMatch(m, REGISTER_LETTER, `${p.verb} mistake uses a register letter: ${m}`);
        assert.doesNotMatch(m, REGISTER_WORD, `${p.verb} mistake uses register jargon: ${m}`);
        assert.doesNotMatch(m, OPCODE_WORD, `${p.verb} mistake says "opcode": ${m}`);
      }
    }
  });

  it('[INSTRPAGE-016] presentation order of INSTRUCTION_PAGES matches VOCAB §3.3 load order (0-31); order is presentational only, nothing keys off the array index (C-CON-SOURCE / C-GS-NOOPCODES)', () => {
    assert.deepEqual(INSTRUCTION_PAGES.map((p) => p.verb), VERB_NAMES);
  });
});
