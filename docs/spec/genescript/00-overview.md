# GeneScript — Language Overview & Architecture (anchor)

**Status:** v1 anchor. Defines the **concrete GeneScript language**, the **compile
pipeline**, the **document set**, and the authoring conventions for
`docs/spec/genescript/`. Every `NN-*.md` here conforms to the doc template and criterion
scheme in the engine anchor [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md)
§8 (reused verbatim — doc template §8.1, criterion IDs §8.2, node:test `it.todo` conventions
§8.3, fidelity tags §8.4). Companion package: **`@tierra26/genescript`**
(`packages/genescript/`), tests are pending `it.todo` criteria.

Upstream: [`SPEC.md`](../SPEC.md) §10 (friendly language decision — *hybrid worded + block
assists*, "peek under the hood"), [`engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3
(the classic-32 set + **provisional GeneScript names** this spec finalizes), §5 (template
addressing — the mechanism GeneScript hides behind labels).

> **This anchor's concrete syntax/vocabulary is a *proposal*.** It is deliberately concrete
> so the sub-specs align, but the exact keywords/syntax remain open for review (each doc's
> §9). We would rather react to one coherent concrete language than argue in the abstract.

---

## 1. What GeneScript is

The kid-facing language you write creatures in. It is a **thin, friendly, two-way surface**
over the authentic classic-32 engine ISA:

- **Readable, mostly operand-free verbs.** Because classic-32 binds fixed registers per
  instruction, most GeneScript statements are a single colored verb — `copy-byte`,
  `divide`, `make-space` — no operands to get wrong.
- **Labels instead of templates.** Kids never type `nop0`/`nop1`. They mark places with
  **labels** and jump/find *to a label*; the compiler generates the complementary
  nop-templates and keeps them from colliding (the addressing gotcha, hidden).
- **Two-way / peek-under-hood.** Every line maps to the exact opcodes it emits (source map);
  any genome — even a mutated, *evolved* one — can be disassembled back into GeneScript.
- **One language, two renderings.** The same program is editable as **worded text** or as
  **drag blocks** (same underlying statements/AST). Youngest kids use blocks; teens type.
- **Nintendo-style keywords.** Every verb/noun/marker is color-coded and hoverable (wiki
  tooltip: a kid line + the machine truth).

GeneScript targets whatever **instruction subset** a scenario enables (tutorials unlock
verbs gradually — the engine's named-subset mechanism, ISA-VM §3.2).

## 2. The language at a glance (proposed concrete form)

- **One statement per line.** Case-insensitive keywords. Blank lines ignored.
- **Comments:** `#` to end of line.
- **Labels:** an identifier followed by `:` at the start of a line — `copy:`. Labels are the
  addressing landmarks (they become templates).
- **Verbs:** a friendly keyword, usually with **no operand** (registers are implied by the
  classic-32 binding). A handful are register-specific verbs (e.g. `grow-a`, `save-c`) so we
  still avoid exposing operand syntax to beginners.
- **Targets:** control verbs take a **label** — `jump-back copy`, `call reproduce`,
  `find-back start`.
- **Advanced/raw mode:** a line beginning `raw <mnemonic>` drops to a literal classic-32
  instruction (incl. explicit `nop0/nop1`) for older kids / under-the-hood editing.

### Illustrative creature (feel, not byte-exact — exact ancestor is a COMP test)
```genescript
# A minimal self-replicator: find myself, copy myself, split off, repeat.
start:                 # a landmark at my first instruction
  find-back  start     # locate my start   -> address in A
  find-forward end     # locate my end
  subtract             # C = size (end - start)
  make-space           # reserve a daughter cell of size C; its start -> A
copy:
  copy-byte            # copy one byte of me into the daughter
  shrink-c             # one fewer to go
  if-zero              # when none left...
  jump-back done       #   ...leave the loop
  jump-back copy       # else keep copying
done:
  divide               # release the daughter as a new, living creature
  jump-back start      # and do it all again
end:                   # a landmark at my last instruction
```

Full vocabulary (verb ↔ classic-32 mnemonic ↔ tooltip ↔ color category) is defined in
[`02-vocabulary-and-keywords.md`](02-vocabulary-and-keywords.md), building on the
provisional names in ISA-VM §3.3.

## 3. The compile pipeline

```
GeneScript source
      │  lexer  (01)         → tokens
      ▼
   tokens
      │  parser (01)         → AST (statements, labels, targets)
      ▼
    AST
      │  validate (06 DIAG)  → kid-friendly diagnostics (errors/warnings/hints)
      ▼
  checked AST
      │  lower  (03 LBL + 04 COMP)
      │    · LBL: allocate complementary nop-templates per label; place template at each
      │      label; place complement at each reference; insert spacers to avoid template
      │      MERGE (ISA-VM §5.5); pick minimal unambiguous lengths.
      │    · COMP: emit classic-32 opcode bytes; build a SOURCE MAP (line ↔ byte range).
      ▼
  genome bytes  (valid @tierra26/engine input for the active set)  +  source map

reverse:  genome bytes ──(05 DISASM)──▶ GeneScript (best-effort; raw fallback for
          unmappable/mutated regions)  ── powers "peek under the hood" & studying evolved
          creatures.
```

- **Deterministic:** same source + active set → identical bytes + source map (mirrors the
  engine's determinism contract; template allocation is a deterministic function of source
  order, no RNG).
- **The compiler depends on the engine's instruction-set definition** (`@tierra26/engine`
  ISA) to know the classic-32 mnemonic↔opcode mapping and register bindings — GeneScript
  does not hard-code opcodes.

## 4. System map & document set

```
 source ─▶ [01 Language & Syntax] ─▶ AST ─▶ [06 Diagnostics] ─▶ [03 Labels&Templates]
                    ▲                                    │              │
             [07 Block form] (same AST)                  ▼              ▼
                                             [04 Compiler & Lowering] ─▶ bytes + sourcemap
   [02 Vocabulary & Keywords] feeds 01/04/05/07 and the UI keyword tooltips
   bytes ─▶ [05 Disassembler] ─▶ GeneScript (peek-under-hood / evolved-creature study)
```

| # | Doc | Code | Responsibility |
|---|---|---|---|
| 00 | this file | GSA | language overview, concrete form, pipeline, conventions |
| 01 | language-and-syntax | GS | lexical grammar, statements, labels, program structure, raw mode |
| 02 | vocabulary-and-keywords | VOCAB | verb↔mnemonic table, register verbs, keyword color categories + tooltips |
| 03 | labels-and-templates | LBL | labels → complementary nop-templates; collision/merge avoidance; length choice |
| 04 | compiler-and-lowering | COMP | AST→bytes, source maps, determinism, active-subset targeting |
| 05 | disassembler | DISASM | bytes→GeneScript (best-effort), raw fallback, evolved-creature decompile |
| 06 | diagnostics-and-validation | DIAG | kid-friendly errors/warnings, static checks, "will it replicate?" hints |
| 07 | block-form | BLOCK | block↔text shared model, palette gated by the active subset |

Cross-layer invariants (round-trip, compiles-to-valid-bytes, ancestor-breeds-true) live in
`packages/genescript/test/_invariants.test.ts` (code **GSINV**).

## 5. Cross-cutting contracts

- **C-GS-DET:** compilation is deterministic (source + active set → identical bytes + source
  map); no RNG, no wall-clock.
- **C-GS-VALID:** every successful compile emits bytes that are **valid input to
  `@tierra26/engine`** for the active set (every byte a legal opcode; templates well-formed).
- **C-GS-ROUNDTRIP:** `disassemble(compile(src))` is semantically equivalent to `src`
  (verb sequence preserved; labels may be renamed) — see GSINV.
- **C-GS-SUBSET:** the compiler rejects verbs not in the scenario's active subset with a
  friendly diagnostic (supports tutorial gating).
- **C-GS-KID:** every user-facing message (errors, tooltips) uses plain language suitable for
  ages 8–16 (DIAG owns the tone rules).
- **C-GS-NOOPCODES:** GeneScript never hard-codes opcode numbers; it reads them from the
  engine's active instruction set at compile time.

## 6. Global invariants (GSINV — asserted by cross-layer tests)
- **GSINV-VALID:** any GeneScript that compiles produces bytes the engine loads without an
  illegal-opcode error.
- **GSINV-ROUNDTRIP:** compile → disassemble → compile yields identical bytes (fixed point).
- **GSINV-ANCESTOR:** the GeneScript ancestor compiles to a genome that **breeds true** in
  the engine under sterile settings (the headline cross-layer test — ties GeneScript to the
  engine's REPRO/GENE criteria).
- **GSINV-SOURCEMAP:** every emitted byte maps back to exactly one source statement (and each
  statement to a contiguous byte range).
- **GSINV-DETERMINISM:** compiling the same source twice yields byte-identical output + maps.

## 7. Authoring conventions
Identical to the engine anchor §8: the 9-section doc template (§8.1), append-only criterion
IDs `CODE-NNN` referenced verbatim in `it.todo('[CODE-NNN] …')` tests (§8.3, **no `src/`
imports yet**), fidelity/scope tags (§8.4 — here mostly `[CORE]`/`[MOD]` for language
decisions, `[OPTIONAL]` for advanced/raw features). One doc + one companion test file per
system: `packages/genescript/test/NN-<code>.test.ts`.

## 8. Milestone
GeneScript is **M2** (after the engine's M0/M1). Specced now so the language is settled
before the editor and every per-instruction tutorial page are built on it.
