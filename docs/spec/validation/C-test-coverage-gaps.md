# Phase C — Test-Coverage Gap Audit (Sherlockian review)

**Status:** v1. A read-only detective sweep of every system spec's §8 acceptance criteria
against its companion `packages/<pkg>/test/*.test.ts` pending-test file, hunting for
behaviors the docs imply we care about (§4 behavior, §6 determinism/edge-cases, the
cross-layer invariants) that **no criterion actually tests**.

**Scope reviewed:** 43 spec docs + 40 test files across 5 packages (engine, genescript,
content, ui, versus), ~616 `it.todo` criteria.

**Headline:** the spec-as-checklist is in remarkably good shape at the *mapping* level —
across all 5 packages every §8 criterion has a matching `it.todo` and every `it.todo` has a
backing §8 criterion, with **near-zero ID divergence**. The gaps are therefore almost
entirely **§4/§6 behaviors that were written into prose but never promoted to a numbered
criterion** — plus a small cluster of genuine doc↔test text/tag defects (UI), one
structurally important **snapshot-completeness hole** (engine), and the **absence of any
cross-package integration harness** to execute the cross-layer invariants that already exist
on paper.

**Recommended new tests: ~119 new per-system criteria + 3 engine founder-seam criteria + 10
cross-layer integration tests + 8 property/fuzz suites ≈ 140 total.** Plus 6 doc↔test defect
fixes (§1, not new tests).

> **Convention note (applies to every recommendation).** All proposed IDs are **append-only**
> and continue each system's existing max (per engine anchor §8.2). None of these require
> renumbering. Integration/property IDs use new `INT-*` / `PROP-*` prefixes and need a home
> (see §3).

---

## Priority legend

- **P0 — structural / silent-divergence risk** (a passing suite would still hide a real bug).
- **P1 — named edge-case or negative path with no criterion** (the bulk).
- **P2 — completeness/robustness, lower blast radius.**

---

## 1. Doc↔test mismatches (defects to fix — mostly not new tests)

These are the only places where the 1:1 doc↔test discipline actually broke. Fix in place;
they are corrections, not additions.

| # | Location | Defect | Severity |
|---|---|---|---|
| M1 | `ui/02-tank.test.ts` **TANK-006** | Test prefixes `(visual)` on a **logic** criterion (daughter = mother's ColorIndex + dim tier — a pure transform). The tag wrongly defers a unit-testable derivation to the design pass. | P0 |
| M2 | `ui/02-tank.test.ts` **TANK-015** | Same defect: `diffFrames` (birth/death diff = pure function of two frames) is tagged `(visual)`; only the animation (TANK-021) is visual. | P0 |
| M3 | `ui/01-worker.test.ts` **WORKER-006** | Test name truncated to "step yields exactly one frame" — **drops** the load-bearing half "setSpeed changes cadence, not fate" (§4.5/§4.6: setSpeed alters emission rate only, never a cycle's digest/frame content). A dev would never test the presentation-only guarantee. | P0 |
| M4 | `ui/02-tank.test.ts` **TANK-022** | `it.todo` name truncated mid-sentence ("…independent of the sim cadence, with"); doc continues "…with the map staying crisp at each zoom level". | P1 |
| M5 | `ui/03-editor.test.ts` **EDITOR-007/010/011/013/024/026** | Six `it.todo` names truncated mid-phrase (e.g. EDITOR-024 "what you see =" cuts "what's injected"; EDITOR-026 "through DISASM" cuts "and loads editable GeneScript"). Restore full §8 text — several are core round-trip criteria. | P1 |
| M6 | `engine/_invariants.test.ts` **INV-INT** | `[INV-INT]` exists as a test but is **not** a defined global invariant in `00-architecture.md §5` (there it is only the *contract* C-INT). Either promote C-INT→INV-INT in §5, or relabel the test. It also duplicates CPU-001. | P2 |

Everything below §1 is a **missing criterion**, not a mismatch.

---

## 2. Missing edge-case / behavior criteria, per system

Grouped by package. Each bullet: proposed append-only ID, the behavior, the doc anchor, and
priority. "(neg)" marks a negative/failure path.

### 2A. Engine — core (00–07)

**00 / Global invariants**
- **INV-ID** (P1) — creature ids strictly monotonic, never reused (`world.nextId++`). §5 C-ID
  has no invariant test.
- (P2) C-SNAP "no hidden module-level mutable state" is only implied by INV-ROUNDTRIP; consider
  an explicit "restored world shares no mutable module state" assertion.

**01 RNG** (max RNG-015)
- **RNG-016** (P0) — `int(1)` returns 0 **without advancing the stream** (§6/§9-Q2). RNG-009
  tests only the return value, not the draw-count/no-advance property that is load-bearing for
  replay.
- **RNG-017** (P2) — `float01()` consumes exactly one `next()` word (§4.4). RNG-013 tests range
  only.

**02 Soup & memory** (max SOUP-017)
- **SOUP-018** (P1) — a `size == 0` own cell can write **nowhere**; `inCell` rejects every
  address (§6 "Empty/degenerate cells"). SOUP-014 covers only the closed *daughter* window.
- **SOUP-019** (P1) — `canWrite` admits a **daughter cell that wraps the soup end**
  (`dauStart+dauSize > S`) (§4.4 `inCell`). SOUP-015 tests wrap only for the own cell, yet the
  daughter is the copy-loop write target.

**03 Allocator** (max ALLOC-013)
- **ALLOC-014** (P0) — **no wrap-around cell**: `findFree` refuses a request that would only fit
  by combining trailing+leading gaps across the soup end (§3, §6). Distinct from ALLOC-003
  (fragmentation) and load-bearing (why cells and `canWrite` bounds align).
- **ALLOC-015** (P0, neg) — `reserve`/`free` **precondition violations are FATAL** (overlap /
  freeing a non-occupied interval — a bug, not a creature fault), not `raiseE` (§2/§4.4/§6).
- **ALLOC-016** (P1, neg) — `size > soupSize` / `> maxCellSize` is a **distinct third** mal
  reject branch (§4.3.3); ALLOC-010 folds it into the MaxMalMult branch.
- **ALLOC-017** (P1, neg) — oversize rejection leaves `A`, daughter fields, **and** `occupied`
  unchanged (§4.3). ALLOC-009 asserts this only for the `size<MinCellSize` branch.
- **ALLOC-018** (P2) — re-`mal` can **reuse its own just-freed** interval (§4.2). ALLOC-011
  asserts the free-first ordering but not the reuse landing.

**04 ISA & dispatch** (max ISA-009)
- **ISA-010** (P1) — `bitWidth = n<=1 ? 1 : ceil(log2 n)`; 1-instruction set clamps to 1;
  non-32 subset widths (§4.1/§3.4/§6). ISA-004 tests only classic32=5.
- **ISA-011** (P0, neg) — `buildSet` **rejects** a set whose nop0/nop1 aren't opcodes 0/1
  (INV-TEMPLATE build error, §4.1 step 4).
- **ISA-012** (P1, neg) — `buildSet` rejects an `InstrId` not in the dictionary / with null
  `exec` (§4.1 step 5).
- **ISA-013** (P0) — **mutation-domain fold for a non-power-of-two subset** (e.g. n=6,
  bitWidth=3): `mod n` maps the whole low-bit range into `[0,n)` (§4.3). ISA-005 tests only
  classic32 where `mod 32` is identity — the interesting wrap case is untested. This is the
  "mutation always yields a valid opcode" guarantee.
- **ISA-014** (P2, neg) — out-of-range opcode is a build/injection error, not a hot-path fault
  (§6).

**05 Decode & operands** (max DEC-017)
- **DEC-018** (P0) — **decode-before-gate ordering**: `iip = s+1` advances the IP past the
  source template **regardless of template match/miss** (§4.4). DEC-010 checks only the hit
  case; the miss-still-advances path is the ordering the whole fault protocol depends on.
- **DEC-019** (P1) — `ifz` skip advances exactly **one cell** even when the next cell begins a
  template (§4.3/§9-Q1).
- **DEC-020** (P1) — decode **never writes soup and never raises E** (purity; mutates only
  `world.decoded`) (§1/§5). No test guards this cross-cutting property.

**06 Template addressing** (max TMPL-010)
- **TMPL-011** (P1) — the outward walk **skips non-nop bytes** and continues, rather than
  aborting (§4.2).
- **TMPL-012** (P1, neg) — `s >= soupSize` (and `s < MinTemplSize`) ⇒ immediate failure treated
  as MISS (§6). TMPL-009 covers only `s==0`.
- **TMPL-013** (P0) — `searchLimit` derived from **integer** `avgSize` (float-free); identical
  soup+avgSize resolve identically (C-DET/INV-DET). The test file's own FIXME flags this;
  no criterion asserts it. A float here is a determinism break.
- **TMPL-014** (P2) — M0 flaw-off: landing address is exact, ±1 seam is identity (§6).
- *Sharpen:* **TMPL-010** says merge behavior "documented" — should **assert** two back-to-back
  nop runs resolve as one longer template.

**07 CPU & execution cycle** (max CPU-008) — *the most under-covered system; flag subsystem has zero tests*
- **CPU-009** (P0) — `applyFlags` sets `S`/`Z` from the wrapped result (§4.3/§6). No test
  anywhere for S/Z — a core CPU responsibility.
- **CPU-010** (P0) — `nop0`/`nop1` **clear** `E/S/Z` (the only way a creature recovers from E);
  ops that neither define nor clear leave flags unchanged (§4.5).
- **CPU-011** (P2) — a jump landing on its own IP is legal (tight loop), charges one cycle (§6).
- **CPU-012** (P1) — `makeCpu(ip)` newborn state: regs 0, stack cleared, sp=0, flags false, IP at
  daughter start (§2/§3/§6).
- **CPU-013** (P1) — normal `push`/`pop` LIFO round-trip and `sp` accounting (§3). Only the
  fault boundaries (CPU-005/006) are tested; ordinary stack behavior is not.

### 2B. Engine — dynamics & API (08–15)

**08 Reproduction** (max REPRO-018)
- **REPRO-019** (P0) — `mal` on a full soup **reaps to make room** then allocates (§4.1/§6). The
  reap-to-make-room path is untested at the repro layer (ties to REAP-007).
- **REPRO-020** (P0, neg) — `mal` at the population floor ⇒ `raiseE`, no allocation
  (allocation-failure / extinction termination, §4.1/§6/Q2).
- **REPRO-021** (P1, neg) — a `mal` fault moves the mother **up** the reaper and leaves registers
  untouched (§4.1 Notes). REPRO-003 asserts only "A unchanged".
- **REPRO-022** (P1) — a legal `movii` into the mother's **own** cell writes but does **not**
  advance `dauWritten` (§4.2/Q3) — distinct from the denied out-of-bounds write (REPRO-008).
- **REPRO-023** (P0) — a **wrap-spanning** daughter counts writes via `ad(addr)-dauStart` (§6).
  The test file carries a FIXME on exactly this with no criterion.
- **REPRO-024** (P0) — on `divide` the allocator interval is **transferred**, not freed/realloc'd;
  INV-MEM holds with no free/occupy call (§4.3).

**09 Scheduler/slicer** (max SLICE-009)
- **SLICE-010** (P0) — empty population: `runSlice` returns 0 and draws **no** RNG word (§4.2/§6).
  The zero-draw property is load-bearing for replay; SLICE-006 covers only loop exit.
- **SLICE-011** (P1) — singleton ring: self-referential next/prev; 1↔0 and 1↔2 transitions (§4.3/§4.4/§6).
- **SLICE-012** (P0) — a creature that dies from its **own** `mal`-triggered reap ends its slice
  cleanly (self-kill; §4.2). Cross-layer with REAP-010/REPRO-019.
- *Vague:* SLICE-009 ("~2× on average") lacks sample size/tolerance.

**10 Reaper/death** (max REAP-008)
- **REAP-009** (P1) — single-creature queue: head==tail; moveUp/moveDown no-ops (§6).
- **REAP-010** (P0) — `kill` on the currently-executing (cursor) creature is safe; unlinks from
  slicer so the slice loop stops cleanly (§6). Cross-layer with SLICE-004/012.
- **REAP-011** (P1) — an `E` event increments `errorCount` in addition to moveUp (§3/§4b).
- **REAP-012** (P0) — `reapToThreshold` uses **integer-scaled** fullness (`occupied*denom` vs
  `threshold*soupSize`), no float on the fate path (§4f/§6).

**11 Mutation** (max MUT-016)
- **MUT-017** (P1) — cosmic ray writes **unprotected** (bypasses `canWrite`), whole-soup incl.
  dead code/gaps — the only ungated write (§4.4/§6).
- **MUT-018** (P1) — divide-time operators fire in the fixed 8-operator dispatch order (§4.5).
- **MUT-019** (P1) — segment operators cut **only at nop0/nop1 boundaries** (§4.5).
- **MUT-020** (P0, neg) — an indel/crossover violating MinCellSize/MovPropThrDiv/max-multiple is
  **rejected**, daughter unchanged (§4.5/§6). All size-change criteria currently assert success
  only.
- **MUT-021** (P0) — divide-time mate selection draws uniformly **in queue order** via `rng.int`
  (never map order; C-DET, §4.5/§5).
- **MUT-022** (P1) — an accepted size-changing operator triggers a **re-`mal`** of the daughter
  before registration (§4.5/§6) — the untested mutation→alloc→genotype seam.

**12 Genotype & genebank** (max GENE-011)
- **GENE-012** (P2) — label base-26 rollover at `c0` and 4-digit size-field widening for sizes
  ≥ 10000 (§3/§4.3). GENE-003 tests only seq 0/1/26.
- **GENE-013** (P2) — save-policy `maxAlive` peak tracking drives peakPop/peakMem share (§4.5).
- *Sharpen:* GENE-002 (byte-compare under forced hash collision) needs a stubbed colliding-hash
  fixture, per its FIXME, or naturally-distinct hashes bypass the collision-safety path.

**13 Statistics** (max STAT-010)
- **STAT-011** (P1) — `generations` accrues as integer `(births+deaths)/2` crossing running avg
  population (§4.4). The `generations` surface field has **no test at all**.
- **STAT-012** (P1) — `fillTank` byte-class semantics: 0=free / 1=mother / 2=daughter over the
  correct extents via `ad()` (§2/§4.5).
- **STAT-013** (P1, neg) — empty soup: population 0 ⇒ no divide-by-zero avgSize, 0 genotypes,
  empty histograms, fullness 0, valid digest (§6).

**14 Snapshot & reproducibility** (max SNAP-010) — *highest-value cluster in the whole audit*
- **SNAP-011** (P1) — empty-population snapshot restores and runs to an identical empty digest (§6).
- **SNAP-012** (P0) — snapshot must carry the **slicer cursor id + `remainingInSlice`** so
  restore resumes mid-pass identically (Slicer §9-Q1/Q2). Absent from the Snapshot interface
  (14-§3) and from SNAP-008's completeness list.
- **SNAP-013** (P0) — snapshot must carry the **mutation counters** (flaw/copy/cosmic)
  (Mutation §3 MUT-COUNTER-SNAP + MUT-016). Absent.
- **SNAP-014** (P0) — snapshot must carry the **genebank state** (records + genotype nextId +
  per-size seq) (Genebank §5, GENE-009). Absent.
- **SNAP-015** (P0) — snapshot must carry **stats `generations` and `avgSize`** (not just
  births/deaths); `avgSize` feeds `searchLimit`, so omitting it changes post-restore
  trajectories (Stats §5/§3). 14-§3 lists only births/deaths.

  > **These four are the single most consequential finding.** SNAP-008 is the "add a mutable
  > field and INV-ROUNDTRIP fails" tripwire, yet its own enumerated field list does not reach
  > the slicer cursor, mutation counters, genebank records, or `avgSize` — all of which their
  > owning specs require to serialize. A *passing* INV-ROUNDTRIP today would still silently
  > diverge on any of them. This is a doc gap (14-§3 interface too narrow) **and** a test gap.

**15 Engine API & scenarios** (max API-010) — *most happy-path-skewed system*
- **API-011** (P0, neg) — `inject` into a full soup **throws a host error and never reaps**
  (distinct from `mal`); explicit FIXME hazard (§4.2/§6).
- **API-012** (P0, neg) — `inject` validates the genome (bytes `< activeSet.n`, length in
  `[minCellSize, soupSize]`) (§4.2 `assertValidGenome`).
- **API-013** (P1, neg) — limits validation rejects the §4.5 table (minCellSize<1,
  maxCellSize>soupSize, min>max, slicer.style≠'ran', non-int slicePow, non-uint32 seed, negative
  rates). API-002 covers ~2 of ~10 rules.
- **API-014** (P1, neg) — ratio-range validation: movPropThrDiv and reaper.threshold outside
  `(0,1]` rejected (§4.5).
- **API-015** (P1) — scenario immutability: normalized Scenario deep-frozen; host mutation of the
  passed object doesn't affect the run; round-trips through snapshot/RunDescriptor (§6).

### 2C. GeneScript

**01 Language & syntax** (max GS-018) — *no determinism criterion, unlike every other GS layer*
- **GS-019** (P1, neg) — lexer emits an `error` token for an unrecognized character and continues
  (§4/§2). GS-016 covers only parse-level ErrorStmt.
- **GS-020** (P1) — lexer **retains** comment tokens (editor highlighting); parser **discards**
  them (§3). GS-001 asserts only "no AST node".
- **GS-021** (P0) — lex/parse are deterministic pure functions of input (§6/C-GS-DET). This layer
  has no determinism criterion at all.
- **GS-022** (P1) — a label literally named `raw:` is a LabelDef, not a raw statement (§6/§3).

**02 Vocabulary** (max VOCAB-013)
- **VOCAB-014** (P1) — every verb string stored in canonical lower-kebab form (§6/§3); VOCAB-003
  tests uniqueness only.
- **VOCAB-015** (P1) — `register` present **iff** the verb ends in a register letter; VOCAB-005
  tests only the forward half.
- **VOCAB-016** (P2) — out-of-active-set verb greyed/hidden, not removed (§6/C-GS-SUBSET).

**03 Labels & templates** (max LBL-012)
- **LBL-013** (P1, neg) — a label immediately followed by a real verb needs **no spacer**; no
  redundant spacer inserted (§4.4/§6; the test file's own FIXME demands this).
- **LBL-014** (P1) — the allocator picks the lowest-index pattern of the current length in fixed
  ascending enumeration (§4.2) — the property that makes golden byte fixtures (COMP-002)
  authorable.
- **LBL-015** (P2) — mixed-length **prefix-confusable** candidate rejected (§4.3 prefix guard;
  §9-Q2 notes the definition still needs pinning).

**04 Compiler & lowering** (max COMP-016)
- **COMP-017** (P1) — a general `raw <mnemonic>` (non-nop, e.g. `raw movii`) lowers to the
  active-set opcode (§4.2/§3.1). COMP-003 covers only `raw nop0/nop1`.
- **COMP-018** (P2) — label→template owns its byte range in the source map; non-emitting
  statements own no range (§3.1/§4.4).
- (P2) Open-Q#1 "1 verb = 1 opcode" has no criterion that each non-label verb emits exactly one
  byte.

**05 Disassembler** (max DISASM-017) — *most thorough GS file*
- **DISASM-018** (P1, neg) — a **mid-genome** addressing instruction followed by a non-template
  falls back to `raw <mnemonic>` (§4). DISASM-009 covers only the end-of-genome dangling case.
- **DISASM-019** (P0) — Pass B pairs a reference with the **direction-aware nearest** complement
  the engine's search would land on, not merely any complement (§4) — the property that makes
  round-trip a fixed point. Cross-layer with engine TMPL.

**06 Diagnostics** (max DIAG-014)
- **DIAG-015** (P1) — diagnostics returned **sorted** by `(line, colStart, code)` (§5/§5.4).
  DIAG-010 asserts run-to-run identity, not the ordering rule.
- **DIAG-016** (P1, neg) — an unknown verb with **no** near match yields `unknown-verb` with
  `suggestion` omitted (never fabricate a "did you mean") (§5.1/§4-rule6).
- **DIAG-017** (P2) — "did you mean" tie-breaks deterministically by opcode order (§5.1/§5.4).

**07 Block form** (max BLOCK-014)
- **BLOCK-015** (P1, neg) — text→blocks on a program with parse errors yields best-effort blocks;
  ErrorStmt renders an error affordance, no crash (§6).
- **BLOCK-016** (P1) — insert/move/delete/edit-field map to AST edits and preserve `nodeId`
  (§4). BLOCK-004 covers reorder only.
- **BLOCK-017** (P2) — `raw` blocks are opaque to palette gating yet still round-trip exactly (§6).

### 2D. Content

**01 Content model** (max CONTENT-022)
- **CONTENT-023** (P2) — unknown frontmatter key ⇒ **warning**, not error (§3/§4).
- **CONTENT-024** (P2) — duplicate frontmatter key ⇒ last-wins + warning (§6).
- **CONTENT-025** (P1, neg) — unknown `subset` id ⇒ validate **error** (§4/§6). Negative-path
  parity is missing vs scenario(012)/starter(013)/verb(014)/prereq(015).
- **CONTENT-026** (P2) — valid frontmatter + whitespace-only body ⇒ `body: []`, **no** body
  diagnostic (§6).
- **CONTENT-027** (P1, neg) — well-formed directive with a **bad payload** (unknown config key /
  non-scalar value / goal missing `kind`) ⇒ validate error (§4). CONTENT-016 covers only
  parse-level malformed `:::`.

**02 Playground** (max PLAY-013)
- **PLAY-014** (P1, neg) — `injectEdited` of a valid genome into a too-full soup surfaces a
  diagnostic, never a silent reap (§6).
- **PLAY-015** (P1) — population→0 ⇒ `status:'ended'`, later `runTo`/`play` are no-ops, last frame
  observable (§6). The whole `status` lifecycle is untested.
- **PLAY-016** (P1) — `PlaygroundState` is frozen/read-only (§3 PLAY-STATE-READONLY) — the only
  §3 invariant without a criterion.

**04 Keyword** (max KEYWORD-013)
- **KEYWORD-014** (P1) — an **alias** surface form (`tank`, `baby`, `species`) resolves and the
  span reports the canonical term/category (§4.1/§3.2). KEYWORD-004 tests only alias uniqueness.
- **KEYWORD-015 / INSTRPAGE-017** (P0) — every verb entry's `link:{kind:'instruction',mnemonic}`
  resolves to a real per-instruction page, **and** every page's verb has a keyword entry (the
  missing half of CONTINV-COVERAGE; see §3).

**06 Goals** (max GOAL-012) — *most negative-path holes in content*
- **GOAL-013** (P1) — a `diversity` goal **passes** iff distinct live genotypes reach ≥ count by
  cycle N, `measured` = max seen (§4.2). Only the rejection case (GOAL-011) exists.
- **GOAL-014** (P1) — failure-hint selection for non-`replicates` kinds (§4.3 table of 8 codes;
  only 2 tested) incl. integer interpolation (`too-big`→size, etc.) and byte-identical templating.
- **GOAL-015** (P1, neg) — `out-populate` without a `rivalGenome` in the CheckContext is rejected
  (§4.5).

*(PROGRESS 05 and INSTRPAGE 03 are complete — no missing criteria found.)*

### 2E. Versus

**01 Match** (max MATCH-012)
- **MATCH-013** (P1) — early end when a single founder remains before threshold ⇒ that founder
  wins (configurable) (§4). Only total wipe-out (MATCH-010) exists.
- **MATCH-014** (P1) — inert genome that survives scores 1; inert-and-dead scores 0 (§6 boundary).
- **MATCH-015** (P1) — each tiebreaker (peak-population, total-births, earliest-threshold-lead,
  smaller-avg-size) breaks an equal-population tie by its rule (§2/§4). MATCH-006 tests only
  order+exhaustion→draw.
- **MATCH-016** (P1) — a founder with zero live population scores 0 and ranks **last** (distinct
  from `neutral`, which is excluded).

**02 Lineage** (max LINEAGE-010)
- **LINEAGE-011** (P0, neg) — a Versus build **asserts frames carry founder tags**; if the engine
  founder extension is absent, scoring is rejected with a clear error (§6). The one negative-path
  guard for the whole engine seam.
- **LINEAGE-012** (P1) — the per-founder census is a deterministic function of birth/death event
  order (§6/C-VS-DET).
- **LINEAGE-013** (P2) — a neutral (founder 0) creature's daughter is also neutral (§4/§9-Q3).

**03 Runner** (max RUNNER-014)
- **RUNNER-015** (P1) — best-of-N with an even number of symmetric players can **draw**, reported
  as a draw (§6).
- **RUNNER-016** (P0) — a threshold reached mid-slice stops **exactly after** the instruction that
  reaches it (deterministic boundary) (§6). RUNNER-008 asserts only "stops at the threshold".
- **RUNNER-017** (P1) — player **entry order** does not affect the result; only seed-derived
  de-biasing determines order (§4 fairness).
- **RUNNER-018** (P1) — `runMatch(desc)` is **idempotent** — re-running yields identical standings
  and result (§6).

**VSINV**
- Tighten **VSINV-MIRROR-SEED** (see §5 — statistical, no threshold/sample size stated).
- Consider a **VSINV-SOURCE** invariant for C-VS-SOURCE (scoring reads only engine observables,
  invents no metric) — currently only RUNNER-013 touches it.

### 2F. UI

**01 Worker** (max WORKER-019)
- **WORKER-020** (P1) — the full session **state-machine legality matrix**
  (created→inited→running↔paused→disposed), incl. `reset` re-inits (§4.7). WORKER-019 asserts a
  single example.

**02 Tank** (max TANK-022)
- **TANK-023** (P1) — empty/saturated soup render: population 0 ⇒ all cells class 0, no sparks,
  valid all-free buffer; saturated ⇒ no free cells, nothing special-cased (§6).
- **TANK-024** (P1) — quantization when `soupSize > width*height`: `bucketBytes>1`, small creature
  shares a cell, click resolves to bucket-start (§6).
- **TANK-025** (P1) — SoA buffers reused in place; re-alloc only on dimension change; nothing
  allocated per frame on the steady-state path (§3/§4.6/§6).

**03 Editor** (max EDITOR-032)
- **EDITOR-033** (P1) — empty/comment-only program: no diagnostics, zero bytes, empty (vacuously
  complete) source map, `injectable:true`, empty BlockDoc (§6).
- **EDITOR-034** (P1, neg) — mode switch with parse errors degrades to best-effort blocks + error
  affordance, never crashes (§6).
- **EDITOR-035** (P1, neg) — peek-under-hood on a failed compile shows an **empty** byte pane, not
  a stale map (§6).
- **EDITOR-036** (P1, neg) — a locked verb, if typed, diagnoses as `verb-not-unlocked` (§6).
  EDITOR-009 covers only "absent from completions".
- **EDITOR-037** (P1) — peek-under-hood for an **evolved** genome uses DISASM per-byte annotations
  (no authored source map) — the whole "study an evolved parasite" path (§4.5/§4.7).

**04 Inspector** (max INSPECTOR-014)
- **INSPECTOR-015** (P1) — inspector holds no authoritative state; renders the latest
  `inspectResult`, stable between steps (§4/UIINV-ROUNDTRIP).
- **INSPECTOR-016** (P0, neg) — a creature dying **between** `requestInspect` and reply renders
  "gone", never stale-but-live data (§6 race). INSPECTOR-012 covers only a statically dead address.
- *Widen INSPECTOR-004* to add the "full stack (10) renders all slots" half (§6).

**05 Charts** (max CHARTS-013)
- **CHARTS-014** (P1) — ChartModel clears its series on session re-init/reset; no stale points
  across runs. **Also a doc gap** — charts §4 never specifies reset behavior vs WORKER-007.

**06 Reader** (max READER-013)
- **READER-014** (P1) — a deterministic embedded playground (seed+config) renders identically for
  every learner (C-CON-DET via the worker) (§6). Binds UIINV-DET at the reader level.
- *Note:* the "reader page-navigation bounds" concern does not apply — Reader is a scroll model;
  deep-linking lives in SHELL.

**07 Shell** (max SHELL-014)
- **SHELL-015** (P1, neg) — a RunLink whose genome fails to compile routes to the surface with an
  error, not a crash (§6). SHELL-009 covers only the happy deep-link restore.

---

## 3. Recommended cross-layer integration tests

**The critical structural gap:** the cross-layer invariants already exist on paper
(GSINV-ANCESTOR/VALID/ROUNDTRIP, UIINV-EDITOR-ENGINE/DET, CONTINV-COMPILE, VSINV-INHERIT/ATTRIB)
but every one lives inside a **single** package's `_invariants.test.ts` with a "no `src/`
imports yet" note — and there is **no cross-package harness** to execute them. Worse:

- Root `npm test` runs only `test/replication.test.ts`; the ~616 package `it.todo`s are **not
  aggregated** into any root/CI runner, and there is **no npm-workspaces config**.
- These invariants require importing 2–3 sibling packages (e.g. GSINV-ANCESTOR needs
  `@tierra26/genescript` + `@tierra26/engine`), which the current per-package layout forbids.

**Recommendation:** create a dedicated **`packages/integration/test/*.test.ts`** (or root
`test/integration/`) with dev-dependencies on all sibling packages, add an npm-workspaces
`test` script that runs every package suite, and home the following `INT-*` criteria there.
Each is a real end-to-end path that no single-system test can cover.

| ID | Path it exercises | Backs / extends | Where it lives | Prio |
|---|---|---|---|---|
| **INT-ANCESTOR-GOLDEN** | GeneScript ancestor → compile → engine load → run sterile → **breeds true**, and its digest equals the hand-written byte-ancestor golden digest | GSINV-ANCESTOR + REPRO-012.. + a golden run (SPEC §12) | integration | P0 |
| **INT-COMPILE-LOAD-VALID** | Every content playground starter/solution + a generated corpus → compile → engine loads with **no illegal-opcode** error | GSINV-VALID, CONTINV-COMPILE, COMP-013, API-012 | integration | P0 |
| **INT-ROUNDTRIP-FIXEDPOINT** | compile → disassemble → compile is a **byte fixed point** over the ancestor corpus **and** evolved/mutated genomes (raw fallback) | GSINV-ROUNDTRIP, DISASM-010/011/019, EDITOR-028 | integration | P1 |
| **INT-SNAPSHOT-REPLAY-E2E** | run N cycles → snapshot **mid-daughter/mid-gestation** → restore → continue → **bit-identical**; and `replay(desc)` digest == live digest | INV-ROUNDTRIP/REPLAY/DET + **SNAP-012..015** (the completeness holes) | integration | P0 |
| **INT-EDITOR-ENGINE-3VIEW** | editor genome (+ peek opcodes) == injected genome == inspector disassembly — one genome, three views, across engine+genescript+ui | UIINV-EDITOR-ENGINE, EDITOR-023/024/029 | integration | P1 |
| **INT-FRAME-CONSISTENCY** | **one** `ObservationFrame` drives tank pixel buffer + charts series + inspector; population counts and genotype colors agree (no divergent copy) | UIINV-ROUNDTRIP, TANK-026 (proposed), CHARTS | integration | P0 |
| **INT-PLAYGROUND-GOAL** | `PlaygroundConfig` → worker session → frames → `checkGoal` verdict; deterministic per seed; `config→CheckContext→checkGoal` agree | CONTINV-DET, PLAY-007/012, GOAL-001/007 | integration | P1 |
| **INT-FOUNDER-ATTRIB-MUTATION** | mutation-ON match: `founderId` set at `inject` [15], inherited on `divide` [08], surfaced in frame [13]; per-founder partition holds as **genotypes drift** | VSINV-ATTRIB/INHERIT, LINEAGE-003/006, the engine seam | integration | P0 |
| **INT-KEYWORD-PAGE-JOIN** | every classic-32 verb has a keyword entry **and** a per-instruction page **and** a VOCAB row (total join, no orphans) | CONTINV-COVERAGE, KEYWORD-015/INSTRPAGE-017 | integration | P1 |
| **INT-WORKER-RESET-CHARTS** | worker `reset`/`init` clears accumulated chart series — no stale points carried across runs | CHARTS-014 (proposed), WORKER-007 | integration | P2 |

> **Engine seam alert (INT-FOUNDER-ATTRIB-MUTATION):** the versus `founderId` (set at inject,
> inherited on divide, surfaced in the frame) is described by the versus specs as a *required
> engine extension*, but **no engine-package criterion** (REPRO/API/STAT) mirrors it. Either add
> engine criteria (REPRO-025 inherit-founder-on-divide, API-016 inject-with-founderId,
> STAT-014 per-founder census in frame) or accept that the seam is only ever exercised from
> versus — which means a change to engine `divide` could silently break attribution with a green
> engine suite. Recommend the engine-side criteria.

---

## 4. Recommended property / fuzz tests

Several existing criteria are single-example assertions of what are really **universal
properties**. Elevating them to property/fuzz suites (fast-check or a seeded generator) closes
whole classes of edge cases at once.

| ID | Property | Elevates | Prio |
|---|---|---|---|
| **PROP-DISASM-NOTHROW** | the disassembler **never throws** on arbitrary byte arrays (0..255, any length, incl. dangling templates / illegal opcodes) | DISASM-011 (example) → fuzz | P0 |
| **PROP-COMPILE-VALID** | compiler output is **always** valid opcodes for the active set, over generated random valid programs | GSINV-VALID, COMP-013 → property | P0 |
| **PROP-DET-DESCRIPTOR** | same `RunDescriptor` ⇒ same digest, over many random descriptors/seeds/genomes | INV-DET (example) → property | P0 |
| **PROP-ALLOC-CHURN** | INV-MEM (sorted, non-overlapping, `occupancy+free==soupSize`) holds under random reserve/free/mal churn | ALLOC-008 (example) → fuzz | P0 |
| **PROP-QUEUE-MEMBERSHIP** | INV-QUEUE (every live creature in exactly one slicer + one reaper slot; dead in neither) under random birth/death sequences | INV-QUEUE (example) → fuzz | P1 |
| **PROP-MUT-DOMAIN** | every mutation/copy/cosmic output byte is a **valid opcode** in the active set, over all subsets incl. non-power-of-two | ISA-013 (proposed) → property | P0 |
| **PROP-INT-WRAP** | register arithmetic is signed-32-bit wrap over random op sequences | INV-INT / CPU-001 → property | P2 |
| **PROP-TEMPLATE-SEARCH** | complement match is bounded by `searchLimit` and lands on the nearest in-direction complement, for random template placements | TMPL-003/011/013 → property | P1 |

---

## 5. Vague / under-specified criteria to sharpen

`it.todo` names too loose to author a real test from — pin the threshold/order/fixture before
implementation, or the test will be brittle or vacuous.

| Criterion | Problem | Fix |
|---|---|---|
| **VSINV-MIRROR-SEED** (versus) | "favors no player **beyond seed noise**" — no threshold, sample size, or tolerance; not a deterministic assertion | State an exact expected tally over a fixed seed-rotation set, or an explicit tolerance + N |
| **SLICE-009** (engine) | "~2× the instructions on average" — no sample size / tolerance | Fix seed set + expected mean ± bound |
| **MUT-013 / MUT-014** (engine) | "within tolerance over a large sample" — no tolerance or N | Pin seed, N, and the acceptance interval |
| **RNG-013/014/015** (engine) | source-grep/lint assertions ("no `Math.random`", "no `/` or `*` on advance path"); §9-Q3 admits the enforcement mechanism is unresolved | Decide behavioral-test vs lint vs grep; RNG-016 (no-advance) is the behavioral substitute for part of it |
| **TMPL-010** (engine) | "merge behavior **documented**" | Change to **assert** two back-to-back nop runs resolve as one longer template (a concrete search result) |
| **LBL-003 / LBL-008** (genescript) | can't be tested without the engine TMPL search model at test time | Mark cross-layer; realize via INT-ROUNDTRIP / engine TMPL, not as GS-only unit tests |
| **COMP-002 / LBL-014** (genescript) | golden byte fixture needs a pinned template-allocation enumeration order | Land LBL-014 (enumeration order) first, then author COMP-002's fixture against it |
| **VOCAB-006** (genescript) | bundles family enumeration + "no unbound-register member" + (implicit) "single-binding ⇒ bare word" into one todo | Split the bare-word positive rule into its own criterion |
| **KEYWORD-012** (content) | doc tags the array-order tie-break as KEYWORD-012 but the test scopes 012 to determinism/registry-only | Add a dedicated first-wins tie-break assertion or re-scope (low priority — can't arise in a valid registry) |
| **RUNNER-004** (versus) | "seed-derived permutation, not slot index" is only assertable as "varies with seed" until engine [09] scheduler order is settled (§9-Q1) | Note the dependency; strengthen once the scheduler seed-stream is fixed |

---

## 6. Risk-ranked summary of where to spend first

1. **SNAP-012..015 (P0)** — the snapshot-completeness holes. A green INV-ROUNDTRIP today would
   still silently diverge on the slicer cursor, mutation counters, genebank records, and
   `avgSize`. Fix the 14-§3 interface **and** add the criteria. *(engine)*
2. **INT-SNAPSHOT-REPLAY-E2E + INT-ANCESTOR-GOLDEN + the integration harness (P0)** — there is
   currently no way to run any cross-layer invariant; and SPEC §12 mandates golden-run tests that
   don't exist. Build the harness, wire workspaces, aggregate the suites.
3. **INT-FOUNDER-ATTRIB-MUTATION + the missing engine founder seam (P0)** — attribution can break
   with a green engine suite.
4. **Determinism sharp edges (P0):** TMPL-013 (integer avgSize), REAP-012 (integer fullness),
   SLICE-010/RNG-016 (no stray RNG draws), ISA-013/PROP-MUT-DOMAIN (mutation domain). Any float
   or stray draw here is a silent replay break.
5. **UI doc↔test defects M1–M3 (P0):** two logic criteria mis-tagged `(visual)` and one
   criterion with its key half dropped — these actively mislead implementers.
6. **CPU flag subsystem (P0):** CPU-009/010 — S/Z flags and nop-clears-E have **zero** tests
   today.
7. **Negative-path parity across API (API-011..014), mutation (MUT-020), goals (GOAL-013/015),
   editor/inspector/shell failure paths (P1)** — the happy-path bias the audit found everywhere.

**Totals:** ~119 new per-system criteria + ~3 engine founder-seam criteria (§3) + 10 cross-layer
`INT-*` tests + 8 `PROP-*` suites ≈ **140 recommended new tests**; plus 6 doc↔test defect fixes
(§1). IDs are all append-only.
