// Match Runner & Fairness (RUNNER) — acceptance criteria as executable tests.
// Ref: docs/spec/versus/03-match-runner-and-fairness.md §8 (RUNNER-001..014). Kept 1:1 with the doc.
//
// Matches run on the AUTHORITATIVE engine THROUGH the UI worker core (C-VS-VIEW). Real genomes:
// the GeneScript ancestor (a breeder that breeds true under sterile mutation) vs a simple inert
// genome (four raw nops — stays alive but never divides). >= 2 players throughout.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Engine } from '../../engine/src/index.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';
import { createWorkerCore } from '../../ui/src/worker-core.ts';

import type { MatchConfig, MatchDescriptor, MatchHistory, ObservationFrame, Placement, Player, VersusLink } from '../src/types.ts';
import {
  placements,
  buildDescriptor,
  toRunDescriptor,
  serializeVersusLink,
  parseVersusLink,
  runMatch,
  record,
  validateMatch,
  seededPermutation,
  engineHasGenerationCounter,
} from '../src/runner.ts';
import { score, rank } from '../src/match.ts';

function emptyHistory(): MatchHistory {
  return {
    peakPopulation: new Map(),
    totalBirths: new Map(),
    earliestThresholdLead: new Map(),
    avgSize: new Map(),
  };
}

function frameOf(evs: unknown[]): ObservationFrame {
  return (evs.find((e) => (e as { type: string }).type === 'frame') as unknown as { frame: ObservationFrame }).frame;
}

// ---- shared fixtures -------------------------------------------------------

const BREEDER = ANCESTOR_GS;                            // compiles to the 80-byte self-replicator
// A genuinely inert rival: a tight self-loop (jump-back to its own landmark). It stays alive but
// never divides and never wanders into the breeder's copy loop, so the breeder wins decisively
// regardless of injection order/placement. (Four bare nops are NOT inert in a shared soup — their
// IP falls into a neighbour's copy loop and reproduces by borrowed code; see LINEAGE-005.)
const INERT = 'here:\njump-back here\n';
const BAD = 'florbulator\n';                             // an unknown verb — fails to compile

function scenarioWith(over: Record<string, unknown> = {}) {
  return new Engine({ seed: 3, soupSize: 20_000, ...over }).scenario;
}

function descriptor(over: Partial<MatchDescriptor> = {}): MatchDescriptor {
  const threshold = { kind: 'cycles', value: 40_000 } as const;
  return {
    scenario: scenarioWith(),
    players: [
      { founderId: 1, genome: BREEDER },
      { founderId: 2, genome: INERT },
    ],
    placement: { kind: 'even' },
    threshold,
    rules: { threshold, tiebreakers: ['peak-population'] },
    engineVersion: Engine.version,
    ...over,
  };
}

// A spy worker core that records the command types it is driven with (RUNNER-013).
function spyCore() {
  const inner = createWorkerCore();
  const calls: string[] = [];
  const core = {
    handle(cmd: Parameters<typeof inner.handle>[0]) { calls.push((cmd as { type: string }).type); return inner.handle(cmd); },
    pump(sessionId: string, ticks?: number) { calls.push('pump'); return inner.pump(sessionId, ticks); },
  };
  return { core: core as unknown as ReturnType<typeof createWorkerCore>, calls };
}

describe('Match Runner & Fairness (RUNNER)', () => {
  it('[RUNNER-001] all player genomes are injected at cycle 0 before any instruction runs (VSINV-SIMULTANEOUS)', () => {
    const m = runMatch(descriptor());
    const first = m.standings$[0]!;
    // The first observed frame is BEFORE any instruction runs: cycle 0, both founders already present.
    assert.equal(first.cycle, 0);
    assert.equal(first.standings.length, 2);
    for (const s of first.standings) assert.equal(s.population, 1); // each seed creature, one live
    assert.deepEqual(first.standings.map((s) => s.founderId).sort(), [1, 2]);
  });

  it('[RUNNER-002] each injected seed creature is stamped with its founderId', () => {
    const rd = toRunDescriptor(descriptor());
    const core = createWorkerCore();
    core.handle({ type: 'createSession', engineVersion: Engine.version, sessionId: 's' } as never);
    core.handle({ type: 'init', scenario: rd.scenario, injections: rd.injections, sessionId: 's' } as never);
    const evs = core.handle({ type: 'run', mode: 'budget', nInstructions: 0, sessionId: 's' } as never);
    const frame = (evs.find((e) => (e as { type: string }).type === 'frame') as unknown as { frame: { cycles: number; founders: { counts: Uint32Array; total: number } } }).frame;
    assert.equal(frame.cycles, 0);
    assert.equal(frame.founders.counts[1], 1); // founder 1 stamped
    assert.equal(frame.founders.counts[2], 1); // founder 2 stamped
    assert.equal(frame.founders.counts[0], 0); // nothing neutral — every seed is attributed
    assert.equal(frame.founders.total, 2);
    // Injections carry the founder stamp explicitly, all at cycle 0 (simultaneous).
    for (const inj of rd.injections) assert.equal(inj.atCycle, 0);
    assert.deepEqual(rd.injections.map((i) => i.founderId).sort(), [1, 2]);
  });

  it('[RUNNER-003] placements(n, soupSize, even) returns round(i*soupSize/n) — evenly spaced, non-overlapping, pure', () => {
    const even = placements(4, 1000, { kind: 'even' });
    assert.deepEqual(even, [0, 250, 500, 750]);
    // non-overlapping (strictly increasing, distinct)
    assert.deepEqual([...even].sort((a, b) => a - b), even);
    assert.equal(new Set(even).size, even.length);
    // pure — same inputs, same output
    assert.deepEqual(placements(4, 1000, { kind: 'even' }), even);

    // even-rotated: even + rotation (mod soupSize)
    assert.deepEqual(placements(4, 1000, { kind: 'even-rotated', rotation: 100 }), [100, 350, 600, 850]);
    // rotation wraps around the circular soup
    assert.deepEqual(placements(4, 1000, { kind: 'even-rotated', rotation: 900 }), [900, 150, 400, 650]);

    // explicit passes its offsets through
    const off: Placement = { kind: 'explicit', offsets: [3, 17, 99] };
    assert.deepEqual(placements(3, 1000, off), [3, 17, 99]);
  });

  it('[RUNNER-004] injection/initial-scheduling order is a seed-derived permutation, not fixed to slot index', () => {
    // seededPermutation is a valid permutation, deterministic, and NOT always the identity.
    let sawNonIdentity = false;
    for (let seed = 0; seed < 12; seed++) {
      const perm = seededPermutation(4, seed);
      assert.deepEqual([...perm].sort((a, b) => a - b), [0, 1, 2, 3]); // a permutation of 0..3
      assert.deepEqual(seededPermutation(4, seed), perm);              // deterministic
      if (perm.join() !== '0,1,2,3') sawNonIdentity = true;
    }
    assert.ok(sawNonIdentity, 'some seed must reorder the slots (order de-biasing)');

    // Applied to real injection order: a permutation of the players' founderIds, seed-derived.
    const players = [
      { founderId: 1, genome: 'raw nop0\nraw nop0\n' },
      { founderId: 2, genome: 'raw nop1\nraw nop1\n' },
      { founderId: 3, genome: 'raw nop0\nraw nop1\n' },
      { founderId: 4, genome: 'grow-a\ngrow-b\n' },
    ];
    const mk = (seed: number): MatchDescriptor => ({
      scenario: scenarioWith({ seed }),
      players,
      placement: { kind: 'even' },
      threshold: { kind: 'cycles', value: 1000 },
      rules: { threshold: { kind: 'cycles', value: 1000 }, tiebreakers: [] },
      engineVersion: Engine.version,
    });
    const orderA = toRunDescriptor(mk(1)).injections.map((i) => i.founderId);
    const orderB = toRunDescriptor(mk(2)).injections.map((i) => i.founderId);
    assert.deepEqual([...orderA].sort(), [1, 2, 3, 4]);           // still every player, once
    assert.deepEqual(toRunDescriptor(mk(1)).injections.map((i) => i.founderId), orderA); // deterministic
    assert.notDeepEqual(orderA, orderB);                          // seed-derived (different seed → different order)
  });

  it('[RUNNER-005] buildDescriptor is pure and captures scenario+seed+players+placement+threshold+rules+engineVersion', () => {
    const cfg: MatchConfig = {
      scenario: scenarioWith({ seed: 5 }),
      seed: 7,
      players: [
        { founderId: 1, name: 'Breeder', genome: BREEDER },
        { founderId: 2, name: 'Inert', genome: INERT },
      ],
      rules: { threshold: { kind: 'cycles', value: 12_345 }, tiebreakers: ['peak-population'] },
    };
    const d = buildDescriptor(cfg);
    // seed folded into scenario.seed (S14) — distinct from both the raw scenario seed and cfg.seed
    assert.notEqual(d.scenario.seed, 5);
    assert.notEqual(d.scenario.seed, 7);
    assert.deepEqual(d.players, [
      { founderId: 1, genome: BREEDER },
      { founderId: 2, genome: INERT },
    ]);
    assert.deepEqual(d.placement, { kind: 'even' });
    assert.deepEqual(d.threshold, cfg.rules.threshold);
    assert.equal(d.rules, cfg.rules);
    assert.equal(d.engineVersion, Engine.version);
    // pure — same input, same output; input not mutated
    assert.deepEqual(buildDescriptor(cfg), d);
    assert.equal(cfg.seed, 7);
  });

  it('[RUNNER-006] runMatch(desc) reproduces identical live standings + result for any viewer (VSINV-DET)', () => {
    const desc = descriptor();
    const a = runMatch(desc);
    const b = runMatch(desc);
    assert.deepEqual(a.standings$, b.standings$);   // identical live scoreboard for any viewer
    return Promise.all([a.result, b.result]).then(([ra, rb]) => {
      assert.deepEqual(ra, rb);                     // identical result

      // Engine.replay of the derived RunDescriptor reproduces the SAME run (same stop, same census).
      const rd = toRunDescriptor(desc);
      const e = Engine.replay(rd);
      assert.equal(ra.atCycle, e.cycles);
      for (const s of ra.standings) assert.equal(s.population, e.world.founders[s.founderId]);
    });
  });

  it('[RUNNER-007] a MatchDescriptor round-trips to/from a VersusLink; toRunDescriptor(m) yields a valid RunDescriptor (S16)', () => {
    const desc = descriptor({ threshold: { kind: 'cycles', value: 8_000 }, rules: { threshold: { kind: 'cycles', value: 8_000 }, tiebreakers: [] } });
    const link: VersusLink = { match: desc };
    const s = serializeVersusLink(link);
    const back = parseVersusLink(s);
    assert.deepEqual(back, link);                   // round-trips (genome strings preserved)
    assert.equal(parseVersusLink('not json {'), null);
    assert.equal(parseVersusLink('{"nope":1}'), null);

    const rd = toRunDescriptor(desc);
    assert.equal(rd.engineVersion, Engine.version);
    assert.equal(rd.cycles, 8_000);                 // cycles threshold → run budget = threshold
    assert.equal(rd.injections.length, 2);
    for (const inj of rd.injections) {
      assert.ok(inj.genome instanceof Uint8Array && inj.genome.length > 0);
      assert.equal(inj.atCycle, 0);
    }
    assert.doesNotThrow(() => Engine.replay(rd)); // a valid engine RunDescriptor
  });

  it('[RUNNER-008] the match stops deterministically at the threshold cycle/generation', () => {
    // cycles threshold: same descriptor → same stop cycle, at/after the threshold.
    const desc = descriptor();
    const r1 = runMatch(desc);
    const r2 = runMatch(desc);
    return Promise.all([r1.result, r2.result]).then(([a, b]) => {
      assert.equal(a.atCycle, b.atCycle);                    // deterministic stop
      assert.ok(a.atCycle >= 40_000);                        // reached the threshold
      assert.equal(desc, a.descriptor);                      // never mutated; carried for replay
      assert.equal(r1.standings$[r1.standings$.length - 1]!.cycle, a.atCycle);

      // generations threshold: stops deterministically at/after N generations.
      const gThreshold = { kind: 'generations', value: 2 } as const;
      const gDesc = descriptor({ threshold: gThreshold, rules: { threshold: gThreshold, tiebreakers: ['peak-population'] } });
      const g1 = runMatch(gDesc);
      const g2 = runMatch(gDesc);
      return Promise.all([g1.result, g2.result]).then(([ga, gb]) => {
        assert.equal(ga.atGeneration, gb.atGeneration);
        assert.equal(ga.atCycle, gb.atCycle);
        assert.ok(ga.atGeneration >= 2);
      });
    });
  });

  it('[RUNNER-009] each observed frame yields a LiveStanding via attribute for the scoreboard', () => {
    const m = runMatch(descriptor());
    assert.ok(m.standings$.length >= 2, 'the scoreboard collects a standing per observed frame');
    for (const ls of m.standings$) {
      assert.ok(Number.isInteger(ls.cycle) && ls.cycle >= 0);
      assert.ok(Number.isInteger(ls.generation) && ls.generation >= 0);
      assert.equal(ls.standings.length, 2);
      for (const s of ls.standings) {
        assert.ok(Number.isInteger(s.population) && s.population >= 0);
        assert.ok(s.founderId === 1 || s.founderId === 2);
      }
    }
    // the breeder out-populates the inert rival by the threshold
    return m.result.then((r) => assert.equal(r.winner, 1));
  });

  it('[RUNNER-010] a genome that fails to compile is rejected before the match starts (no partial start)', () => {
    const bad = descriptor({
      players: [
        { founderId: 1, genome: BREEDER },
        { founderId: 2, genome: BAD },
      ],
    });
    assert.ok(validateMatch(bad).some((r) => /compile/.test(r)));
    assert.throws(() => runMatch(bad), /cannot start match/); // never a partial start
  });

  it('[RUNNER-011] a soup too small for N even-spaced genomes is rejected with a clear error', () => {
    // soupSize 100, 2 players → gap 50, but the breeder is 80 bytes → cannot be placed non-overlapping.
    const tiny = descriptor({ scenario: scenarioWith({ soupSize: 100 }) });
    const reasons = validateMatch(tiny);
    assert.ok(reasons.some((r) => /soup too small/.test(r)), reasons.join('; '));
    assert.throws(() => runMatch(tiny), /cannot start match/);
    // a comfortably large soup is fine
    assert.deepEqual(validateMatch(descriptor()).filter((r) => /soup too small/.test(r)), []);
  });

  it('[RUNNER-012] best-of-N runs the configured seeds with rotated placement and aggregates deterministically', () => {
    const threshold = { kind: 'cycles', value: 30_000 } as const;
    const desc = descriptor({
      scenario: scenarioWith({ soupSize: 16_000 }),
      threshold,
      rules: { threshold, tiebreakers: ['peak-population'], bestOf: { seeds: 3, rotate: true } },
    });
    const a = runMatch(desc);
    const b = runMatch(desc);
    // more than one game's worth of live standings were collected (seeds ran)
    assert.ok(a.standings$.length > runMatch(descriptor({ scenario: scenarioWith({ soupSize: 16_000 }), threshold, rules: { threshold, tiebreakers: ['peak-population'] } })).standings$.length);
    return Promise.all([a.result, b.result]).then(([ra, rb]) => {
      assert.deepEqual(ra, rb);           // same config → identical aggregate (deterministic)
      assert.equal(ra.winner, 1);         // the breeder aggregates the win over the inert rival
    });
  });

  it('[RUNNER-013] the match runs via the worker on the authoritative engine; no local simulation (C-VS-VIEW)', () => {
    const { core, calls } = spyCore();
    const m = runMatch(descriptor(), core);
    // The runner drove the worker: version handshake, init (simultaneous injection), then runs.
    assert.ok(calls.includes('createSession'));
    assert.ok(calls.includes('init'));
    assert.ok(calls.includes('run'));
    return m.result.then((r) => assert.equal(r.descriptor.engineVersion, Engine.version));
  });

  it('[RUNNER-014] a generations threshold is only accepted when the engine exposes a generation counter', () => {
    assert.equal(engineHasGenerationCounter(), true); // the engine does (stats().generations)
    const threshold = { kind: 'generations', value: 2 } as const;
    const gDesc = descriptor({ threshold, rules: { threshold, tiebreakers: ['peak-population'] } });
    // accepted (no rejection reason about the counter) and it runs to the generation threshold.
    assert.deepEqual(validateMatch(gDesc).filter((r) => /generation/.test(r)), []);
    return runMatch(gDesc).result.then((r) => {
      assert.ok(r.atGeneration >= 2);
    });
  });

  it('[RUNNER-003b] toRunDescriptor APPLIES symmetric placement — injections carry `at` offsets and land founders there', () => {
    const cfg: MatchConfig = {
      scenario: scenarioWith({ seed: 9 }),
      seed: 4,
      players: [
        { founderId: 1, name: 'Breeder', genome: BREEDER },
        { founderId: 2, name: 'Inert', genome: INERT },
      ],
      rules: { threshold: { kind: 'cycles', value: 10_000 }, tiebreakers: ['peak-population'] },
    };
    const m = buildDescriptor(cfg);                 // placement defaults to { kind: 'even' }
    const rd = toRunDescriptor(m);
    const offsets = placements(m.players.length, m.scenario.soupSize, m.placement);
    assert.deepEqual(offsets, [0, 10_000]);         // even spacing over the 20k soup

    // Each injection carries an `at` (no longer inert): the offsets, assigned in emitted order.
    assert.deepEqual(rd.injections.map((i) => i.at), offsets);
    // Even spacing holds regardless of the (permuted) emission order — the set of `at`s IS the offset set.
    assert.deepEqual([...rd.injections.map((i) => i.at!)].sort((a, b) => a - b), offsets);

    // Injecting them into a fresh Engine lands the founders exactly at those addresses (blocks free at cycle 0).
    const e = new Engine(rd.scenario);
    const starts: number[] = [];
    for (const inj of rd.injections) {
      const id = e.inject(inj.genome, { founderId: inj.founderId, at: inj.at });
      starts.push(e.world.creatures.get(id)!.start);
    }
    assert.deepEqual(starts, rd.injections.map((i) => i.at)); // founders start match the placement offsets
  });

  it('[RUNNER-009b] the record path captures LIVE totalBirths + avgSize per founder; a total-births tie resolves via the recorded observable', () => {
    // Drive the REAL record() over a real engine census (the same worker path runMatch uses).
    const desc = descriptor();
    const rd = toRunDescriptor(desc);
    const core = createWorkerCore();
    core.handle({ type: 'createSession', engineVersion: Engine.version, sessionId: 's' } as never);
    core.handle({ type: 'init', scenario: rd.scenario, injections: rd.injections, sessionId: 's' } as never);

    const players: Player[] = [
      { founderId: 1, name: 'Breeder', genome: BREEDER },
      { founderId: 2, name: 'Inert', genome: INERT },
    ];
    const history = emptyHistory();
    const standings$: never[] = [];

    // Cycle-0 frame (both founders alive) then a threshold frame (breeder has bred). Both fold in.
    const f0 = frameOf(core.handle({ type: 'run', mode: 'budget', nInstructions: 0, sessionId: 's' } as never));
    record(standings$ as unknown as never, history, f0, players);
    const fN = frameOf(core.handle({ type: 'run', mode: 'budget', nInstructions: 40_000, sessionId: 's' } as never));
    record(standings$ as unknown as never, history, fN, players);

    // Non-zero, per founder, straight from the census — not hand-filled.
    assert.ok((history.totalBirths.get(1) ?? 0) > 1, 'breeder recorded many cumulative births');
    assert.ok((history.totalBirths.get(2) ?? 0) >= 1, 'the inert seed itself is one recorded birth');
    assert.ok((history.avgSize.get(1) ?? 0) > 0, 'breeder recorded a live avg genome size');
    assert.ok((history.avgSize.get(2) ?? 0) > 0, 'inert recorded a live avg genome size');
    // The breeder out-breeds the inert rival (a real, ordered observable).
    assert.ok((history.totalBirths.get(1) ?? 0) > (history.totalBirths.get(2) ?? 0));

    // A population tie now resolves via the RECORDED total-births — the history came from record(), not a literal.
    const tied = score(new Map<number, number>([[1, 5], [2, 5]]), players);
    assert.deepEqual(tied.map((s) => s.rank), [1, 1]); // genuine tie on population
    const decided = rank(tied, { threshold: desc.threshold, tiebreakers: ['total-births'] }, history, {
      atCycle: fN.cycles,
      atGeneration: fN.stats.generations,
      descriptor: desc,
    });
    assert.equal(decided.winner, 1);
    assert.equal(decided.tiebreakerUsed, 'total-births');
  });
});
