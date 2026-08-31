// ============================================================================
// The shipped lesson corpus + registries (the concrete artifacts the cross-layer
// CONTINV invariants exercise). Every lesson parses + validates clean; every
// starter genome compiles under its subset and loads in the engine. The 17 lessons
// mirror the design→emergence curriculum (progress.ts): frontmatter ids, unlocks,
// prerequisites, and mutation setting match CURRICULUM node-for-node.
// ============================================================================
import type { ActiveSubset, IdResolver } from './types.ts';
import { CURRICULUM } from './progress.ts';
import { KEYWORDS, lookupKeyword } from './keyword.ts';
import { isVerb } from '../../genescript/src/vocab.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';

// ---- Shipped starter/solution genomes (id → GeneScript source + subset) -----
export interface StarterEntry { source: string; subset: ActiveSubset; }
export const STARTERS: Readonly<Record<string, StarterEntry>> = Object.freeze({
  ancestor: { source: ANCESTOR_GS, subset: { kind: 'classic32' } },
});

// ---- Shipped scenario ids (resolved by the content layer) -------------------
// soup-small / soup-standard = design-phase (mutation off); soup-evolve = emergence (mutation on).
export const SCENARIOS: readonly string[] = Object.freeze(['soup-small', 'soup-standard', 'soup-evolve']);

// ---- Named instruction subsets a lesson may name (none yet: lessons use classic-32) --
export const SUBSETS: readonly string[] = Object.freeze([]);

export interface ShippedLesson { id: string; source: string; }

// --- Chapter 1 — Hello, soup -------------------------------------------------
const CH01_LANDMARKS = `---
id: ch01-landmarks
chapter: 1
title: Hello, soup
unlocks: { verbs: [mark-0, mark-1], concepts: [soup, cell, template, landmark] }
requires: []
mutation: off
---
Welcome to the {soup} — the little world your creatures live in. A creature is a
program written on a strip of memory, and it needs a way to find its own parts.

So it drops landmarks into its code with \`mark-0\` and \`mark-1\`. A run of landmarks
makes a {template}: a pattern other instructions can search for, like a signpost you
can jump straight to.

:::playground { scenario: soup-small, seed: 1, starter: ancestor }
Press play and watch the ancestor read itself and make a copy.
:::goal { kind: replicates, within: 5000 }
Make your creature produce a baby.
:::
`;

const CH01_REGISTERS = `---
id: ch01-registers
chapter: 1
title: Four little notebooks
unlocks: { verbs: [grow-a, grow-b, grow-c, shrink-c], concepts: [register, instruction-pointer] }
requires: [ch01-landmarks]
mutation: off
---
Every creature carries four tiny notebooks called registers, named A, B, C and D. It
scribbles numbers in them to keep track of things — where it's reading from, or how
many bytes are left to copy.

Try \`grow-a\` to add one to notebook A, or \`shrink-c\` to take one away from C. \`grow-b\`
and \`grow-c\` work the same way. These little counters are how a creature walks along
its own {genome}, one byte at a time.

:::playground { scenario: soup-small, seed: 2, starter: ancestor }
Watch the ancestor use its notebooks to copy itself.
:::goal { kind: reach-pop, population: 6, within: 30000 }
Grow the tank to six creatures.
:::
`;

const CH01_BIT_TRICKS = `---
id: ch01-bit-tricks
chapter: 1
title: Bit tricks
unlocks: { verbs: [flip-bit, double, clear], concepts: [byte, bit] }
requires: [ch01-registers]
mutation: off
---
Deep down, everything is bits — tiny 0s and 1s. A creature can nudge them directly.
\`clear\` sets notebook C to zero, \`flip-bit\` flips its smallest bit, and \`double\`
doubles it.

These look like party tricks, but they're how a creature builds the exact numbers it
needs — like the length of its own body — without writing them down one by one.

:::playground { scenario: soup-small, seed: 5, starter: ancestor }
Watch the ancestor count itself up, then breed.
:::goal { kind: replicates, within: 6000 }
Build a number and make a baby.
:::
`;

// --- Chapter 2 — Find yourself -----------------------------------------------
const CH02_FIND = `---
id: ch02-find
chapter: 2
title: Finding your way
unlocks: { verbs: [find, find-back, find-forward], concepts: [address, self-location] }
requires: [ch01-bit-tricks]
mutation: off
---
A creature lives in a big {soup}, so how does it find its own parts? It searches for
the {template}s it left behind — those signposts of \`mark-0\` and \`mark-1\`.

\`find\` looks both ways for a signpost, \`find-forward\` looks ahead, and \`find-back\`
looks behind. When it finds one, it remembers the address in a notebook — that's how
it locates the start of its own {genome} before copying it.

:::playground { scenario: soup-small, seed: 3, starter: ancestor }
Watch it find its own edges, then copy itself.
:::goal { kind: replicates, within: 6000 }
Find your way to a baby.
:::
`;

const CH02_MEASURE = `---
id: ch02-measure
chapter: 2
title: Measuring up
unlocks: { verbs: [subtract, subtract-into-a], concepts: [size, subtraction] }
requires: [ch02-find]
mutation: off
---
Before a creature can copy itself, it needs to know how big it is. It finds the
signpost at its start and the one at its end, then subtracts one address from the
other. That difference is its size.

\`subtract\` puts A minus B into C; \`subtract-into-a\` puts A minus C back into A. With
these, a creature measures its own body and remembers the number for the copy to come.

:::playground { scenario: soup-standard, seed: 4, starter: ancestor }
Watch it size itself up, then reserve exactly that much room.
:::goal { kind: reach-pop, population: 8, within: 30000 }
Measure up and grow to eight.
:::
`;

// --- Chapter 3 — Make a daughter ---------------------------------------------
const CH03_ALLOCATE = `---
id: ch03-allocate
chapter: 3
title: Make a daughter
unlocks: { verbs: [make-space], concepts: [daughter, allocation, write-protection] }
requires: [ch02-measure]
mutation: off
---
Before a creature can copy itself it must ask for room for its {daughter}. The
\`make-space\` instruction reserves a fresh block of {soup} for the new creature — and
until she is born, only the mother is allowed to write there.

That rule — read anywhere, but write only into your own body and your baby's — is what
keeps the {soup} from turning into chaos. It also, much later, leaves a gap that
{parasite}s will learn to exploit.

:::playground { scenario: soup-small, seed: 7, starter: ancestor }
Watch the mother reserve space, then fill it.
:::goal { kind: reach-pop, population: 10, within: 20000 }
Grow the population to ten living creatures.
:::
`;

// --- Chapter 4 — Teach it to copy --------------------------------------------
const CH04_COPY_BYTE = `---
id: ch04-copy-byte
chapter: 4
title: The copy
unlocks: { verbs: [copy-byte], concepts: [byte-copy] }
requires: [ch03-allocate]
mutation: off
---
Here it is — the most important instruction of all. \`copy-byte\` takes one byte of the
mother and writes it into the {daughter}. One byte. That's it.

A whole creature is dozens of bytes, so one copy isn't enough — but do it over and
over and a baby takes shape. Everything else in these lessons exists to make this one
line run in the right place, the right number of times.

:::playground { scenario: soup-small, seed: 1, starter: ancestor }
Step through it and watch a single byte fly from mother to baby.
:::goal { kind: replicates, within: 5000 }
Copy yourself into a baby.
:::
`;

const CH04_LOOP = `---
id: ch04-loop
chapter: 4
title: Going in circles
unlocks: { verbs: [if-zero, jump, jump-back], concepts: [copy-loop, loop, conditional] }
requires: [ch04-copy-byte]
mutation: off
---
One \`copy-byte\` copies one byte. To copy a whole body, a creature loops: copy a byte,
move the counter, and if there's more to do, go round again.

\`jump-back\` sends the creature back to a {template}; \`jump\` sends it forward. \`if-zero\`
is the clever part — it only lets the next line run when a counter has hit zero, so the
loop knows exactly when to stop. Copy, step, check, repeat: the beating heart of the
{soup}.

:::playground { scenario: soup-standard, seed: 2, starter: ancestor }
Watch the copy loop build a whole baby, byte by byte.
:::goal { kind: reach-pop, population: 12, within: 30000 }
Loop your way to twelve creatures.
:::
`;

const CH04_MOVE_REGS = `---
id: ch04-move-regs
chapter: 4
title: Shuffling notes
unlocks: { verbs: [copy-c-to-d, copy-a-to-b], concepts: [move] }
requires: [ch04-loop]
mutation: off
---
Sometimes a creature needs a number in two notebooks at once. \`copy-c-to-d\` copies C
into D; \`copy-a-to-b\` copies A into B.

It's like keeping a spare copy of an address before you change the original — handy
when the copy loop must remember where it started while its counters race ahead.

:::playground { scenario: soup-standard, seed: 6, starter: ancestor }
Watch it keep a spare copy while the loop runs.
:::goal { kind: reach-pop, population: 15, within: 30000 }
Grow the tank to fifteen.
:::
`;

// --- Chapter 5 — Give birth --------------------------------------------------
const CH05_DIVIDE = `---
id: ch05-divide
chapter: 5
title: Give birth
unlocks: { verbs: [divide], concepts: [replication, divide-gate] }
requires: [ch04-move-regs]
mutation: off
---
When the {daughter} has been fully written, \`divide\` splits her off as a brand-new
creature with her own {genome}. Now there are two of them, and each carries the same
{genotype} until something changes.

This is replication at last: reserve room, copy yourself in, and split. Everything
alive in the tank is descended from a creature that learned to run these three steps.

:::playground { scenario: soup-standard, seed: 3, starter: ancestor }
Run it and count how fast the tank fills.
:::goal { kind: replicates, within: 5000 }
Split off your first daughter.
:::
`;

const CH05_SUBROUTINES = `---
id: ch05-subroutines
chapter: 5
title: Little routines
unlocks: { verbs: [call, return], concepts: [subroutine, stack] }
requires: [ch05-divide]
mutation: off
---
As creatures get cleverer, they reuse chunks of code. \`call\` runs a routine and
remembers where it came from; \`return\` jumps back to exactly that spot.

Behind the scenes there's a shared stack — a little pile of bookmarks — so a routine
can call another routine and everyone finds their way home. It keeps a creature tidy
instead of repeating itself.

:::playground { scenario: soup-standard, seed: 3, starter: ancestor }
Watch a routine run and return, over and over.
:::goal { kind: reach-pop, population: 20, within: 40000 }
Grow a colony of twenty.
:::
`;

const CH05_SAVE_LOAD = `---
id: ch05-save-load
chapter: 5
title: Pocket and stack
unlocks: { verbs: [save-a, save-b, save-c, save-d, load-a, load-b, load-c, load-d], concepts: [save-restore] }
requires: [ch05-subroutines]
mutation: off
---
The stack isn't only for routines — a creature can stash any notebook on it and grab
it back later. \`save-a\` pushes notebook A onto the stack; \`load-a\` pulls it back. The
same works for B, C and D.

This lets a creature borrow a notebook for a quick job and then restore it, exactly as
it was. Careful hands make reliable babies.

:::playground { scenario: soup-standard, seed: 7, starter: ancestor }
Watch it stash a number, do a job, and restore it.
:::goal { kind: reach-pop, population: 25, within: 50000 }
Raise a population of twenty-five.
:::
`;

// --- Chapter 6 — It fills the tank (life) ------------------------------------
const CH06_POPULATION = `---
id: ch06-population
chapter: 6
title: A living tank
unlocks: { verbs: [], concepts: [population, scheduler, reaper, fullness] }
requires: [ch05-save-load]
mutation: off
---
Drop one creature in and soon there are hundreds. But the {soup} isn't endless — so
who lives and who dies?

Two invisible referees keep order. The {slicer} shares out turns, giving every creature
a slice of thinking time so none is left frozen. The {reaper} clears space when the
tank fills, retiring the oldest and the ones that make mistakes. Together they turn a
copy machine into an ecosystem.

:::playground { scenario: soup-standard, seed: 1, starter: ancestor }
Watch the numbers climb, then settle into a balance.
:::goal { kind: reach-pop, population: 60, within: 120000 }
Fill the tank with sixty creatures.
:::
`;

// --- Chapter 7 — Turn on the copy errors (emergence) -------------------------
const CH07_MUTATION = `---
id: ch07-mutation
chapter: 7
title: Copy errors
unlocks: { verbs: [], concepts: [mutation, flaw, copy-mutation, variation] }
requires: [ch06-population]
mutation: on
---
Real copying isn't perfect. Turn on {mutation} and every so often a byte gets flipped
as it's copied — a tiny mistake, exactly like a real DNA copy error.

Most mistakes are harmless, or fatal. But once in a while a flipped byte makes a
creature that's a little different — a new {genotype}. Watch the colours in the tank:
new shades mean new kinds of creature appearing. This is the moment the tank stops
being a copy machine and starts being alive.

:::playground { scenario: soup-evolve, seed: 3, starter: ancestor }
Let the copy errors run and watch new colours appear.
:::goal { kind: diversity, count: 3, within: 200000 }
Watch three different kinds of creature appear.
:::
`;

// --- Chapter 8 — Survival of the fittest (emergence) -------------------------
const CH08_SELECTION = `---
id: ch08-selection
chapter: 8
title: Survival of the fittest
unlocks: { verbs: [], concepts: [selection, fitness, size-reduction, optimization] }
requires: [ch07-mutation]
mutation: on
---
Now there are many kinds, all sharing one crowded {soup}. The ones that copy faster,
or take less room, leave more babies — so the tank slowly fills with them. Nobody
planned it; it just happens. That's natural selection.

Watch which colours take over. The winners aren't the biggest — often they're the
leanest and quickest, {genotype}s that found a shorter way to make the same baby.

:::playground { scenario: soup-evolve, seed: 5, starter: ancestor }
Let evolution run and see which lineages win the soup.
:::goal { kind: reach-pop, population: 40, within: 200000 }
Let the fittest fill the tank to forty.
:::
`;

// --- Chapter 9 — Parasites & arms races (emergence) --------------------------
const CH09_PARASITES = `---
id: ch09-parasites
chapter: 9
title: Cheaters and immunity
unlocks: { verbs: [], concepts: [parasite, immunity, hyper-parasite, arms-race] }
requires: [ch08-selection]
mutation: on
---
Give evolution long enough and something sneaky appears: a {parasite}. It throws away
its own copy code and borrows a neighbour's instead — a tiny freeloader that breeds
using someone else's work.

Then the hosts fight back, evolving to ignore the cheats, and the {parasite}s evolve
new tricks. An arms race. From a single ancestor, a whole tangled web of life appears —
no designer required.

:::playground { scenario: soup-evolve, seed: 2, starter: ancestor }
Watch the variety explode into a whole ecosystem.
:::goal { kind: diversity, count: 5, within: 300000 }
Grow an ecosystem of five kinds.
:::
`;

// --- Chapter 10 — Versus -----------------------------------------------------
const CH10_VERSUS = `---
id: ch10-versus
chapter: 10
title: Into the arena
unlocks: { verbs: [], concepts: [competition, win-condition, seed-replay] }
requires: [ch09-parasites]
mutation: on
---
You've built a creature, watched it live, and seen it evolve. Now make it fight.

In Versus, two creatures drop into one {soup} at the very same instant and race to fill
the tank. Same seed, same rules — so the better design wins every time, and anyone with
your share link sees the exact same match. Take your best creature to the arena, or
just watch this one endure.

:::playground { scenario: soup-evolve, seed: 1, starter: ancestor }
Watch a lineage survive the churn of a living, mutating soup.
:::goal { kind: survive, cycles: 60000 }
Keep a lineage alive to cycle 60,000.
:::
`;

// In curriculum order, so "next" navigation flows design → emergence → versus.
export const LESSONS: readonly ShippedLesson[] = Object.freeze([
  { id: 'ch01-landmarks', source: CH01_LANDMARKS },
  { id: 'ch01-registers', source: CH01_REGISTERS },
  { id: 'ch01-bit-tricks', source: CH01_BIT_TRICKS },
  { id: 'ch02-find', source: CH02_FIND },
  { id: 'ch02-measure', source: CH02_MEASURE },
  { id: 'ch03-allocate', source: CH03_ALLOCATE },
  { id: 'ch04-copy-byte', source: CH04_COPY_BYTE },
  { id: 'ch04-loop', source: CH04_LOOP },
  { id: 'ch04-move-regs', source: CH04_MOVE_REGS },
  { id: 'ch05-divide', source: CH05_DIVIDE },
  { id: 'ch05-subroutines', source: CH05_SUBROUTINES },
  { id: 'ch05-save-load', source: CH05_SAVE_LOAD },
  { id: 'ch06-population', source: CH06_POPULATION },
  { id: 'ch07-mutation', source: CH07_MUTATION },
  { id: 'ch08-selection', source: CH08_SELECTION },
  { id: 'ch09-parasites', source: CH09_PARASITES },
  { id: 'ch10-versus', source: CH10_VERSUS },
]);

// ---- The content IdResolver, backed by the shipped registries ---------------
export function contentResolver(): IdResolver {
  const scenarios = new Set(SCENARIOS);
  const subsets = new Set(SUBSETS);
  const lessons = new Set(Object.keys(CURRICULUM.lessons));
  return {
    hasScenario: (id) => scenarios.has(id),
    hasStarter: (id) => Object.prototype.hasOwnProperty.call(STARTERS, id),
    isVerb: (verb) => isVerb(verb),
    hasLesson: (id) => lessons.has(id),
    hasKeyword: (term) => lookupKeyword(term, KEYWORDS) !== undefined,
    hasSubset: (name) => subsets.has(name),
  };
}
