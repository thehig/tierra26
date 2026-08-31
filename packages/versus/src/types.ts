// ============================================================================
// @tierra26/versus — SHARED FOUNDATION (single source of every cross-system
// data shape). Locked BEFORE the fleet so MATCH/LINEAGE/RUNNER agree on one
// MatchConfig, MatchResult, MatchDescriptor, Standing, etc.
//
// Deriving layers:
//   - engine  (@tierra26/engine): Scenario, RunDescriptor, Injection, ObservationFrame,
//     FounderCensus — the founderId seam (set at inject, inherited on divide, per-founder
//     census in frames) is ALREADY in the engine; LINEAGE reads frame.founders.
//   - content (@tierra26/content): rankVersus is the shared 2-player scoring core (MATCH-012).
//
// NOTE: `--experimental-strip-types` rejects TS parameter properties/enums — declare class
// fields explicitly; use string-literal unions, not enums.
// ============================================================================

export type {
  Scenario,
  RunDescriptor,
  Injection,
  LiveStats,
} from '../../engine/src/index.ts';
export type { ObservationFrame, FounderCensus } from '../../engine/src/stats.ts';

// ---- Identity --------------------------------------------------------------
export type FounderId = number; // 1..N players; 0 = neutral (LINEAGE)

export interface Player {
  founderId: FounderId;
  name: string;
  genome: string; // GeneScript source (compiled under the scenario subset)
}

// ---- Match rules & scoring (MATCH [01]) ------------------------------------
export type Threshold =
  | { kind: 'cycles'; value: number }        // stop at N executed instructions (in-sim clock)
  | { kind: 'generations'; value: number };  // stop at N elapsed generations (in-sim clock)

export type Tiebreaker =
  | 'peak-population'
  | 'total-births'
  | 'earliest-threshold-lead'
  | 'smaller-avg-size';

export interface MatchRules {
  threshold: Threshold;
  tiebreakers: Tiebreaker[];                 // applied in order; exhausted → 'draw'
  bestOf?: { seeds: number; rotate: boolean }; // fairness aggregation (RUNNER)
}

export interface MatchConfig {
  scenario: import('../../engine/src/index.ts').Scenario;
  seed: number;
  players: Player[];                         // >= 2, distinct founderIds + genomes
  rules: MatchRules;
}

export interface Standing {
  founderId: FounderId;
  name: string;
  population: number;                        // integer live population at/upto threshold
  rank: number;                              // 1-based; equal populations share a rank
}

// Recorded engine observables the tiebreakers read (MATCH-007) — per founder, integer.
export interface MatchHistory {
  peakPopulation: Map<FounderId, number>;         // max live population seen
  totalBirths: Map<FounderId, number>;            // cumulative births
  earliestThresholdLead: Map<FounderId, number>;  // first cycle this founder led (smaller = earlier)
  avgSize: Map<FounderId, number>;                // avg live genome size at threshold
}

export interface MatchResult {
  standings: Standing[];                     // sorted, ranked, ties shared
  winner: FounderId | 'draw';
  atCycle: number;
  atGeneration: number;
  tiebreakerUsed?: Tiebreaker;
  descriptor: MatchDescriptor;               // for replay/share
}

// ---- Runner & fairness (RUNNER [03]) ---------------------------------------
export type Placement =
  | { kind: 'even' }                                 // evenly spaced around the soup
  | { kind: 'even-rotated'; rotation: number }        // even + seed/rotation offset
  | { kind: 'explicit'; offsets: number[] };          // testing / custom

// S16: a MatchDescriptor is a SUPERSET recipe that DERIVES a RunDescriptor (toRunDescriptor):
// it resolves each player's GeneScript + placement into the engine Injection list (founderId
// stamped) and folds seed into scenario.seed. It has its own share payload (VersusLink) — the
// UI sandbox RunLink cannot carry players/threshold.
export interface MatchDescriptor {
  scenario: import('../../engine/src/index.ts').Scenario; // seed lives at scenario.seed (S14)
  players: { founderId: FounderId; genome: string }[];    // ordered; genome is GeneScript
  placement: Placement;
  threshold: Threshold;
  rules: MatchRules;
  engineVersion: string;
}

export interface VersusLink { match: MatchDescriptor; } // Versus's own shareable deep-link (≠ RunLink)

export interface LiveStanding {
  cycle: number;
  generation: number;
  standings: Standing[];
}

// ---- small shared helper ---------------------------------------------------
// Read per-founder live populations from a frame's census (0 = neutral). Pure.
export function foundersFromCensus(census: import('../../engine/src/stats.ts').FounderCensus): Map<FounderId, number> {
  const m = new Map<FounderId, number>();
  for (let id = 0; id < census.counts.length; id++) {
    const n = census.counts[id]!;
    if (n > 0) m.set(id, n);
  }
  return m;
}
