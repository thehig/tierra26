# Genotype & Genebank — Engineering Spec              (Code: GENE · Milestone: M1 · minimal hook M0)

**Status:** v1. Owns **genotype identity** (which genomes count as "the same organism"), the
human **naming/label** scheme, per-genotype **demographics** (alive / everBorn), **lineage**
(parent genotype, first-seen cycle, sample bytes), and the durable **gene bank** with its
**save policy**. It is the engine's speciation observatory — it is how the run *names the
parasite that appears*.
**Upstream:** [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §13 (genebank hook — M0 minimal
`{id,hash,size,alive,everBorn}` via FNV-1a; M1 full bank), §11 (divide fires the birth hook),
§10/§reaper (death fires the death hook), §14 (`Engine.stats().genotypes`).
**Reference:** [`docs/original-tierra/05-genetics-genebank.md`](../../../original-tierra/05-genetics-genebank.md)
§2 Genebank (`size+label` naming `0080aaa`; `Int2Lbl`/`Lbl2Int`; `GList`/`SList`; in-memory
ops `CheckGenotype`/`NewGenotype`/`DivGenBook`/`ReapGenBook`; on-disk banker; save policy
`SavMinNum`/`SavThrPop`/`SavThrMem`/`CumGeneBnk`/`SaveFreq`) — fidelity only.
**Contracts obeyed:** C-DET (label assignment is a deterministic function of **birth order**,
never hash-map iteration order — see §6), C-ID (creatures carry `genotypeId`; genotype ids
come from a monotonic counter), C-INT (hash/size/counters are integers; 32-bit hash math),
C-SNAP (the whole bank lives in `World.genebank`; no module-level mutable state).

---

## 1. Purpose & responsibility

A **genotype** is an *equivalence class of byte-identical genomes*: two creatures whose cell
bytes are equal (same length, same opcodes) belong to the same genotype; a single differing
byte makes a new genotype. This system owns that classification and everything hung off it. It
must guarantee: (a) **stable identity** — the same genome always maps to the same
`genotypeId`, recognised via a content hash (FNV-1a over the cell bytes) with a full byte
compare to defeat collisions; (b) a **deterministic human label** — `size + 3-letter code`
(e.g. `0080aaa`, next `0080aab`), assigned in **birth order within a size class**, reproducible
across runs of the same seed; (c) **demographics** — `alive` (extant now) and `everBorn`
(cumulative), maintained by a **birth hook** (`alive++`, `everBorn++`) and a **death hook**
(`alive--`); (d) **lineage** — parent genotype, first-seen cycle, a sample of the genome bytes;
(e) **size-class organisation** so the UI species list and coloring can group/scan by size; and
(f) the **save policy** deciding which genotypes are durable (the "gene bank"). It performs **no
soup writes**, decides **nothing about a creature's fate** (selection is CPU-time + reaper only),
and holds **no wall-clock/floating state**. It only *observes and names*.

**M0 (minimal hook):** on birth compute the hash → `genotypeId`, track only
`{ id, hash, size, alive, everBorn }`. Enough for the M0 acceptance gate to assert "the
ancestor breeds true ⇒ exactly **1** genotype ever born under sterile (mutation-off) conditions."
**M1 (this doc's full scope):** labels, lineage, sample bytes, size-class lists, save policy.

---

## 2. Interfaces

```ts
// genebank.ts — imports: creature, types. Imported by: world (birth/divide + death wiring),
// reaper (death hook), engine API (inject registers a genotype; stats() reads counts).
// World is passed to hooks as an argument (for cycles/soup), never imported (downward rule).
type GenotypeId = number;   // engine-wide stable id, from a monotonic counter (C-ID-style)
type Addr = number;

interface GenotypeRecord {
  // --- identity (present in M0) ---
  id: GenotypeId;           // monotonic; assignment order == first-seen (birth) order
  hash: number;             // FNV-1a over the genome bytes (uint32; C-INT)
  size: number;             // genome length in bytes (the size class)
  // --- demographics (present in M0) ---
  alive: number;            // creatures of this genotype extant right now (>= 0)
  everBorn: number;         // cumulative count ever born (monotonic non-decreasing)
  // --- identity/labelling & lineage (M1) ---
  label: string;            // "0080aaa" = 4-digit size + 3-letter code (M1); "" in M0 hook
  sizeSeq: number;          // 0-based index of first-appearance WITHIN this size class → label
  parentId: GenotypeId;     // genotype of the mother at birth (-1 for injected/ancestor)
  firstSeenCycle: number;   // world.cycles when this genotype was first created
  sample: Uint8Array;       // canonical genome bytes (the defining sequence; M1)
}

interface Genebank {
  // Birth hook: classify the creature's genome, assign/lookup a genotype, bump demographics.
  // Returns the (new or existing) genotype id, which the caller stores on the creature.
  onBirth(w: World, c: Creature): GenotypeId;

  // Death hook: decrement `alive` for the creature's genotype. The record PERSISTS at alive 0
  // (extinct genotypes stay named/known); it is never deleted mid-run (see §4.4, §6).
  onDeath(w: World, c: Creature): void;

  get(id: GenotypeId): GenotypeRecord | undefined;
  count(): number;                         // number of DISTINCT genotypes ever born
  aliveCount(): number;                    // number of genotypes with alive > 0
  bySizeClass(size: number): readonly GenotypeRecord[];  // for the UI species list / coloring
  records(): readonly GenotypeRecord[];    // birth-order stable (for snapshot / stats / tests)

  // --- durable bank (M1 save policy, §4.5) ---
  savedIds(): readonly GenotypeId[];       // genotypes that have crossed the save threshold
  archive?(): ArchiveBlob;                 // [OPTIONAL] serialise the durable bank (web export)
}
```

- **Consumers.** `divide` (Reproduction `[08]`, driven by `world.ts` §11) calls `onBirth` and
  stores the returned id on the daughter's `genotypeId`. The `reaper` (`[10]`) calls `onDeath`
  in `kill`. The Engine API `inject` (`[15]`) calls `onBirth` for the placed genome (parent
  `-1`). Statistics (`[13]`) reads `count()`/`aliveCount()`/`bySizeClass()`; `Engine.stats()`
  surfaces `genotypes` from `count()` (or `aliveCount()` — see Open Q3). Snapshot (`[14]`)
  serialises `records()` + the id counter + per-size sequence counters.
- **Ownership.** The `Genebank` is a member of `World` (C-SNAP). No genebank metadata lives in
  the soup; the `sample` bytes are copies, so a genotype outlives the creature that defined it.

---

## 3. Data structures

**Primary store: a birth-ordered record array + two lookup maps (lookup only, never traversed
for ordering).**

| Field | Type | Why / units | Invariant it holds |
|---|---|---|---|
| `list` | `GenotypeRecord[]` | all genotypes ever born, in **first-seen (birth) order**; `list[i].id == i` | append-only; index == id; never spliced (extinct records persist) |
| `byHash` | `Map<number, GenotypeId[]>` | hash → candidate ids, to screen before byte compare | lookup only (C-DET: never iterated for order) |
| `bySize` | `Map<number, GenotypeId[]>` | size → ids of that size class, in birth order | each list append-only in birth order; drives labels + UI grouping |
| `nextId` | `number` (integer) | monotonic genotype-id counter; also `== list.length` | strictly increasing; deterministic |
| `sizeSeqNext` | `Map<number, number>` | per-size next `sizeSeq` (label index) | increments only on a **new** genotype of that size (C-DET) |

- **Why an array keyed by id, not a `Map<id,record>` for traversal.** `records()` and
  `bySizeClass()` must be **birth-ordered and reproducible**; iterating a `Map` by key/insertion
  order is exactly what C-DET forbids for simulation-visible ordering. The array *is* the order;
  the maps are pure accelerators. This mirrors the allocator's "sorted list is the only order"
  rule (`[03]`).
- **Hash (`FNV-1a`, 32-bit, C-INT).** `h = 0x811c9dc5; for b in bytes: h = ((h ^ b) * 0x01000193) >>> 0`
  (implemented with `Math.imul` + `>>> 0`, integer-only — same cross-engine discipline as the
  RNG `[01]`). The hash is a *screen*, not identity: a hash hit is confirmed by a full length +
  byte compare (`IsSameGen`), so collisions never merge two genotypes.
  *(Tierra uses `h = (3*h + inst) % 277218551`; we substitute FNV-1a — see §7.)*
- **`label` / `sizeSeq` (Tierra `Int2Lbl`).** For a genotype that is the `sizeSeq`-th distinct
  one of its size class, the 3-letter code is base-26 over `a..z`:
  `c0 = 'a' + floor(seq/676); r = seq%676; c1 = 'a' + floor(r/26); c2 = 'a' + r%26`.
  The label is `pad4(size) + c0 + c1 + c2`, e.g. size 80 seq 0 → `0080aaa`, seq 1 → `0080aab`,
  seq 26 → `0080aba`. `seq < 0` ⇒ `"---"` (an in-progress/unnamed mutant; not used by M0). The
  4-digit size field zero-pads (sizes ≥ 10000 widen, matching Tierra's fixed-then-overflow
  field). **The label is unique only within a size class**; full identity is `(size, sizeSeq)`
  plus the hash/bytes.
- **`sample`.** A copy of the defining genome bytes (`Uint8Array(size)`), taken once at
  first-seen. Lets the UI show/diff a genotype after every carrier has died (record persists).

Constants (from reference §2.6; validated by `config.ts`):

| Constant | Value | Meaning (genebank use) |
|---|---|---|
| `SavMinNum` | 2 | min concurrent `alive` before a genotype is worth saving to the durable bank |
| `SavThrPop` | 0.015 | population-proportion threshold (peak share of population) to save |
| `SavThrMem` | 0.015 | memory-occupancy threshold (peak share of soup bytes) to save |
| `CumGeneBnk` | 0 | 0 = overwrite archive; 1 = cumulative (accumulate across runs) |
| `SaveFreq` | 100 | checkpoint the durable bank every `SaveFreq`·10⁶ instructions [OPTIONAL] |

---

## 4. Behavior / algorithms

### 4.1 Hashing & the same-genome test

```
hash(soup, start, size):
  h = 0x811c9dc5
  for i in 0..size-1:
      h = (Math.imul(h ^ soup.read(start+i), 0x01000193)) >>> 0      # C-INT, C-ADDR via read()
  return h

sameGenome(rec, soup, start, size):
  if rec.size != size: return false
  for i in 0..size-1:
      if rec.sample[i] != soup.read(start+i): return false           # byte-exact identity
  return true
```

### 4.2 `onBirth(w, c)` — classify → assign/lookup → bump demographics

```
onBirth(w, c):
  start = c.start; size = c.size
  h = hash(w.soup, start, size)
  # --- lookup: hash screen, then exact byte compare (collision-safe) ---
  for id in (byHash.get(h) ?? []):
      if sameGenome(list[id], w.soup, start, size):
          list[id].alive    += 1
          list[id].everBorn += 1
          c.genotypeId = id
          return id
  # --- miss ⇒ a NEW genotype (deterministic id + label in birth order) ---
  id  = nextId++                              # == list.length; first-seen order
  seq = sizeSeqNext.get(size) ?? 0            # per-size label index (C-DET, birth order)
  sizeSeqNext.set(size, seq + 1)
  rec = {
    id, hash: h, size,
    alive: 1, everBorn: 1,
    sizeSeq: seq, label: makeLabel(size, seq),          # M0 hook: label = "" , seq still tracked
    parentId: parentGenotypeOf(c),                      # c.parentId → its genotypeId, else -1
    firstSeenCycle: w.cycles,
    sample: copyBytes(w.soup, start, size),
  }
  list.push(rec)
  byHash.getOrCreate(h).push(id)
  bySize.getOrCreate(size).push(id)
  c.genotypeId = id
  return id
```

- **`alive++` and `everBorn++` happen on every birth**, existing genotype or new; a new
  genotype starts both at 1.
- **`parentGenotypeOf(c)`** = the genotype id recorded on the mother when the daughter was
  created (the mother's `genotypeId`). The ancestor / injected creatures have `parentId = -1`.

### 4.3 `makeLabel(size, seq)` — deterministic `Int2Lbl`

```
makeLabel(size, seq):
  if seq < 0: return pad4(size) + "---"
  c0 = 'a' + floor(seq / 676)
  r  = seq % 676
  c1 = 'a' + floor(r / 26)
  c2 = 'a' + (r % 26)
  return pad4(size) + c0 + c1 + c2            # "0080" + "aaa"
```

`makeLabel` is a **pure function of `(size, seq)`**; `seq` is the birth-order index within the
size class. It never reads the hash, the map iteration order, or the wall clock (§6).

### 4.4 `onDeath(w, c)` — decrement, persist the record

```
onDeath(w, c):
  rec = list[c.genotypeId]
  if rec == undefined: return                 # defensive; every live creature has a genotype
  rec.alive -= 1                              # may reach 0
  # record is NOT removed: extinct genotypes stay named, counted in count()/records(),
  # and available to the UI (sample bytes, label, everBorn) for the emergence narrative.
```

- **The record persists at `alive == 0`.** `count()` (distinct genotypes ever born) is
  monotonic; `aliveCount()` is the extant subset. (Tierra frees the `GList` when non-permanent
  and pop hits 0; we keep all records resident for the web timeline — see §7.)

### 4.5 Save policy — which genotypes are durable ("the gene bank")

The durable bank is the subset of genotypes deemed evolutionarily significant. Evaluated on
each birth (after demographics update), gated on the reaper having begun acting (`w.reaped`):

```
maybeSave(w, rec):
  if not w.reaped: return
  peakPopShare = rec.maxAlive / max(1, w.population)      # tracked as running peak
  peakMemShare = (rec.maxAlive * rec.size) / w.soupSize
  if rec.alive >= SavMinNum and (peakPopShare >= SavThrPop or peakMemShare >= SavThrMem):
      mark rec as saved (add to savedIds once)            # idempotent
      if CumGeneBnk: accumulate into the persistent archive; else overwrite
```

- A genotype reaches the bank once it is **both** sufficiently common (`alive ≥ SavMinNum`) and
  has peaked past a **population or memory** share threshold — filtering the transient noise of
  one-off mutants from the named, durable lineages (ancestor, established parasites, hyper-
  parasites). Marking is **idempotent** and monotone (a saved genotype stays saved).
- `SaveFreq`/checkpointing and the on-disk file format are **[OPTIONAL]** for the web build
  (§7); in-memory `savedIds()` + `archive()` are the M1 durable surface.

### 4.6 Feeding Statistics `[13]` and the emergence narrative

`Statistics` reads `count()` (total genotypes), `aliveCount()` (extant species), and
`bySizeClass(size)` to build the population-by-genotype and size-histogram views.
`Engine.stats().genotypes` is sourced here. Because labels are stable and birth-ordered, the UI
can *name* what emerges: the ancestor is `0080aaa`; the first successful smaller replicator that
exploits write-protection — **the parasite** — appears as its own genotype (e.g. `0045aaa`) the
moment its first byte-distinct daughter divides, with `firstSeenCycle`, `parentId` (pointing
back at its host lineage), and `sample` bytes captured for the timeline. This is the mechanism
by which the run tells the Tierran story rather than just showing a population count.

---

## 5. Interconnections

- **Calls down:** `Soup` (`[02]`) via `read()` only (hashing + byte compare + sample copy;
  C-ADDR). `Creature` (`[08]`) for `start/size/parentId/genotypeId`. Nothing else; no writes.
- **Called by:**
  - **Reproduction / `world.divide`** (`[08]`/§11) — `onBirth` on each successful divide;
    stores the returned id on the daughter (C-ID). Crosses into demographics (`alive++`,
    `everBorn++`).
  - **Reaper `kill`** (`[10]`) — `onDeath` (`alive--`) before the creature is unlinked.
  - **Engine API `inject`** (`[15]`) — `onBirth` for the injected genome (parent `-1`).
  - **Statistics** (`[13]`) — `count()`/`aliveCount()`/`bySizeClass()`/`records()`.
  - **Snapshot** (`[14]`) — serialises `records()`, `nextId`, `sizeSeqNext`; restore rebuilds
    `byHash`/`bySize` from `list` (deterministically, in id order).
- **Contracts crossed:** C-DET (label + id assignment are functions of birth order, never map
  iteration — this is the system's headline determinism obligation), C-ID (each creature carries
  a stable `genotypeId`), C-SNAP (bank fully lives in `World`).

---

## 6. Determinism & edge cases

- **Label = f(birth order), NOT hash iteration (C-DET).** The 3-letter code is derived from
  `sizeSeq`, a per-size counter bumped **only** when a byte-new genotype of that size first
  appears — and genotypes first appear in the deterministic order the scheduler produces
  divides. It is never derived by sorting hashes, iterating `byHash`/`bySize` map keys, or any
  hash-dependent order. Two runs with the same `RunDescriptor` therefore assign identical labels
  to identical lineages (`INV-DET`). This is the single most load-bearing rule in this doc.
- **Hash collision safety (C-INT).** A 32-bit hash *will* eventually collide; identity is the
  **byte compare**, with the hash only screening candidates. Two different genomes that hash
  equal get two distinct genotypes (their `byHash` bucket holds both ids). Tested by GENE-002.
- **`alive` never negative.** Every `onDeath` corresponds to a prior `onBirth` that incremented
  `alive` (INV-QUEUE guarantees each live creature was born and dies once); `alive` floors at 0
  and the record persists (GENE-005).
- **Extinct-then-returning genotype.** If a genotype dies out (`alive==0`) and is later re-born
  (a mutant reappears), `onBirth` re-finds the **same** record by hash+bytes and increments
  `alive`/`everBorn`; it does **not** allocate a new id or label (identity is content, not
  liveness). `firstSeenCycle`/`sizeSeq`/`label` are unchanged.
- **Injected ancestor.** `inject` registers `0080aaa` at cycle 0 with `parentId = -1`; the first
  bred daughter (mutation off) hashes identically → same genotype (GENE-001, GENE-004).
- **Sterile / mutation-off run (M0 gate).** With copy/flaw/cosmic rates 0 the ancestor breeds
  byte-true, so **exactly 1** genotype is ever born (`count() == 1`), no matter how many births
  — the golden invariant the M0 hook exists to assert (GENE-005/GENE-006 map here).
- **Size classes group correctly.** `bySize.get(size)` returns exactly the genotypes of that
  length in birth order; a one-byte-longer mutant lands in a *different* size class (GENE-007).
- **Empty / degenerate genome.** `MinCellSize(12)` (from `[03]`) means a real cell is never
  smaller than 12; `hash` of a 0-length span is the FNV offset basis (defensive only).
- **No floats (C-INT).** Hash, counters, `sizeSeq`, and label arithmetic are all integer;
  share thresholds in the save policy are the only ratios and are **[MOD]**/observation-only,
  never on a creature's fate path.

---

## 7. Fidelity notes

| Aspect | Tierra | tierra26 | Tag | Why |
|---|---|---|---|---|
| Genotype identity | `(size, hash, exact-genome)`; `Hash()` = `(3*h+inst) % 277218551` | `(size, FNV-1a hash, exact-genome byte compare)` | **[MOD]** | FNV-1a is a standard, integer-only, cross-engine-stable 32-bit hash matching the RNG's `Math.imul`/`>>>` discipline; identity is still the exact byte compare, so the substitution is observationally identical (only the screen changes). |
| Naming `size+label` | `Int2Lbl` base-26 `a..z` (`BIGNAMES`=base-52), `0080aaa` | **identical** base-26 `Int2Lbl`; `0080aaa`→`0080aab` | **[CORE]** | The naming scheme *is* how Tierra reports speciation; preserved exactly. `BIGNAMES` mixed-case deferred. |
| Label index source | `gi` = slot in size-class `GList[]`, reusing freed slots | `sizeSeq` = birth-order counter per size class, **no slot reuse** | **[MOD]** | Slot-reuse made labels depend on free/GC timing (nondeterministic for us). A monotonic per-size birth counter is fully deterministic (C-DET) and gives the same `aaa,aab,…` progression; extinct records persist rather than freeing slots. |
| In-memory structures | `GList` (per genotype) + `SList` (per size, `sl[]` O(1) by size) | `GenotypeRecord[]` + `bySize` map (O(1) by size), `byHash` screen | **[MOD]** | Same two-level (genotype / size-class) model, modern containers; array is the birth order, maps are accelerators (C-DET). Thread/ploidy/`AvgRpdEff` fields omitted (not selection inputs). |
| Death handling | free non-permanent `GList` at pop 0; GC trailing slots | **keep all records resident** (persist at `alive 0`) | **[MOD]** | The web timeline needs extinct lineages nameable/inspectable; memory is bounded by genotype count, not population. No GC needed for M1 scale. |
| Save policy | `DivGenBook` gate: `pop≥SavMinNum && (MaxPropInst>SavThrMem·.5 …)` on `reaped` | same shape: `alive≥SavMinNum && (peakPopShare≥SavThrPop ‖ peakMemShare≥SavThrMem)`, gated on `reaped` | **[MOD]** | Semantics (common **and** peaked ⇒ durable) preserved; float `·.5` factor folded into the two threshold constants; in-memory bank instead of `.gen`/`.tmp`. |
| On-disk XDR archive | `head_t`+`indx_t` per-size `.gen`/`.tmp`/`.mem` XDR files, `add_gen` data-shift | **in-memory bank**; `archive()` → a self-contained blob | **[OPTIONAL]** | The evolutionary model runs entirely from the RAM bank (reference §"Incidental"); XDR cross-platform persistence is replaced by a web-friendly export when/if needed. |
| `CumGeneBnk`/`SaveFreq`/`SavRenewMem`/`TierraLog` | run params for disk archiving cadence/defrag/log | `CumGeneBnk` kept as accumulate-vs-overwrite flag; cadence/defrag/log deferred | **[OPTIONAL]** | Operational conveniences around the disk archive; not part of the in-memory model. |
| `AvgRpdEff` / `MaxProp*` fitness proxy | running per-size reproduction efficiency stats | tracked in Statistics `[13]` if needed, not in identity | **[OPTIONAL]** | Informative for observation, "not inputs to selection" (reference §"Incidental"); belongs to `[13]`. |

All identity/naming/demographic semantics that make the genebank *observe speciation* are
preserved (`[CORE]` naming, exact-byte identity, birth/death demographics, save-policy shape);
only the hash function, the label-index source (made deterministic), the containers, death
retention, and disk persistence are modernized/deferred.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in [`packages/engine/test/12-genebank.test.ts`](../../../../packages/engine/test/12-genebank.test.ts).
IDs are append-only.

- **GENE-001** — **identical genomes share one genotype:** two creatures whose cell bytes are
  byte-for-byte equal (same size, same opcodes) are classified to the **same** `genotypeId`;
  `onBirth` for the second finds the existing record (no new id), and `alive`/`everBorn` reach 2.
- **GENE-002** — **a single-byte difference yields a new genotype:** two genomes of equal length
  differing in exactly one byte get **distinct** `genotypeId`s; identity is the byte compare, so
  even a hash collision would still separate them (`count()` increases by 1 for the second).
- **GENE-003** — **label increments deterministically in birth order:** the first genotype of
  size 80 is labelled `0080aaa`, the second distinct genotype of size 80 is `0080aab` (base-26
  `a..z`; seq 26 → `0080aba`); the label is a pure function of `(size, sizeSeq)` and independent
  of the genomes' hash values or map iteration order.
- **GENE-004** — **birth increments alive and everBorn:** each `onBirth` bumps the target
  genotype's `alive` and `everBorn` by 1 (a new genotype starts both at 1; an existing one
  increments both); everBorn is monotonic non-decreasing.
- **GENE-005** — **death decrements alive; the record persists:** `onDeath` decrements `alive`
  (never below 0); when `alive` reaches 0 the `GenotypeRecord` is **not** removed — it stays in
  `records()`/`count()` with its label, sample, and `everBorn` intact (extinct-but-named).
- **GENE-006** — **sterile conditions ⇒ exactly 1 genotype ever born:** with mutation off, an
  ancestor that breeds byte-true across many births yields `count() == 1` (all daughters map to
  the ancestor's `genotypeId`) — the M0 breeds-true gate.
- **GENE-007** — **size classes group correctly:** genotypes are grouped by genome length;
  `bySizeClass(size)` returns exactly the genotypes of that length in birth order, and a
  genotype one byte longer/shorter falls into a different size class (its label carries the new
  4-digit size field).
- **GENE-008** — **re-appearance reuses identity, not a new id/label:** a genotype that goes
  extinct (`alive==0`) and is later re-born is re-found by hash+bytes — same `genotypeId`,
  `label`, `sizeSeq`, and `firstSeenCycle`; only `alive`/`everBorn` change.
- **GENE-009** — **determinism (C-DET):** two genebanks driven with identical birth/death
  sequences (same genomes, same order) produce identical `records()` — identical ids, labels,
  `sizeSeq`, `firstSeenCycle`, and demographics — with no dependence on hash-map iteration order.
- **GENE-010** — **lineage & first-seen captured:** a new genotype records `firstSeenCycle` =
  `world.cycles` at first appearance, `parentId` = the mother's genotype (or `-1` for
  injected/ancestor), and a `sample` copy of the defining bytes that survives the death of every
  carrier.
- **GENE-011** — **save policy marks durable genotypes idempotently:** once (post-`reaped`) a
  genotype has `alive ≥ SavMinNum` and peaks past `SavThrPop`/`SavThrMem`, it appears in
  `savedIds()`; transient one-off genotypes below threshold do not; re-evaluation never
  duplicates or un-marks a saved genotype.

---

## 9. Open questions

1. **`sizeSeq` vs Tierra slot reuse.** We assign labels by a monotonic per-size birth counter
   (never reusing freed slots) for determinism; Tierra reused `GList` slots, so labels could
   recycle after extinction+GC. Confirm the monotonic scheme is the desired behaviour for the
   web timeline (it means labels only ever advance).
2. **Hash width.** FNV-1a 32-bit with byte-compare confirmation is collision-safe for
   correctness but buckets can grow; is 32-bit sufficient for expected genotype counts, or move
   to 53-bit safe-integer FNV for fewer `byHash` collisions? (Correctness is unaffected either
   way; only bucket length.)
3. **`Engine.stats().genotypes` = `count()` or `aliveCount()`?** M0-TECH-DESIGN §14 lists a
   single `genotypes` number. Total-ever (`count()`) is the diversity-generated metric; extant
   (`aliveCount()`) is the current-species metric. Propose exposing **both** to `[13]` and
   letting the UI choose; `stats().genotypes` defaults to `aliveCount()`.
4. **Peak tracking for the save policy.** `peakPopShare`/`peakMemShare` need a per-genotype
   running peak (`maxAlive`), updated on birth. Confirm updating it only on birth (not on death)
   is acceptable (peak can only rise on a birth).
5. **Archive format for the web `archive()`** — deferred `[OPTIONAL]`; when built, a compact
   JSON/binary blob of `savedIds()` records (label, size, hash, sample, lineage, firstSeen) is
   proposed over the Tierra XDR `.gen` layout.
