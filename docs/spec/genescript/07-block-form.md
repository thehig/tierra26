# Block Form — Engineering Spec (Code: BLOCK · Milestone: M2)

**Status:** v1. Obeys the anchor contracts in [`00-overview.md`](00-overview.md) (§5:
C-GS-DET, C-GS-SUBSET, C-GS-KID) and the doc/test conventions in
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Upstream: [`SPEC.md`](../SPEC.md) §10 (hybrid worded + block assists, scales 8→16),
[`01-language-and-syntax.md`](01-language-and-syntax.md) (the AST blocks must produce),
[`02-vocabulary-and-keywords.md`](02-vocabulary-and-keywords.md) (verbs + color categories),
[`06-diagnostics-and-validation.md`](06-diagnostics-and-validation.md) (diagnostic attach).

---

## 1. Purpose & responsibility

Block form is a **drag-and-drop rendering of the *same* GeneScript program** as the worded
text — not a separate language. It is how the youngest kids (and anyone starting out) author
creatures without typing. Its one hard guarantee: **blocks and text are two views of one
underlying AST**, and converting between them is **lossless and reversible**. It owns the
block taxonomy, the palette (gated by the scenario's unlocked verbs), and the text↔block
mapping. It adds **no expressive power** beyond the text — every block corresponds to a
statement, and every statement to a block.

## 2. Interfaces

```ts
// A block program is just the shared AST (from 01) rendered/edited as blocks.
import type { Ast, Statement } from '@tierra26/genescript'; // (future)

interface BlockView {
  fromAst(ast: Ast): BlockDoc;            // AST -> blocks
  toAst(doc: BlockDoc): Ast;              // blocks -> AST   (toAst(fromAst(x)) === x)
  palette(activeSet: InstructionSet): BlockKind[];   // only unlocked verbs (C-GS-SUBSET)
}

interface BlockDoc { blocks: Block[]; }   // ordered = statement order
interface Block {
  nodeId: string;          // SHARED with the AST node (diagnostics + editor sync key)
  kind: BlockKind;         // verb | registerVerb | label | control | raw
  verb?: string;           // for verb/registerVerb: the GeneScript verb (02)
  target?: string;         // for control: the referenced label name
  name?: string;           // for label: the landmark name
  raw?: string;            // for raw: literal mnemonic/byte text
  color: ColorCategory;    // from 02 (action|register|marker|control|value)
}
```

Blocks carry the **same `nodeId`** as their AST node so diagnostics [06] and cursor/selection
sync work identically in text and block modes.

## 3. Data structures

- **`BlockDoc`** — an ordered list of `Block`s; order *is* statement order (no nesting
  needed: GeneScript is flat, control flow is via label targets, not nested bodies).
- **`Block`** — one per statement kind (§4). Holds only what its statement needs; carries its
  `color` category from [02] for the Nintendo-style palette.
- **`BlockKind`** — the closed set: `verb`, `registerVerb`, `label`, `control`, `raw`.
- **Palette entry** — a spawnable block template; the palette is computed from the active
  instruction subset so locked verbs are absent.

## 4. Behavior / algorithms

- **`fromAst` / `toAst` isomorphism.** Each `Statement` kind maps to exactly one `Block` kind
  and back; `toAst(fromAst(ast))` is structurally identical, and `fromAst(toAst(doc))` is
  identical. Statement order ↔ block order. This is the central contract (BLOCK-001).
- **Block taxonomy** (one per statement form from [01] §statement forms):
  - `verb` — a bare operand-free verb (`copy-byte`, `divide`, `make-space`).
  - `registerVerb` — a register-specific verb (`grow-a`, `save-c`) — still no free operand;
    the register is baked into the block's verb choice.
  - `label` — a **landmark** block naming a location (`copy:`); editable name.
  - `control` — a verb that takes a **label target** (`jump-back`, `jump`, `call`,
    `find-back`, `find-forward`); the target is chosen from a **dropdown populated by the
    program's current labels** (no free-typing a target that doesn't exist).
  - `raw` — the advanced escape hatch: a literal classic-32 instruction (incl. `nop0/nop1`);
    round-trips to a `raw` statement.
- **Palette gating (C-GS-SUBSET).** `palette(activeSet)` lists only verbs present in the
  scenario's active subset, so tutorials reveal blocks as instructions unlock — mirroring the
  compiler's subset rejection. Locked verbs never appear as draggable blocks.
- **Edit operations** map to AST edits: drag-in = insert statement; drag-reorder = move
  statement; delete = remove; edit-field (label name / control target / register choice) =
  update the node. All preserve the `nodeId`.
- **Color** on every block comes from [02]'s category for that verb/marker, so the palette and
  canvas match the text editor's keyword colors exactly (one visual language).
- **Diagnostics** [06] attach by `nodeId`, so a warning ("this creature never calls divide")
  highlights the relevant block just as it underlines the text line.

## 5. Interconnections

- **[01] Language & Syntax** — blocks produce/consume the *same* `Ast`; text↔block switching
  goes through `toAst`/`fromAst`, never through re-serializing to text and re-parsing (avoids
  drift). (An editor may still round-trip via text for display, but the AST is the source of
  truth.)
- **[02] Vocabulary** — verb list, register-verb families, and color categories.
- **[04] Compiler** — a block program compiles by `toAst` → the normal compile path; a block
  program and its text twin therefore emit **identical bytes**.
- **[06] Diagnostics** — attach to blocks via shared `nodeId`.
- **UI** — the editor renders either view of the current AST; the tutorial/tank UI decides
  which view to present per lesson/age.

## 6. Determinism & edge cases

- `fromAst`/`toAst` are pure and deterministic (C-GS-DET): same AST → same blocks, same doc →
  same AST/bytes.
- **Empty program** → empty `BlockDoc` (and vice-versa).
- **Dangling control target** (label deleted while a `control` block still references it) →
  surfaces a [06] diagnostic; the block retains the now-missing name so the user can fix it
  (never silently dropped). The dropdown offers existing labels + the stale value marked
  invalid.
- **Duplicate label names** → allowed structurally (a [06] error flags it), so block editing
  never blocks on a transient duplicate mid-edit.
- **`raw` blocks** are opaque to gating (advanced mode) but still round-trip exactly.
- Switching text→blocks on a program with parse errors: best-effort blocks for the valid
  statements; error nodes render as an `error` affordance carrying their diagnostic (no crash).

## 7. Fidelity notes

- **[CORE]** block↔text isomorphism and the shared-AST model — the whole "one language, two
  renderings" promise depends on it.
- **[CORE]** palette gating by active subset (tutorial progression).
- **[MOD]** blocks are a modern UX layer with no analog in original Tierra.
- **[OPTIONAL]** richer visual affordances (icons, animations, snap hints, "ghost" preview of
  the emitted opcodes) — layer on later; not required for correctness.

## 8. Acceptance criteria

- **BLOCK-001** `toAst(fromAst(ast))` is structurally identical (text→blocks→text is identity).
- **BLOCK-002** `fromAst(toAst(doc))` is structurally identical (blocks→text→blocks is identity).
- **BLOCK-003** A block program compiles to the **same bytes** as its worded-text twin.
- **BLOCK-004** Block order equals statement order; reordering blocks reorders statements.
- **BLOCK-005** `palette(activeSet)` contains exactly the verbs in the active subset (locked
  verbs absent) — C-GS-SUBSET.
- **BLOCK-006** Each statement form maps to exactly one `BlockKind` and back (total mapping).
- **BLOCK-007** A `control` block's target dropdown lists exactly the program's current labels.
- **BLOCK-008** Every block carries the [02] color category for its verb/marker.
- **BLOCK-009** Diagnostics [06] attach to the correct block via shared `nodeId`.
- **BLOCK-010** A `raw` block round-trips losslessly (blocks↔text↔blocks).
- **BLOCK-011** Deleting a label referenced by a `control` block yields a diagnostic and
  preserves the stale target name (not silently dropped).
- **BLOCK-012** `fromAst`/`toAst` are deterministic and pure (C-GS-DET).
- **BLOCK-013** Empty program ↔ empty `BlockDoc` round-trips.
- **BLOCK-014** Blocks add no expressive power: no `BlockKind` exists without a corresponding
  statement form in [01].

## 9. Open questions

1. **Nested vs flat rendering.** GeneScript is flat (labels, not nested bodies). Do we *render*
   loops as visually nested (a "repeat" wrapper inferred from `jump-back`) for readability,
   while keeping the flat AST? (Proposed: optional visual grouping only, no AST change.)
2. **Label naming UX.** Auto-name new landmarks (`spot1`, `spot2`) with inline rename, or
   prompt? (Proposed: auto-name + rename.)
3. **Palette organization** by color category vs by lesson order — decide with the tutorial
   system (M3).
4. Whether `raw` blocks are hidden entirely below a certain age/lesson (gating policy shared
   with [06]/tutorials).
