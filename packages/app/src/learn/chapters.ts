// The brick-by-brick curriculum: a data-driven registry of scroll-driven chapters. Each Phase-A/B
// chapter teaches ONE small idea (a command or two, one new entity attribute) with a short scrolly
// explainer over a steppable demo creature, then a "your turn" micro-challenge checked live.
// Phase-C chapters (population → evolution → versus) swap the step-through stage for the live tank.
import type { Focus } from '../anatomy/EntityDiagram.tsx';
import type { EntityState } from '../anatomy/useMicroEngine.ts';

export type MicroGoal =
  | { kind: 'regAtLeast'; reg: 'A' | 'B' | 'C' | 'D'; value: number; label: string }
  | { kind: 'regEquals'; reg: 'A' | 'B' | 'C' | 'D'; value: number; label: string }
  | { kind: 'daughter'; label: string }
  | { kind: 'born'; label: string };

// Latch-friendly: true the moment the goal is met at the current step.
export function checkMicroGoal(g: MicroGoal, s: EntityState): boolean {
  switch (g.kind) {
    case 'regAtLeast': return s.regs[g.reg] >= g.value;
    case 'regEquals': return s.regs[g.reg] === g.value;
    case 'daughter': return s.hasDaughter;
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
}

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
  // ── stubs — building next (still listed + gated) ──────────────────────────
  ...([
    ['landmarks', '5', 'Landmarks', 'change', 'doubling'],
    ['loops', '6', 'Go in circles', 'change', 'landmarks'],
    ['deciding', '7', 'Know when to stop', 'change', 'loops'],
    ['sums', '8', 'Doing sums', 'change', 'deciding'],
    ['find', '9', 'Finding yourself', 'change', 'sums'],
    ['measure', '10', 'Measuring', 'change', 'find'],
    ['make-room', '11', 'Make room', 'daughter', 'measure'],
    ['copy-byte', '12', 'Copy one byte', 'daughter', 'make-room'],
    ['copy-loop', '13', 'The copy loop', 'daughter', 'copy-byte'],
    ['give-birth', '14', 'Give birth', 'daughter', 'copy-loop'],
    ['tank', '15', 'A living tank', 'life', 'give-birth'],
    ['mutation', '16', 'Copy errors', 'evolve', 'tank'],
    ['selection', '17', 'Survival', 'evolve', 'mutation'],
    ['parasites', '18', 'Parasites', 'evolve', 'selection'],
    ['versus', '19', 'Versus', 'versus', 'parasites'],
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
