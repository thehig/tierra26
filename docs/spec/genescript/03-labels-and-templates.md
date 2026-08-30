# Labels & Templates — Engineering Spec              (Code: LBL · Milestone: M2)

**Status:** v1, authored. The **key abstraction** of GeneScript: kids mark places with named
**labels** and jump/find *to a label*; this system lowers those labels into the engine's
complementary `nop`-template addressing, and — crucially — keeps the generated templates from
**colliding** or **merging** so a jump always lands where the author meant. Kids never type
`nop0`/`nop1`; this doc owns the machinery that hides them.

**Upstream refs:** [`00-overview.md`](00-overview.md) §2 (labels as addressing landmarks), §3
(the **LBL** lowering step in the pipeline), §5 (cross-cutting contracts);
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §5 (template addressing in depth) and
**§5.5** (the adjacent-template **MERGE** gotcha this system exists to prevent), §3.3 (the
classic-32 `nop0=0`/`nop1=1`, `jmp*`/`adr*`/`call` opcodes), §9 (constants: `MinTemplSize=1`,
`SearchLimit=5.0`, `nop0/nop1/NopS=0/1/1`);
[`../engine/systems/06-template-addressing.md`](../engine/systems/06-template-addressing.md)
(TMPL — the search this lowering must satisfy: complementary, outward one cell at a time,
skipping non-nops, bounded by `floor(5.0 × avgSize)`, landing just past the matched run).

**Contracts obeyed:** **C-GS-DET** (allocation is a deterministic function of source order — no
RNG, no wall-clock), **C-GS-VALID** (every emitted template is well-formed: legal `nop0`/`nop1`
opcodes, resolvable by the engine's search for the active set), **C-GS-NOOPCODES** (reads
`nop0`/`nop1`/`jmp*`/`adr*`/`call` opcodes from the engine's active set, never hard-codes them),
**C-GS-SUBSET** (a label reference whose control verb is outside the active subset is a DIAG
error, not a lowering surprise). Depends on the engine's **INV-TEMPLATE** (`nop0/nop1 = 0/1`,
complement match uses `NopS == 1`).

---

## 1. Purpose & responsibility

This system owns the **label → template** lowering: it turns each named label and each
reference to it (`jump`, `jump-back`, `call`, `find`, `find-back`, `find-forward`) into concrete
`nop0`/`nop1` byte runs the engine can resolve by complementary search. It must guarantee: (a)
for every referenced label a **unique template bit-pattern** `T` is chosen, placed **at the
label site**, with the bitwise **complement** `T̄` placed at every reference; (b) the reference's
control verb selects a search **direction** (jump-back → backward, jump/call → outward, find-back
→ `adrb`, find-forward → `adrf`, find → `adro`) such that the engine's search reaches the
intended label and no other; (c) **template lengths** are the minimal length that stays
**unambiguous** under the active search limit and the other allocated templates — length grows
only when a shorter one would be confusable; (d) **no two adjacent `nop`-runs** are ever emitted
that the VM would read as one longer template (the **MERGE** gotcha, ISA-VM §5.5) — a non-`nop`
spacer is inserted between abutting runs; (e) allocation is **deterministic** — a pure function
of source order with no RNG, so the same source always yields byte-identical templates
(C-GS-DET / GSINV-DETERMINISM). The system is a **pure pass over the checked AST**: it consumes
labels + references and produces a template assignment (which pattern at which site, plus
inserted spacers) that COMP (§[04]) then serializes to bytes.

**What it is *not*:** it does not emit final opcode bytes (COMP does), does not validate verbs
against the active subset (DIAG does), and does not concern itself with *evolved* templates —
once a genome is running in the soup, its `nop` runs are just code the engine matches; mutation
may drift them, and that is the engine's problem (§6, §7), never the compiler's to preserve.

---

## 2. Interfaces

LBL is a lowering pass consumed by COMP (§[04]). It exposes a pure function over the checked AST
and a description of the placement it chose. (Types are illustrative; finalized with COMP.)

```ts
// A template bit-pattern: the ordered nop bits at a site. bit 0 == nop0, bit 1 == nop1.
type TemplateBits = ReadonlyArray<0 | 1>;

// The direction the engine will search from a reference, chosen by the control verb.
type LowerDir = 'out' | 'fwd' | 'bwd';   // maps to jmpo/adro | adrf | jmpb/adrb

// One placed nop-run in the lowered program (label site or reference site).
interface TemplatePlacement {
  atStmt: StmtId;        // the AST statement this run belongs to (for the source map)
  role: 'label' | 'ref'; // label site carries T; reference site carries the complement T̄
  labelName: string;     // the label this run addresses
  bits: TemplateBits;    // the nop pattern to emit (T at label, complement(T) at ref)
  dir?: LowerDir;        // present on 'ref' — the search direction its verb implies
}

// A required non-nop separator emitted between two runs that would otherwise MERGE.
interface Spacer { afterStmt: StmtId; reason: 'merge-avoidance'; }

interface LowerResult {
  placements: TemplatePlacement[];         // deterministic order == source order
  spacers: Spacer[];                        // where COMP must inject a non-nop cell
  templates: Map<string, TemplateBits>;     // label → its chosen pattern T (for disasm/debug)
}

// Pure over the checked AST + the active set (for nop/jmp/adr/call opcodes). No RNG.
function lowerLabels(ast: CheckedAst, set: InstructionSet): LowerResult;
```

- **Imports:** the AST/label types from §[01], the active `InstructionSet` from the engine (for
  `nop0`/`nop1` opcodes + which control verbs exist; C-GS-NOOPCODES). No `src/` imports exist yet
  (M2 pending; tests are `it.todo`).
- **Imported by:** COMP (§[04]) which serializes placements + spacers to bytes and threads the
  source map; DISASM (§[05]) reads `templates` to name a `nop` run back to its label best-effort.

---

## 3. Data structures

LBL holds **no persistent state** across compiles (C-SNAP-analogue; C-GS-DET). Within one pass it
carries the allocation table below, all derived deterministically from source order.

| Field | Source | Domain / units | Invariant |
|---|---|---|---|
| `labelName` | AST label decl | identifier string | each declared label unique in the program (DIAG enforces) |
| `T` (`bits`) | allocator (§4.2) | `TemplateBits`, length `s ∈ [MinTemplSize(1), soupSize)` | placed **verbatim** at the label; complement at each ref |
| `complement(T)` | derived | per-bit `0↔1` flip of `T` | `T[i] + complement(T)[i] == NopS == 1` for all `i` (INV-TEMPLATE) |
| `dir` | control verb | `'out' \| 'fwd' \| 'bwd'` | jump-back→bwd, jump/call→out, find-back→bwd(`adrb`), find-forward→fwd(`adrf`), find→out(`adro`) |
| `s` (length) | allocator (§4.3) | integer, grows only on collision | minimal length that keeps `T` unambiguous vs all live templates under the search limit |
| `searchLimit` | engine `World` at run time | `floor(SearchLimit(5.0) × avgSize)`, integer | LBL uses a **conservative estimate** (§6) — it does not know the run-time soup |
| spacer | merge check (§4.4) | one non-`nop` cell | inserted iff a label-run would abut a reference-run (or two runs) with no non-nop between |

Constants inherited from ISA-VM §9: `MinTemplSize = 1` (shortest legal template is a single
`nop`), `nop0/nop1/NopS = 0/1/1`. The allocator's alphabet is `{nop0, nop1}` only — a template
is a binary string; `complement` is bitwise NOT.

---

## 4. Behavior / algorithms

### 4.1 Collect references (deterministic scan)
Walk the checked AST **in source order**. For each label declaration record its site; for each
control statement that names a label (`jump`, `jump-back`, `call`, `find`, `find-back`,
`find-forward`) record a reference `(labelName, dir)` where `dir` is fixed by the verb:

| GeneScript verb | classic-32 op | `dir` | Rationale |
|---|---|---|---|
| `jump-back <label>` | `jmpb` | `bwd` | loop back to an earlier landmark (the common case) |
| `jump <label>` | `jmpo` | `out` | jump to the nearest matching template either way (outward) |
| `call <label>` | `call` | `out` | outward like `jmpo`, plus a pushed return address |
| `find-back <label>` | `adrb` | `bwd` | locate a landmark behind (e.g. `start`) → address in A |
| `find-forward <label>` | `adrf` | `fwd` | locate a landmark ahead (e.g. `end`) → address in A |
| `find <label>` | `adro` | `out` | locate the nearest either-direction (rare) |

Only labels that are actually **referenced** get a template (an unreferenced label is a landmark
with no addressing consumer — DIAG may hint it is dead; LBL allocates nothing for it).

### 4.2 Allocate a unique pattern per label (deterministic, no RNG)
Assign templates in **source order of first reference** (C-GS-DET: order is the only input). For
each label needing a pattern, pick the **lowest-index** binary string of the current length that
is not yet confusable with any already-allocated template (§4.3 defines confusable). Enumeration
is a fixed order — e.g. length-1: `[0]`, `[1]`; length-2: `[0,0],[0,1],[1,0],[1,1]`; length-`k`:
ascending as `k`-bit integers — so the *n*-th label always gets the same pattern for the same
source. There is **no PRNG, no hashing of names, no wall-clock**: rename a label and (because the
reference order is unchanged) the *bytes* are identical (a renamed-label round-trip is still
byte-stable — GSINV-DETERMINISM).

```
allocate(labels_in_ref_order):
  live = []                            # (name -> pattern) already chosen
  len  = MinTemplSize                  # start at the shortest legal template (1)
  for label in labels_in_ref_order:
     T = firstPatternOfLength(len) not confusable-with any live       # §4.3
     while T is null:                  # nothing of this length works → grow
        len = len + 1
        T = firstPatternOfLength(len) not confusable-with any live
     live.append((label, T))
  return live
```

### 4.3 Template length & collision / uniqueness
Two distinct labels must get patterns a jump can **tell apart**. The hazards, and the rule:

- **Self-match is impossible by construction.** Matching is *complementary* (§5, ISA-VM §5.2): a
  template never matches a copy of itself. So a label's own `T` and its references' `complement(T)`
  never match *each other's identical copies* — only `T̄` finds `T`. This is why the label carries
  `T` and the reference carries `complement(T)`.
- **Cross-label confusion is the real risk.** A reference for label `X` carries `complement(Tx)`.
  If some *other* label `Y` was placed with `Ty == complement(Tx)` (i.e. `Ty` is the complement of
  `Tx`), then the reference for `X` would *also* match `Y`'s site — and if `Y` is nearer in the
  search direction, the jump lands on the wrong label. **Rule:** distinct labels get patterns that
  are neither equal **nor complementary** to one another (`Tx != Ty` and `Tx != complement(Ty)`).
  Under this rule a given `complement(Tx)` complements exactly one live label — `X` — so a hit is
  unambiguous **as to which label**.
- **Length grows only when forced.** At length `k` there are `2^k` patterns; the non-equal /
  non-complementary constraint pairs them, giving `2^(k-1)` usable *representatives*. Length 1 →
  1 label, length 2 → 2, length 3 → 4, length `k` → `2^(k-1)`. When the current length is
  exhausted, `allocate` bumps `len` and continues (§4.2). Minimal length keeps templates short
  (cheaper to emit, less to mutate) while staying unambiguous — the **uniqueness-vs-length**
  tradeoff.
- **Prefix/substring confusion under variable length.** Because the engine measures a run by
  scanning *until a non-nop* (ISA-VM §5.1), a shorter template that is a **prefix** of a longer
  one is not automatically safe — the search reads the *whole* run at a site. LBL therefore treats
  "confusable" conservatively: a candidate `T` is rejected if, against any live template `U` (of
  any length), `T == U` or `T == complement(U)` **or** one is a prefix of the other in a way that
  a length-`len(U)` complement scan at a `T`-site could satisfy. In practice equal-length
  allocation with the non-equal/non-complement rule is the common path; the prefix guard is the
  belt-and-suspenders for mixed lengths.

### 4.4 MERGE avoidance (ISA-VM §5.5) — never emit two adjacent nop-runs
The VM reads a template by scanning **consecutive** `nop` bytes until a non-`nop` (ISA-VM §5.1).
So two back-to-back `nop`-runs — e.g. a label's `T` immediately followed by the next statement's
reference `complement(T')`, or a label placed right after a jump's template — **read as one longer
template**, silently breaking both. LBL guarantees this never happens in generated code:

```
for each pair of nop-runs (Ra, Rb) that would be adjacent in emission order:
   if no non-nop cell lies between Ra and Rb:
      request a spacer (a non-nop instruction) between them   # Spacer{reason:'merge-avoidance'}
```

The spacer is any **non-`nop`** cell COMP can legally place there without changing behavior — the
natural instruction that already follows (a label site is typically followed by a real verb, which
*is* the spacer), or, when two runs would truly abut (e.g. a reference template immediately
preceding a label template), an explicit inert instruction. LBL emits the *request*; COMP realizes
it. The raw-VM merge semantics are **preserved unchanged** (evolved/hand-`raw` code may still
merge — that is the engine's documented behavior, ISA-VM §5.5 / TMPL-010); LBL only prevents the
compiler from ever *authoring* an accidental merge.

### 4.5 Direction, wrap-around & search-limit awareness
- **Direction** is the verb's (§4.1). `jump-back`/`find-back` search backward, so the label they
  target should lie *behind* the reference in source order for the nearest hit to be the intended
  one; `find-forward` searches forward; `jump`/`call`/`find` search outward and take the nearest
  either way. DIAG (§[06]) is where a "you `jump-back` to a label that is ahead of you" hint lives;
  LBL assumes the checked AST is direction-sane and lowers faithfully.
- **Wrap-around.** The engine's search wraps the soup ends via `ad()` (TMPL §6). Within a single
  creature this rarely matters, but LBL must not rely on "there is nothing past my end" — a
  template could match a complementary run in a *neighboring* creature. Uniqueness across the whole
  soup is not achievable at compile time (other genomes are unknown), so LBL guarantees uniqueness
  **within the compiled creature** and relies on nearest-wins + the search limit to keep intra-
  creature jumps local. (Inter-creature template collision is a *feature* — it is how parasites
  reach another's code, ISA-VM §5.)
- **Search-limit awareness.** The engine's reach is `floor(5.0 × avgSize)` (TMPL §3). LBL does not
  know the run-time `avgSize`, but a self-replicator is smaller than `5 × avgSize` in any healthy
  soup, so intra-creature landmarks are always in reach. LBL keeps templates short and places each
  label's `T` and its references in the same creature, so the intended hit is the **nearest**
  matching run in the chosen direction and well inside the limit (see §6 for the conservative
  assumption and its open question).

### 4.6 Self-location markers (`start` / `end`) for the reproduction loop
The replication loop (ISA-VM §6, overview §2 example) uses two self-location landmarks:
`start:` at the creature's first instruction and `end:` at its last, found by
`find-back start` (`adrb`) and `find-forward end` (`adrf`) to compute size = end − start. LBL
treats these like any other label — allocate a unique `T` for `start`, another for `end`, place
each at its site, place `complement` at the `find-back`/`find-forward`. Two properties matter: (1)
`start`'s and `end`'s templates must be **distinguishable** (non-equal, non-complementary) so
`find-back start` never lands on `end` and vice-versa; (2) they must be at the true first/last
instruction so the computed size spans the whole genome. These are ordinary consequences of §4.2–
§4.3; they are called out because the ancestor *depends* on them and the headline GSINV-ANCESTOR
test breeds-true only if they hold.

---

## 5. Interconnections

- **Calls:** the engine's active `InstructionSet` for the `nop0`/`nop1` opcodes and the set of
  control verbs (C-GS-NOOPCODES); nothing else — LBL is otherwise pure over the AST.
- **Called by:** COMP (§[04]), which runs LBL then serializes `placements` + `spacers` to bytes and
  builds the source map (each placement carries `atStmt` so every emitted `nop` maps to its
  statement — GSINV-SOURCEMAP). DISASM (§[05]) reads the `templates` map to re-name a recognized
  `nop` run to its label (best-effort; unmapped/mutated runs fall back to `raw nop0/nop1`).
- **Contracts crossed:** C-GS-DET (source-order allocation, no RNG — the same source compiles to
  identical templates), C-GS-VALID (every template is a well-formed run of legal `nop` opcodes the
  engine can resolve), C-GS-NOOPCODES (opcodes read from the active set). Relies on the engine's
  TMPL contract (complementary, outward-stepping, non-nop-skipping, limit-bounded search) — LBL is
  correct **iff** it emits patterns that TMPL resolves to the intended site; the LBL tests assert
  the *placement*, the engine's TMPL tests assert the *search*, and GSINV-ANCESTOR ties them.
- **Depends on** INV-TEMPLATE from the engine: `nop0/nop1 = 0/1` and complement match via
  `NopS == 1` — the whole `T` / `complement(T)` scheme is invalid otherwise.

---

## 6. Determinism & edge cases

- **Determinism (C-GS-DET).** Allocation is a pure function of source order: labels are numbered by
  first-reference order, patterns are enumerated in a fixed ascending order, spacers are inserted at
  deterministic sites. No `Math.random`, no name-hash, no wall-clock. Compiling twice → byte-
  identical templates + spacers (GSINV-DETERMINISM); renaming a label leaves bytes unchanged.
- **Search-limit is a *conservative* compile-time assumption.** LBL cannot know run-time `avgSize`,
  so it assumes any two sites within one compiled creature are in reach (true whenever
  creatureSize ≤ 5 × avgSize, which holds for a lone replicator). It keeps templates short and
  intra-creature so the intended hit is the nearest in-direction match. Pathologically large
  hand-authored genomes are an open question (§9).
- **Nearest-wins is load-bearing.** With the non-equal/non-complementary rule, a reference's
  complement matches exactly one label's pattern *class*; if the author placed two same-class
  copies (impossible for generated code, possible via `raw`), nearest-wins in the chosen direction
  decides. LBL guarantees one intended target per reference within the creature.
- **Wrap-around & neighbors.** Uniqueness is guaranteed only within the compiled creature; a
  generated template can still match a complementary run in another creature across the soup wrap.
  This is intended (parasitism) and out of LBL's control; LBL never *depends* on the absence of an
  outside match.
- **Zero-length / no template.** LBL never emits a length-0 template; the shortest is
  `MinTemplSize = 1`. A control verb with no label target is a syntax/DIAG error, not an LBL case.
- **Merge edge.** The one place LBL *must* act is two `nop`-runs with no non-nop between them; the
  spacer request (§4.4) covers label→ref, ref→label, and ref→ref adjacencies. A label immediately
  followed by a real verb needs no spacer (the verb *is* the non-nop separator).
- **Evolved templates are not LBL's concern.** Once compiled, templates are ordinary bytes; copy
  mutation / cosmic rays (ISA-VM §7) may flip a `nop` bit, lengthen/shorten a run, or turn a `nop`
  into a real op. The running engine resolves whatever is there by the same complementary search;
  LBL neither tracks nor repairs drifted templates. DISASM handles reading them back (raw fallback).

---

## 7. Fidelity notes

| Aspect | Tag | Note |
|---|---|---|
| Labels → complementary `nop` templates (`T` at label, `T̄` at ref) | **[CORE]** | The exact engine addressing mechanism (ISA-VM §5.2); LBL is a *lowering*, it changes no VM semantics. |
| Direction from the verb (back→bwd, jump/call→out, find-back→adrb, find-forward→adrf) | **[CORE]** | Mirrors the classic-32 op set (ISA-VM §3.3). |
| Minimal-length, non-equal/non-complementary allocation | **[MOD]** | A *compiler* policy (no Tierra analogue — Tierra genomes were hand-written). Chosen for short, unambiguous templates; deterministic. |
| MERGE avoidance via spacers | **[MOD]** / **FIXME** | The compiler-side half of ISA-VM §5.5. Raw VM merge behavior is **preserved** (TMPL-010); LBL only stops the compiler from authoring an accidental merge. Do **not** "fix" merge in the VM. |
| Deterministic, RNG-free allocation | **[CORE]** (C-GS-DET) | Same source → identical bytes; required for GSINV-DETERMINISM and replayable golden runs. |
| Evolved/drifted templates left to the engine | **[CORE]** | Templates are just code under selection; the compiler does not preserve or repair them (ISA-VM §7). |
| Cross-soup (inter-creature) template collision | **[CORE]** | Intended (parasitism); LBL guarantees uniqueness only *within* a creature. |

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/genescript/test/03-lbl.test.ts`. IDs are
append-only — never renumber.

- **LBL-001** — A label plus a `jump-back` to it lowers to a template `T` at the **label site** and
  its bitwise **complement** `complement(T)` at the **jump** site (label carries `T`, reference
  carries `T̄`; `T[i] + T̄[i] == NopS == 1`).
- **LBL-002** — Two **distinct** labels are assigned **distinguishable** patterns: neither equal
  nor complementary to one another (`Tx != Ty` and `Tx != complement(Ty)`), so a reference for one
  cannot match the other's site.
- **LBL-003** — Under the engine's complementary search, a reference resolves to the **intended**
  label (the nearest in-direction complementary run) and to no other, within the search limit.
- **LBL-004** — Direction is chosen from the control verb: `jump-back`/`find-back` → **backward**
  (`jmpb`/`adrb`), `find-forward` → **forward** (`adrf`), `jump`/`call`/`find` → **outward**
  (`jmpo`/`call`/`adro`).
- **LBL-005** — Two `nop`-runs that would be **adjacent** in emission (label→ref, ref→label, or
  ref→ref with no non-nop between) are separated by an inserted non-`nop` **spacer** so the VM
  never reads them as one merged template (ISA-VM §5.5).
- **LBL-006** — Template **length grows** only when needed for uniqueness: as long as the current
  length has an unused non-equal/non-complementary pattern, length stays minimal; when exhausted,
  length increments (length `k` supports `2^(k-1)` labels).
- **LBL-007** — Allocation is **deterministic** across compiles: compiling the same source twice
  yields byte-identical templates + spacers; **renaming** a label (order unchanged) leaves the
  emitted bytes unchanged (no name-hash, no RNG — C-GS-DET).
- **LBL-008** — `find-back` and `find-forward` pick the correct direction so the self-location
  landmarks resolve as intended: `find-back start` finds the **start** landmark behind, and
  `find-forward end` finds the **end** landmark ahead (they never cross-match each other).
- **LBL-009** — `start`/`end` self-location markers used by the reproduction loop get **distinct**
  templates placed at the creature's true first and last instructions, so size = end − start spans
  the whole genome (a precondition of GSINV-ANCESTOR breeding true).
- **LBL-010** — Every emitted `nop` run is a **well-formed** template of length ≥ `MinTemplSize`
  (1), composed only of the active set's `nop0`/`nop1` opcodes (C-GS-VALID; opcodes read from the
  active set, never hard-coded — C-GS-NOOPCODES).
- **LBL-011** — Only **referenced** labels get templates; an unreferenced label produces no `nop`
  run (a landmark with no addressing consumer emits nothing).
- **LBL-012** — Uniqueness is guaranteed **within the compiled creature** only; LBL does not (and
  must not) depend on the absence of a complementary match elsewhere in the soup (inter-creature
  collision is the intended parasitism mechanism).

---

## 9. Open questions

1. **Search-limit assumption.** LBL assumes intra-creature sites are always in reach
   (`creatureSize ≤ 5 × avgSize`). Confirm this holds for the largest hand-authored tutorial
   genomes, or add a compile-time DIAG warning when a creature is large enough that a landmark
   could fall outside a plausible search limit.
2. **Prefix confusion under mixed lengths.** The equal-length non-equal/non-complementary rule is
   clean; the mixed-length prefix guard (§4.3) needs a precise, tested definition of "confusable"
   before length ever varies within one program. Is it ever worth allowing mixed lengths, or should
   LBL pick a **single** length large enough for all of a program's labels (simpler, slightly
   longer templates)?
3. **Spacer choice.** When an explicit spacer is required (a ref-run abutting a label-run), which
   inert instruction does COMP insert, and is it always behavior-neutral in every position? (Owned
   with COMP §[04].)
4. **Disassembly of drifted templates.** How should DISASM (§[05]) name a `nop` run that *nearly*
   matches an allocated template but has mutated — best-effort label with a "(drifted)" note, or
   always `raw`? (Owned with DISASM.)
