// ============================================================================
// Shipped content corpus + registries (the concrete artifacts the cross-layer
// CONTINV invariants exercise). Small but REAL: every lesson parses+validates
// clean, every starter genome compiles under its subset and loads in the engine.
// Expand this corpus as chapters are authored; the invariants scale with it.
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
export const SCENARIOS: readonly string[] = Object.freeze(['soup-small', 'soup-standard']);

// ---- Named instruction subsets a lesson may name (all lessons here use the
//      full classic-32, so none are named yet; kept for the resolver contract) --
export const SUBSETS: readonly string[] = Object.freeze([]);

// ---- The shipped lesson corpus (id → source text authored to the [01] grammar) --
// Each frontmatter id matches a real CURRICULUM node; prose {terms} are real
// KEYWORD entries; `verbs` are real classic-32 verbs; starters/scenarios resolve.
export interface ShippedLesson { id: string; source: string; }

const CH01_LANDMARKS = `---
id: ch01-landmarks
chapter: 1
title: Hello, soup
unlocks: { verbs: [mark-0, mark-1], concepts: [soup, cell, template, landmark] }
requires: []
mutation: off
---
Welcome to the {soup} — the little world your creatures live in. A creature is a
program written on a strip of memory. You drop landmarks into your code so you can
find your place again later, with \`mark-0\` and \`mark-1\`. A run of landmarks makes
a {template}: a pattern other instructions can search for.

:::playground { scenario: soup-small, seed: 1, starter: ancestor }
Press play and watch the ancestor read itself and make a copy.
:::goal { kind: replicates, within: 5000 }
Make your creature produce a baby.
:::
`;

const CH03_ALLOCATE = `---
id: ch03-allocate
chapter: 3
title: Make a daughter
unlocks: { verbs: [make-space], concepts: [daughter, allocation, write-protection] }
requires: [ch02-measure]
mutation: off
---
Before a creature can copy itself it must ask for room for its {daughter}. The
\`make-space\` instruction reserves a fresh block of {soup} for the new creature —
and until it is born, only the mother may write there.

:::playground { scenario: soup-small, seed: 7, starter: ancestor }
Watch the mother reserve space, then fill it.
:::goal { kind: reach-pop, population: 10, within: 20000 }
Grow the population to ten living creatures.
:::
`;

const CH05_DIVIDE = `---
id: ch05-divide
chapter: 5
title: Give birth
unlocks: { verbs: [divide], concepts: [replication, divide-gate] }
requires: [ch04-move-regs]
mutation: off
---
When the {daughter} has been fully written, \`divide\` splits her off as a brand-new
creature with her own {genome}. Now there are two of them, and each one carries the
same {genotype} until something changes.

:::playground { scenario: soup-standard, seed: 3, starter: ancestor }
Run it and count how fast the tank fills.
:::goal { kind: replicates, within: 5000 }
Split off your first daughter.
:::
`;

export const LESSONS: readonly ShippedLesson[] = Object.freeze([
  { id: 'ch01-landmarks', source: CH01_LANDMARKS },
  { id: 'ch03-allocate', source: CH03_ALLOCATE },
  { id: 'ch05-divide', source: CH05_DIVIDE },
]);

// ---- The content IdResolver, backed by the shipped registries ---------------
// isVerb consults the fixed classic-32 vocabulary; hasLesson the curriculum;
// hasKeyword the keyword registry; the rest the content registries above.
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
