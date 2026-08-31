// The brick-by-brick curriculum: a data-driven registry of scroll-driven chapters. Each Phase-A/B
// chapter teaches ONE small idea (a command or two, one new entity attribute) with a short scrolly
// explainer over a steppable demo creature, then a "your turn" micro-challenge checked live.
// Phase-C chapters (population → evolution → versus) swap the step-through stage for the live tank.
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import type { Focus } from '../anatomy/EntityDiagram.tsx';
import type { EntityState } from '../anatomy/useMicroEngine.ts';

export type MicroGoal =
  | { kind: 'regAtLeast'; reg: 'A' | 'B' | 'C' | 'D'; value: number; label: string }
  | { kind: 'regEquals'; reg: 'A' | 'B' | 'C' | 'D'; value: number; label: string }
  | { kind: 'sizeEquals'; value: number; label: string }
  | { kind: 'daughter'; label: string }
  | { kind: 'daughterFill'; pct: number; label: string }
  | { kind: 'born'; label: string };

// The slice of engine state a goal reads — the full EntityState satisfies it, and tests can pass a
// minimal object without building the whole thing.
export interface EntityStateLike {
  regs: { A: number; B: number; C: number; D: number };
  size: number; // how many cells the body fills (== block count while every verb is 1 byte)
  hasDaughter: boolean;
  daughterFillPct: number;
  population: number;
  halted: boolean; // the program has run its last block (straight-line finished)
}

// Latch-friendly: true the moment the goal is met.
// `regEquals` is an *end result* — it only counts once the program has halted, so a value the
// creature merely passes through mid-run (e.g. C climbing past 1) can't solve the challenge for
// the learner. The threshold/growth goals ("reach", "make a daughter", "be born") are monotonic,
// so latching on first-true is what we want.
export function checkMicroGoal(g: MicroGoal, s: EntityStateLike): boolean {
  switch (g.kind) {
    case 'regAtLeast': return s.regs[g.reg] >= g.value;
    case 'regEquals': return s.halted && s.regs[g.reg] === g.value;
    case 'sizeEquals': return s.size === g.value; // static — true as soon as the body is the right length, no stepping
    case 'daughter': return s.hasDaughter;
    case 'daughterFill': return s.daughterFillPct >= g.pct || s.population > 1; // filled, or already split off
    case 'born': return s.population >= 2;
  }
}

export interface Waypoint { title: string; body: string; focus?: Focus }
export interface Challenge { prompt: string; starter: string; goal: MicroGoal; }

export interface Chapter {
  id: string;
  no: string;
  title: string;
  phase: 'read' | 'change' | 'daughter' | 'life' | 'evolve' | 'versus';
  prevId: string | null;
  lede: string;
  ready: boolean;
  waypoints: Waypoint[];
  demo?: string;         // steppable example the explainer stage shows
  challenge?: Challenge; // "your turn"
  soup?: number;         // world size (cells); small tutorial worlds show every opcode emoji at once
}

// Small enough that a tutorial creature (and its daughter) fits and every cell's emoji is legible;
// the ancestor chapters override this with a bigger world + the hover magnifier.
export const TUTORIAL_SOUP = 36; // 6×6
export const chapterSoup = (c: Chapter | undefined): number => c?.soup ?? TUTORIAL_SOUP;

// ── Phase A · read & change one creature ───────────────────────────────────
const CHAPTERS_DATA: Chapter[] = [
  {
    id: 'meet', no: '0', title: 'Meet a creature', phase: 'read', prevId: null, ready: true,
    lede: "Before you build one, let's get to know one — every part of a living program, then watch it run one tick at a time.",
    demo: 'grow-a\ngrow-b\nflip-bit\ngrow-a\ngrow-c',
    waypoints: [
      { focus: 'whole', title: 'This is a creature.', body: 'Everything alive in the soup is a tiny program, just like this one. Let’s take it apart and see how it works.' },
      { focus: 'genome', title: 'Its genome', body: 'A creature is a *stack of instruction blocks* — its genome. Each block is one small thing it can do. Read them top to bottom.' },
      { focus: 'ip', title: 'The reading head', body: 'The little *▶ reading head* shows which block it’s about to run. Every tick it does that one block, then slides to the next.' },
      { focus: 'registers', title: 'Four notebooks', body: 'A creature keeps numbers in *four notebooks* — A, B, C and D. Watch them change as it runs.' },
      { focus: 'flags', title: 'Flags', body: 'Flags are tiny *yes/no lights* it flips as it works — they help it make decisions later on.' },
      { focus: 'age', title: 'Age & size', body: 'Every creature has an *age* (ticks lived) and a *size* (blocks in its body). The oldest, crowded-out creatures go first.' },
      { focus: 'run', title: 'Watch it run', body: 'Press *Step one tick* over and over. The reading head moves, a notebook changes. That’s a creature *thinking*.' },
    ],
  },
  {
    id: 'count-up', no: '1', title: 'Count up', phase: 'change', prevId: 'meet', ready: true,
    lede: 'The simplest thing a creature can do: add one to a notebook.',
    demo: 'grow-a\ngrow-a\ngrow-a',
    waypoints: [
      { focus: 'genome', title: 'Adding one', body: 'The block `grow-a` adds *one* to notebook A. There’s `grow-b` and `grow-c` too — one per notebook.' },
      { focus: 'registers', title: 'Watch A climb', body: 'Step through this creature. Each `grow-a` bumps A up by one: 0 → 1 → 2 → 3.' },
    ],
    challenge: { prompt: 'Make notebook A reach 3.', starter: 'grow-a\ngrow-a', goal: { kind: 'regAtLeast', reg: 'A', value: 3, label: 'A reaches 3' } },
  },
  {
    id: 'count-down', no: '2', title: 'Count down', phase: 'change', prevId: 'count-up', ready: true,
    lede: 'What goes up can come down.',
    demo: 'grow-c\ngrow-c\ngrow-c\nshrink-c',
    waypoints: [
      { focus: 'genome', title: 'Taking one away', body: '`shrink-c` takes *one* away from notebook C — the opposite of `grow-c`.' },
      { focus: 'registers', title: 'Up, then down', body: 'This creature counts C up to 3, then `shrink-c` brings it back to 2. Step through and watch.' },
    ],
    challenge: { prompt: 'Count C up, then bring it back down to exactly 1.', starter: 'grow-c\ngrow-c\ngrow-c', goal: { kind: 'regEquals', reg: 'C', value: 1, label: 'C returns to 1' } },
  },
  {
    id: 'zero-flip', no: '3', title: 'Zero & flip', phase: 'change', prevId: 'count-down', ready: true,
    lede: 'Two handy tricks for setting a notebook just so.',
    demo: 'flip-bit\nflip-bit\nclear',
    waypoints: [
      { focus: 'genome', title: 'Flip and clear', body: '`flip-bit` flips the smallest bit of C (0 ↔ 1). `clear` wipes C straight back to *zero*.' },
      { focus: 'registers', title: 'Try it', body: 'Step through: flip makes C 1, flip again makes it 0, clear keeps it 0.' },
    ],
    challenge: { prompt: 'Turn notebook C into 1.', starter: 'clear', goal: { kind: 'regEquals', reg: 'C', value: 1, label: 'C is 1' } },
  },
  {
    id: 'doubling', no: '4', title: 'Doubling', phase: 'change', prevId: 'zero-flip', ready: true,
    lede: 'Build up big numbers fast.',
    demo: 'flip-bit\ndouble\ndouble',
    waypoints: [
      { focus: 'genome', title: 'Times two', body: '`double` *doubles* notebook C. Start at 1, and 1 → 2 → 4 → 8 in just a few blocks.' },
      { focus: 'registers', title: 'Powers of two', body: 'Doubling is how a creature makes big numbers (like its own size) without a hundred `grow` blocks.' },
    ],
    challenge: { prompt: 'Make notebook C reach 4.', starter: 'flip-bit\ndouble', goal: { kind: 'regAtLeast', reg: 'C', value: 4, label: 'C reaches 4' } },
  },
  {
    id: 'world', no: '5', title: 'The world', phase: 'change', prevId: 'doubling', ready: true,
    lede: 'Meet the place your creature lives.',
    demo: 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b',
    waypoints: [
      { focus: 'world', title: 'This is the world', body: 'That big grid up top is the *world* — the space every creature lives in. Think of it as a huge sheet of graph paper, one *cell* per square.' },
      { focus: 'world', title: 'Your creature is in there', body: 'See the little patch of *bright* cells? That’s your creature — its *whole body* sits in the world, right there. It doesn’t wander around; it stays put and does its thinking on the spot. Step it and watch: the notebooks change, but the patch stays.' },
      { focus: 'world', title: 'Empty space', body: 'All the *faint* cells are *free space* — empty world with nobody in it yet. That’s the room a creature’s babies will need later.' },
    ],
  },
  {
    id: 'body-is-code', no: '6', title: 'Your body is your code', phase: 'change', prevId: 'world', ready: true,
    lede: 'Where does your code actually live? In the world.',
    demo: 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b',
    waypoints: [
      { focus: 'genome', title: 'Code lives in the world', body: 'Your genome isn’t kept somewhere separate — every *block* of it sits in one *cell* of the world. Your code and your body are the *same thing*.' },
      { focus: 'whole', title: 'Block 0 is cell 0', body: 'The numbers beside your blocks are their spots in the world. *Block 0* is the first bright cell, *block 1* the next, and so on. Hover a block to light up its cell — count the bright cells, then count your blocks. Same number.' },
      { focus: 'genome', title: 'That’s your size', body: 'How many cells your body fills is your *size*. More blocks means a bigger body that takes up more of the world.' },
    ],
    challenge: { prompt: 'Add blocks until your body fills exactly 6 cells. (Any `grow`/`flip-bit`/`double` block is one cell.)', starter: 'grow-a\ngrow-b\ngrow-c\ngrow-a', goal: { kind: 'sizeEquals', value: 6, label: 'your body fills 6 cells' } },
  },
  {
    id: 'landmarks', no: '7', title: 'Landmarks', phase: 'change', prevId: 'body-is-code', ready: true,
    lede: 'Signposts inside your own code.',
    demo: 'grow-a\nhere:\ngrow-b',
    waypoints: [
      { focus: 'genome', title: 'A signpost', body: '`mark-0` and `mark-1` make a *landmark* — a signpost you write like `here:`. It marks a *spot in your list of blocks* (see the numbers down the left side), not a square in the world up above. On its own it does nothing; the reading head walks straight past it.' },
      { focus: 'ip', title: 'Why bother?', body: 'A landmark is a place you can *jump to* or *search for* by name. Next chapter you’ll send the reading head back to one — and make your first loop.' },
    ],
  },
  {
    id: 'loops', no: '8', title: 'Go in circles', phase: 'change', prevId: 'landmarks', ready: true,
    lede: 'Send the reading head back to a signpost, and blocks repeat.',
    demo: 'top:\ngrow-a\njump-back top\nclear',
    waypoints: [
      { focus: 'ip', title: 'The loop', body: '`jump-back top` sends the reading head back up to the `top:` landmark. So `grow-a` runs again and again — a *loop*. (The `clear` at the bottom is a *wall* — it marks where the loop ends. A loop must always have a wall after it.)' },
      { focus: 'world', title: 'One block, two cells', body: 'Look at the world: `jump-back` fills *two cells* side by side, both with its arrow. That’s because it’s a *two-part block* — the *jump* plus the *signpost it aims at* (`top`). Most blocks are one cell; only jumps and searches carry a target, so they take two.' },
      { focus: 'registers', title: 'Watch A climb', body: 'Press *Run* and watch A shoot up. A loop is how a creature does a lot with just a few blocks.' },
    ],
    challenge: { prompt: 'Add a `jump-back top` line just above `clear` to make a loop, and push notebook A to 5.', starter: 'top:\ngrow-a\nclear', goal: { kind: 'regAtLeast', reg: 'A', value: 5, label: 'A reaches 5' } },
  },
  {
    id: 'deciding', no: '9', title: 'Know when to stop', phase: 'change', prevId: 'loops', ready: true,
    lede: 'A loop that never ends is stuck. This is how a creature decides.',
    demo: 'flip-bit\nif-zero\nclear\ngrow-a',
    waypoints: [
      { focus: 'genome', title: 'Only if zero', body: '`if-zero` looks at notebook C. It lets the *next* block run only when C is zero — otherwise it skips it.' },
      { focus: 'registers', title: 'The off-switch', body: 'Step through: C is 1 (not zero), so `if-zero` *skips* the `clear`. This is how a copy loop knows when it’s finished.' },
    ],
  },
  {
    id: 'sums', no: '10', title: 'Doing sums', phase: 'change', prevId: 'deciding', ready: true,
    lede: 'Creatures do arithmetic to work things out — like their own size.',
    demo: 'grow-a\ngrow-a\ngrow-a\ngrow-b\nsubtract',
    waypoints: [
      { focus: 'genome', title: 'Take away', body: '`subtract` does a sum: it puts *A minus B* into notebook C.' },
      { focus: 'registers', title: 'A − B → C', body: 'Here A is 3 and B is 1, so `subtract` makes C = 2. Step through and see.' },
    ],
    challenge: { prompt: 'A is 3 and B is 1. Add `subtract` to put A − B into C (that’s 2).', starter: 'grow-a\ngrow-a\ngrow-a\ngrow-b', goal: { kind: 'regEquals', reg: 'C', value: 2, label: 'C becomes 2' } },
  },
  {
    id: 'find', no: '11', title: 'Finding a signpost', phase: 'change', prevId: 'sums', ready: true,
    lede: 'A creature reads its own code to find a signpost by name.',
    demo: 'spot:\ngrow-a\ngrow-a\nfind-back spot\ngrow-b',
    waypoints: [
      { focus: 'genome', title: 'Search by name', body: '`find-back` looks *backwards* through your own blocks for a signpost. This searches your *code*, not the world — it’s how a creature finds a spot inside itself. Like `jump-back`, it’s a *two-cell block* — the search plus the signpost it hunts for. (`find` looks both ways; `find-forward` looks ahead.)' },
      { focus: 'registers', title: 'Where, and how long', body: 'When it finds the `spot` signpost it fills two notebooks: *A* = the position right after it (here that’s *1* — check the numbers on the blocks), and *C* = how many blocks long the signpost itself is (here, *1*).' },
    ],
    challenge: { prompt: 'Add a `find-back spot` line just above `grow-b`, so the creature finds its own signpost — its length lands in C.', starter: 'spot:\ngrow-a\ngrow-b', goal: { kind: 'regAtLeast', reg: 'C', value: 1, label: 'C holds the signpost’s length' } },
  },
  {
    id: 'measure', no: '12', title: 'Measuring', phase: 'change', prevId: 'find', ready: true,
    lede: 'Two signposts and a subtraction tell a creature how big it is.',
    demo: 'start:\ngrow-a\ngrow-a\ngrow-b\nend:',
    waypoints: [
      { focus: 'genome', title: 'How big is a piece of me?', body: 'Put a signpost at the *start* of a stretch and one at the *end* (see them at positions 0 and 5). `find` each to get its position, then `subtract` the two. The answer is the *size* of everything in between — the number of blocks in that piece of your body.' },
      { focus: 'age', title: 'Ready to copy', body: 'Measuring itself from start to end is the last thing a creature needs before it can copy *itself*. Next: making room for a baby.' },
    ],
  },
  {
    id: 'make-room', no: '13', title: 'Make room', phase: 'daughter', prevId: 'measure', ready: true,
    lede: 'Before copying itself, a creature reserves a patch of the world for its baby.',
    demo: 'flip-bit\ndouble\ndouble\ndouble\ndouble\nmake-space',
    waypoints: [
      { focus: 'world', title: 'A patch of world', body: '`make-space` asks the world for a patch of *empty cells* — the free space you met earlier — and reserves it as the *daughter*. Notebook C says how many cells to grab.' },
      { focus: 'daughter', title: 'The daughter appears', body: 'Watch those free cells light up as the daughter — empty and waiting. Only the mother may write there.' },
    ],
    challenge: { prompt: 'C is built up to 16. Add `make-space` to reserve room for a daughter.', starter: 'flip-bit\ndouble\ndouble\ndouble\ndouble', goal: { kind: 'daughter', label: 'a daughter is reserved' } },
  },
  {
    id: 'copy-byte', no: '14', title: 'Copy one byte', phase: 'daughter', prevId: 'make-room', ready: true,
    lede: 'The most important block of all — but one at a time.',
    demo: 'flip-bit\ndouble\ndouble\ndouble\ndouble\nmake-space\ncopy-byte',
    waypoints: [
      { focus: 'genome', title: 'One byte', body: '`copy-byte` copies a single byte from the mother into the daughter. Just one.' },
      { focus: 'daughter', title: 'Not enough', body: 'One byte barely fills the daughter. A whole body is dozens of bytes — so you `copy-byte` over and over. That’s a job for a loop.' },
    ],
  },
  {
    id: 'copy-loop', no: '15', title: 'The copy loop', phase: 'daughter', prevId: 'copy-byte', ready: true,
    lede: 'Everything so far, together: a creature that copies its whole self.',
    soup: 256, demo: ANCESTOR_GS,
    waypoints: [
      { focus: 'genome', title: 'A real creature', body: 'This is a full creature — much bigger now. It finds itself, makes room, and runs a copy loop: `copy-byte`, move along, `jump-back` until it’s done.' },
      { focus: 'daughter', title: 'Watch it fill', body: 'Press *Run*. The reading head races round the loop and the daughter fills up, byte by byte, into a complete copy.' },
    ],
    challenge: { prompt: 'Press ▶ Run and watch the daughter fill up.', starter: ANCESTOR_GS, goal: { kind: 'daughterFill', pct: 60, label: 'the daughter is copied' } },
  },
  {
    id: 'give-birth', no: '16', title: 'Give birth', phase: 'daughter', prevId: 'copy-loop', ready: true,
    lede: 'The moment it all leads to.',
    soup: 256, demo: ANCESTOR_GS,
    waypoints: [
      { focus: 'daughter', title: 'Split', body: 'Once the daughter is a full copy, `divide` sets her free as a brand-new creature — her own body, her own reading head, her own life.' },
      { focus: 'world', title: 'Two, then many', body: 'Now there are two. Each will copy itself too. Press *Run* and watch your creature become a family.' },
    ],
    challenge: { prompt: 'Press ▶ Run until a baby is born (the world shows 2 creatures).', starter: ANCESTOR_GS, goal: { kind: 'born', label: 'your first baby is born! 🎉' } },
  },
  // ── stubs — building next (still listed + gated) ──────────────────────────
  ...([
    ['tank', '17', 'A living tank', 'life', 'give-birth'],
    ['mutation', '18', 'Copy errors', 'evolve', 'tank'],
    ['selection', '19', 'Survival', 'evolve', 'mutation'],
    ['parasites', '20', 'Parasites', 'evolve', 'selection'],
    ['versus', '21', 'Versus', 'versus', 'parasites'],
  ] as const).map(([id, no, title, phase, prevId]) => ({
    id, no, title, phase: phase as Chapter['phase'], prevId, ready: false,
    lede: 'Coming next.', waypoints: [] as Waypoint[],
  })),
];

export const CHAPTERS: readonly Chapter[] = CHAPTERS_DATA;
export function chapterById(id: string): Chapter | undefined { return CHAPTERS.find((c) => c.id === id); }
export function nextChapter(id: string): Chapter | undefined {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  return i >= 0 ? CHAPTERS[i + 1] : undefined;
}
