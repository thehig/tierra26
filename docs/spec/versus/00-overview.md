# Versus Mode — Overview & Architecture (anchor)

**Status:** v1 anchor. Defines the **match model**, the **document set**, cross-cutting
contracts, and conventions for `docs/spec/versus/`. Reuses the doc template + criterion scheme
+ test conventions from the engine anchor
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8. Companion
package **`@tierra26/versus`** (`packages/versus/`) holds the match model, lineage attribution,
runner, and results as pure testable logic (rendering/hotseat UX are the UI layer + design pass).

Upstream: [`SPEC.md`](../SPEC.md) §6 (Versus; local hotseat first), engine
[`08-…reproduction`](../engine/systems/08-creature-lifecycle-and-reproduction.md) /
[`13-statistics`](../engine/systems/13-statistics-and-observation.md) /
[`14-snapshot`](../engine/systems/14-snapshot-and-reproducibility.md) (RunDescriptor/replay),
content [`06-goals`](../content/06-goals-challenges-and-assessment.md) (`rankVersus`, the goal
model this generalizes), UI [`07-shell`](../ui/07-app-shell-and-state.md) (`RunLink` deep links).

---

## 1. What Versus is

A **competitive match**: two or more players each submit a genome; all genomes are **injected
into one shared soup at the same instant** (cycle 0); the soup runs — creatures replicate,
compete for CPU time and space, and (if mutation is on) evolve — until a **threshold** is
reached (a number of cycles or generations); the match is **scored by each player's lineage
population** at that moment. Highest population wins. It is the same authentic engine as
everything else — Versus is a *framing* (players, simultaneous start, a scoring rule), not a
different simulator.

**Local hotseat first** (`SPEC.md` §6): players enter genomes on one machine, then watch one
shared run. Online is a later phase; because a match is fully described by a reproducible
descriptor (§5), it is share/replay-ready from day one.

## 2. The core problem: attributing population to a player

With mutation **on**, a player's descendants diverge in genotype — so "population per player"
**cannot** be scored by genotype. Each creature must instead carry the **founder** it descends
from. This requires a small **engine seam**: a `founderId` (team tag) set on a creature at
injection and **inherited by its daughter on `divide`** (engine [08]), and surfaced in the
observation frame / stats (engine [13]). Attribution is then O(1) per creature. See
[`02-lineage-attribution.md`](02-lineage-attribution.md). *(This is a required engine extension,
tracked as an engine seam — like the ObservationFrame genotype/IP gap the tank raised.)*

## 3. Fairness (a real design concern, not assumed)

"Same instant" is necessary but not sufficient for a fair game. Structural bias can creep in
via **placement** (where in the soup each genome starts) and **scheduling/reaper order** (the
first-injected creature is the oldest → reaped first). Versus addresses this explicitly
(see [`03-match-runner-and-fairness.md`](03-match-runner-and-fairness.md)):
- **Symmetric placement:** players are placed at evenly spaced offsets around the circular soup
  (`soupSize / N` apart), identical local conditions.
- **Seed-randomized order:** injection order and initial slicer-queue order are derived from the
  match seed, not fixed to slot index, so no slot carries a systematic head start.
- **Best-of-N with rotation (recommended for competitive play):** run several seeds with rotated
  positions and aggregate, since a single seeded run cannot be perfectly position-symmetric.
Versus is honest that a single run is not provably unbiased; it minimizes and averages bias
rather than pretending it away.

## 4. Document set

| # | Doc | Code | Responsibility |
|---|---|---|---|
| 00 | this file | VSA | match concept, the attribution problem, fairness, conventions |
| 01 | match-model-and-scoring | MATCH | match config (players, scenario, threshold), population scoring, ranking, ties, results model |
| 02 | lineage-attribution | LINEAGE | founder tags, inherited-on-divide, mutated-descendant attribution, the engine seam |
| 03 | match-runner-and-fairness | RUNNER | simultaneous injection, symmetric placement, determinism, seed order, best-of-N, live standings, replay |

Cross-layer invariants live in `packages/versus/test/_invariants.test.ts` (code **VSINV**).

## 5. Cross-cutting contracts

- **C-VS-DET:** a match is fully described by `MatchDescriptor = {scenario, seed, players[]
  (ordered genomes), placement, threshold, rules}` and replays **bit-identically** for any
  viewer (reuses engine determinism + RunDescriptor).
- **C-VS-SIMULTANEOUS:** all player genomes are injected at **cycle 0**, before any instruction
  executes; no player's code runs before another's is placed.
- **C-VS-ATTRIB:** every live creature is attributed to exactly one founder (or `neutral`); the
  per-founder populations partition the population (Σ + neutral = total).
- **C-VS-VIEW:** Versus runs on the authoritative engine via the worker (C-UI-VIEW); the match
  logic computes scores from frames/stats, never by simulating in the UI.
- **C-VS-SOURCE:** scoring reads engine observables (per-founder population, generations); it
  invents no metric the engine doesn't expose.

## 6. Global invariants (VSINV)
- **VSINV-DET:** the same `MatchDescriptor` yields identical standings and result for any viewer.
- **VSINV-SIMULTANEOUS:** every player's genome is present at cycle 0; the first executed
  instruction sees all founders placed (C-VS-SIMULTANEOUS).
- **VSINV-ATTRIB:** per-founder populations + neutral == total population at every frame
  (partition; C-VS-ATTRIB).
- **VSINV-INHERIT:** a daughter's `founderId` equals its mother's for every birth (attribution
  is preserved across arbitrary lineage depth and genotype drift).
- **VSINV-MIRROR-SEED:** aggregated over the recommended best-of-N rotation, a mirror match
  (all players submit identical genomes) has no player favored beyond seed noise (fairness).

## 7. Conventions
Identical to the engine anchor §8: 9-section doc template, append-only `CODE-NNN` criterion IDs
referenced verbatim in `it.todo('[CODE-NNN] …')` tests (**no `src/` imports yet**),
fidelity/scope tags. One doc + one companion test file per system:
`packages/versus/test/NN-<code>.test.ts`.

## 8. Milestone
Versus is **M4** (after the engine, GeneScript, content, and core UI). Its win-conditions
generalize the content GOAL model (`rankVersus`); its determinism + `RunLink` make online
multiplayer a later drop-in rather than a rewrite.
