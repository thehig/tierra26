// Match Runner & Fairness (RUNNER) — schedules & scores a Versus match on the AUTHORITATIVE
// engine via the UI worker (C-VS-VIEW): it places+injects every player's genome at cycle 0,
// runs to the threshold, records live standings per observed frame, and produces the reproducible
// MatchResult. It owns the fairness mechanics (symmetric placement, seed-derived order de-biasing,
// best-of-N) and the determinism/replay guarantees. It NEVER re-implements the sim — the only
// simulation is the worker driving a real Engine; everything else here is a pure helper.
//
// Ref: docs/spec/versus/03-match-runner-and-fairness.md (§2 interfaces, §4 rules, §8 RUNNER-001..014).
//
// strip-types note: no parameter properties / enums / decorators / namespaces — plain functions,
// explicit fields, `import type` for types.

import type {
  MatchConfig,
  MatchDescriptor,
  MatchResult,
  MatchRules,
  MatchHistory,
  Standing,
  LiveStanding,
  Placement,
  Player,
  Threshold,
  VersusLink,
  FounderId,
  Scenario,
  RunDescriptor,
  Injection,
  ObservationFrame,
} from './types.ts';

import { score, rank } from './match.ts';
import { attribute } from './lineage.ts';

import { Engine } from '../../engine/src/index.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';
import { makeRng } from '../../engine/src/rng.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';

import { compile } from '../../genescript/src/comp.ts';
import { hasErrors } from '../../genescript/src/types.ts';

import { createWorkerCore } from '../../ui/src/worker-core.ts';
import type { WorkerCore } from '../../ui/src/worker-core.ts';
import type { WorkerEvent, HostCommand, SessionId } from '../../ui/src/protocol.ts';

// ---------------------------------------------------------------------------
// AsyncMatch (§2) — the live scoreboard stream + the eventual result. The worker
// core is synchronous, so `result` is an already-resolved Promise.
// ---------------------------------------------------------------------------
export interface AsyncMatch {
  standings$: LiveStanding[];
  result: Promise<MatchResult>;
}

const SESSION: SessionId = 'versus';

// How many observation frames to collect over a cycles-threshold run (the live scoreboard cadence;
// presentation only — it never changes the deterministic stop point).
const CYCLE_FRAMES = 8;
// Instructions advanced per observation while waiting on a generations threshold.
const GEN_CHUNK = 5_000;
// Safety bound on the generations wait loop (deterministic; broken earlier on extinction).
const GEN_GUARD = 100_000;

// ---------------------------------------------------------------------------
// Seed folding & the seed-derived order-de-biasing permutation (RUNNER-004).
// ---------------------------------------------------------------------------

/** Fold two uint32 seeds into one, deterministically (S14 — cfg.seed into scenario.seed). */
function foldSeed(a: number, b: number): number {
  let x = ((a >>> 0) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (b >>> 0), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

/**
 * A seed-derived permutation of [0..n-1] — a seeded Fisher–Yates over the engine RNG
 * (never Math.random). Drives the injection / initial-scheduling order so no slot is
 * structurally "first" every match (order de-biasing, RUNNER-004).
 */
export function seededPermutation(n: number, seed: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const rng = makeRng(seed >>> 0);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Placement (RUNNER-003) — PURE, symmetric offsets around the circular soup.
// ---------------------------------------------------------------------------
/**
 * placements(n, soupSize, p) — evenly-spaced, non-overlapping founder offsets.
 *  - even:          round(i * soupSize / n) for i in 0..n-1
 *  - even-rotated:  even + rotation, wrapped modulo soupSize
 *  - explicit:      the given offsets verbatim
 * Pure and deterministic; no side effects.
 */
export function placements(n: number, soupSize: number, p: Placement): number[] {
  if (p.kind === 'explicit') return p.offsets.slice();
  const rotation = p.kind === 'even-rotated' ? p.rotation : 0;
  const out: number[] = [];
  const size = Math.max(1, soupSize);
  for (let i = 0; i < n; i++) {
    const even = Math.round((i * soupSize) / n);
    out.push(((even + rotation) % size + size) % size);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Active instruction set resolution (through the scenario subset).
// ---------------------------------------------------------------------------
function activeSetOf(is: Scenario['instructionSet']): InstructionSet {
  if (is === 'classic32') return classic32;
  return buildSubset(is.name ?? 'subset', is.include);
}

// ---------------------------------------------------------------------------
// buildDescriptor (RUNNER-005) — PURE. Fold cfg.seed into scenario.seed (S14) and
// capture scenario+seed+players+placement+threshold+rules+engineVersion.
// ---------------------------------------------------------------------------
export function buildDescriptor(cfg: MatchConfig): MatchDescriptor {
  const scenario: Scenario = { ...cfg.scenario, seed: foldSeed(cfg.scenario.seed, cfg.seed) };
  const placement: Placement = { kind: 'even' }; // fair default (rules carry no placement)
  return {
    scenario,
    players: cfg.players.map((p) => ({ founderId: p.founderId, genome: p.genome })),
    placement,
    threshold: cfg.rules.threshold,
    rules: cfg.rules,
    engineVersion: Engine.version,
  };
}

// ---------------------------------------------------------------------------
// toRunDescriptor (RUNNER-007 / S16) — PURE. Compile every player's GeneScript under
// the scenario's active set into an Injection[] (all at cycle 0 — SIMULTANEOUS), in a
// seed-derived permutation order (order de-biasing), fold nothing further (the descriptor's
// scenario.seed is already the authoritative folded seed), and pick a run budget.
// ---------------------------------------------------------------------------
export function toRunDescriptor(m: MatchDescriptor): RunDescriptor {
  const active = activeSetOf(m.scenario.instructionSet);
  const order = seededPermutation(m.players.length, m.scenario.seed);
  const injections: Injection[] = [];
  for (const i of order) {
    const p = m.players[i]!;
    const { bytes, diagnostics } = compile(p.genome, active);
    if (hasErrors(diagnostics)) {
      throw new Error(`genome for founder ${p.founderId} failed to compile`);
    }
    injections.push({ atCycle: 0, genome: bytes, founderId: p.founderId });
  }
  const cycles =
    m.threshold.kind === 'cycles' ? m.threshold.value : runBudgetForGenerations(m.threshold.value);
  return { engineVersion: m.engineVersion, scenario: m.scenario, injections, cycles };
}

// A generations threshold has no fixed cycle count; give the RunDescriptor a bounded budget so a
// direct Engine.replay is well-defined. runMatch itself watches the live generation counter instead.
function runBudgetForGenerations(generations: number): number {
  return Math.max(1, generations) * 50_000;
}

// ---------------------------------------------------------------------------
// VersusLink round-trip (RUNNER-007) — JSON deep-link; genome strings preserved.
// ---------------------------------------------------------------------------
export function serializeVersusLink(link: VersusLink): string {
  return JSON.stringify(link);
}

export function parseVersusLink(s: string): VersusLink | null {
  try {
    const o = JSON.parse(s) as unknown;
    if (o === null || typeof o !== 'object') return null;
    const m = (o as { match?: unknown }).match as MatchDescriptor | undefined;
    if (!m || typeof m !== 'object') return null;
    if (!m.scenario || !Array.isArray(m.players) || !m.threshold || !m.rules || !m.placement) return null;
    if (typeof m.engineVersion !== 'string') return null;
    return { match: m };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation guards (reject BEFORE any match starts — no partial start).
// ---------------------------------------------------------------------------

/** True when the engine exposes an integer generation counter (RUNNER-014). */
export function engineHasGenerationCounter(): boolean {
  try {
    return Number.isInteger(new Engine({}).stats().generations);
  } catch {
    return false;
  }
}

/**
 * validateMatch — the reasons a MatchDescriptor cannot start ([] = ok). PURE.
 *  - RUNNER-010: any genome that fails to compile.
 *  - RUNNER-011: a soup too small for N even-spaced, non-overlapping genomes.
 *  - RUNNER-014: a generations threshold when the engine has no generation counter.
 */
export function validateMatch(desc: MatchDescriptor): string[] {
  const reasons: string[] = [];
  const n = desc.players.length;
  if (n < 2) reasons.push('a match needs at least 2 players');

  const active = activeSetOf(desc.scenario.instructionSet);
  const sizes: number[] = [];
  for (const p of desc.players) {
    const { bytes, diagnostics } = compile(p.genome, active);
    if (hasErrors(diagnostics)) {
      reasons.push(`genome for founder ${p.founderId} does not compile`);
      sizes.push(0);
    } else {
      sizes.push(bytes.length);
    }
  }

  // Even spacing gives each founder a gap of floor(soupSize / n); a genome larger than its gap
  // would overlap its neighbour — the soup is too small for N even-spaced genomes.
  const gap = Math.floor(desc.scenario.soupSize / Math.max(1, n));
  const biggest = sizes.reduce((a, b) => Math.max(a, b), 0);
  if (biggest > gap) {
    reasons.push(
      `soup too small for ${n} even-spaced genomes: gap ${gap} < largest genome ${biggest} (soupSize ${desc.scenario.soupSize})`,
    );
  }

  if (desc.threshold.kind === 'generations' && !engineHasGenerationCounter()) {
    reasons.push('a generations threshold requires the engine generation counter, which is unavailable');
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// runMatch (RUNNER-006/008/009/013) — drive the worker on the authoritative engine.
// ---------------------------------------------------------------------------
export function runMatch(desc: MatchDescriptor, core?: WorkerCore): AsyncMatch {
  const reasons = validateMatch(desc);
  if (reasons.length > 0) {
    // Reject before any match starts — no partial start (RUNNER-010/011/014).
    throw new Error(`cannot start match: ${reasons.join('; ')}`);
  }
  if (desc.rules.bestOf && desc.rules.bestOf.seeds > 1) {
    return runBestOf(desc, core);
  }
  return runSingle(desc, core);
}

function playersOf(desc: MatchDescriptor): Player[] {
  return desc.players.map((p) => ({ founderId: p.founderId, name: `founder-${p.founderId}`, genome: p.genome }));
}

function emptyHistory(): MatchHistory {
  return {
    peakPopulation: new Map(),
    totalBirths: new Map(),
    earliestThresholdLead: new Map(),
    avgSize: new Map(),
  };
}

// Advance the session by `nInstructions` and return the single frame the worker emits (or null).
function observeOnce(core: WorkerCore, nInstructions: number): ObservationFrame | null {
  const cmd = { type: 'run', mode: 'budget', nInstructions, sessionId: SESSION } as unknown as HostCommand;
  const events = core.handle(cmd);
  for (const e of events) {
    if ((e as { type: string }).type === 'frame') return (e as unknown as { frame: ObservationFrame }).frame;
  }
  return null;
}

// Record one observed frame → a LiveStanding, and fold it into the running MatchHistory.
function record(standings$: LiveStanding[], history: MatchHistory, frame: ObservationFrame, players: Player[]): void {
  const pop = attribute(frame); // per-founder live population (neutral 0 included; score ignores it)
  const standings = score(pop, players);
  standings$.push({ cycle: frame.cycles, generation: frame.stats.generations, standings });
  for (const p of players) {
    if (p.founderId === 0) continue;
    const v = pop.get(p.founderId) ?? 0;
    history.peakPopulation.set(p.founderId, Math.max(history.peakPopulation.get(p.founderId) ?? 0, v));
  }
  const leaders = standings.filter((s) => s.rank === 1 && s.population > 0);
  if (leaders.length === 1) {
    const id = leaders[0]!.founderId;
    if (!history.earliestThresholdLead.has(id)) history.earliestThresholdLead.set(id, frame.cycles);
  }
}

function runSingle(desc: MatchDescriptor, core?: WorkerCore): AsyncMatch {
  const { standings$, result } = runSingleCore(desc, core);
  return { standings$, result: Promise.resolve(result) };
}

// The worker core is synchronous, so a single match resolves immediately; this returns the concrete
// standings + result so best-of aggregation can consume them without awaiting a Promise.
function runSingleCore(desc: MatchDescriptor, core?: WorkerCore): { standings$: LiveStanding[]; result: MatchResult } {
  const c = core ?? createWorkerCore();
  const rd = toRunDescriptor(desc);
  const players = playersOf(desc);

  // Version handshake, then init injects ALL genomes at cycle 0 (simultaneous, founder-stamped).
  c.handle({ type: 'createSession', engineVersion: desc.engineVersion, sessionId: SESSION });
  c.handle({ type: 'init', scenario: rd.scenario, injections: rd.injections, sessionId: SESSION });

  const standings$: LiveStanding[] = [];
  const history = emptyHistory();

  // Cycle-0 observation — the frame BEFORE any instruction runs (all founders present; RUNNER-001/002).
  let last = observeOnce(c, 0);
  if (last) record(standings$, history, last, players);

  if (desc.threshold.kind === 'cycles') {
    const target = desc.threshold.value;
    const chunk = Math.max(1, Math.floor(target / CYCLE_FRAMES));
    let cyc = last ? last.cycles : 0;
    while (cyc < target) {
      const step = Math.min(chunk, target - cyc);
      const f = observeOnce(c, step);
      if (!f || f.cycles <= cyc) break; // no progress (e.g. extinction) — stop deterministically
      cyc = f.cycles;
      record(standings$, history, f, players);
      last = f;
    }
  } else {
    const target = desc.threshold.value;
    let gen = last ? last.stats.generations : 0;
    let cyc = last ? last.cycles : 0;
    let guard = 0;
    while (gen < target && guard++ < GEN_GUARD) {
      const f = observeOnce(c, GEN_CHUNK);
      if (!f || f.cycles <= cyc) break; // no progress — stop deterministically
      cyc = f.cycles;
      gen = f.stats.generations;
      record(standings$, history, f, players);
      last = f;
    }
  }

  const finalPop = last ? attribute(last) : new Map<FounderId, number>();
  const finalStandings = score(finalPop, players);
  const result = rank(finalStandings, desc.rules, history, {
    atCycle: last ? last.cycles : 0,
    atGeneration: last ? last.stats.generations : 0,
    descriptor: desc,
  });

  return { standings$, result };
}

// ---------------------------------------------------------------------------
// Best-of-N with rotation (RUNNER-012) — run `seeds` games with rotated placement and a
// per-game seed, then aggregate deterministically (match wins, tiebroken by aggregate population).
// ---------------------------------------------------------------------------
function runBestOf(desc: MatchDescriptor, core?: WorkerCore): AsyncMatch {
  const bestOf = desc.rules.bestOf!;
  const players = playersOf(desc);
  const n = desc.players.length;
  const slot = Math.max(1, Math.round(desc.scenario.soupSize / n));

  const standings$: LiveStanding[] = [];
  const wins = new Map<FounderId, number>();
  const aggPop = new Map<FounderId, number>();
  let atCycle = 0;
  let atGeneration = 0;

  for (let k = 0; k < bestOf.seeds; k++) {
    const gameSeed = foldSeed(desc.scenario.seed, k);
    const rotation = bestOf.rotate ? (k * slot) % Math.max(1, desc.scenario.soupSize) : 0;
    const gameDesc: MatchDescriptor = {
      ...desc,
      scenario: { ...desc.scenario, seed: gameSeed },
      placement: { kind: 'even-rotated', rotation },
      // drop bestOf so each game is a single deterministic match (no recursion)
      rules: { threshold: desc.rules.threshold, tiebreakers: desc.rules.tiebreakers },
    };
    // The synchronous worker resolves each game immediately (concrete result, no await).
    const game = runSingleCore(gameDesc, core);
    for (const ls of game.standings$) standings$.push(ls);
    const gr = game.result;
    if (gr.winner !== 'draw') wins.set(gr.winner, (wins.get(gr.winner) ?? 0) + 1);
    for (const s of gr.standings) aggPop.set(s.founderId, (aggPop.get(s.founderId) ?? 0) + s.population);
    atCycle = gr.atCycle;
    atGeneration = gr.atGeneration;
  }

  const winner = decideBestOf(players, wins, aggPop);
  const aggStandings = score(aggPop, players);
  const result: MatchResult = {
    standings: aggStandings,
    winner,
    atCycle,
    atGeneration,
    tiebreakerUsed: undefined,
    descriptor: desc,
  };
  return { standings$, result: Promise.resolve(result) };
}

// Aggregate winner: most match wins; tiebreak by aggregate population; else 'draw' (RUNNER-012).
function decideBestOf(players: Player[], wins: Map<FounderId, number>, aggPop: Map<FounderId, number>): FounderId | 'draw' {
  const ids = players.filter((p) => p.founderId !== 0).map((p) => p.founderId);
  if (ids.length === 0) return 'draw';
  let maxW = -1;
  for (const id of ids) maxW = Math.max(maxW, wins.get(id) ?? 0);
  const winCands = ids.filter((id) => (wins.get(id) ?? 0) === maxW);
  if (maxW > 0 && winCands.length === 1) return winCands[0]!;
  // tie on wins (or every game a draw) → break by aggregate population over the tied candidates
  const cands = maxW > 0 ? winCands : ids;
  let maxP = -1;
  for (const id of cands) maxP = Math.max(maxP, aggPop.get(id) ?? 0);
  const popCands = cands.filter((id) => (aggPop.get(id) ?? 0) === maxP);
  return popCands.length === 1 ? popCands[0]! : 'draw';
}
