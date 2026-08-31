# Lineage Attribution — Engineering Spec (Code: LINEAGE · Milestone: M4)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§5: C-VS-ATTRIB, C-VS-DET,
C-VS-SOURCE). Conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
**Defines a required engine extension** (a founder tag) and consumes engine
[`08-…reproduction`](../engine/systems/08-creature-lifecycle-and-reproduction.md) (parentId,
divide) and [`13-statistics`](../engine/systems/13-statistics-and-observation.md).

---

## 1. Purpose & responsibility

Answers "**which player does this creature belong to?**" — the crux of scoring a Versus match
when mutation makes descendants diverge in genotype. It defines the **founder tag**: an id set
on each creature at injection and **inherited by its daughter on every `divide`**, so a player's
whole lineage — however mutated — stays attributable in O(1). It owns the attribution rules,
the neutral case, and the per-founder population aggregation the scoreboard reads.

## 2. The engine seam (required extension)

Attribution cannot be done purely in Versus-land; it needs one small, general engine addition
(tracked like the tank's ObservationFrame gap):

- **`Creature.founderId: number`** (engine [08]) — default `0` (neutral).
- **Set at injection:** the Engine API `inject(genome, { founderId })` stamps it (engine [15]).
- **Inherited on divide:** in the `divide` handler, `daughter.founderId = mother.founderId`
  (engine [08] REPRO) — the one line that makes attribution survive arbitrary depth + mutation.
- **Exposed in stats/frames:** the `ObservationFrame`/`LiveStats` carry **per-founder population**
  (a small `Map<founderId, count>` or fixed-N array), maintained incrementally on birth/death
  (engine [13]).

The tag is **inert to the simulation** — it never changes what a creature does or how selection
works; it is pure bookkeeping, so adding it cannot alter evolutionary dynamics (fidelity-safe).

## 3. Interfaces

```ts
type FounderId = number;                                   // 0 = neutral; 1..N = players

// Consumed from engine frames (after the extension above):
interface FounderCensus { perFounder: Map<FounderId, number>; total: number; }

function attribute(frame: ObservationFrame): FounderCensus;          // pure read of frame tags
function isPartition(c: FounderCensus): boolean;                     // Σ perFounder == total
```

## 4. Behavior / algorithms
- **Injection stamping:** the Runner [03] injects each player's genome with its `founderId`; that
  founder tags the seed creature.
- **Inheritance:** every `divide` copies the mother's `founderId` to the daughter. A creature's
  founder therefore equals the founder of its lineage's seed, for any lineage depth — no chain
  walking, no dependence on now-dead ancestors (VSINV-INHERIT).
- **Genotype independence:** attribution is by founder, **not** genotype — a mutated descendant
  (new genotype/label) keeps its founder, so a player's evolving lineage counts for them.
- **Parasites & borrowed code:** if a creature of founder B *executes* founder A's copy routine
  (the parasite niche), the resulting daughter is still B's (it descends from B's cell via
  `divide`) — attribution follows descent, which is the fair, well-defined measure.
- **Neutral (founder 0):** any creature not descended from a player (none in a clean Versus soup,
  which is seeded only by the players; but reserved for robustness) is neutral and does not
  score. Optional "primordial/free-for-all" scenarios could seed neutral ancestors.
- **Aggregation:** `attribute(frame)` reads the per-founder census the engine maintains; scoring
  [01] and standings [03] consume it. `isPartition` asserts Σ per-founder == total (VSINV-ATTRIB).

## 5. Interconnections
- **engine [08] REPRO** — the `founderId` field + inherit-on-divide (the seam).
- **engine [15] API** — `inject(genome, {founderId})`.
- **engine [13] Statistics** — per-founder population in frames/stats.
- **[01] MATCH** — scoring reads the census.
- **[03] RUNNER** — stamps founders at injection; records the census over time.

## 6. Determinism & edge cases
- Inheritance is deterministic (a copy on divide); the census is a deterministic function of the
  birth/death event order (C-VS-DET).
- A creature that is reaped decrements its founder's count; partition holds at every frame.
- Founder ids are small integers assigned by player slot; `0` is reserved neutral.
- Self-replicating garbage from a player's mutated lineage is still that player's (correct).
- If the engine extension is absent, Versus cannot score by lineage — this doc is the contract
  that makes the extension a prerequisite (a Versus build asserts the frame carries founders).

## 7. Fidelity notes
- **[CORE]** founder inheritance on divide — without it, mutation-on matches are unscorable.
- **[CORE]** the tag is simulation-inert (does not touch selection) — fidelity-preserving.
- **[MOD]** exposing per-founder population in the frame is a stats addition, not a sim change.
- **[OPTIONAL]** deeper genealogy (full phylogeny per founder) — beyond scoring; later.

## 8. Acceptance criteria
- **LINEAGE-001** A creature has a `founderId`; injection stamps it; default is `0` (neutral).
- **LINEAGE-002** On `divide`, the daughter's `founderId` equals the mother's (VSINV-INHERIT).
- **LINEAGE-003** Attribution is by founder, not genotype: a mutated descendant keeps its
  founder.
- **LINEAGE-004** A creature descends to exactly one founder for any lineage depth (no chain
  walk, independent of dead ancestors).
- **LINEAGE-005** A daughter produced while executing another founder's borrowed code is still
  attributed by descent (its mother's founder).
- **LINEAGE-006** Per-founder populations partition the live population: Σ perFounder + neutral ==
  total, at every frame (VSINV-ATTRIB / `isPartition`).
- **LINEAGE-007** `attribute(frame)` is a pure read of frame tags (no recomputation from
  genomes).
- **LINEAGE-008** The founder tag is simulation-inert: enabling it does not change any run's
  digest vs the same run without scoring (fidelity check).
- **LINEAGE-009** Reaping a creature decrements exactly its founder's count.
- **LINEAGE-010** `neutral` (founder 0) creatures are excluded from player scoring.

## 9. Open questions
1. Frame encoding of the census (fixed-N array for small N vs a map) — align with engine [13].
2. Whether to also expose per-founder births/deaths (for tiebreakers [01]) in the frame or derive
   in the Runner.
3. Free-for-all/primordial Versus (seed neutral ancestors too) — a later scenario variant.
