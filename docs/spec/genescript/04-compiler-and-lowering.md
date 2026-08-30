# Compiler & Lowering — Engineering Spec              (Code: COMP · Milestone: M2)

**Status:** v1. Owns the **back half of the compile pipeline**: turning a checked AST into
**classic-32 opcode bytes** plus a **source map** and **diagnostics**. It resolves friendly
verbs to engine `InstrId`s **via the engine ISA** (never hard-coded opcodes), invokes the
label/template lowering pass ([`03`](03-labels-and-templates.md)), emits the opcode bytes for
the **active set**, assembles them into a genome, and builds the statement↔byte-range source
map that powers peek-under-hood and editor highlighting. Compilation is **deterministic** and
**active-subset-aware**.

**Upstream:** [`00-overview.md`](00-overview.md) §3 (pipeline), §5 (contracts
C-GS-DET/C-GS-VALID/C-GS-SUBSET/C-GS-NOOPCODES), §6 (invariants GSINV-SOURCEMAP/
GSINV-VALID/GSINV-DETERMINISM); [`ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3 (encoding —
dictionary/named set, opcode = index into the active set, `nop0/nop1 = 0/1`), §8 (encoding
summary). Depends on the engine ISA: [`engine/systems/04-instruction-set-and-dispatch.md`](../engine/systems/04-instruction-set-and-dispatch.md)
(the `InstructionSet` this compiler imports). Reuses the anchor doc template + criterion/test
conventions ([`engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8).

**Sibling passes (this doc does NOT duplicate them):** lexing/parsing → AST is
[`01-language-and-syntax.md`](01-language-and-syntax.md); the verb↔mnemonic table is
[`02-vocabulary-and-keywords.md`](02-vocabulary-and-keywords.md); **label→template lowering**
(complementary nop allocation, merge/collision avoidance, length choice) is
[`03-labels-and-templates.md`](03-labels-and-templates.md) — COMP **invokes** it, does not
reimplement it; kid-friendly message content/tone is
[`06-diagnostics-and-validation.md`](06-diagnostics-and-validation.md) (DIAG) — COMP **emits**
DIAG-typed diagnostics but does not own their wording; reverse decompilation is
[`05-disassembler.md`](05-disassembler.md).

**Contracts obeyed:** **C-GS-DET** (source + active set → identical bytes + map; no RNG, no
wall-clock), **C-GS-VALID** (every emitted byte is a legal opcode for the active set; templates
well-formed), **C-GS-SUBSET** (verbs outside the scenario's active subset are rejected with a
DIAG error), **C-GS-NOOPCODES** (opcodes are read from the engine's active `InstructionSet` at
compile time, never hard-coded). Enforces **GSINV-SOURCEMAP** (every emitted byte maps to
exactly one statement; each statement to a contiguous range), **GSINV-DETERMINISM**,
**GSINV-VALID**.

---

## 1. Purpose & responsibility

This system is the **lowering back-end**: given a *checked* AST (produced by [`01`], validated
by [`06`]) and the **active `InstructionSet`** the scenario enables, it produces the genome
bytes the engine can load, a bidirectional source map, and any diagnostics raised during
lowering. It owns three guarantees:

- **Opcode fidelity via the ISA.** Every verb is resolved to a canonical engine `InstrId` (via
  the vocabulary [`02`]), then to the **opcode** that `InstrId` occupies *in the active set* —
  by reading `set.opcodeToId`/`entryOf`, **never** by embedding a number (C-GS-NOOPCODES). If
  the active set is a tutorial subset, the same verb may emit a *different* byte than under
  `classic32`; the compiler follows the set, not a table of constants.
- **Determinism.** The same `(source, active set)` yields **byte-identical** output and an
  identical source map on every run — no `Math.random`, no `Date.now`, no map-iteration-order
  dependence. Template allocation is delegated to [`03`], which is itself a deterministic
  function of source order (no RNG); COMP adds no nondeterminism of its own (C-GS-DET).
- **Subset targeting + validity.** A verb not in the active subset is **rejected** with a
  friendly DIAG error (C-GS-SUBSET — this is how tutorials gate vocabulary); and every byte a
  *successful* compile emits is a **legal opcode** for the active set, with well-formed
  templates (C-GS-VALID / GSINV-VALID).

It does **not** lex/parse (that is [`01`]), decide message wording/tone (that is [`06`]),
allocate or place templates itself (that is [`03`]), or disassemble (that is [`05`]). It
**orchestrates** those passes and does the final byte emission + map assembly.

---

## 2. Interfaces (TS surface it exposes; who imports it)

Module: `packages/genescript/src/compile.ts` (companion pending test:
`packages/genescript/test/04-comp.test.ts`). It imports the **engine ISA** — the active
`InstructionSet` and dictionary accessors — from `@tierra26/engine` (C-GS-NOOPCODES); it does
**not** import engine simulation state (no `World`). It imports the checked-AST types from
[`01`], the verb→`InstrId` resolver from [`02`], the label-lowering pass from [`03`], and the
diagnostic constructors from [`06`].

```ts
import type { InstructionSet, InstrId } from '@tierra26/engine'; // the ACTIVE set (§3, ISA-VM §3)
import type { CheckedProgram, Statement } from './ast.ts';       // from [01]/[06]
import type { Diagnostic } from './diagnostics.ts';              // from [06]

// The compile entry point (00-overview §3 pipeline back-end).
declare function compile(source: string, activeSet: InstructionSet): CompileResult;

interface CompileResult {
  bytes: Uint8Array;          // the genome: each byte an opcode in [0, activeSet.n)  (C-GS-VALID)
  sourceMap: SourceMap;       // statement <-> contiguous byte range, bidirectional   (GSINV-SOURCEMAP)
  diagnostics: Diagnostic[];  // errors/warnings/hints from lowering ([06] owns tone) (C-GS-SUBSET)
}
// On any error-severity diagnostic, `bytes` is empty and `sourceMap` covers nothing
// (a failed compile emits diagnostics only) — callers gate on `diagnostics.some(isError)`.

// The source map: bidirectional statement <-> byte-range index (§3.2).
interface SourceMap {
  // statement index -> its contiguous, half-open byte range [start, end) in `bytes`.
  ranges: ReadonlyArray<ByteRange>;            // indexed by statement index; length = #emitting statements
  // reverse lookup: which statement produced the byte at `offset`? (peek-under-hood, DISASM)
  statementAt(offset: number): number;         // total over [0, bytes.length): exactly one owner
}
interface ByteRange { stmt: number; start: number; end: number; } // end exclusive; end > start
```

- `compile` is a **pure function** of its two arguments (C-GS-DET): no ambient state, no
  clock, no RNG. Two calls with equal `(source, activeSet)` return equal `bytes` and an equal
  map (GSINV-DETERMINISM).
- `activeSet` is supplied by the caller (the editor/playground or a scenario harness) and is
  the **single source of truth** for opcode values, set size `n`, and which verbs are legal.
  The compiler reads it; it never constructs opcodes from literals (C-GS-NOOPCODES).

Consumers: the **editor/playground** (highlighting via `SourceMap`, error underlines via
`diagnostics`), the **disassembler** [`05`] (round-trip fixture), the cross-layer invariant
suite (`_invariants.test.ts`, GSINV-*), and the ancestor breeds-true test (GSINV-ANCESTOR).

---

## 3. Data structures

### 3.1 The lowering intermediate (per statement)
Between the AST and the byte buffer, each **emitting** statement is lowered to an ordered list
of *emit items*. An emit item is either a **verb opcode** (one byte) or a **template fragment**
(a run of `nop0`/`nop1` bytes) supplied by the label pass [`03`]:

| Item | Source | Bytes | Notes |
|---|---|---|---|
| verb | AST verb node | 1 | opcode = index of the verb's `InstrId` in the active set (§4.2) |
| template | [`03`] for a label def or a control-verb target | `s` (≥ `MinTemplSize`=1) | placed by [`03`]; COMP emits the bytes it returns |
| raw mnemonic | AST `raw` node (advanced mode) | 1 | resolved to `InstrId` by mnemonic, then to opcode via the set |

Label-definition statements and comment/blank lines are **non-emitting** except where [`03`]
attaches a template to a label site; the source map records ranges only for statements that
produce ≥1 byte (a label that lowers to a template *does* own its template bytes).

### 3.2 `SourceMap` (bidirectional statement↔byte-range)

| Field | Type | Why / units | Invariant |
|---|---|---|---|
| `ranges` | `ByteRange[]` | forward: statement → its contiguous half-open `[start,end)` | ranges are **disjoint**, **sorted**, **cover `[0, bytes.length)` with no gaps** |
| `statementAt(off)` | `(number)=>number` | reverse: byte offset → owning statement index | total and single-valued over every `off ∈ [0, bytes.length)` (GSINV-SOURCEMAP) |

The two directions are **consistent**: `statementAt(off) === r.stmt` for the unique `r` with
`r.start ≤ off < r.end`. Each statement's bytes are **contiguous** (a statement never
interleaves its bytes with another's) — this is what lets the editor highlight one line as one
solid range and lets DISASM attribute any byte to its line. `ranges` is built in **emission
order**, so it is inherently sorted and gap-free by construction (§4.4).

### 3.3 What COMP reads from the engine `InstructionSet` (imported, not copied)
Only the fields needed to map verbs→bytes and validate them (ISA-VM §8; ISA §2):

- `set.opcodeToId: Int16Array` — the mask; COMP inverts it (once, at compile start) to build
  `InstrId → opcode` for the active set. This inversion is the **whole** of "reading opcodes
  from the ISA."
- `set.n` — set size; the legal opcode range is `[0, n)` (validity check, §4.5).
- `set.nop0`, `set.nop1` — the template byte values (must be `0`/`1`; ISA-VM §8 / INV-TEMPLATE);
  handed to [`03`] and used when emitting template fragments and `raw nop0/nop1`.
- dictionary accessor (`entryOf`) — to map a raw mnemonic (advanced mode) or a verb's resolved
  `InstrId` back to its dictionary entry when needed for diagnostics.

COMP **never** stores its own copy of the opcode order (C-GS-NOOPCODES); if the scenario swaps
in a different active set, the emitted bytes change accordingly with no code change.

---

## 4. Behavior / algorithms

### 4.1 Top-level flow
```
compile(source, activeSet):
  1. AST      = parse(source)                       # [01]; assume already checked by [06] upstream
  2. diags    = validate against activeSet          # subset gating, §4.3 (C-GS-SUBSET)
     if any error-severity diag: return { bytes: empty, sourceMap: empty, diags }
  3. invId2op = invert(activeSet.opcodeToId)         # InstrId -> opcode, once (C-GS-NOOPCODES)
  4. lowered  = LBL.lower(AST, activeSet)            # [03]: allocate/place templates deterministically
  5. bytes,map = emit(lowered, invId2op, activeSet)  # §4.4 (build buffer + source map together)
  6. assert every byte in [0, activeSet.n)           # §4.5 (C-GS-VALID / GSINV-VALID; internal check)
  return { bytes, sourceMap: map, diagnostics: diags }
```
No step reads a clock or RNG; step 4 is delegated to [`03`], which is deterministic in source
order; steps 3/5 are pure array walks → **C-GS-DET / GSINV-DETERMINISM** hold end to end.

### 4.2 Verb → opcode resolution (via the ISA — C-GS-NOOPCODES)
For each verb (or `raw` mnemonic) node:
1. Resolve the friendly verb to a canonical engine **`InstrId`** using the vocabulary map
   [`02`] (`raw` nodes resolve by mnemonic directly). The vocabulary maps *names*; the engine
   dictionary maps *ids* — neither carries a hard-coded opcode.
2. Map `InstrId → opcode` through `invId2op` (the inverted `activeSet.opcodeToId`). The opcode
   is **wherever that instruction sits in the active set** — different sets place it
   differently; COMP emits whatever the set says.
3. Emit that opcode as one byte.

`nop0`/`nop1` are never authored as verbs (kids use labels); when they appear (from [`03`]
templates or `raw nop0`/`raw nop1`) they emit as `set.nop0` / `set.nop1`, i.e. bytes **0/1**
(ISA-VM §8).

### 4.3 Active-subset targeting (C-GS-SUBSET)
Before emission, every verb/`raw` node is checked against the active set: its resolved
`InstrId` **must be present in `activeSet.opcodeToId`**. If not (the scenario's subset doesn't
unlock this verb), COMP raises an **error-severity DIAG** ([`06`]) anchored to that statement
("This creature can't use `divide` yet — it unlocks in a later chapter") and the compile fails
(no bytes). This is exactly the tutorial-gating mechanism: the *same* source compiles under
`classic32` but is rejected under an early subset. Verbs are resolved through the ISA, so
"legal here?" is simply "is this `InstrId` in the active set?" — no separate allow-list.

### 4.4 Emission + source-map construction (single pass — GSINV-SOURCEMAP)
Emit into a growing byte buffer, recording each statement's range **as it is written**:
```
offset = 0; ranges = []
for stmt in lowered.statementsInOrder:
    start = offset
    for item in stmt.emitItems:          # verb opcode(s) and/or template fragment bytes ([03])
        for b in bytesOf(item):          # verb: 1 byte via §4.2; template: s bytes = nop0/nop1
            buffer.push(b); offset += 1
    if offset > start:                   # emitted ≥1 byte
        ranges.push({ stmt: stmt.index, start, end: offset })
bytes = Uint8Array.from(buffer)
```
Because ranges are appended in emission order and each covers exactly the bytes written for one
statement, the set of ranges is **sorted, disjoint, and gap-free over `[0, bytes.length)`** by
construction → forward map. `statementAt(off)` is a binary search over `ranges` (or a
precomputed `offset→stmt` index) → reverse map. Every byte has **exactly one** owning statement
(GSINV-SOURCEMAP); each statement owns a **contiguous** range.

### 4.5 Output validity (C-GS-VALID / GSINV-VALID)
Two properties hold for every successful compile:
- **Every byte is a legal opcode:** each verb byte came from `invId2op` (⊂ `[0, n)`), each
  template byte is `set.nop0`/`set.nop1` ∈ `{0,1} ⊂ [0, n)` (`n ≥ 2` always, since every set
  pins nop0/nop1). An internal assertion `∀ b ∈ bytes: 0 ≤ b < set.n` guards this; a violation
  is a compiler bug, not a user error.
- **Templates well-formed:** [`03`] guarantees each emitted template is a run of `nop0`/`nop1`
  of length `≥ MinTemplSize`, complementary to its target, and separated from adjacent
  templates so they do not MERGE (ISA-VM §5.5). COMP emits [`03`]'s bytes verbatim and does not
  re-fold them. The composite guarantee — bytes the engine loads without an illegal-opcode
  error — is **GSINV-VALID**, asserted at the cross-layer level against a real engine load.

---

## 5. Interconnections

- **Called by** the editor/playground and scenario harnesses with `(source, activeSet)`; the
  `activeSet` comes from the engine ISA ([`ISA`](../engine/systems/04-instruction-set-and-dispatch.md),
  scenario selection [`15`](../engine/systems/15-engine-api-and-scenarios.md)).
- **Imports** the engine `InstructionSet`/dictionary from `@tierra26/engine` (C-GS-NOOPCODES);
  the checked-AST types + parser from [`01`]; the verb→`InstrId` map from [`02`]; the label
  lowering pass from [`03`]; diagnostic constructors from [`06`].
- **Invokes** [`03`] for all template allocation/placement (the merge-avoidance gotcha,
  ISA-VM §5.5, is handled there — COMP only emits the returned fragment bytes).
- **Feeds** the disassembler [`05`] (round-trip fixtures, C-GS-ROUNDTRIP/GSINV-ROUNDTRIP) and
  the editor (source map for highlighting, diagnostics for underlines).
- **Produces** input to the **engine loader** ([`15`]): `bytes` is a valid genome for the
  active set (C-GS-VALID); the cross-layer GSINV-ANCESTOR test loads a compiled ancestor and
  checks it breeds true.

---

## 6. Determinism & edge cases

- **C-GS-DET / GSINV-DETERMINISM:** no `Math.random`, no `Date.now`, no reliance on `Map`/object
  key-iteration order; every traversal is over source order or a sorted array. Template lengths
  come from [`03`]'s deterministic allocation (source-order function, no RNG). Two compiles of
  the same `(source, activeSet)` are byte- and map-identical.
- **Empty / comment-only source:** yields `bytes` of length 0 and an empty `ranges` (vacuously
  covers `[0,0)`); not an error.
- **Failed compile:** any error-severity diagnostic ⇒ `bytes` empty, `sourceMap` empty, only
  `diagnostics` populated. Callers must check `diagnostics` before using `bytes` (partial byte
  output is never returned).
- **Subset rejection (C-GS-SUBSET):** a locked verb produces an error diagnostic anchored to the
  statement; compilation stops before emission (no partial genome).
- **Opcode source (C-GS-NOOPCODES):** swapping the active set (e.g. a subset that orders
  instructions differently) changes emitted bytes **with zero code change** — proof the compiler
  reads the ISA, not constants. A test compiles the same verb under two sets and asserts the
  byte differs iff the set places the `InstrId` at a different opcode.
- **`nop` bytes:** template and `raw nop0/nop1` bytes are exactly `set.nop0`/`set.nop1` = `0`/`1`
  (INV-TEMPLATE); COMP never emits a nop from a friendly verb.
- **Validity floor (C-GS-VALID):** `set.n ≥ 2` always (nop0/nop1 pinned), so the legal opcode
  range is never empty; the `∀ b: 0 ≤ b < n` assertion cannot be vacuous.

---

## 7. Fidelity notes

- **[CORE] opcode = index into the active set.** COMP emits bytes that are indices into the
  scenario's active `InstructionSet` (ISA-VM §3, §8) — the authentic Tierra encoding. It does
  not invent an addressing or literal scheme; genomes are pure opcode bytes.
- **[CORE] `nop0=0 / nop1=1`.** Template bytes are emitted as the set's pinned nop opcodes
  (INV-TEMPLATE), so compiled templates match the engine's complementary search (`NopS=1`,
  ISA-VM §5.2) exactly.
- **[MOD] language-layer template management.** COMP (via [`03`]) prevents template MERGE
  (ISA-VM §5.5) at authoring time rather than changing VM semantics — the raw VM behavior is
  preserved for evolved/under-the-hood code; only *authored* genomes are kept collision-free.
- **[MOD] compiler reads the ISA at compile time.** Unlike a fixed assembler with a baked opcode
  table, COMP imports the engine's active set so tutorials can re-scope the vocabulary without a
  compiler change (C-GS-NOOPCODES). Faithful to Tierra's data-driven `opcode.map` model (ISA-VM
  §3.1); modernized as a typed import.
- **[CORE] determinism.** Mirrors the engine's determinism commitment (ISA-VM §2.5): compilation
  is a pure integer/array function; no wall-clock, no RNG (C-GS-DET).

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in
[`packages/genescript/test/04-comp.test.ts`](../../../packages/genescript/test/04-comp.test.ts).
IDs are append-only.

- **COMP-001** — `compile(source, activeSet)` returns `{ bytes: Uint8Array, sourceMap,
  diagnostics }`; on a clean compile `diagnostics` has no error-severity entries and `bytes` is
  non-empty for emitting source.
- **COMP-002** — A verb sequence compiles to the **expected opcode bytes for `classic32`**: a
  fixed small program lowers to the exact byte array dictated by the `classic32` opcode order
  (golden fixture).
- **COMP-003** — `nop0`/`nop1` (from a template or `raw nop0`/`raw nop1`) emit as bytes **0**
  and **1** respectively (`set.nop0`/`set.nop1`; INV-TEMPLATE).
- **COMP-004** — The compiler resolves verbs to opcodes **via the engine ISA**, not constants:
  compiling the *same* verb under two active sets that place its `InstrId` at different opcodes
  yields the corresponding **different** bytes (C-GS-NOOPCODES).
- **COMP-005** — The compiler **imports** the active `InstructionSet` from `@tierra26/engine` and
  emits `opcodeToId`-consistent bytes: for every emitted verb byte `b`,
  `activeSet.opcodeToId[b]` equals the verb's resolved `InstrId` (no hard-coded opcode map;
  C-GS-NOOPCODES).
- **COMP-006** — The source map is **forward-complete**: `ranges` are disjoint, sorted, and cover
  `[0, bytes.length)` with no gaps or overlaps; each statement's range is contiguous
  (GSINV-SOURCEMAP).
- **COMP-007** — The source map is **bidirectionally consistent**: for every offset `off ∈
  [0, bytes.length)`, `statementAt(off)` returns exactly one statement, and it is the statement
  whose `ByteRange` contains `off` (GSINV-SOURCEMAP).
- **COMP-008** — Every emitted byte maps to **exactly one** statement (no byte unmapped, no byte
  double-owned) — the counting form of GSINV-SOURCEMAP over a multi-statement program.
- **COMP-009** — Compiling the **same** `(source, activeSet)` twice yields **byte-identical**
  `bytes` and an identical source map (C-GS-DET / GSINV-DETERMINISM).
- **COMP-010** — Compilation uses **no RNG and no wall-clock**: output does not vary across runs
  or with injected clock/RNG stubs (C-GS-DET) — determinism is structural, not seeded.
- **COMP-011** — A verb **outside the active subset** is rejected with an error-severity DIAG
  anchored to its statement, and the compile emits **no bytes** (C-GS-SUBSET; tutorial gating).
- **COMP-012** — The *same* source that is rejected under an early subset (COMP-011) **compiles
  cleanly** under `classic32` (subset gating is about the active set, not the source).
- **COMP-013** — **Every emitted byte is a legal opcode** for the active set: `∀ b ∈ bytes,
  0 ≤ b < activeSet.n` (C-GS-VALID / GSINV-VALID).
- **COMP-014** — Emitted **templates are well-formed**: every template byte is `set.nop0`/
  `set.nop1`, each template run has length `≥ MinTemplSize` (1), and [`03`]'s output is emitted
  verbatim with no adjacent-template MERGE (C-GS-VALID; ISA-VM §5.5).
- **COMP-015** — A **failed compile** (any error diagnostic) returns empty `bytes` and an empty
  `sourceMap` (no partial genome), with the error(s) in `diagnostics`.
- **COMP-016** — **Comment-only / blank source** compiles to zero bytes with an empty, vacuously
  complete source map and no diagnostics.

---

## 9. Open questions

1. **Multi-byte verbs.** Are any friendly verbs lowered to more than one opcode (a macro), or is
   every non-label verb exactly one byte? (Current assumption: 1 verb = 1 opcode; only labels/
   targets add template bytes via [`03`]. Confirm against the vocabulary [`02`].)
2. **Source-map granularity for `raw` blocks.** Does a multi-instruction `raw` region map as one
   statement range or per-mnemonic? (Lean per-mnemonic so DISASM can attribute each evolved byte;
   confirm with [`05`].)
3. **Diagnostics vs. lowering ordering.** Should subset checks (§4.3) run entirely before
   emission (fail-fast, current design) or be collected alongside emission to report *all* locked
   verbs at once? (Lean report-all for a better kid experience; needs [`06`] batching.)
4. **`sourceMap` for injected/mutated genomes.** COMP owns the forward map for *authored* source;
   the reverse attribution of an evolved genome with no source is DISASM's ([`05`]) concern —
   confirm the boundary (COMP maps source→bytes; DISASM maps bytes→best-effort source).
