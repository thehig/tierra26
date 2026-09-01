// The brick-by-brick curriculum: TYPES and pure goal-checking.
//
// The chapters themselves are no longer here. They are authored documents under
// `docs/lessons/*.md`, read by ./lessons.ts through the build-time pipeline.
// This file keeps only what is logic rather than content, so the engine test
// suite and the goal checker can be imported without pulling in the corpus.
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

export interface Challenge { prompt: string; starter: string; goal: MicroGoal; }

export type ChapterPhase = 'read' | 'change' | 'daughter' | 'life' | 'evolve' | 'versus';

/** One chapter, projected from its document. `doc` is what the page renders;
 *  the rest is the metadata the map, the router and the tests read. */
export interface Chapter {
  id: string;
  no: string;
  title: string;
  phase: ChapterPhase;
  prevId: string | null;
  lede: string;
  ready: boolean;
  demo?: string;         // the stage genome, in compilable GENE form
  challenge?: Challenge; // "your turn"
  solution?: { source: string; budget: number }; // the reference answer, from <Solution>
  soup?: number;         // world size (cells); small tutorial worlds show every opcode emoji at once
}

// Small enough that a tutorial creature (and its daughter) fits and every cell's emoji is legible;
// the ancestor chapters override this with a bigger world + the hover magnifier.
export const TUTORIAL_SOUP = 36; // 6×6
export const chapterSoup = (c: Chapter | undefined): number => c?.soup ?? TUTORIAL_SOUP;
