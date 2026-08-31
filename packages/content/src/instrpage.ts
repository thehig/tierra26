// ============================================================================
// [03] INSTRPAGE — one data record per classic-32 verb (instruction DEPTH).
// Ref: docs/spec/content/03-per-instruction-pages.md (§8 INSTRPAGE-001..016).
//
// This module owns THE per-instruction pages: the single source of instruction
// depth feeding the wiki page [03], the keyword tooltip [04], and the playground
// "try this" scenarios [02]. Identity (mnemonic/kid/machine) is a PROJECTION of
// the VOCAB entry (single source, C-CON-SOURCE / C-GS-NOOPCODES) — never a copy,
// never a hard-coded mnemonic or opcode. Every scenario is a complete, frozen,
// reproducible PlaygroundConfig whose starter genome compiles under its subset,
// loads in the engine, and genuinely exercises the spotlighted verb.
//
// Pure data + logic; NO Date.now / Math.random / env / filesystem at load
// (C-CON-DET, INSTRPAGE-011). --experimental-strip-types: no parameter
// properties, enums, decorators, or namespaces; `import type` for types.
// ============================================================================
import { allVerbs, entry, opcodeOf } from '../../genescript/src/vocab.ts';
import { compile } from '../../genescript/src/comp.ts';
import { classic32 } from '../../engine/src/index.ts';
import { introLessonOf } from './progress.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';
import type {
  InstructionPage,
  AnimationSpec,
  EditableScenario,
  PlaygroundConfig,
  ActiveSubset,
} from './types.ts';

// ----------------------------------------------------------------------------
// Starter genomes. Every scenario is based on the GeneScript ancestor — a
// known-good self-replicator that compiles under classic-32 and loads in the
// engine (GSINV-ANCESTOR). The ancestor already emits the opcodes of 27 of the
// 32 verbs; for the 5 it does not (computed at load, never hard-coded) we append
// one harmless line that emits this verb, so the compiled genome truly runs it.
// ----------------------------------------------------------------------------
const CLASSIC32: ActiveSubset = { kind: 'classic32' };

// Opcodes the bare ancestor emits under classic-32 (derived, single-source).
const ANCESTOR_OPCODES: ReadonlySet<number> = new Set(compile(ANCESTOR_GS, classic32).bytes);

/** GeneScript for a scenario that is guaranteed to exercise `verb`. */
function starterFor(verb: string): string {
  const e = entry(verb);
  if (e === undefined) throw new Error(`instrpage: unknown verb '${verb}'`);
  if (ANCESTOR_OPCODES.has(opcodeOf(classic32, e.mnemonic))) return ANCESTOR_GS;
  // Target-taking control verbs are appended in `raw` form (a single opcode byte,
  // no template needed); plain verbs are appended by their friendly name.
  const line = e.takesTarget ? `raw ${e.mnemonic}` : e.verb;
  return `${ANCESTOR_GS}${line}\n`;
}

/** A complete, reproducible recipe: scenario + seed + starter + subset. */
function scenarioConfig(verb: string, seed: number): PlaygroundConfig {
  return {
    scenario: 'default',
    seed,
    starter: { kind: 'genescript', source: starterFor(verb) },
    subset: CLASSIC32,
  };
}

// ----------------------------------------------------------------------------
// Authored depth per verb (keyed by the GeneScript verb name). Identity fields
// are NOT here — they project from VOCAB. This table holds only the things
// INSTRPAGE owns: the animation, the "try this" prompt, related verbs, and the
// plain-language pitfalls (C-CON-KID: no engine mnemonics, no register letters,
// never the word "opcode").
// ----------------------------------------------------------------------------
interface Authored {
  summary: string;
  targets: AnimationSpec['targets'];
  prompt: string;
  seeAlso: readonly string[];
  mistakes: readonly string[];
}

const AUTHORED: Record<string, Authored> = {
  'mark-0': {
    summary: 'A signpost in your code that jumps and searches use to find their place.',
    targets: [{ kind: 'ip', change: 'jump' }],
    prompt: 'Try: move this signpost to a different spot and watch where the jumps land.',
    seeAlso: ['mark-1', 'jump', 'find'],
    mistakes: [
      'Two signposts with the same pattern can be mixed up, so the jump lands on the wrong one.',
      'Signposts do nothing by themselves — something has to jump or search to one.',
    ],
  },
  'mark-1': {
    summary: 'The other kind of signpost, made of the opposite pattern, that jumps aim for.',
    targets: [{ kind: 'ip', change: 'jump' }],
    prompt: 'Try: change one signpost bit and see the matching jump miss its target.',
    seeAlso: ['mark-0', 'jump', 'find'],
    mistakes: [
      'Jumps look for the mirror image of your signpost, so flipping one bit changes where it goes.',
      'Signposts placed right next to each other can blur into one longer pattern.',
    ],
  },
  'flip-bit': {
    summary: 'Flips the smallest bit of the counting box, turning an even number odd and back.',
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
    prompt: 'Try: flip the bit twice in a row and notice the number ends up unchanged.',
    seeAlso: ['double', 'clear'],
    mistakes: [
      'Flipping the lowest bit only changes even to odd, not the whole number.',
      'Doing it twice puts the number right back where it started.',
    ],
  },
  double: {
    summary: 'Doubles the number in the counting box by sliding all its bits up one place.',
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
    prompt: 'Try: double the same number three times and watch it grow eight times bigger.',
    seeAlso: ['flip-bit', 'clear'],
    mistakes: [
      'Doubling grows a number fast, so it can get bigger than you expect.',
      'Doubling nothing still leaves nothing — you have to start with a number first.',
    ],
  },
  clear: {
    summary: 'Empties the counting box back to nothing so you can start counting fresh.',
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
    prompt: 'Try: clear the box in the middle of a count and see the total reset.',
    seeAlso: ['double', 'flip-bit', 'if-zero'],
    mistakes: [
      'Emptying the box throws away whatever number was in it, so save it first if you need it.',
      'Starting a count without emptying the box first can leave a leftover number in the way.',
    ],
  },
  'if-zero': {
    summary: 'Only runs the very next line when the counting box is empty; otherwise skips it.',
    targets: [
      { kind: 'ip', change: 'skip' },
      { kind: 'register', reg: 'C', change: 'read' },
    ],
    prompt: 'Try: change the number in the box and see whether the next line runs or is skipped.',
    seeAlso: ['jump', 'jump-back', 'clear'],
    mistakes: [
      'It only guards the single line right after it, not a whole group of lines.',
      'If the box is not empty, the next line is skipped completely and never runs.',
    ],
  },
  subtract: {
    summary: 'Takes one box away from another and puts the difference in the counting box.',
    targets: [{ kind: 'register', reg: 'C', change: 'set' }],
    prompt: 'Try: swap which two boxes are subtracted and watch the size it measures change.',
    seeAlso: ['subtract-into-a', 'find'],
    mistakes: [
      'The answer lands in the counting box, overwriting whatever was there before.',
      'Taking a bigger number from a smaller one wraps around instead of going below nothing.',
    ],
  },
  'subtract-into-a': {
    summary: 'Takes the counting box away from the first box and keeps the answer there.',
    targets: [{ kind: 'register', reg: 'A', change: 'set' }],
    prompt: 'Try: change the amount taken away and watch the first box shrink by a different step.',
    seeAlso: ['subtract', 'find'],
    mistakes: [
      'The first box is changed, so its old number is gone afterwards.',
      'Take away too much and the number wraps around to a huge value.',
    ],
  },
  'grow-a': {
    summary: 'Adds one to the first box, the counter that usually points at an address.',
    targets: [{ kind: 'register', reg: 'A', change: 'increase' }],
    prompt: 'Try: add one more step and see the address the box points at move along.',
    seeAlso: ['grow-b', 'grow-c', 'shrink-c'],
    mistakes: [
      'Adding one moves an address forward by a single spot, not a whole line.',
      'Forgetting to step it forward makes a copy loop keep working on the same spot.',
    ],
  },
  'grow-b': {
    summary: 'Adds one to the second box, the helper counter used alongside the first.',
    targets: [{ kind: 'register', reg: 'B', change: 'increase' }],
    prompt: 'Try: add one to this box each time and watch it track a second position.',
    seeAlso: ['grow-a', 'grow-c'],
    mistakes: [
      'This box counts separately, so growing it does not touch the other boxes.',
      'Forgetting to step it forward leaves it stuck pointing at the same place.',
    ],
  },
  'shrink-c': {
    summary: 'Takes one away from the counting box, the usual way to count a loop down.',
    targets: [{ kind: 'register', reg: 'C', change: 'decrease' }],
    prompt: 'Try: change the starting count and watch the loop run a different number of times.',
    seeAlso: ['grow-c', 'if-zero', 'grow-a'],
    mistakes: [
      'Counting down past nothing wraps around to a huge number and the loop runs far too long.',
      'Forgetting to count down at all makes the loop never stop.',
    ],
  },
  'grow-c': {
    summary: 'Adds one to the counting box, the counter loops and sizes lean on most.',
    targets: [{ kind: 'register', reg: 'C', change: 'increase' }],
    prompt: 'Try: add one more to the count and watch the loop do one extra round.',
    seeAlso: ['shrink-c', 'grow-a', 'grow-b'],
    mistakes: [
      'Growing the counter when you meant to shrink it sends a loop the wrong way.',
      'The count grows one at a time, so it takes many steps to reach a big number.',
    ],
  },
  'save-a': {
    summary: 'Puts a copy of the first box onto the save pile so you can get it back later.',
    targets: [
      { kind: 'register', reg: 'A', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
    prompt: 'Try: save the box before a routine and bring it back afterwards to keep its number safe.',
    seeAlso: ['load-a', 'save-b'],
    mistakes: [
      'Saving copies the number onto the pile without emptying the box itself.',
      'Everything you save must be brought back in the opposite order, or the pile gets muddled.',
    ],
  },
  'save-b': {
    summary: 'Puts a copy of the second box onto the save pile to protect its number.',
    targets: [
      { kind: 'register', reg: 'B', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
    prompt: 'Try: save this box before it gets changed, then bring it back to compare.',
    seeAlso: ['load-b', 'save-a'],
    mistakes: [
      'The save pile gives things back last-in first-out, so plan the order you bring them back.',
      'Saving without ever bringing it back slowly fills the pile with leftovers.',
    ],
  },
  'save-c': {
    summary: 'Puts a copy of the counting box onto the save pile before something changes it.',
    targets: [
      { kind: 'register', reg: 'C', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
    prompt: 'Try: save the count, do some other work, then bring the count back to finish the loop.',
    seeAlso: ['load-c', 'save-d'],
    mistakes: [
      'Saving keeps the number safe on the pile but leaves the box free to be overwritten.',
      'Bring saved things back in reverse order or you will get the wrong one.',
    ],
  },
  'save-d': {
    summary: 'Puts a copy of the fourth box onto the save pile for safe keeping.',
    targets: [
      { kind: 'register', reg: 'D', change: 'read' },
      { kind: 'stack', change: 'push' },
    ],
    prompt: 'Try: save this spare box and bring it back later to see its number survive.',
    seeAlso: ['load-d', 'save-c'],
    mistakes: [
      'Each thing you put on the pile has to come back off, in the opposite order.',
      'Saving the wrong box means the number you wanted is still not protected.',
    ],
  },
  'load-a': {
    summary: 'Takes the top thing off the save pile and drops it into the first box.',
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
    prompt: 'Try: bring the saved number back and watch the first box return to its old value.',
    seeAlso: ['save-a', 'load-b'],
    mistakes: [
      'Bringing a number back removes it from the pile, so you cannot grab it twice.',
      'Bringing back from an empty pile gives you a leftover, not the number you wanted.',
    ],
  },
  'load-b': {
    summary: 'Takes the top thing off the save pile and drops it into the second box.',
    targets: [
      { kind: 'register', reg: 'B', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
    prompt: 'Try: bring back a saved number into this box and use it after the routine.',
    seeAlso: ['save-b', 'load-a'],
    mistakes: [
      'The pile gives back the last thing saved first, so the order matters a lot.',
      'Bringing back more than you saved reaches into an empty pile.',
    ],
  },
  'load-c': {
    summary: 'Takes the top thing off the save pile and drops it into the counting box.',
    targets: [
      { kind: 'register', reg: 'C', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
    prompt: 'Try: bring back a saved count and let the loop pick up where it left off.',
    seeAlso: ['save-c', 'load-d'],
    mistakes: [
      'This overwrites the counting box with whatever was on top of the pile.',
      'Bring things back in the opposite order you saved them, or the counts get swapped.',
    ],
  },
  'load-d': {
    summary: 'Takes the top thing off the save pile and drops it into the fourth box.',
    targets: [
      { kind: 'register', reg: 'D', change: 'set' },
      { kind: 'stack', change: 'pop' },
    ],
    prompt: 'Try: save the spare box and bring it back here to see its number return.',
    seeAlso: ['save-d', 'load-c'],
    mistakes: [
      'Bringing a number back takes it off the pile for good.',
      'If nothing was saved, you get a leftover instead of the number you hoped for.',
    ],
  },
  jump: {
    summary: 'Sends the reader to the nearest signpost that matches, to skip ahead or loop.',
    targets: [{ kind: 'ip', change: 'jump' }],
    prompt: 'Try: point the jump at a different signpost and watch the path through the code change.',
    seeAlso: ['jump-back', 'mark-0', 'mark-1'],
    mistakes: [
      'Jumps hunt for the mirror image of a signpost, so the patterns must match up.',
      'With no matching signpost, the reader keeps searching instead of jumping where you meant.',
    ],
  },
  'jump-back': {
    summary: 'Jumps to a signpost behind the reader, the usual way to loop back and repeat.',
    targets: [{ kind: 'ip', change: 'jump' }],
    prompt: 'Try: change the guard before this jump and watch how many times the loop repeats.',
    seeAlso: ['jump', 'if-zero', 'mark-1'],
    mistakes: [
      'Looping back with no way to stop makes the same lines run over and over forever.',
      'If the signpost is ahead instead of behind, the backward jump cannot find it.',
    ],
  },
  call: {
    summary: 'Runs a helper routine and remembers where to come back to when it finishes.',
    targets: [
      { kind: 'ip', change: 'call' },
      { kind: 'stack', change: 'push' },
    ],
    prompt: 'Try: send the reader into the copy routine and watch it return right after.',
    seeAlso: ['return', 'jump'],
    mistakes: [
      'Every trip into a routine needs a matching way back, or the return goes nowhere.',
      'The spot to come back to is remembered on the pile, so do not disturb it inside.',
    ],
  },
  return: {
    summary: 'Goes back to wherever the routine was started from and carries on there.',
    targets: [
      { kind: 'ip', change: 'return' },
      { kind: 'stack', change: 'pop' },
    ],
    prompt: 'Try: remove the way back and watch the routine lose track of where it started.',
    seeAlso: ['call', 'load-a'],
    mistakes: [
      'Coming back only works if a routine was started properly first.',
      'Disturbing the save pile inside a routine can send the way back to the wrong place.',
    ],
  },
  'copy-c-to-d': {
    summary: 'Copies the counting box into the fourth box so both hold the same number.',
    targets: [{ kind: 'register', reg: 'D', change: 'set' }],
    prompt: 'Try: copy a number across and change the first box to see the copy stay put.',
    seeAlso: ['copy-a-to-b'],
    mistakes: [
      'The copy overwrites the fourth box, so its old number is lost.',
      'Copying makes two separate numbers — changing one does not change the other.',
    ],
  },
  'copy-a-to-b': {
    summary: 'Copies the first box into the second box so both start with the same number.',
    targets: [{ kind: 'register', reg: 'B', change: 'set' }],
    prompt: 'Try: copy the start address across and use one box to walk while the other stays.',
    seeAlso: ['copy-c-to-d'],
    mistakes: [
      'The second box is overwritten, so protect its old number first if you still need it.',
      'The two boxes are separate after copying — moving one leaves the other behind.',
    ],
  },
  'copy-byte': {
    summary: 'Copies one piece of the mother into the baby, the heart of making a copy.',
    targets: [{ kind: 'soup', from: 'mother', to: 'daughter' }],
    prompt: 'Try: copy just one piece, then loop so the whole baby gets built.',
    seeAlso: ['make-space', 'divide', 'jump-back'],
    mistakes: [
      'This copies a single piece, so you need a loop to build the whole baby.',
      'You can only write into space you have asked for first, or the copy goes nowhere.',
    ],
  },
  find: {
    summary: 'Searches both directions for a signpost and reports where it is and how big.',
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'register', reg: 'C', change: 'set' },
    ],
    prompt: 'Try: search for your own signposts and watch the boxes fill with your start and size.',
    seeAlso: ['find-back', 'find-forward', 'subtract'],
    mistakes: [
      'Skipping the search leaves a creature with no idea where it starts or how big it is.',
      'Searching for a signpost that does not exist gives back nothing useful.',
    ],
  },
  'find-back': {
    summary: 'Searches behind the reader for a signpost and reports where it sits.',
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'register', reg: 'C', change: 'set' },
    ],
    prompt: 'Try: search backward for the start signpost and read off the address it finds.',
    seeAlso: ['find', 'find-forward'],
    mistakes: [
      'Searching the wrong way misses a signpost that is actually ahead.',
      'With no matching signpost behind, the search comes back empty.',
    ],
  },
  'find-forward': {
    summary: 'Searches ahead of the reader for a signpost and reports where it sits.',
    targets: [
      { kind: 'register', reg: 'A', change: 'set' },
      { kind: 'register', reg: 'C', change: 'set' },
    ],
    prompt: 'Try: search forward for the end signpost to work out how big the creature is.',
    seeAlso: ['find', 'find-back'],
    mistakes: [
      'Looking ahead misses a signpost that is really behind the reader.',
      'Measuring from the wrong signpost gives a size that is too big or too small.',
    ],
  },
  'make-space': {
    summary: 'Asks the world for empty room to build a baby and points the first box at it.',
    targets: [
      { kind: 'cell', change: 'allocate' },
      { kind: 'register', reg: 'A', change: 'set' },
    ],
    prompt: 'Try: ask for a bigger or smaller room and see whether the baby still fits.',
    seeAlso: ['copy-byte', 'divide'],
    mistakes: [
      'Ask for the wrong amount of room and the baby will not fit the copy you make.',
      'You cannot write a baby anywhere until you have asked for its room first.',
    ],
  },
  divide: {
    summary: 'Splits the finished baby off from the mother to become its own new creature.',
    targets: [{ kind: 'cell', change: 'divide' }],
    prompt: 'Try: split the baby off before the copy is done and watch it come out broken.',
    seeAlso: ['make-space', 'copy-byte'],
    mistakes: [
      'Splitting off a baby before it is fully copied gives you a broken creature.',
      'Nothing new is born until you split the baby off at the very end.',
    ],
  },
};

// ----------------------------------------------------------------------------
// Build the pages: identity PROJECTS VOCAB, depth comes from AUTHORED, the
// intro lesson comes from PROGRESS, and the scenario is a compiled-and-loaded
// recipe. Presentation order == VOCAB §3.3 load order (allVerbs()), which is the
// ONLY thing keyed off the array index (INSTRPAGE-016).
// ----------------------------------------------------------------------------
function buildPage(verb: string, index: number): InstructionPage {
  const e = entry(verb);
  if (e === undefined) throw new Error(`instrpage: unknown verb '${verb}'`);
  const a = AUTHORED[verb];
  if (a === undefined) throw new Error(`instrpage: no authored depth for verb '${verb}'`);

  const animation: AnimationSpec = Object.freeze({
    summary: a.summary,
    targets: Object.freeze(a.targets.map((t) => Object.freeze({ ...t }))) as AnimationSpec['targets'],
  });

  const scenario: EditableScenario = Object.freeze({
    id: `${verb}-try`,
    prompt: a.prompt,
    // A stable per-verb seed keeps every run reproducible (C-CON-DET).
    config: Object.freeze(scenarioConfig(verb, 1000 + index)),
    spotlight: verb,
  });

  const intro = introLessonOf(verb);
  if (intro === undefined) throw new Error(`instrpage: no intro lesson for verb '${verb}'`);

  return Object.freeze({
    verb,
    // identity — PROJECTED from VOCAB, never redefined (C-CON-SOURCE)
    mnemonic: e.mnemonic,
    kid: e.kid,
    machine: e.machine,
    // depth — OWNED here
    animation,
    scenarios: Object.freeze([scenario]) as readonly EditableScenario[],
    seeAlso: Object.freeze([...a.seeAlso]) as readonly string[],
    commonMistakes: Object.freeze([...a.mistakes]) as readonly string[],
    introLesson: intro,
  });
}

/** Exactly one page per classic-32 verb, in VOCAB §3.3 load order (a bijection). */
export const INSTRUCTION_PAGES: readonly InstructionPage[] = Object.freeze(
  allVerbs().map((v, i) => buildPage(v.verb, i)),
);

const PAGE_BY_VERB: ReadonlyMap<string, InstructionPage> = new Map(
  INSTRUCTION_PAGES.map((p) => [p.verb, p]),
);

/** The page for a verb, or undefined if the verb has no page (not a classic-32 verb). */
export function pageOf(verb: string): InstructionPage | undefined {
  return PAGE_BY_VERB.get(verb);
}
