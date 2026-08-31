# Match Runner & Fairness — Engineering Spec (Code: RUNNER · Milestone: M4)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§5: C-VS-DET,
C-VS-SIMULTANEOUS, C-VS-VIEW). Conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Consumes: engine [`15-api`](../engine/systems/15-engine-api-and-scenarios.md) (inject/run/replay),
[`14-snapshot`](../engine/systems/14-snapshot-and-reproducibility.md) (RunDescriptor),
UI [`01-worker-protocol`](../ui/01-worker-protocol.md) (runs in a worker session),
[`01-match`](01-match-model-and-scoring.md), [`02-lineage`](02-lineage-attribution.md).

---

## 1. Purpose & responsibility

Runs a match: builds one shared soup, **places and injects every player's genome at cycle 0**
(fairly), runs the engine to the threshold, records the per-founder census over time (live
standings), and produces the reproducible result. It owns the **fairness** mechanics
(placement, order) and the **determinism/replay** guarantees. It runs on the authoritative
engine via the worker (C-VS-VIEW) — it schedules and scores, it does not re-implement the sim.

## 2. Interfaces

```ts
import type { Scenario } from '@tierra26/engine';                 // (future)
import type { MatchConfig, MatchResult, Standing } from './match';

// S16: a MatchDescriptor is NOT a RunDescriptor — it is a superset recipe that DERIVES one
// (via toRunDescriptor below): it resolves each player's GeneScript genome + placement offset into
// the engine's Injection list (founderId stamped) and folds seed into scenario.seed. It has its own
// share payload `VersusLink` (the UI sandbox `RunLink` [ui/07] cannot carry players/threshold).
interface MatchDescriptor {                                        // the reproducible recipe (00 §5)
  scenario: Scenario;                                             // seed lives at scenario.seed (S14)
  players: { founderId: number; genome: string }[];               // ordered; genome is GeneScript
  placement: Placement; threshold: MatchConfig['rules']['threshold'];
  rules: MatchConfig['rules']; engineVersion: string;
}
interface VersusLink { match: MatchDescriptor; }                   // Versus's own shareable deep-link (≠ RunLink)
function toRunDescriptor(m: MatchDescriptor): RunDescriptor;       // compile+place players → Injection[]; pure
function resolveScenario(scenarioId: string): Scenario;           // scenarioId → Scenario (content/preset registry)

type Placement =
  | { kind: 'even'; }                                              // evenly spaced around the soup
  | { kind: 'even-rotated'; rotation: number; }                    // even + seed/rotation offset
  | { kind: 'explicit'; offsets: number[]; };                      // testing / custom

interface LiveStanding { cycle: number; generation: number; standings: Standing[]; }

function buildDescriptor(cfg: MatchConfig): MatchDescriptor;       // pure
function placements(n: number, soupSize: number, p: Placement): number[]; // pure, symmetric
function runMatch(desc: MatchDescriptor, engine: WorkerSession): AsyncMatch; // drives the worker
interface AsyncMatch { standings$: LiveStanding[]; result: Promise<MatchResult>; }
```

## 3. Data structures
- **`MatchDescriptor`** — the full, reproducible recipe (scenario+seed+ordered players+placement+
  threshold+rules+engineVersion); the unit of share/replay and a superset of the engine
  `RunDescriptor` (adds players/placement/threshold). Serializes to a `VersusLink` (its own payload; the UI sandbox `RunLink` cannot carry players).
- **`Placement`** — how founders are positioned; `even` is the fair default.
- **`LiveStanding`** — a standings snapshot per observed frame (drives the live scoreboard).

## 4. Behavior / algorithms
- **Simultaneous injection (C-VS-SIMULTANEOUS):** before running any instruction, the Runner
  injects **all** player genomes at their placement offsets, each stamped with its `founderId`
  (LINEAGE [02]). The first executed instruction sees every founder already present
  (VSINV-SIMULTANEOUS). Genomes are compiled (GeneScript) under the scenario's subset first; a
  genome that fails to compile is rejected before the match starts (never mid-run).
- **Symmetric placement (fairness):** `placements(n, soupSize, 'even')` returns offsets
  `round(i * soupSize / n)` — evenly spaced around the circular soup, identical local conditions,
  no overlap (soup large enough for N genomes). Pure and deterministic.
- **Order de-biasing:** the injection order and the initial slicer-queue order are a
  **seed-derived permutation** of the players, not fixed to slot index, so no slot is
  structurally "oldest"/first every match. (§3 of the anchor: a single seeded run can't be
  perfectly position-symmetric; this removes the systematic component.)
- **Best-of-N with rotation (recommended competitive mode):** `rules.bestOf` runs `seeds` matches
  with `even-rotated` placement (rotating which founder sits at which offset) and aggregates
  (match wins, then aggregate population). Deterministic given the base seed.
- **Run to threshold:** drive the worker `run` until `threshold` (cycles or generations) is
  reached; on each observed frame, compute `attribute(frame)` [02] → a `LiveStanding` for the
  scoreboard; at the threshold, call `score`/`rank` [01] → `MatchResult`.
- **Determinism/replay (C-VS-DET):** `runMatch(desc)` reproduces bit-identically for any viewer;
  `MatchDescriptor` → `Engine.replay`-style reconstruction; the live standings sequence is
  identical too (a shared match link replays exactly).
- **Local hotseat flow:** players enter genomes sequentially (UI), the Runner assembles the
  `MatchConfig`, then runs one shared match; nothing about entry order affects fairness beyond
  the seed-derived de-biasing.

## 5. Interconnections
- **UI [01] Worker** — the match runs in a worker session (C-VS-VIEW).
- **[02] LINEAGE** — founder stamping at injection + per-founder census each frame.
- **[01] MATCH** — scoring/ranking at the threshold; live standings shape.
- **engine [14/15]** — RunDescriptor/replay + inject/run.
- **UI [07] Shell** — `VersusLink` share/deep-link (its versus route); scoreboard renders
  `standings$`.

## 6. Determinism & edge cases
- `placements`/`buildDescriptor` are pure; `runMatch` is deterministic given the descriptor.
- Soup too small for N genomes at even spacing → config rejected (clear error) before start.
- A non-compiling genome → rejected pre-match (VSINV-SIMULTANEOUS preserved: no partial start).
- Threshold reached mid-slice → stop deterministically at the exact cycle boundary (define the
  stop as "after the instruction that reaches the threshold").
- `generations` threshold requires the engine generation counter (engine [13]); if undefined,
  only `cycles` thresholds are allowed.
- Best-of-N with an even number of players and symmetric genomes can still draw — reported as
  such.

## 7. Fidelity notes
- **[CORE]** simultaneous injection + symmetric placement + deterministic replay (the fairness &
  reproducibility spine).
- **[CORE]** runs on the authoritative engine via the worker (C-VS-VIEW) — no re-sim.
- **[MOD]** seed-derived order de-biasing and best-of-N are product fairness measures, honest
  about single-run asymmetry.
- **[OPTIONAL]** online/networked matches — `MatchDescriptor` + determinism make server-
  authoritative Versus a later drop-in (reuses the same runner server-side).

## 8. Acceptance criteria
- **RUNNER-001** All player genomes are injected at cycle 0 before any instruction runs
  (C-VS-SIMULTANEOUS / VSINV-SIMULTANEOUS).
- **RUNNER-002** Each injected seed creature is stamped with its `founderId` (LINEAGE).
- **RUNNER-003** `placements(n, soupSize, 'even')` returns `round(i*soupSize/n)` — evenly spaced,
  non-overlapping, pure.
- **RUNNER-004** Injection/initial-scheduling order is a seed-derived permutation, not fixed to
  slot index (order de-biasing).
- **RUNNER-005** `buildDescriptor` is pure and captures scenario+seed+players+placement+threshold+
  rules+engineVersion.
- **RUNNER-006** `runMatch(desc)` reproduces identical live standings + result for any viewer
  (VSINV-DET).
- **RUNNER-007** A `MatchDescriptor` round-trips to/from a `VersusLink`, and `toRunDescriptor(m)` yields a valid engine `RunDescriptor` (S16).
- **RUNNER-008** The match stops deterministically at the threshold cycle/generation.
- **RUNNER-009** Each observed frame yields a `LiveStanding` via `attribute` [02] for the
  scoreboard.
- **RUNNER-010** A genome that fails to compile is rejected before the match starts (no partial
  start).
- **RUNNER-011** A soup too small for N even-spaced genomes is rejected with a clear error.
- **RUNNER-012** `best-of-N` runs the configured seeds with rotated placement and aggregates
  deterministically.
- **RUNNER-013** The match runs via the worker on the authoritative engine; the Runner performs
  no local simulation (C-VS-VIEW).
- **RUNNER-014** A `generations` threshold is only accepted when the engine exposes a generation
  counter.

## 9. Open questions
1. Exact order-de-biasing permutation (which seed stream, applied to injection and/or slicer
   queue) — settle with engine [09] scheduler.
2. Best-of-N aggregation rule (match-wins then total-population vs sum-of-populations).
3. Minimum soup-size / spacing guard as a function of expected genome sizes.
4. Mid-match join/leave (out of scope for hotseat; relevant to online later).
