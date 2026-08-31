// Locks the brick-by-brick curriculum against the real engine: every ready chapter's demo and
// challenge-starter must compile, and every challenge must be *solvable* — the intended solution,
// run in the same micro-engine the lesson uses (seed 1, soup 256, no mutation), reaches its goal.
import { describe, it, expect } from 'vitest';
import { Engine } from '@tierra26/engine';
import { classic32 } from '@tierra26/engine/isa.ts';
import { compile } from '@tierra26/genescript/comp.ts';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import { CHAPTERS, checkMicroGoal, type MicroGoal, type EntityStateLike } from '../src/learn/chapters.ts';

const SOUP = 256;

// Run a genome in the micro-engine and return true if the goal is ever met within `budget` steps.
function solves(source: string, goal: MicroGoal, budget: number): boolean {
  const e = new Engine({ seed: 1, soupSize: SOUP, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
  const id = e.inject(compile(source, classic32).bytes, { founderId: 1 });
  for (let t = 0; t < budget; t++) {
    const c = e.world.creatures.get(id);
    const s: EntityStateLike = {
      regs: { A: c ? c.cpu.reg[0]! : 0, B: c ? c.cpu.reg[1]! : 0, C: c ? c.cpu.reg[2]! : 0, D: c ? c.cpu.reg[3]! : 0 },
      hasDaughter: !!c && c.dauStart >= 0,
      daughterFillPct: c && c.dauStart >= 0 && c.dauSize > 0 ? Math.floor((c.dauWritten / c.dauSize) * 100) : 0,
      population: e.world.creatures.size,
      halted: !!c && (c.cpu.ip - c.start < 0 || c.cpu.ip - c.start >= c.size),
    };
    if (checkMicroGoal(goal, s)) return true;
    if (s.halted) break; // straight-line program is done — no point stepping into empty soup
    e.step();
  }
  return false;
}

// The intended solution for each challenge chapter (what a learner would arrive at).
const SOLUTIONS: Record<string, { source: string; budget: number }> = {
  'count-up':   { source: 'grow-a\ngrow-a\ngrow-a', budget: 20 },
  'count-down': { source: 'grow-c\ngrow-c\ngrow-c\nshrink-c\nshrink-c', budget: 20 },
  'zero-flip':  { source: 'clear\nflip-bit', budget: 20 },
  'doubling':   { source: 'flip-bit\ndouble\ndouble', budget: 20 },
  'loops':      { source: 'top:\ngrow-a\njump-back top\nclear', budget: 60 },
  'sums':       { source: 'grow-a\ngrow-a\ngrow-a\ngrow-b\nsubtract', budget: 20 },
  'find':       { source: 'spot:\nfind-back spot\ngrow-b', budget: 20 },
  'make-room':  { source: 'flip-bit\ndouble\ndouble\ndouble\ndouble\nmake-space', budget: 20 },
  'copy-loop':  { source: ANCESTOR_GS, budget: 8000 },
  'give-birth': { source: ANCESTOR_GS, budget: 8000 },
};

describe('brick-by-brick chapters', () => {
  const ready = CHAPTERS.filter((c) => c.ready);

  it('has ready chapters wired in a chain', () => {
    expect(ready.length).toBeGreaterThanOrEqual(14);
  });

  for (const ch of ready) {
    it(`ch${ch.no} "${ch.title}" demo + starter compile`, () => {
      if (ch.demo) expect(compile(ch.demo, classic32).bytes.length).toBeGreaterThan(0);
      if (ch.challenge) expect(compile(ch.challenge.starter, classic32).bytes.length).toBeGreaterThan(0);
    });
  }

  for (const ch of ready) {
    if (!ch.challenge) continue;
    it(`ch${ch.no} "${ch.title}" challenge is solvable`, () => {
      const sol = SOLUTIONS[ch.id];
      expect(sol, `no reference solution for ${ch.id}`).toBeDefined();
      expect(solves(sol!.source, ch.challenge!.goal, sol!.budget)).toBe(true);
    });
  }

  // The unedited starter must NOT solve the challenge — except the two "just press Run" chapters
  // whose starter (the ancestor) IS the solution. This guards the self-solving bug: a "must equal"
  // goal being satisfied by a value the creature merely passes through while the program runs.
  const RUN_THE_STARTER = new Set(['copy-loop', 'give-birth']);
  for (const ch of ready) {
    if (!ch.challenge) continue;
    it(`ch${ch.no} "${ch.title}" starter does not self-solve`, () => {
      const runsToSolve = RUN_THE_STARTER.has(ch.id);
      expect(solves(ch.challenge!.starter, ch.challenge!.goal, runsToSolve ? 8000 : 500)).toBe(runsToSolve);
    });
  }

  // Step and Run must agree: a straight-line program halts on ONE deterministic end-state, no matter
  // how far you run it. (The bug: Run walked the reading head off the end, wrapped the 256-byte world,
  // and re-ran the genome, so "sums" gave a different answer than stepping.)
  it('a straight-line program halts on one stable end-state', () => {
    const src = 'grow-a\ngrow-a\ngrow-a\ngrow-b\nsubtract';
    const at = (budget: number) => {
      const e = new Engine({ seed: 1, soupSize: SOUP, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
      const id = e.inject(compile(src, classic32).bytes, { founderId: 1 });
      for (let t = 0; t < budget; t++) {
        const c = e.world.creatures.get(id)!;
        if (c.cpu.ip - c.start >= c.size) break; // halted — stop, exactly as the UI does
        e.step();
      }
      const c = e.world.creatures.get(id)!;
      return { A: c.cpu.reg[0], B: c.cpu.reg[1], C: c.cpu.reg[2] };
    };
    expect(at(5)).toEqual({ A: 3, B: 1, C: 2 });   // stepping through
    expect(at(9000)).toEqual({ A: 3, B: 1, C: 2 }); // "running" lands on the same state
  });
});
