# Vocabulary & Keywords — Engineering Spec              (Code: VOCAB · Milestone: M2)

**Status:** v1. The **single source of truth** for the GeneScript keyword system: the
definitive verb↔classic-32-mnemonic table (finalizing the *provisional* names in
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3), the register-specific verbs,
and the color-coded keyword taxonomy + tooltips that drive the Nintendo-style editor
highlighting.

Upstream: [`00-overview.md`](00-overview.md) (§2 concrete form, §4 doc set, §5 contracts),
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3 (the classic-32 table + provisional
names — finalized here) and §4 (per-op semantics — the source of each "machine-truth" line).
Conforms to the engine anchor [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md)
§8 (doc template §8.1, criterion IDs §8.2, `it.todo` test conventions §8.3, fidelity tags §8.4).

**Contracts obeyed:** **C-GS-KID** (every tooltip/keyword uses plain age-8–16 language),
**C-GS-NOOPCODES** (verbs map to opcodes via the engine's active instruction set at compile
time — this doc never records an opcode *number*, only a mnemonic the engine resolves),
**C-GS-SUBSET** (each keyword carries its dictionary mnemonic so the palette can be gated by
the active subset). Feeds systems 01 (lexer keyword set), 04 (verb→mnemonic lowering), 05
(disassembler naming), 07 (block palette) and the UI keyword tooltips.

---

## 1. Purpose & responsibility

This system owns the **vocabulary**: the closed set of friendly keywords a kid can type or
drag, and everything the UI needs to render them. It must guarantee:

- **Total, one-to-one coverage.** Every one of the classic-32 instructions has **exactly one**
  primary GeneScript verb, and every verb resolves to a **real** engine mnemonic. No
  instruction is unreachable; no verb is a dead name.
- **Operand-free surface.** Because classic-32 binds fixed registers per instruction, the
  register is baked into the *verb* (`grow-a`, `save-c`, `copy-a-to-b`) so a beginner never
  writes an operand. Where one classic instruction is register-specific, the verb name carries
  the register letter; where it is not, the verb is a bare action word.
- **A UI keyword model.** Each keyword declares a **color category** (its highlighting role)
  and a **tooltip** with two registers of explanation: a *kid line* (what it does, plainly) and
  a *machine-truth* "more" line (the exact ISA effect, from ISA-VM §4).
- **No hard-coded opcodes (C-GS-NOOPCODES).** A verb record stores its **mnemonic string**, not
  a byte. The compiler asks the engine's active set for the opcode at lower time. Reordering the
  set, or activating a subset, changes bytes — never this table.

This doc is **data**, not behavior: it is the authoritative content that the lexer, compiler,
disassembler, block palette, and tooltip UI all read from one place.

---

## 2. Interfaces

The vocabulary is exposed as a plain, declarative table (no engine imports; the *binding* to
opcodes happens in COMP at compile time):

```ts
// Color highlighting role of a keyword (the Nintendo-style palette — see §5).
type KeywordCategory =
  | 'action'    // a verb: the thing the creature does           (warm / primary)
  | 'register'  // a named store the verb reads or writes (a-d)   (cool / secondary)
  | 'marker'    // a landmark/label token (nop-templates)         (green / landmark)
  | 'control'   // flow: jumps, calls, conditionals, divide       (purple / flow)
  | 'value';    // a literal/target slot (label name after a control verb) (grey / neutral)

// One tooltip: the two-register explanation model (C-GS-KID).
interface Tooltip {
  kid: string;        // one plain line, ages 8-16, no jargon
  machine: string;    // the "more" line: exact ISA effect (ISA-VM §4 machine truth)
}

// One vocabulary entry — the definitive per-instruction record.
interface VerbEntry {
  verb: string;             // the GeneScript keyword (unique across the table)
  mnemonic: string;         // engine dictionary mnemonic (C-GS-NOOPCODES: a name, NOT a byte)
  register?: 'A'|'B'|'C'|'D'; // the bound register, if this verb is register-specific
  category: KeywordCategory;  // highlighting role
  tooltip: Tooltip;
  // opcode is intentionally ABSENT — resolved from the engine active set at compile time.
}

const VOCABULARY: readonly VerbEntry[]; // the §4 table, in classic-32 order
```

**Importers:** 01 (lexer builds its keyword recognizer from `verb`), 04 (lowering maps
`verb→mnemonic`, then `mnemonic→opcode` via the engine set), 05 (disassembler maps
`mnemonic→verb` for peek-under-hood), 07 (block palette renders one block per `verb`, filtered
by the active subset), and the tooltip UI (`category`+`tooltip`).

---

## 3. Data structures

- **`VOCABULARY`** — a frozen array, **one entry per classic-32 instruction**, in the engine's
  §3.3 load order (0–31) so the disassembler and palette can present a canonical ordering. The
  order is *presentational only*; nothing keys off the index (C-GS-NOOPCODES).
- **`verb`** — lower-kebab-case, unique. Register-specific verbs suffix the register letter
  (`-a`/`-b`/`-c`/`-d`). Bare-action verbs have no letter. This is the token the lexer matches
  (case-insensitive per §2 of the overview).
- **`mnemonic`** — the exact string in the engine dictionary (`incA`, `movii`, …). Its presence
  (not a number) is what satisfies C-GS-NOOPCODES; COMP resolves it against the active set.
- **`register`** — set **iff** the verb name carries a letter; it must equal the register the
  engine binds for that mnemonic (a redundancy the tests cross-check). Bare-action and
  marker/control verbs omit it.
- **`category`** — exactly one of the five §5 roles; drives both syntax color and (with
  `register`) the palette grouping.
- **`tooltip.kid` / `tooltip.machine`** — both **required and non-empty** for every entry;
  `kid` obeys C-GS-KID (no mnemonics, no register jargon), `machine` may name registers/soup and
  restates ISA-VM §4 precisely.

**Invariants this structure holds** (asserted in §8): 32 entries; verbs unique; every mnemonic
is a real classic-32 mnemonic; `register` present ⇔ verb ends in a letter and matches the
engine binding; both tooltip lines present; `nop0`/`nop1` are the only two `marker` entries.

---

## 4. The definitive vocabulary table

One row per classic-32 instruction, in engine load order (ISA-VM §3.3). **Verb** = the
finalized GeneScript keyword (replaces the provisional §3.3 italics). **Mnemonic** = the engine
dictionary name the verb lowers to (C-GS-NOOPCODES — a name, never a number). **Reg** = the
bound register when the verb is register-specific. **Kid line** = the tooltip's plain line
(C-GS-KID). **Machine truth** = the tooltip's "more" line (ISA-VM §4). **Color** = §5 category.

| Mnemonic | GeneScript verb | Reg | Kid line (tooltip) | Machine truth (tooltip "more") | Color |
|---|---|---|---|---|---|
| `nop0` | `mark-0` | — | A landmark tile (kind 0) you can jump to. | No-op; contributes template bit **0**; clears E/S/Z. | marker |
| `nop1` | `mark-1` | — | A landmark tile (kind 1) you can jump to. | No-op; contributes template bit **1**. | marker |
| `not0` | `flip-bit` | C | Flip C's smallest switch on or off. | `C := C XOR 1` (flip low bit); sets S/Z. | action |
| `shl` | `double` | C | Double the number in C. | `C := C << 1`; sets S/Z. | action |
| `zero` | `clear` | C | Empty C back to nothing. | `C := 0`; sets S/Z. | action |
| `ifz` | `if-zero` | C | Do the next line only if C is empty. | If `C == 0` run next instr, else skip next (`iip = 2`). | control |
| `subCAB` | `subtract` | C | Put A-minus-B into C (how big am I?). | `C := A - B`; sets S/Z. | action |
| `subAAC` | `subtract-into-a` | A | Take C away from A, keep it in A. | `A := A - C`; sets S/Z. | action |
| `incA` | `grow-a` | A | Make A one bigger. | `A := A + 1`; sets S/Z. | action |
| `incB` | `grow-b` | B | Make B one bigger. | `B := B + 1`; sets S/Z. | action |
| `decC` | `shrink-c` | C | Make C one smaller (count down). | `C := C - 1`; sets S/Z. | action |
| `incC` | `grow-c` | C | Make C one bigger. | `C := C + 1`; sets S/Z. | action |
| `pushA` | `save-a` | A | Put A away on the shelf to use later. | `push(A)`; E on stack overflow. | action |
| `pushB` | `save-b` | B | Put B away on the shelf to use later. | `push(B)`; E on stack overflow. | action |
| `pushC` | `save-c` | C | Put C away on the shelf to use later. | `push(C)`; E on stack overflow. | action |
| `pushD` | `save-d` | D | Put D away on the shelf to use later. | `push(D)`; E on stack overflow. | action |
| `popA` | `load-a` | A | Take the top thing off the shelf into A. | `A := pop()`; E on stack underflow. | action |
| `popB` | `load-b` | B | Take the top thing off the shelf into B. | `B := pop()`; E on stack underflow. | action |
| `popC` | `load-c` | C | Take the top thing off the shelf into C. | `C := pop()`; E on stack underflow. | action |
| `popD` | `load-d` | D | Take the top thing off the shelf into D. | `D := pop()`; E on stack underflow. | action |
| `jmpo` | `jump` | — | Jump to the nearest matching landmark. | `IP :=` nearest **outward** complementary template; E on no match. | control |
| `jmpb` | `jump-back` | — | Jump back to a landmark behind me. | `IP :=` nearest **backward** complementary template; E on no match. | control |
| `call` | `call` | — | Go run a landmark, then come back here. | Push return addr; `IP :=` outward template; E on no match. | control |
| `ret` | `return` | — | Go back to where I was called from. | `IP := pop()`; E on stack underflow. | control |
| `movDC` | `copy-c-to-d` | D←C | Copy C's number into D. | `D := C` (register→register). | action |
| `movBA` | `copy-a-to-b` | B←A | Copy A's number into B. | `B := A` (register→register). | action |
| `movii` | `copy-byte` | [A]←[B] | Copy one of my tiles into my daughter. | `soup[A] := soup[B]`; write-protected (§2.3); E if outside own/daughter cell. | action |
| `adro` | `find` | A,C | Find the nearest matching landmark (any way). | Find **outward** template: `A := addr`, `C := size`; E on no match. | control |
| `adrb` | `find-back` | A,C | Find a matching landmark behind me. | Find **backward** template: `A := addr`, `C := size`; E on no match. | control |
| `adrf` | `find-forward` | A,C | Find a matching landmark ahead of me. | Find **forward** template: `A := addr`, `C := size`; E on no match. | control |
| `mal` | `make-space` | A←C | Reserve a daughter cell C tiles big. | Allocate daughter of size `C`; `A := its start`; write-protect to mother; E on fail. | control |
| `divide` | `divide` | — | Set my finished daughter free to live. | Release the filled daughter as a new creature; legal only at ≥0.7 fill, else E. | control |

**Coverage:** 32 rows, 32 unique verbs, 32 real mnemonics — total and one-to-one (VOCAB-001/2/3).

### 4.1 Register-specific verb families (why the letter is in the name)

Beginners never type an operand; the register is part of the verb. The classic-32 register-bound
instructions therefore appear as **named families**:

- **grow / shrink (counters):** `grow-a` (`incA`), `grow-b` (`incB`), `grow-c` (`incC`),
  `shrink-c` (`decC`). *(Classic-32 binds `inc` to A/B/C and `dec` to C only — so there is
  deliberately no `grow-d`/`shrink-a`; the family is exactly what the ISA provides, VOCAB-006.)*
- **save (push) A–D:** `save-a`..`save-d` (`pushA`..`pushD`) — the shelf, one per register.
- **load (pop) A–D:** `load-a`..`load-d` (`popA`..`popD`) — take back off the shelf.
- **subtract forms:** `subtract` = **C = A − B** (`subCAB`, the "how big am I?" line);
  `subtract-into-a` = **A = A − C** (`subAAC`, the copy-loop pointer step).
- **register copies:** `copy-a-to-b` (`movBA`, `B := A`) and `copy-c-to-d` (`movDC`, `D := C`).
  Named source→dest so direction is unambiguous without operands.
- **single-C bit/arith:** `flip-bit`, `double`, `clear` bind C implicitly (no letter needed —
  there is only one such instruction each, so the bare action word is unambiguous).

**Rule for naming (VOCAB-005/006):** a verb suffixes a register letter **iff** the underlying
instruction is register-specific *and* the same action exists for more than one register (the
`grow-*`/`save-*`/`load-*` families, and the directional `copy-x-to-y`). Where an action is bound
to a single register with no sibling (`double`=C, `clear`=C, `flip-bit`=C, `subtract`=C from A,B),
the plain action word is used and the binding is documented, not typed.

### 4.2 Labels replace `mark-0`/`mark-1` in normal authoring

`mark-0`/`mark-1` (mnemonics `nop0`/`nop1`) are the two **marker**-category keywords, but kids do
**not** normally type them — they write a **label** (`copy:`) and the compiler (LBL, doc 03)
emits the complementary `nop0`/`nop1` template. `mark-0`/`mark-1` exist in the vocabulary so that
(a) the disassembler can name raw templates in evolved/mutated genomes and (b) `raw mark-0` is
available in advanced mode (overview §2). They are the sole two `marker` entries (VOCAB-007).

---

## 5. Keyword color categories (the Nintendo-style palette)

Every keyword carries **exactly one** category. The category fixes a **palette role** (a
semantic slot, not a hex value — theming maps roles to colors so light/dark/high-contrast themes
stay consistent). Five roles:

| Category | What it colors | Palette role | Examples |
|---|---|---|---|
| **action** | The verbs a creature *does* — arithmetic, stack, the copy. | **Primary / warm** (the loudest color; verbs are the star) | `grow-a`, `copy-byte`, `save-c`, `double`, `clear` |
| **register** | A named store (A–D) when shown as a standalone noun (blocks / hover). | **Secondary / cool** | the `-a`/`-b`/`-c`/`-d` chip inside a family verb |
| **marker** | Landmark tokens — labels and the raw `mark-0`/`mark-1`. | **Landmark / green** | `start:`, `copy:`, `mark-0`, `mark-1` |
| **control** | Flow: jumps, call/return, conditionals, find, make-space, divide. | **Flow / purple** | `jump-back`, `if-zero`, `call`, `find`, `divide` |
| **value** | A neutral target slot — the label name written after a control verb. | **Neutral / grey** | the `start` in `jump-back start` |

Palette rules:

- **One role → one color**, applied everywhere that role appears (worded text *and* blocks), so a
  kid learns "warm = doing, purple = going somewhere, green = a place" once.
- **`register` vs `action`:** a family verb like `grow-a` is a single **action** token; the
  trailing register letter is tinted with the **register** role so `grow-a`/`grow-b`/`grow-c`
  visually rhyme. In block form the register is a separate **register**-colored chip.
- **`marker` covers both** the author's labels *and* the raw `mark-0/1`, because to a kid they are
  the same idea: "a place I can jump to."
- **`control` is the movement/decision family** — anything that changes *where* execution goes or
  *whether* the next line runs, plus `make-space`/`divide` (life-cycle turning points). This
  keeps the two "big deal" verbs visually distinct from ordinary actions.
- **`value` is deliberately quiet** — the label *name* after a control verb is a reference, not a
  keyword, so it uses the neutral role and does not compete with the control verb's color.

### 5.1 Tooltip content model

Hovering any keyword shows a two-register card (C-GS-KID):

```
┌───────────────────────────────┐
│  copy-byte            [action] │   ← verb + its category badge (colored by role)
│  Copy one of my tiles into my  │   ← tooltip.kid   (always shown; plain language)
│  daughter.                     │
│  ── more ──────────────────    │   ← expander
│  soup[A] := soup[B]; write-    │   ← tooltip.machine ("machine truth", ISA-VM §4)
│  protected; error if outside   │
│  my own or daughter cell.      │
└───────────────────────────────┘
```

- **kid line** (`tooltip.kid`): one sentence, no mnemonics, no register letters, no "opcode" —
  what it *does for the creature*. Shown by default (VOCAB-008).
- **machine line** (`tooltip.machine`): revealed by "more"; the exact ISA effect from ISA-VM §4,
  including flags/protection/error conditions. May name registers and the soup (VOCAB-009).
- The category **badge** is colored by the keyword's palette role, reinforcing §5.
- For a **label** (marker), the card reads: kid = "A place you can jump to."; machine = "Compiles
  to a nop0/nop1 template; matched by its complement (LBL)."
- Tooltip text is **content owned here**, so the wiki page, playground hover, and block hover all
  render the identical two lines (single source of truth).

---

## 6. Determinism & edge cases

- **C-GS-NOOPCODES:** no entry stores an opcode number; the `mnemonic` string is resolved to a
  byte by COMP against the *active set* at compile time. Activating a subset or reordering the
  set changes bytes with **zero** edits here (VOCAB-011).
- **Verb uniqueness is global** (VOCAB-003): the lexer must have an unambiguous token→verb map;
  two entries sharing a `verb` would make lowering non-deterministic.
- **Register-name consistency** (VOCAB-005): when `verb` ends in a letter, `register` is set and
  must equal the engine binding's destination register for that mnemonic; a mismatch is a bug the
  test catches.
- **Subset gating (C-GS-SUBSET):** because each keyword carries its mnemonic, the palette filters
  to the active subset by asking the engine set for membership — a verb whose mnemonic is not in
  the active set is greyed/hidden, not removed from the table.
- **Case-insensitive** matching (overview §2): `GROW-A` and `grow-a` are the same token; the table
  stores the canonical lower-kebab form.
- **Bare-action ambiguity:** the naming rule (§4.1) guarantees a bare action word maps to exactly
  one instruction; if a future set added a second `double`-like op on another register, the family
  rule forces both to gain letters — the test that "single-binding ⇒ bare, multi ⇒ suffixed" (part
  of VOCAB-006) guards this.

---

## 7. Fidelity notes

- **[CORE]** The 32 verbs are a **total, faithful renaming** of ISA-VM §3.3 — same instructions,
  same bindings, same order; only the surface names change. Nothing is added, dropped, or
  re-bound.
- **[MOD]** Provisional names finalized: `mark-0`/`mark-1` (was `mark-0`/`mark-1` — kept),
  `double` (was `shift-left` — kid-truer: for a child "double" beats "shift left"; the machine
  line still says `C << 1`), `clear` (was `clear` — kept), `flip-bit` (was `flip-bit` — kept). All
  other provisional names are adopted verbatim as they already read plainly.
- **[MOD]** Register letters are lifted **into verb names** (`grow-a`) rather than exposed as
  operands — a GeneScript surface choice; the engine still binds registers exactly as ISA-VM §3.3.
- **[OPTIONAL]** `mark-0`/`mark-1` as *typed* verbs are advanced/raw-mode only; normal authoring
  uses labels (§4.2). The keyword system still defines them for disassembly and raw mode.
- **[CORE]** The two-line tooltip (kid + machine truth) realizes the SPEC "peek under the hood"
  commitment at the keyword granularity.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo` in `packages/genescript/test/02-vocab.test.ts`.

- **VOCAB-001** — `VOCABULARY` has **exactly 32 entries**, one per classic-32 instruction (total
  coverage; no instruction unreachable).
- **VOCAB-002** — **every** classic-32 instruction (all 32 mnemonics from ISA-VM §3.3) is covered
  by **exactly one** verb entry (a bijection mnemonic→verb; no mnemonic missing or doubled).
- **VOCAB-003** — all 32 `verb` strings are **unique** (no two keywords collide).
- **VOCAB-004** — every entry's `mnemonic` is a **real** classic-32 dictionary mnemonic (each verb
  maps to an actual engine instruction, not a made-up name).
- **VOCAB-005** — a verb ending in `-a/-b/-c/-d` has `register` set to that same letter, and that
  letter **equals the engine binding's** destination register for its mnemonic (register-name
  consistency).
- **VOCAB-006** — the register-specific families are exactly as specified and cover the ISA's
  register bindings: `grow-a/grow-b/grow-c` + `shrink-c`; `save-a..save-d`; `load-a..load-d`;
  `copy-a-to-b`; `copy-c-to-d`; `subtract` (C=A−B) and `subtract-into-a` (A=A−C) — and no family
  member exists for a register the ISA does not bind (e.g. no `grow-d`, no `shrink-a`).
- **VOCAB-007** — `nop0` and `nop1` are the **only** two entries with the **marker** category, and
  their verbs are `mark-0`/`mark-1` (landmark naming).
- **VOCAB-008** — **every** entry has a non-empty `tooltip.kid` written in plain language: no
  mnemonic string, no register-letter jargon, no word "opcode" (C-GS-KID).
- **VOCAB-009** — **every** entry has a non-empty `tooltip.machine` ("machine truth") consistent
  with the ISA-VM §4 semantics for its mnemonic.
- **VOCAB-010** — every entry's `category` is one of the **five** defined roles
  (`action`/`register`/`marker`/`control`/`value`), and the flow instructions
  (`jmpo/jmpb/call/ret/ifz/adro/adrb/adrf/mal/divide`) are all **control**.
- **VOCAB-011** — **no entry hard-codes an opcode number**: a `VerbEntry` exposes only a
  `mnemonic` string (C-GS-NOOPCODES); opcode resolution is deferred to the engine active set at
  compile time.
- **VOCAB-012** — every **register**-role usage references only registers **A–D** (the classic
  core), never E/F.
- **VOCAB-013** — the table's presentation order matches the engine's §3.3 load order (0–31) so
  the disassembler and palette share one canonical ordering (order is presentational only; nothing
  keys off the index — C-GS-NOOPCODES).

---

## 9. Open questions

1. **`double` vs `shift-left`** — is "double" too lossy for kids who later meet bit-shifting, or
   is the machine-truth line enough? (Finalized as `double`; flagged for review.)
2. **`find` for `adro`** — outward-search `adro` is named `find` (bare) while `find-back`/
   `find-forward` carry a direction; confirm the bare `find` reads as "search both ways" and not
   as a default/forward.
3. **Register as its own hoverable token** — in worded text the register letter is part of the
   verb; should hovering `grow-a` show *two* cards (the action and the register) or one combined
   card? (Spec assumes one card with a register-tinted suffix.)
4. **`value` category scope** — currently only label references. If numeric-free GeneScript later
   grows any literal-like slot (e.g. a subset count), does it join `value` or get its own role?
5. **Theme palette hexes** — roles are fixed here; the concrete color values (and high-contrast
   variants) are a UI-theme decision deferred to the editor spec.
