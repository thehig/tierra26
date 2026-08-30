// Per-Instruction Pages (INSTRPAGE) — pending acceptance tests.
// Ref: docs/spec/content/03-per-instruction-pages.md §8 (INSTRPAGE-NNN).
// One InstructionPage data record per classic-32 verb — the single source of instruction
// DEPTH feeding three surfaces: the wiki page, the keyword tooltip [04], and the playground
// "try this" scenarios [02]. Identity (mnemonic/kid/machine) is a PROJECTION of the VOCAB
// entry (docs/spec/genescript/02-vocabulary-and-keywords.md), whose mnemonic the engine ISA
// resolves at compile time (C-GS-NOOPCODES) — pages never hard-code a mnemonic or opcode.
// Instruction facts live ONLY in VOCAB [04] + this record; prose/tooltips reference, never
// redefine (C-CON-SOURCE). Every scenario is a valid PlaygroundConfig whose genome compiles
// under its subset and loads in the engine (C-CON-COMPILES) and is deterministic (C-CON-DET).
//
// Pending until the content data model + validators exist; encoded as node:test todo tests
// (spec-as-checklist). NO src imports yet (the modules don't exist — an import error would
// fail the file). When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Per-Instruction Pages (INSTRPAGE)', () => {
  it.todo('[INSTRPAGE-001] INSTRUCTION_PAGES has exactly one page per classic-32 verb — a bijection page<->VOCAB verb (32 pages, no orphan verb, no page for an unknown verb) (CONTINV-COVERAGE)');
  it.todo('[INSTRPAGE-002] every page.verb is a real verb present in VOCABULARY, and every VOCAB verb has a page (coverage exact in both directions)');
  it.todo('[INSTRPAGE-003] every page.mnemonic equals vocab(verb).mnemonic and is a real classic-32 mnemonic resolved via the engine ISA — never hard-coded, never an opcode number');
  it.todo('[INSTRPAGE-004] every page.kid and page.machine are byte-equal to the VOCAB entry tooltip.kid / tooltip.machine (kid def + machine truth present and consistent with VOCAB — C-CON-SOURCE)');
  it.todo('[INSTRPAGE-005] no page redefines a fact owned by VOCAB: a page adds no definition field beyond the three VOCAB projections, so prose/tooltips reference and never fork a definition (C-CON-SOURCE)');
  it.todo('[INSTRPAGE-006] every page.animation has a non-empty plain-language summary (C-CON-KID) and targets consistent with the machine-truth (bound register increase/decrease/set; copy-byte soup mother->daughter; divide cell-divide; mark-0/1 ip target)');
  it.todo('[INSTRPAGE-007] every page has >= 1 EditableScenario, each with a non-empty "try: change X" prompt (C-CON-KID) and spotlight equal to the page verb');
  it.todo('[INSTRPAGE-008] every EditableScenario.config is a valid PlaygroundConfig [02] (complete scenario + seed + starter genome + active subset [+ optional goal])');
  it.todo('[INSTRPAGE-009] every EditableScenario starter genome compiles under its config.subset (@tierra26/genescript) and loads in @tierra26/engine, and that subset contains this verb mnemonic so the spotlight is runnable (C-CON-COMPILES)');
  it.todo('[INSTRPAGE-010] every EditableScenario genuinely exercises the page verb: its starter genome contains this verb (or, for mark-0/1, a label compiling to it) — no scenario spotlights an instruction it never runs');
  it.todo('[INSTRPAGE-011] page data is deterministic/static: INSTRUCTION_PAGES is a frozen constant with no Date.now/Math.random/env/filesystem reads at load, and each config is a complete reproducible recipe (C-CON-DET)');
  it.todo('[INSTRPAGE-012] every scenario config is deterministic per seed: re-running the same config yields the identical engine run (reproduces as a RunDescriptor)');
  it.todo('[INSTRPAGE-013] every page.seeAlso list contains only verbs that resolve to a page in this table (related-verb links resolve; no dangling see-also)');
  it.todo('[INSTRPAGE-014] every page.introLesson resolves to a lesson in the [05] progression graph, and that lesson unlocks.verbs includes this verb (each page names the lesson that introduces it, soundly)');
  it.todo('[INSTRPAGE-015] every page.commonMistakes entry is non-empty plain language (C-CON-KID: no mnemonic string, no register-letter jargon, no word "opcode")');
  it.todo('[INSTRPAGE-016] presentation order of INSTRUCTION_PAGES matches VOCAB §3.3 load order (0-31); order is presentational only, nothing keys off the array index (C-CON-SOURCE / C-GS-NOOPCODES)');
});
