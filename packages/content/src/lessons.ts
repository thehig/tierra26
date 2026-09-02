// ============================================================================
// The shipped registries: starter genomes, scenario ids and named subsets.
//
// This file used to also hold a 17-chapter lesson corpus as TypeScript template
// literals — a second curriculum alongside docs/lessons/*.md, rendered at its own
// route. The two had drifted (15 of 17 titles disagreed with progress.ts, which
// supplied the crumb over this file's body), so the corpus is gone and the
// documents are the only curriculum. `git log` has the prose if it is ever wanted
// as raw material for the chapters that are still stubs.
// ============================================================================
import type { ActiveSubset } from './types.ts';
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
