// Match Model & Scoring (MATCH) — acceptance criteria as executable tests.
// Ref: docs/spec/versus/01-match-model-and-scoring.md §8 (MATCH-001..012). Kept 1:1 with the doc.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  Player,
  MatchConfig,
  MatchRules,
  MatchHistory,
  MatchDescriptor,
  Standing,
  Threshold,
} from '../src/types.ts';
import { score, rank, validateMatchConfig, type RankContext } from '../src/match.ts';

import { Engine } from '../../engine/src/index.ts';
import { rankVersus } from '../../content/src/goal.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';

// ---- shared fixtures -------------------------------------------------------

// A trivially inert creature: four nops — it stays alive (population 1) but never divides.
const INERT = new Uint8Array([0, 0, 0, 0]);

function player(founderId: number, name: string, genome: string): Player {
  return { founderId, name, genome };
}

function emptyHistory(): MatchHistory {
  return {
    peakPopulation: new Map(),
    totalBirths: new Map(),
    earliestThresholdLead: new Map(),
    avgSize: new Map(),
  };
}

function descriptorFor(scenario = new Engine({ seed: 0 }).scenario): MatchDescriptor {
  return {
    scenario,
    players: [
      { founderId: 1, genome: 'a' },
      { founderId: 2, genome: 'b' },
    ],
    placement: { kind: 'even' },
    threshold: { kind: 'cycles', value: 1000 },
    rules: { threshold: { kind: 'cycles', value: 1000 }, tiebreakers: [] },
    engineVersion: Engine.version,
  };
}

function ctx(over: Partial<RankContext> = {}): RankContext {
  return { atCycle: 1000, atGeneration: 3, descriptor: descriptorFor(), ...over };
}

function rules(tiebreakers: MatchRules['tiebreakers'], threshold?: Threshold): MatchRules {
  return { threshold: threshold ?? { kind: 'cycles', value: 1000 }, tiebreakers };
}

describe('Match Model & Scoring (MATCH)', () => {
  it('[MATCH-001] a MatchConfig requires >=2 players with distinct founderIds and genomes; invalid rejected', () => {
    const good: MatchConfig = {
      scenario: new Engine({ seed: 0 }).scenario,
      seed: 0,
      players: [player(1, 'A', 'srcA'), player(2, 'B', 'srcB')],
      rules: rules([]),
    };
    assert.deepEqual(validateMatchConfig(good), []); // valid → no reasons

    // fewer than 2 players
    assert.ok(validateMatchConfig({ ...good, players: [player(1, 'A', 'srcA')] }).length > 0);
    // duplicate founderIds
    assert.ok(
      validateMatchConfig({ ...good, players: [player(1, 'A', 'srcA'), player(1, 'B', 'srcB')] })
        .some((r) => r.includes('founderId')),
    );
    // duplicate genomes
    assert.ok(
      validateMatchConfig({ ...good, players: [player(1, 'A', 'same'), player(2, 'B', 'same')] })
        .some((r) => r.includes('genome')),
    );
    // founder 0 used as a player
    assert.ok(
      validateMatchConfig({ ...good, players: [player(0, 'N', 'srcN'), player(2, 'B', 'srcB')] })
        .some((r) => r.includes('founder 0')),
    );
  });

  it('[MATCH-002] Threshold is cycles or generations — both in-sim clocks, never wall-clock', () => {
    const base: MatchConfig = {
      scenario: new Engine({ seed: 0 }).scenario,
      seed: 0,
      players: [player(1, 'A', 'srcA'), player(2, 'B', 'srcB')],
      rules: rules([]),
    };
    assert.deepEqual(validateMatchConfig({ ...base, rules: rules([], { kind: 'cycles', value: 1000 }) }), []);
    assert.deepEqual(validateMatchConfig({ ...base, rules: rules([], { kind: 'generations', value: 5 }) }), []);
    // a wall-clock threshold is rejected
    const wall = { ...base, rules: { threshold: { kind: 'wallclock', value: 1000 } as unknown as Threshold, tiebreakers: [] } };
    assert.ok(validateMatchConfig(wall).some((r) => r.includes('wall-clock')));
  });

  it('[MATCH-003] score = per-founder live population from stats; neutral (founder 0) does not score', () => {
    const players = [player(1, 'A', 'srcA'), player(2, 'B', 'srcB')];
    // map carries neutral founder 0 — it must be ignored, never a standing.
    const pop = new Map<number, number>([[0, 999], [1, 10], [2, 4]]);
    const standings = score(pop, players);
    assert.equal(standings.length, 2);
    assert.ok(!standings.some((s) => s.founderId === 0));
    assert.equal(standings.find((s) => s.founderId === 1)!.population, 10);
    assert.equal(standings.find((s) => s.founderId === 2)!.population, 4);
    // even if founder 0 is (wrongly) listed as a player, it never scores.
    const withNeutral = score(pop, [player(0, 'N', 'n'), ...players]);
    assert.ok(!withNeutral.some((s) => s.founderId === 0));
  });

  it('[MATCH-004] score/rank are pure functions (same inputs → same standings/result)', () => {
    const players = [player(1, 'A', 'srcA'), player(2, 'B', 'srcB')];
    const pop = new Map<number, number>([[1, 7], [2, 3]]);
    assert.deepEqual(score(pop, players), score(pop, players));

    const s = score(pop, players);
    const r = rules(['peak-population']);
    const h = emptyHistory();
    assert.deepEqual(rank(s, r, h, ctx()), rank(s, r, h, ctx()));
  });

  it('[MATCH-005] ranking sorts by descending population; equal populations share a rank', () => {
    const players = [player(1, 'A', 'a'), player(2, 'B', 'b'), player(3, 'C', 'c'), player(4, 'D', 'd')];
    const pop = new Map<number, number>([[1, 5], [2, 9], [3, 9], [4, 1]]);
    const s = score(pop, players);
    // sorted descending by population
    assert.deepEqual(s.map((x) => x.population), [9, 9, 5, 1]);
    // standard competition ranking 1,2,2,4 — equal populations (the two 9s) share rank 1.
    assert.deepEqual(s.map((x) => x.rank), [1, 1, 3, 4]);
  });

  it('[MATCH-006] tiebreakers apply in configured order; exhausted ties → draw', () => {
    const players = [player(1, 'A', 'a'), player(2, 'B', 'b')];
    const pop = new Map<number, number>([[1, 5], [2, 5]]); // exact population tie
    const s = score(pop, players);
    assert.deepEqual(s.map((x) => x.rank), [1, 1]);

    // first tiebreaker (peak-population) is itself tied; second (total-births) decides for founder 2.
    const h = emptyHistory();
    h.peakPopulation.set(1, 8);
    h.peakPopulation.set(2, 8);
    h.totalBirths.set(1, 20);
    h.totalBirths.set(2, 50);
    const decided = rank(s, rules(['peak-population', 'total-births']), h, ctx());
    assert.equal(decided.winner, 2);
    assert.equal(decided.tiebreakerUsed, 'total-births');

    // no tiebreaker configured → draw.
    const drawn = rank(s, rules([]), emptyHistory(), ctx());
    assert.equal(drawn.winner, 'draw');
    assert.equal(drawn.tiebreakerUsed, undefined);

    // all configured tiebreakers still tie → draw.
    const stillTied = emptyHistory();
    stillTied.peakPopulation.set(1, 8);
    stillTied.peakPopulation.set(2, 8);
    assert.equal(rank(s, rules(['peak-population']), stillTied, ctx()).winner, 'draw');
  });

  it('[MATCH-007] tiebreaker inputs come from recorded engine observables (deterministic)', () => {
    const players = [player(1, 'A', 'a'), player(2, 'B', 'b')];
    const pop = new Map<number, number>([[1, 5], [2, 5]]);
    const s = score(pop, players);

    // earliest-threshold-lead: SMALLER cycle wins (founder 1 led first).
    const h1 = emptyHistory();
    h1.earliestThresholdLead.set(1, 300);
    h1.earliestThresholdLead.set(2, 900);
    assert.equal(rank(s, rules(['earliest-threshold-lead']), h1, ctx()).winner, 1);

    // smaller-avg-size: SMALLER wins (founder 2 is leaner).
    const h2 = emptyHistory();
    h2.avgSize.set(1, 80);
    h2.avgSize.set(2, 45);
    assert.equal(rank(s, rules(['smaller-avg-size']), h2, ctx()).winner, 2);
  });

  it('[MATCH-008] the result records atCycle/atGeneration and the MatchDescriptor for replay', () => {
    const players = [player(1, 'A', 'a'), player(2, 'B', 'b')];
    const s = score(new Map([[1, 9], [2, 2]]), players);
    const desc = descriptorFor();
    const r = rank(s, rules([]), emptyHistory(), { atCycle: 12345, atGeneration: 7, descriptor: desc });
    assert.equal(r.atCycle, 12345);
    assert.equal(r.atGeneration, 7);
    assert.equal(r.descriptor, desc);
    assert.equal(r.winner, 1);
  });

  it('[MATCH-009] an inert (never-replicating) genome scores its surviving count and loses, no crash', () => {
    // Real engine: a breeder (ANC) vs an inert genome sharing one soup.
    const e = new Engine({ seed: 0 });
    e.inject(ANC, { founderId: 1 });
    e.inject(INERT, { founderId: 2 });
    e.run(20_000);
    const pop = new Map<number, number>([
      [1, e.world.founders[1]!],
      [2, e.world.founders[2]!],
    ]);
    const players = [player(1, 'Breeder', 'anc'), player(2, 'Inert', 'inert')];
    const s = score(pop, players); // must not crash
    const inert = s.find((x) => x.founderId === 2)!;
    assert.ok(Number.isInteger(inert.population));
    assert.equal(inert.population, 1); // its lone surviving creature
    assert.ok(inert.rank > 1); // it loses to the breeder
    const r = rank(s, rules(['peak-population']), emptyHistory(), ctx());
    assert.equal(r.winner, 1);
  });

  it('[MATCH-010] total extinction ranks by peak/last-nonzero standings (no undefined winner)', () => {
    // All founders extinct at the threshold: every live population is 0.
    const players = [player(1, 'A', 'a'), player(2, 'B', 'b')];
    const s = score(new Map<number, number>([[1, 0], [2, 0]]), players);
    assert.deepEqual(s.map((x) => x.population), [0, 0]);
    assert.deepEqual(s.map((x) => x.rank), [1, 1]); // both tied at rank 1

    // fall back to recorded peak population — founder 2 peaked higher, so it wins (never undefined).
    const h = emptyHistory();
    h.peakPopulation.set(1, 40);
    h.peakPopulation.set(2, 120);
    const r = rank(s, rules(['peak-population']), h, ctx());
    assert.equal(r.winner, 2);
    assert.notEqual(r.winner, undefined);
  });

  it('[MATCH-011] all scores are integers', () => {
    const players = [player(1, 'A', 'a'), player(2, 'B', 'b'), player(3, 'C', 'c')];
    const pop = new Map<number, number>([[1, 7], [3, 2]]); // founder 2 absent → 0
    const s = score(pop, players);
    for (const st of s) {
      assert.ok(Number.isInteger(st.population), `population ${st.population} is integer`);
      assert.ok(Number.isInteger(st.rank), `rank ${st.rank} is integer`);
    }
    assert.equal(s.find((x) => x.founderId === 2)!.population, 0); // absent founder scores 0
  });

  it('[MATCH-012] the scoring core matches content rankVersus for the same inputs (shared logic)', () => {
    const scenario = { seed: 0 };
    const by = 50_000;

    // Build the per-founder populations from a REAL engine run (ANC breeder vs INERT rival).
    const e = new Engine(scenario);
    e.inject(ANC, { founderId: 1 });
    e.inject(INERT, { founderId: 2 });
    e.run(by);
    const pop = new Map<number, number>([
      [1, e.world.founders[1]!],
      [2, e.world.founders[2]!],
    ]);

    const players = [player(1, 'A', 'anc'), player(2, 'B', 'inert')];
    const s = score(pop, players);
    const r = rank(s, rules([]), emptyHistory(), ctx());

    // The shared content scoring core over the same scenario/seed/genomes/threshold.
    const rv = rankVersus(scenario, ANC, INERT, { kind: 'out-populate', by, seed: 0 });
    const expected = rv === 'a' ? 1 : rv === 'b' ? 2 : 'draw';
    assert.equal(rv, 'a'); // the breeder out-populates the inert rival
    assert.equal(r.winner, expected); // my score/rank agrees with rankVersus

    // symmetric tie: two inert genomes → rankVersus 'tie' ↔ my rank (no tiebreaker) 'draw'.
    const rvTie = rankVersus(scenario, INERT, INERT, { kind: 'out-populate', by, seed: 0 });
    const eTie = new Engine(scenario);
    eTie.inject(INERT, { founderId: 1 });
    eTie.inject(INERT, { founderId: 2 });
    eTie.run(by);
    const sTie = score(new Map([[1, eTie.world.founders[1]!], [2, eTie.world.founders[2]!]]), players);
    const rTie = rank(sTie, rules([]), emptyHistory(), ctx());
    assert.equal(rvTie, 'tie');
    assert.equal(rTie.winner, 'draw');
  });
});
