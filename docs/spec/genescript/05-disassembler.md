# Disassembler — Engineering Spec              (Code: DISASM · Milestone: M2)

**Status:** v1. Owns the **reverse pipeline**: genome bytes + active set → GeneScript text
(best-effort), the mechanism behind **"peek under the hood"** and **studying evolved
creatures**. It maps each opcode back to its GeneScript verb (via the engine ISA, the reverse
of the compiler [04]), **reconstructs labels** from the template runs a genome contains, and —
crucially — **never throws**: any byte that does not cleanly map to a verb/label falls back to
`raw <mnemonic>` / `raw byte N`, so **every** genome (including a mutated, evolved, parasitic
one) round-trips to *something editable*. It also emits a **per-byte annotation stream** for
the under-the-hood side-by-side view.

**Upstream:** [`00-overview.md`](00-overview.md) §3 (pipeline — the reverse arrow), §5
(contracts C-GS-ROUNDTRIP, C-GS-NOOPCODES), §6 (invariants, esp. **GSINV-ROUNDTRIP**).
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3 (opcode→mnemonic→provisional
GeneScript name via the active set), §5 (template addressing — the mechanism labels hide), §8
(encoding summary — "Disassembly = index → mnemonic … via the active set"). Verb↔mnemonic
mapping is the same table the compiler uses, read **in reverse** (`02-vocabulary-and-keywords.md`
when present; else ISA-VM §3.3). Companion compiler: [`04-compiler-and-lowering.md`](04-compiler-and-lowering.md)
(this doc is its inverse).

**Contracts obeyed:** **C-GS-DET** (disassembly is a deterministic pure function of bytes +
active set; no RNG, no wall-clock, no map-order traversal), **C-GS-ROUNDTRIP** (the fixed-point
guarantee this doc's algorithm is designed to satisfy), **C-GS-NOOPCODES** (opcode↔verb comes
from the active set at call time, never hard-coded), **C-GS-KID** (generated label names and
`raw` lines are plain and legible). **Never throws on arbitrary input** — the disassembler's
analogue of the engine's C-ERR: malformed/mutated bytes degrade to `raw`, they do not fault.

---

## 1. Purpose & responsibility

Given a `genome: Uint8Array` and the `InstructionSet` it is interpreted against, produce
**editable GeneScript** plus a **byte-aligned annotation stream**. It owns three jobs:

1. **Opcode → verb.** Map each opcode byte to its GeneScript verb by reversing the active
   set's index→mnemonic→verb mapping (ISA-VM §3.3). Opcodes with no clean verb become `raw`.
2. **Label reconstruction.** Recover the label abstraction the compiler [03/04] erased: detect
   `nop0/nop1` runs (templates), pair complementary runs into **inferred labels** with
   generated names (`label1`, `label2`, …), and rewrite the addressing instructions that use
   them (`adr*`→`find*`, `jmp*`→`jump*`, `call`→`call <label>`) to reference those names.
3. **Raw fallback + annotation.** Anything that does not cleanly map — mutated opcodes,
   ambiguous or oversized templates, mid-instruction jump targets, unpaired template runs —
   renders as `raw <mnemonic>` or `raw byte N`, and **every** byte gets an annotation record so
   the UI can line source against genome 1:1.

It **must guarantee**: total (defined for all `2^8` byte values and all lengths), deterministic,
never-throwing, and **round-trip-stable** — recompiling its output reproduces the input bytes
(verb sequence preserved; labels may be renamed). It does **not** run or simulate the genome, and
it does **not** attempt semantic recovery of *mutated* control flow beyond `raw` (a corrupted
jump is faithfully preserved as raw bytes, not "repaired").

---

## 2. Interfaces

The TS surface (types illustrative; finalized with the implementation):

```ts
export interface DisasmResult {
  text: string;               // the reconstructed GeneScript program
  lines: DisasmLine[];        // one entry per emitted source line (statement/label/blank)
  annotations: Annotation[];  // one entry per GENOME BYTE (annotations.length === genome.length)
  labels: InferredLabel[];    // reconstructed labels, in generation order
  stats: DisasmStats;         // counts: verbs, rawBytes, labels, unpairedTemplates …
}

export interface Annotation {
  byteIndex: number;          // 0..genome.length-1  (the stream is dense & ordered)
  opcode: number;             // the raw byte value
  mnemonic: string | null;    // active-set mnemonic, or null if opcode >= set.size (mutated)
  verb: string | null;        // GeneScript verb, or null when rendered raw
  lineIndex: number;          // index into `lines` this byte belongs to (1:N byte→line)
  role: 'verb' | 'template' | 'raw-op' | 'raw-byte';
  labelRef?: string;          // for template bytes: the inferred label this run defines/uses
}

export interface InferredLabel {
  name: string;               // generated: label1, label2, … (deterministic order)
  definedAt: number;          // byte index of the DEFINING template run (the landmark)
  refs: number[];             // byte indices of addressing-instruction template runs using it
  bits: number[];             // the nop bit pattern (0/1) of the defining run
}

export function disassemble(genome: Uint8Array, set: InstructionSet): DisasmResult;
```

- **Imported by:** the editor / under-the-hood view (renders `annotations` beside the genome),
  the "study this evolved creature" flow, and `_invariants.test.ts` (GSINV-ROUNDTRIP driver).
- **Imports:** the engine's active `InstructionSet` (for index→mnemonic, `set.size`,
  bit-width, and the `nop0=0/nop1=1` guarantee) and the shared verb↔mnemonic table. It does
  **not** import the compiler; round-trip is a *test-time* composition, not a code dependency.

---

## 3. Data structures

- **`InstructionSet` (borrowed, read-only).** Provides `size` (N), ordered index→mnemonic, and
  the invariant `nop0`/`nop1` = opcodes `0/1` (INV-TEMPLATE). The disassembler treats any byte
  `< size` as a known opcode and any byte `>= size` as **mutated/out-of-range** → `raw byte N`.
  (Note: on the *engine's* execution path a byte is taken `mod N`; the disassembler does **not**
  fold — it preserves the literal byte as `raw byte N` so round-trip is exact.)
- **Template run (transient).** A maximal run of opcodes `0/1` starting at some byte index,
  recorded as `{start, length, bits[]}`. The unit of label reconstruction.
- **`InferredLabel`.** A defining template run plus the addressing-instruction template runs
  whose bit pattern is its **complement** (`bits[i] + otherBits[i] == 1` for all i — ISA-VM
  §5.2). Named `label1..labelK` in **first-definition byte order** (deterministic).
- **`Annotation` stream.** A **dense array, one record per genome byte**, index-aligned
  (`annotations[i].byteIndex === i`). This is the load-bearing structure for the side-by-side
  view and the object GSINV-SOURCEMAP's reverse is checked against.
- **`DisasmLine`.** One emitted line of text with its source kind (`label` / `statement` /
  `blank`) and the contiguous byte range it covers, so the UI can map line→bytes and bytes→line.

---

## 4. Behavior / algorithms

Disassembly is a **single left-to-right pass** with a template-pairing sub-pass. All steps are
total and deterministic.

**Pass A — classify & segment (byte order).**
For each byte `i` while `i < genome.length`:
1. Let `op = genome[i]`.
2. If `op >= set.size` → emit **`raw byte {op}`**, one byte, `role='raw-byte'`; advance 1.
3. Else if `op` is `nop0`/`nop1` → **extend a template run** (collect the maximal `0/1` run
   `[i, j)`), record it as a pending run; advance to `j`.
4. Else `op` is an addressing instruction (`adrb/adrf/adro`, `jmpb/jmpf/jmpo`, `call`) → mark
   that the **immediately following** template run (if any, per ISA-VM §5.1 "start at IP+1") is
   this instruction's *reference* template; emit the verb provisionally; advance 1.
5. Else → ordinary verb: emit the GeneScript verb for `op`; advance 1.

**Pass B — reconstruct labels (template pairing).**
1. A template run that **follows an addressing instruction** is a **reference** run; a template
   run that does **not** (a bare landmark) is a **definition** candidate.
2. For each reference run, find the definition run whose bits are its **complement** and that
   the engine's search (ISA-VM §5.2, the run's direction from its addressing mnemonic) would
   actually land on — nearest complementary match. Assign both the same `InferredLabel`.
3. If a reference has **no** unambiguous complementary definition (none exists, or several are
   equidistant/ambiguous, or the run is oversized/merges with a neighbor per ISA-VM §5.5) →
   **do not invent a label**: render that addressing instruction and its template as **`raw`**
   (see §4 raw rules). This keeps evolved/parasite code faithful rather than guessing.
4. A definition run with **no** referencing addressing instruction still becomes a **bare
   label line** (`labelK:`) placed at its landmark, so the recovered text re-emits the same
   template on recompile (round-trip fidelity).
5. Name labels `label1, label2, …` in **ascending defining-byte-index order** (deterministic,
   independent of discovery order).

**Pass C — rewrite addressing instructions.**
Each successfully paired addressing instruction is emitted as a **label reference**:
`adrb→find-back <label>`, `adrf→find-forward <label>`, `adro→find <label>`,
`jmpb→jump-back <label>`, `jmpo→jump <label>`, `call→call <label>` (verbs per ISA-VM §3.3).
Its template bytes carry `role='template'` + `labelRef` in the annotation stream (they belong
to the reference, not to a separate line).

**The raw fallback (the never-fail floor).** A byte or instruction renders raw when it cannot
cleanly map:
- **`raw byte N`** — opcode `>= set.size` (a mutation produced a value outside the active set).
- **`raw <mnemonic>`** — a known opcode that cannot be expressed as a clean verb *in context*:
  an addressing instruction whose template could not be paired (§4.B.3), an addressing
  instruction with **no** following template, or a template run left **unpaired/ambiguous**
  (each nop emitted as `raw mark-0`/`raw mark-1`). Ordinary compute verbs always have a clean
  verb, so they never need raw — but the `raw <mnemonic>` form is available for any opcode.
- Raw lines are re-parseable GeneScript (§ `raw` mode, [01]) — that is what makes the whole
  genome **editable** after disassembly, the key requirement for studying evolved creatures.

**Annotation emission.** Every byte, in every branch above, appends exactly one `Annotation`
with its `role`, resolved `mnemonic`/`verb` (or `null`), and the `lineIndex` of the line it
contributed to. The stream is built *as* Pass A/C emit, guaranteeing `annotations.length ===
genome.length` and `annotations[i].byteIndex === i` by construction.

**Worked sketch** (a paired jump — feel, not byte-exact):
```
bytes:  … adrb nop1 nop0  … subCAB …            nop0 nop1 …
              └ ref run ┘                        └ def run ┘   (complement of the ref)
text:   find-back label1     subtract      …   label1:
```
Both nop-runs share `labelRef="label1"`; `find-back` references it; the bare landmark becomes
`label1:`. Recompiling re-emits the same complementary runs (names may differ) → same bytes.

---

## 5. Interconnections

- **Reverse of the compiler [04].** Where COMP does verb→opcode + label→templates + source map,
  DISASM does opcode→verb + templates→label + **byte→annotation**. They meet at
  **GSINV-ROUNDTRIP**: `compile(disassemble(compile(src))) === compile(src)` bytewise.
- **Depends on the engine ISA [ISA].** Reads the active set for index→mnemonic, `size`, and the
  `nop0=0/nop1=1`/`NopS=1` template arithmetic (INV-TEMPLATE). Honors C-GS-NOOPCODES — no opcode
  numbers baked in.
- **Mirrors template addressing [ISA §5].** Label pairing uses the *same* complementary-match +
  direction + nearest-hit rules the VM uses to resolve `ctemplate`, so a reconstructed
  `find-back label1` re-compiles to a template the VM lands on identically. The §5.5 merge
  gotcha is a **raw** trigger, not a silent guess.
- **Feeds the UI.** The `annotations` stream powers the side-by-side "peek under the hood" view;
  `labels`/`lines` power the editor. Consumed by `_invariants.test.ts` for GSINV-ROUNDTRIP.

---

## 6. Determinism & edge cases

- **Determinism (C-GS-DET).** Same bytes + same active set → identical text, lines,
  annotations, and label names. Label numbering is a pure function of defining-byte order; no
  RNG, no wall-clock, no map/object key-order iteration.
- **Never throws (the never-fail floor).** Defined for **all** inputs: empty genome (empty
  text, empty annotation stream), a single byte, all-`nop` genomes, all-out-of-range bytes,
  maximally-mutated garbage. There is no input that raises — the worst case is an all-`raw`
  program that still round-trips.
- **Mutated opcodes.** A byte `>= set.size` → `raw byte N` (literal value preserved, **not**
  folded `mod N`), so recompiling reproduces the exact byte.
- **Ambiguous / oversized / merged templates.** Templates with no unambiguous complement,
  templates larger than the search would resolve, or adjacent runs that merge (ISA-VM §5.5) →
  the addressing instruction and/or its run go **raw**. Never a fabricated label.
- **Mid-instruction jump targets & unreachable bytes.** The disassembler does **not** execute,
  so it decodes purely positionally; a jump landing mid-instruction in the *runtime* sense is
  simply preserved as the raw bytes at that position — nothing is realigned or invented.
- **Trailing dangling addressing instruction** (addressing op at end-of-genome with no template)
  → `raw <mnemonic>`.
- **Alignment guarantee.** `annotations` is dense and index-aligned to bytes 1:1 for every one
  of the above cases (this is the reverse of GSINV-SOURCEMAP and is asserted independently).

---

## 7. Fidelity notes

- **[CORE]** Opcode→verb via the active set and template→label reconstruction reproduce the
  authentic classic-32 semantics (ISA-VM §3.3/§5); the disassembler adds no new instructions.
- **[MOD]** Label *names* are synthesized (`label1…`) — the original genome has no names, only
  templates. This is a deliberate, deterministic renaming; round-trip is defined **up to label
  renaming** (C-GS-ROUNDTRIP), not name-identity. The complementary-match/merge rules are
  preserved exactly (ISA-VM §5.5) — reconstruction refuses to guess where the VM would be
  ambiguous, emitting `raw` instead of "fixing" evolved code.
- **[OPTIONAL]** Nicer heuristics (e.g. semantic label names like `copy:`/`start:` inferred
  from surrounding verbs, or grouping raw runs) are deferred; the guaranteed floor is
  `label1…` + `raw`.
- **[MOD]** The per-byte annotation stream is a modern affordance (the original Tierra had no
  such view); it is defined to be the exact byte-wise inverse of the compiler's source map.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[DISASM-NNN] …')` in
[`../../../packages/genescript/test/05-disasm.test.ts`](../../../packages/genescript/test/05-disasm.test.ts).
IDs are **append-only**.

- **DISASM-001** Every opcode in the active set disassembles to its GeneScript verb: for each
  index `0..size-1`, a one-instruction genome renders the verb ISA-VM §3.3 assigns (opcode→verb
  via the active set, reverse of [04]).
- **DISASM-002** Opcode→verb resolution reads the **active set** (C-GS-NOOPCODES): the same
  byte under a different active set disassembles to that set's verb, with no hard-coded numbers.
- **DISASM-003** A complementary template **pair** (a bare landmark run + an addressing
  instruction's complementary run) becomes an **inferred label**: a `labelK:` line plus a
  `find/jump/call <labelK>` reference to it.
- **DISASM-004** Label names are generated deterministically as `label1, label2, …` in
  **defining-byte-index order**, independent of discovery/traversal order.
- **DISASM-005** Addressing verbs are rewritten from their mnemonics: `adrb→find-back`,
  `adrf→find-forward`, `adro→find`, `jmpb→jump-back`, `jmpo→jump`, `call→call`, each with the
  inferred `<label>` operand.
- **DISASM-006** A **definition** run with no referencing addressing instruction still emits a
  bare `labelK:` line at its landmark (so the template survives recompilation).
- **DISASM-007** A **mutated opcode** (byte `>= set.size`) falls back to `raw byte N`, preserving
  the **literal** value (not folded `mod N`), and never throws.
- **DISASM-008** An addressing instruction whose template **cannot be unambiguously paired**
  (no complement / ambiguous / oversized / merged per ISA-VM §5.5) falls back to
  `raw <mnemonic>` (+ raw template bytes) rather than fabricating a label — never throws.
- **DISASM-009** An addressing instruction at **end-of-genome with no following template**
  renders as `raw <mnemonic>`; a trailing/unpaired lone nop renders as `raw mark-0/mark-1`.
- **DISASM-010** **GSINV-ROUNDTRIP:** for a corpus of GeneScript programs (incl. the ancestor),
  `compile → disassemble → compile` is **byte-identical** — the verb sequence is preserved and
  labels may be renamed (fixed point).
- **DISASM-011** **Disassembly of an arbitrary random genome always succeeds** (never throws)
  for any length and any byte values, and its output **recompiles to the original bytes**
  (raw fallback guarantees a fixed point even for pure garbage).
- **DISASM-012** The **annotation stream aligns 1:1 with bytes**: `annotations.length ===
  genome.length` and `annotations[i].byteIndex === i` for every byte, across verbs, templates,
  and raw fallbacks (the reverse of GSINV-SOURCEMAP).
- **DISASM-013** Each annotation carries the correct `role` (`verb`/`template`/`raw-op`/
  `raw-byte`), resolved `mnemonic`/`verb` (or `null` when raw/out-of-range), and a `lineIndex`
  that points at the emitted line the byte belongs to (bytes→line and line→bytes are consistent).
- **DISASM-014** Template bytes belonging to a paired addressing instruction carry the same
  `labelRef` as the label's defining run, so the under-the-hood view can highlight both ends of
  a jump.
- **DISASM-015** **Determinism (C-GS-DET):** disassembling the same genome + active set twice
  yields identical `text`, `lines`, `labels`, and `annotations` (no RNG, no map-order).
- **DISASM-016** **Edge inputs never throw and round-trip:** empty genome → empty text + empty
  annotation stream; all-`nop` genome → labels/raw as specified; all-out-of-range genome →
  all `raw byte N`; each recompiles to its input.
- **DISASM-017** Disassembly performs **no `mod N` folding and no realignment**: bytes are
  decoded positionally and preserved literally, so a genome with a runtime mid-instruction jump
  target is rendered faithfully (no invented instruction boundaries).

## 9. Open questions

- **Semantic label names.** Should common loops get friendly inferred names (`copy:`, `start:`)
  from surrounding-verb heuristics, or is `label1…` sufficient for M2? (Names never affect
  round-trip, so this is pure UX.)
- **Raw-run coalescing.** Should a long run of `raw byte N` collapse into a single annotated
  block in the UI, or stay one line per byte for exact editing?
- **Reference vs. definition disambiguation.** When a template run is *both* preceded by an
  addressing instruction *and* is itself a valid landmark for another instruction, which role
  wins? Current rule: "follows an addressing instruction ⇒ reference"; confirm this matches the
  compiler's own placement so round-trip stays a fixed point.
- **Provisional verb names.** DISASM-005's verb spellings track ISA-VM §3.3 *provisional* names
  finalized in `02-vocabulary-and-keywords.md`; when [02] lands, reconcile any renames here.
