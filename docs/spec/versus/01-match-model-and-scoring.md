# Match Model & Scoring — Engineering Spec (Code: MATCH · Milestone: M4)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§5: C-VS-DET, C-VS-ATTRIB,
C-VS-SOURCE). Conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Consumes: content [`06-goals`](../content/06-goals-challenges-and-assessment.md) (`rankVersus`,
the goal this generalizes), engine [`13-statistics`](../engine/systems/13-statistics-and-observation.md)
(per-founder population, generations), [`02-lineage-attribution`](02-lineage-attribution.md)
(founder ids), [`03-match-runner`](03-match-runner-and-fairness.md) (how a match is run).

---

## 1. Purpose & responsibility

Defines **what a match is** and **how it is scored**: the match configuration (players, shared
scenario, the win threshold), the scoring rule (each player's **lineage population** at the
threshold), ranking, tie handling, and the results data model (final + live standings). It is
pure logic over engine observables — it computes scores from stats, it does not run the sim
(that is the Runner [03]).

## 2. Interfaces

```ts
import type { Scenario } from '@tierra26/engine';         // (future)

type FounderId = number;                                  // 1..N; 0 = neutral (see LINEAGE)

interface Player { founderId: FounderId; name: string; genome: string; /* GeneScript */ }

type Threshold =
  | { kind: 'cycles'; value: number }                     // stop at N executed instructions
  | { kind: 'generations'; value: number };               // stop at N elapsed generations

interface MatchRules {
  threshold: Threshold;
  tiebreakers: Tiebreaker[];                               // applied in order; else 'draw'
  bestOf?: { seeds: number; rotate: boolean };             // fairness aggregation (RUNNER)
}
type Tiebreaker = 'peak-population' | 'total-births' | 'earliest-threshold-lead' | 'smaller-avg-size';

interface MatchConfig {
  scenario: Scenario;                                     // soup size, mutation on/off, subset, etc.
  seed: number;
  players: Player[];                                      // >= 2
  rules: MatchRules;
}

// Scoring reads the per-founder population the engine exposes at (or up to) the threshold.
interface Standing { founderId: FounderId; name: string; population: number; rank: number; }
interface MatchResult {
  standings: Standing[];                                  // sorted, ranked, ties shared
  winner: FounderId | 'draw';
  atCycle: number; atGeneration: number;
  tiebreakerUsed?: Tiebreaker;
  descriptor: MatchDescriptor;                            // for replay/share (00 §5)
}

function score(perFounderPopulation: Map<FounderId, number>, players: Player[]): Standing[]; // pure
function rank(standings: Standing[], rules: MatchRules, history: MatchHistory): MatchResult;  // pure
```

## 3. Data structures
- **`Player`** — a founder id (assigned by slot at match build), a display name, and a GeneScript
  genome (compiled by the Runner).
- **`Threshold`** — `cycles` or `generations` (both deterministic in-sim clocks; **never
  wall-clock** — C-VS-DET). `generations` reads the engine's generation counter.
- **`MatchRules`** — threshold + ordered tiebreakers (default → `draw`) + optional best-of-N.
- **`MatchResult`** — ranked standings, winner (or `draw`), the stop point, and the reproducible
  `MatchDescriptor`.

## 4. Behavior / algorithms
- **Scoring rule (the user's rule):** at the threshold, each player's score = **count of live
  creatures whose `founderId` is that player** (per-founder population from stats [13] via
  LINEAGE [02]). `neutral` (founder 0) creatures — e.g. any not descended from a player — do not
  score. `score()` is pure over the per-founder population map.
- **Ranking:** sort by descending population; equal populations share a rank and trigger
  **tiebreakers** in `rules.tiebreakers` order (peak population over the run, total births,
  who first reached a lead, smaller average size); if all tie → `winner:'draw'`. All tiebreaker
  inputs come from engine observables recorded over the run (`MatchHistory`), keeping it
  deterministic (C-VS-SOURCE).
- **Threshold detection:** the Runner [03] stops the sim exactly at the threshold cycle/
  generation and hands the final per-founder populations to `score`; `atCycle`/`atGeneration`
  record the stop point.
- **Extinction / early end:** if only one founder has live population before the threshold, the
  match may end early with that founder the winner (configurable); a total wipe-out (all
  founders extinct) ranks by the last-nonzero standings / peak (tiebreaker).
- **Generalizes content GOAL:** the win rule is an `out-populate`-style goal evaluated over a
  shared scenario — `rank` may delegate to content `rankVersus` [content 06] so lessons and
  Versus share one scoring core.

## 5. Interconnections
- **[02] LINEAGE** — supplies per-founder attribution the score reads.
- **[03] RUNNER** — runs the sim to the threshold, records `MatchHistory`, calls `score`/`rank`.
- **engine [13] Statistics** — per-founder population + generations (requires the founder-tag
  stat extension, LINEAGE §engine-seam).
- **content [06] Goals** — `rankVersus`/`out-populate` scoring core reused.
- **UI [07] Shell / scoreboard** — renders standings; `MatchDescriptor` → `RunLink` share.

## 6. Determinism & edge cases
- `score`/`rank` are pure: same inputs → same result.
- Threshold in `generations` requires a defined, deterministic generation counter (engine [13]).
- Ties with no configured tiebreaker → `draw`.
- A player whose genome never replicates scores its initial 1 (or 0 if it died) — inert genomes
  simply lose.
- Population counts are integers (no float scoring).
- `bestOf` aggregation (RUNNER) combines per-seed results (e.g. most match wins, then total
  population) — deterministic.

## 7. Fidelity notes
- **[CORE]** scoring reads authentic engine population (C-VS-SOURCE); Versus does not alter the
  simulation, only frames + scores it.
- **[MOD]** the match/ranking model is new product logic atop the engine.
- **[OPTIONAL]** alternate win rules (territory/soup-share, efficiency, survival-time) — the
  `Threshold`/scoring interfaces are shaped to admit them later.

## 8. Acceptance criteria
- **MATCH-001** A `MatchConfig` requires ≥2 players, each with a distinct `founderId` and a
  genome; invalid configs are rejected.
- **MATCH-002** `Threshold` is `cycles` or `generations` — both in-sim clocks, never wall-clock.
- **MATCH-003** `score` = per-founder live population from stats; `neutral` (founder 0) does not
  score.
- **MATCH-004** `score`/`rank` are pure functions (same inputs → same standings/result).
- **MATCH-005** Ranking sorts by descending population; equal populations share a rank.
- **MATCH-006** Tiebreakers apply in configured order; exhausted ties → `winner:'draw'`.
- **MATCH-007** Tiebreaker inputs come from recorded engine observables (deterministic).
- **MATCH-008** The result records `atCycle`/`atGeneration` (the stop point) and the
  `MatchDescriptor` for replay.
- **MATCH-009** An inert (never-replicating) genome scores its surviving count (loses), no crash.
- **MATCH-010** Total extinction ranks by peak/last-nonzero standings (no undefined winner).
- **MATCH-011** All scores are integers.
- **MATCH-012** The scoring core matches content `rankVersus` for the same inputs (shared logic).

## 9. Open questions
1. Default tiebreaker order (proposed: peak-population → total-births → smaller-avg-size → draw).
2. Early-end policy (stop when one founder remains?) as a default vs opt-in.
3. Whether `generations` or `cycles` is the default threshold for kid matches (cycles is simpler
   to explain; generations is more "biological").
