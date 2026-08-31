# Validation Phase B — Internal Consistency & Design Review

**Scope:** all ~38 engineering specs across 5 packages (engine, genescript, content, ui, versus),
their five anchors, `SPEC.md`, `ISA-VM-SPEC.md`, `M0-TECH-DESIGN.md`. Read-only cross-doc audit
for contract contradictions, interface mismatches, doc-to-doc gaps, and design smells that good
design should catch before implementation.

**Method:** compared each consumer's stated interface/§5 interconnections against the owner's §2
interfaces / §3 data structures. Findings grouped by severity. Each cites the docs involved
(file:section), the contradiction, why it bites, and a concrete resolution.

**BLOCKER count: 4** · SHOULD-FIX: 9 · NICE-TO-HAVE: 6

---

## Contract reconciliation table (shared data structures)

| Structure | Owner (canonical) | Divergent definitions found | Recommended single shape |
|---|---|---|---|
| **ObservationFrame** | engine STAT `13-…§2` | STAT: `{cycles, stats:LiveStats, topGenotypes, sizeHist, tank:{width,height,cells}}`. TANK `ui/02 §2` **requires** `tank.genotypeOf:Uint32Array` + `tank.ips:Uint32Array` (not present). Versus LINEAGE `02 §2` **requires** per-founder census on the frame (not present). | Add `genotypeOf` + `ips` channels to `TankView` and a `perFounder` census (fixed-N array) to the frame — both in STAT §2/§3. |
| **stats scalar surface** | overloaded | API `15 §2` `Stats{population,genotypes,births,deaths,fullness}` with **fullness = scaled int /1000**. STAT `13 §2` `LiveStats{+cycles,+avgSize,+generations, fullness=Float01}`. STAT also names a *service* object `Stats{onBirth,…}`. | Rename service object to `StatsService`; make the wire scalar one type = `LiveStats`; pin `fullness` to one representation (scaled-int /1000 on any digest/sim-adjacent path; Float01 only truly presentation). |
| **RunDigest** | two owners | STAT `13 §2` `{cycle,…}` **and** SNAP `14 §2` `{atCycle,…}`; both declare `digest()`. | One owner (SNAP `14`); one field name (`atCycle`); STAT re-exports, does not redefine. |
| **RunDescriptor** | engine API `15 §2` | API/`M0 §14`: `{engineVersion,scenario,injections,cycles}` (**no seed**). ARCH glossary / SNAP `14 §2` / `M0 §3` / SPEC §12: **include `seed`**. | Seed lives inside `scenario`; drop the top-level field everywhere (or keep as documented read-only mirror in exactly one place). Fix `M0 §3` vs `§14` internal conflict. |
| **MatchDescriptor** | versus RUNNER `03 §2` | `{scenario,seed,players[],placement,threshold,rules,engineVersion}` — claims "superset of RunDescriptor" but has **no `injections`/`cycles`**. | State it as a *sibling* recipe that *derives* a RunDescriptor (players→injections, threshold→cycles), not a superset. |
| **RunLink** | ui SHELL `07 §2` | `{scenarioId,seed,genomes[]}` — `scenarioId` is a **string ref**, genomes are **GeneScript strings**. Versus RUNNER-007 claims MatchDescriptor "round-trips to/from RunLink" — impossible (RunLink lacks founderId/placement/threshold/rules/engineVersion). | Either widen RunLink to carry a discriminated `versus` payload, or have MatchDescriptor serialize to its own link type; drop the RunLink round-trip claim. Pin how `scenarioId` resolves to a `Scenario`. |
| **active subset** | engine ISA `04`/API `15` | Engine `SubsetSpec.include = mnemonics`. PROGRESS `05 §2` produces **verbs** (`sort(verbs)`). Content `01`/`02` reference a **named-string** (`subset: ch02`). VOCAB verb↔mnemonic translation step is **unassigned**; opcode-ordering rule unpinned. | Pin: subset token = engine **mnemonic**; VOCAB owns verb→mnemonic; opcode order = fixed rule (nop0=0,nop1=1 then canonical sort); a named subset resolves via `PROGRESS.activeSubset(lessonId)`, not a cosmetic `SubsetSpec.name`. |
| **Scenario / inject** | engine API `15 §2` | `inject(genome):CreatureId`. LINEAGE `02 §2` requires `inject(genome,{founderId})`. Worker `01` `inject{genome}` and editor `WorkerSend` also lack founderId. | Add optional `founderId` to `inject`, the worker `inject` command, and `Creature`/`CreatureSnapshot` (see BLOCKER-1). |

---

## BLOCKER

### BLOCKER-1 — `founderId` lineage seam is absent from every engine doc it must live in (flagged seam #2, confirmed real)
**Docs:** versus LINEAGE `02 §2` (defines the seam) vs engine REPRO `08 §2/§4.3`, STAT `13 §2`,
SNAP `14 §2/§8`, API `15 §2/§4.2`, worker `ui/01 §2`.
**Contradiction:** LINEAGE requires `Creature.founderId` set at injection and **inherited on
`divide`** (`daughter.founderId = mother.founderId`) and surfaced as a per-founder census in the
frame/stats. None of the engine docs carry it: REPRO `birthDaughter` sets `parentId` but not
`founderId`; `inject` has no `founderId` param; STAT `LiveStats`/`ObservationFrame` carry no
per-founder count; **`CreatureSnapshot` (`14 §2`) and the SNAP-008 completeness enumeration omit
it**; the worker `inject` command carries only `{genome}`.
**Why it bites:** (a) Versus (M4) is unscorable without it. (b) Determinism trap: if `founderId`
is added to `Creature` at build time but not to `CreatureSnapshot`, `restore/replay` silently
resets it to 0 — a Versus match replay **mis-scores** even though the soup digest matches, and
SNAP-008 (the C-SNAP tripwire) would fail. LINEAGE-008 claims the tag is "simulation-inert / does
not change the digest" — true for the soup digest, but the *snapshot* must still serialize it.
**Resolution — where each line belongs:**
- REPRO `08 §2` `Creature` interface + `§4.3 birthDaughter`: add `founderId` field + inherit line.
- API `15 §2/§4.2` `inject`: add optional `founderId` (default 0/neutral).
- STAT `13 §2` add per-founder census to `ObservationFrame`/`LiveStats` (fixed-N array), bumped in the birth/death hooks.
- SNAP `14 §2/§3` `CreatureSnapshot` + SNAP-008 enumeration: add `founderId`.
- Worker `ui/01 §2` `inject` command (+ editor `WorkerSend`): add optional `founderId` for the Versus path.

### BLOCKER-2 — Tank per-cell `genotypeOf` + `ips` seam is absent from STAT's ObservationFrame (flagged seam #1, confirmed real)
**Docs:** ui TANK `02 §2/§5/§9-Q1` (requires) vs engine STAT `13 §2/§4.5/§9` (owner).
**Contradiction:** STAT's `TankView` is `{width,height,cells:Uint8Array}` where cells ∈ {0 free,
1 mother,2 daughter}. TANK's `TankFrameView` additionally **requires** `genotypeOf:Uint32Array`
(per-cell genotype id, for colour-by-species) and `ips:Uint32Array` (IP cells, for sparks) — the
two channels the "star visual" (SPEC §3d) cannot exist without. STAT §9 open questions do **not**
list this extension; the request currently lives only in TANK §9-Q1.
**Why it bites:** the headline tank view is unbuildable against STAT as written; the gap is
recorded on the *consumer* side, so the owning doc will be implemented without it.
**Resolution:** add `genotypeOf` and `ips` (allocation-light, reused buffers like `cells`) to
STAT `13 §2` `TankView`/`ObservationFrame` and its `§4.5 fillTank`. Also resolve TANK §9-Q2 (dead-code:
does STAT keep `genotypeOf` populated one frame after free, enabling class-3 "dead-noise", or zero it?).

### BLOCKER-3 — `RunDigest` is defined twice, with a different field name and two owners
**Docs:** STAT `13 §2` `RunDigest{cycle,…}` + `digest(w,cycle)` vs SNAP `14 §2` `RunDigest{atCycle,…}`
+ `digest(w,atCycle)`.
**Contradiction:** both docs declare the golden-fixture digest interface and a `digest()` function;
the checkpoint field is `cycle` in one and `atCycle` in the other.
**Why it bites:** the golden-run harness and `INV-REPLAY`/`INV-DET` compare `RunDigest` sequences.
Two shapes + two owners means the golden fixtures and the property tests can bind to different
types; field-name mismatch breaks any shared comparison helper.
**Resolution:** SNAP `14` owns `RunDigest` and `digest()` (it owns INV-REPLAY/DET); STAT references
it. Pick one field name (`atCycle`). Both already agree on `{population,genotypes,births,deaths,soupChecksum}`
and FNV-1a/uint32 — lock the checksum constants once (STAT §9-Q6 / SNAP §9-Q4).

### BLOCKER-4 — `InspectView` is defined twice with incompatible shapes; the wire owner cannot supply what the Inspector needs
**Docs:** worker `ui/01 §2` (owns the wire type) vs inspector `ui/04 §2`.
**Contradiction:** worker `InspectView = {creatureId?, ip?, registers?:number[], flags?:number,
stack?:number[], genome?:Uint8Array}` (all optional, `flags` a bitfield `number`, `registers` a
`number[]`). Inspector `InspectView = {address, occupied, creatureId, parentId, bornAtCycle,
genotypeId, genotypeLabel, population, ip, registers:{A,B,C,D}, flags:{E,S,Z}, stack, sp, cell,
daughter, genome}` — required fields, `registers`/`flags` as **objects**, plus `genotypeLabel,
population, parentId, daughter, cell, sp` the worker type never carries.
**Why it bites:** the inspector renders fields (`genotypeLabel`, `population`, `daughter.written`,
`cell`, `sp`, `parentId`) that the worker `inspectResult` payload does not include, and the two
disagree on the shape of `registers`/`flags`. INSPECTOR-002…007 cannot be satisfied against the
worker's type as written.
**Resolution:** make worker `01` the single owner of `InspectView` and widen it to the inspector's
field set (resolve genebank label/population + daughter fill + cell bounds worker-side, per
inspector `§4`); inspector `04` imports it, never redefines. Fix `registers`→`{A,B,C,D}`,
`flags`→`{E,S,Z}`.

---

## SHOULD-FIX

### SHOULD-FIX-1 — `RunDescriptor.seed`: present in some docs, absent in others (incl. an intra-doc conflict)
**Docs:** API `15 §2` & `M0 §14` (no `seed`) vs ARCH `00 §6` glossary, SNAP `14 §2`, `M0 §3`,
SPEC §12 (include `seed`). `M0-TECH-DESIGN` contradicts itself: `§3` lists `seed`, `§14` omits it.
**Why:** the shared replay type must be settled before it is coded; SNAP-004 deep-equals snapshots
(and, transitively, descriptor-derived state) across engines.
**Resolution:** seed is canonical inside `scenario`; drop the top-level field, or keep it as an
explicitly-documented read-only mirror in exactly one doc. Reconcile `M0 §3`↔`§14`.

### SHOULD-FIX-2 — `Stats` vs `LiveStats`, and `fullness` type (scaled-int vs Float01)
**Docs:** API `15 §2` `Stats` (5 fields, `fullness` scaled-int /1000) vs STAT `13 §2` `LiveStats`
(8 fields, `fullness` Float01) — and STAT also names a *service* object `Stats`.
**Why:** the worker `stats` event ships `Stats`; the `frame` ships `LiveStats`; CHARTS needs
`avgSize`/`cycles` (only in `LiveStats`). Two "stats" surfaces + an overloaded `Stats` name +
two `fullness` types invite the exact float-on-fate-path bug C-DET forbids.
**Resolution:** one scalar type (`LiveStats`); rename the service object to `StatsService`; pin
`fullness` to one representation and state which surface(s) may see the Float01 form.

### SHOULD-FIX-3 — `MatchDescriptor` is not a `RunDescriptor` superset; RunLink cannot round-trip it
**Docs:** RUNNER `03 §2/§3` + RUNNER-007 vs SHELL `07 §2` `RunLink` vs API `15 §2` `RunDescriptor`.
**Why:** RUNNER claims MatchDescriptor is "a superset of RunDescriptor" (it lacks `injections`/`cycles`)
and that it "round-trips to/from a RunLink" (RunLink lacks `founderId`/`placement`/`threshold`/`rules`/
`engineVersion`) — RUNNER-007 is unsatisfiable as specified. Also `RunLink.scenarioId` (string) vs
`RunDescriptor.scenario` (object): no doc says how a `scenarioId` resolves to a `Scenario`.
**Resolution:** describe MatchDescriptor as a recipe that **derives** a RunDescriptor; give Versus its
own link payload (or widen `RunLink` with a `versus` variant); define the `scenarioId → Scenario`
resolver and which layer owns the scenario registry.

### SHOULD-FIX-4 — Subset token type + naming + opcode-ordering unpinned across four layers
**Docs:** engine ISA `04 §9-Q1` / API `15 §2 SubsetSpec.include` (mnemonics) vs PROGRESS `05 §2`
(`subset: readonly Verb[]`, "verb / mnemonic" conflated) vs content `01 §2 subset?:string` + `02
ActiveSubset` (verbs) vs API-008 vs API `15 §9-Q4`.
**Why:** (a) content passes **verbs**; the engine set wants **mnemonics** — the VOCAB verb→mnemonic
translation is unassigned (PLAY `resolveSubset` and PROGRESS both hand-wave it). (b) PROGRESS returns
`sort(verbs)`; the engine assigns opcodes by include-order (API-008) *or* canonical sort (open-Q4).
Since a genome byte = index into the active set, an unpinned ordering makes the **same subset produce
different opcode bytes** in different layers → non-portable/non-reproducible genomes. (c) content
validate checks "unknown subset" against an "ISA named set" registry that does not exist (SubsetSpec.name
is cosmetic).
**Resolution:** pin one subset representation (engine mnemonics), assign VOCAB as the verb→mnemonic
owner, fix one opcode-ordering rule (nop0=0/nop1=1 then a canonical sort), and route named subsets
through `PROGRESS.activeSubset(lessonId)` as the authority (retire the "named ISA set" registry idea
or give it a real owner).

### SHOULD-FIX-5 — `Diagnostic` defined twice in genescript; `nodeId` consumed but never defined on the AST
**Docs:** GS `01 §2` `Diagnostic{severity,message,loc}` + `Loc{line,startCol,endCol}` vs DIAG `06 §2`
`Diagnostic{code,severity,span,message,suggestion?,hoverTerms?,teaches?}` + `SourceSpan{line,colStart,
colEnd,nodeId}`. BLOCK `07`, EDITOR `03`, DIAG `06` all key diagnostics/selection on a per-node
`nodeId` — but GS `01 §2` `Stmt` carries only `loc`, **no `nodeId`**.
**Why:** two `Diagnostic` shapes in one package (parser vs validator) with mismatched field names
(`startCol/endCol` vs `colStart/colEnd`) and one carrying `code`/`nodeId` and one not; the shared
`nodeId` that text↔block sync depends on is undefined on the owning AST.
**Resolution:** one `Diagnostic` shape (DIAG `06`'s); reconcile `Loc`↔`SourceSpan` field names; add
`nodeId` to the AST node interfaces in GS `01 §2` (the parser mints stable node ids).

### SHOULD-FIX-6 — `PlaygroundConfig` defined twice in the content package with different shapes
**Docs:** content CONTENT `01 §2` `PlaygroundConfig{scenario?,seed?,starter?,subset?}` (shape-only,
optional strings) vs content PLAY `02 §2` `PlaygroundConfig{scenario:string|Partial<Scenario>, seed,
starter:GenomeSource, subset:ActiveSubset, goal?, variants?, display?, cyclesHint?}` (rich, normalized).
Reader `ui/06 §2` imports `PlaygroundConfig` from `@tierra26/content` — ambiguous which.
**Why:** same name, same package, two shapes → import ambiguity and drift between the parsed shape
and the runtime config.
**Resolution:** rename the parser shape (e.g. `PlaygroundDirective`/`PlaygroundConfigRef`) and reserve
`PlaygroundConfig` for PLAY's normalized type; state the `parse-shape → normalized` transform explicitly.

### SHOULD-FIX-7 — AST type name drift across genescript docs
**Docs:** GS `01 §2` `Program`/`Stmt`; BLOCK `07 §2` `Ast`/`Statement`; COMP `04 §2` `CheckedProgram`/
`Statement`; EDITOR imports `{Program, Stmt}`.
**Why:** four names for the one AST (`Program`/`Ast`/`CheckedProgram`; `Stmt`/`Statement`) invite
import confusion and imply nonexistent distinct types.
**Resolution:** canonical `Program`/`Stmt` (owner GS `01`); if a validated variant is real, name it
`CheckedProgram` and define the `Program → CheckedProgram` step once; BLOCK/COMP import, not rename.

### SHOULD-FIX-8 — `SourceMap` shape drift
**Docs:** COMP `04 §2` `SourceMap{ranges:ByteRange[], statementAt(off)}` (indexed by statement) vs
PLAY `02 §2` `SourceMappedGenome.map: SourceMapEntry[]{line,byteStart,byteEnd}` (by line).
**Why:** the peek-under-hood source map is described two ways (statement-index vs line; `start/end` vs
`byteStart/byteEnd`); EDITOR consumes COMP's, PLAY re-declares its own.
**Resolution:** PLAY imports COMP's `SourceMap` type verbatim; if a flattened line array is wanted for
transport, derive it and name it distinctly.

### SHOULD-FIX-9 — CHARTS size histogram + readouts vs STAT frame shape
**Docs:** CHARTS `ui/05 §2` `sizeHistogram:{size,count}[]` and `Readouts{avgSize,cycles,…}` vs STAT
`13 §2` `sizeHist: HistBin[]{key,label,count}` and worker `stats` event = API `Stats` (no `avgSize`/`cycles`).
**Why:** field-name mismatch (`size` vs `key`), and CHARTS needs `avgSize`/`cycles` that the worker
`stats` event (API `Stats`) omits — charts must read `frame.stats` (`LiveStats`), which the doc doesn't
state, coupling to SHOULD-FIX-2.
**Resolution:** align CHARTS to `HistBin`; state that readouts read `LiveStats` from the frame; settle
whether a separate `stats` event exists at all (worker `01 §9-Q6`).

---

## NICE-TO-HAVE

### NTH-1 — `stats().genotypes` = total-ever vs currently-alive is unresolved
GENE `12 §9-Q3` proposes `aliveCount()`; STAT `13` uses "distinct live genotypes"; API `15` says
"distinct live genotype ids". Mostly aligned on *alive*, but GENE leaves it open — pin `genotypes ==
aliveCount()` and expose `count()` (total ever) separately if the diversity charts need it.

### NTH-2 — `fullness` expressed three ways
STAT `13` Float01; API `15` scaled-int /1000; CHARTS/inspector recompute `floor(occupied*100/soupSize)`.
Harmless if the float never reaches a fate path, but three representations invite mistakes — standardize
(ties to SHOULD-FIX-2).

### NTH-3 — Observation cadence ownership
STAT `13 §9-Q3`, worker `01 §4.6 LiveTunables.observeEveryCycles`, PLAY `02 §9-Q1` all agree it is
presentation-only and must not touch the digest, but none is designated the default-owner. Pick one
(worker) and reference it.

### NTH-4 — `step` granularity phrasing
API `15`/worker `01`/PLAY `02` all say `step` = one instruction; TANK `02 §9-Q4` still asks "instruction
or slice". Align the tank doc to "one instruction" to keep C-UI-DET.

### NTH-5 — Neutral-founder partition wording
Versus anchor C-VS-ATTRIB says `Σ perFounder + neutral == total`; VSINV-ATTRIB / LINEAGE `isPartition`
say `Σ perFounder == total`. Clarify whether neutral (founder 0) is a member of the `perFounder` map or
a separate term, so `isPartition` is unambiguous.

### NTH-6 — Reaper threshold units in `M0-TECH-DESIGN §14`
`M0 §14` shows `reaper:{threshold:number}` with no units; API `15 §3` fixes it as per-1000 integer,
default 900. Backfill the unit into `M0 §14` so the two agree.

---

## Cross-cutting contract health (positive notes)

- **C-DET / integer-only / single-RNG / seed-0-is-normal:** consistently stated across ISA-VM §2.5,
  `M0 §3`, RNG `01`, and every consumer's C-*-DET. No contradictions found.
- **C-*-SOURCE (single source of truth):** VOCAB→KEYWORD projection (KEYWORD `04 §3.1`), COMP reading
  opcodes from the active set (C-GS-NOOPCODES), and UI deriving colours/facts from content are coherent
  and well-guarded.
- **Write-protection, template addressing, 0.7 divide gate, register count (4, A–D):** stated identically
  in ISA-VM, `M0`, SOUP/REPRO/CPU/ISA docs. No drift.
- **The subset *mechanism* (one dictionary + mask):** engine ISA `04` and API `15` agree; the drift is
  only in the *token type / naming / ordering* handed across the content→engine boundary (SHOULD-FIX-4).

The four BLOCKERs are all **interface/data-shape** issues (two are the pre-flagged engine seams; two are
duplicated type definitions). None indicate a flaw in the underlying dynamics — they are contract-surface
reconciliations to settle before the shared types are coded.
