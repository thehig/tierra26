# Gene Editor — Engineering Spec              (Code: EDITOR · Milestone: M2)

**Status:** v1. The GeneScript **authoring surface** with peek-under-hood: a two-mode
(worded **text** + drag **blocks**) editor over one AST, with registry-driven keyword
coloring, subset-aware autocomplete, inline GeneScript diagnostics, a side-by-side
**GeneScript ↔ compiled classic-32 bytes** view, **assemble-and-inject** into a running
soup, and **disassemble-into-editor** (load any creature's evolved bytes as editable
GeneScript). This doc specifies **view logic and contracts only** — the wiring between the
GeneScript compiler/disassembler, the content keyword registry, and the worker. **Pixel
styling is a later design pass**; criteria that are purely visual are marked `(visual)`.

**Upstream (consumed, never redefined):**
[`00-overview.md`](00-overview.md) §1 (client architecture — GeneScript compiles on the main
thread; only bytes/commands cross to the worker), §2 (**C-UI-VIEW**, **C-UI-SOURCE**,
**C-UI-THEME**), §4 (**UIINV-EDITOR-ENGINE**, UIINV-SOURCE), §3 (system map — this is doc 03
`EDITOR`). [`01-worker-protocol.md`](01-worker-protocol.md) (WORKER — the session-addressed
**`inject`** command that carries genome bytes into a soup). GeneScript:
[`../genescript/00-overview.md`](../genescript/00-overview.md) (pipeline + the two-way
promise), [`01-language-and-syntax.md`](../genescript/01-language-and-syntax.md) (the AST,
`Program`/`Stmt`/`Loc`), [`02-vocabulary-and-keywords.md`](../genescript/02-vocabulary-and-keywords.md)
(verbs, categories, active-subset membership), [`04-compiler-and-lowering.md`](../genescript/04-compiler-and-lowering.md)
(`compile` → `bytes` + `SourceMap`), [`05-disassembler.md`](../genescript/05-disassembler.md)
(`disassemble` → editable text + byte annotations),
[`06-diagnostics-and-validation.md`](../genescript/06-diagnostics-and-validation.md)
(`validate` → `Diagnostic[]`, `hasErrors`, spans by `nodeId`),
[`07-block-form.md`](../genescript/07-block-form.md) (block↔text isomorphism over one AST).
Content: [`../content/04-keyword-and-tooltip-system.md`](../content/04-keyword-and-tooltip-system.md)
(KEYWORD registry — `resolveKeywords`, palette roles, two-line tooltips). Doc template + test
conventions: [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8
(reused verbatim — template §8.1, criterion IDs §8.2, `it.todo` conventions §8.3, tags §8.4).

**Contracts obeyed:** **C-UI-VIEW** (the editor never simulates; its one run-affecting action
is `inject` via the worker; compile/validate/disassemble are the permitted main-thread
exceptions). **C-UI-SOURCE / UIINV-SOURCE** (every keyword, color and instruction fact
resolves to `@tierra26/{genescript,content}` — the editor re-defines none). **C-UI-THEME**
(keyword colors are palette-role **tokens** resolved for light/dark/high-contrast, never
per-component hex). **C-UI-A11Y** (keyboard-navigable authoring; honors reduced-motion).
Surfaces the global invariant **UIINV-EDITOR-ENGINE** (editor genome = peek bytes = injected
bytes = inspector disassembly — one genome, three views). This layer holds **view logic**
only; the compile/diagnose/disassemble algorithms are owned upstream and merely orchestrated
here.

---

## 1. Purpose & responsibility

The gene editor is the **kid-facing authoring surface** for GeneScript and the realization of
the SPEC "peek under the hood" promise at program granularity. It owns the **view logic** that
binds five upstream contracts into one editing experience and guarantees:

- **One program, two renderings.** The editor holds a single GeneScript **AST** as its source
  of truth and presents it as either **worded text** or **drag blocks** ([07]); switching modes
  goes through the block↔text isomorphism (`toAst`/`fromAst`), never through re-serialize +
  re-parse, so **switching preserves the program** exactly.
- **Registry-driven presentation.** Keyword **coloring** and **tooltips** come from the content
  KEYWORD registry / VOCAB ([content 04]/[02]) — the editor never invents a color or a keyword
  list (C-UI-SOURCE); colors are palette **roles** mapped to theme tokens (C-UI-THEME).
- **Assistance that respects the lesson.** **Autocomplete** offers only verbs in the scenario's
  **active subset** (C-GS-SUBSET / tutorial gating) and completes control-verb targets from the
  **program's own labels**; **inline diagnostics** are exactly DIAG's ([06]) output, anchored by
  source span / `nodeId`.
- **Two-way transparency.** **Peek-under-hood** shows GeneScript beside the compiled classic-32
  opcodes using the compiler **source map** ([04]) — hovering a line highlights its bytes and a
  byte highlights its line. **Assemble-and-inject** compiles ([04]) and sends the **exact**
  compiled bytes via the worker `inject` ([01]). **Disassemble-into-editor** takes any
  creature's bytes (from the inspector/tank) through DISASM ([05]) into **editable** GeneScript
  — the "study an evolved parasite" flow.
- **The three-views guarantee.** What the editor shows, what it injects, and what the inspector
  disassembles back are **one genome** (UIINV-EDITOR-ENGINE).

It does **not** lex/parse, validate, compile, lower templates, or disassemble (all upstream in
`@tierra26/genescript`); it does **not** run the simulation (that is the worker, C-UI-VIEW); it
does **not** define keyword colors or tooltip text (content [04]/VOCAB [02]). It **orchestrates**
those and owns the editor state, the mode switch, the hover/highlight mapping, the completion
model, and the inject/disassemble flows.

---

## 2. Interfaces

Framework-agnostic view logic (the framework choice is behind these; `SPEC.md` §14). Types are
illustrative and finalized with the implementation. The editor **imports** upstream modules; it
adds no compile/sim logic of its own.

```ts
import type { Program, Stmt } from '@tierra26/genescript';           // AST [01]
import type { InstructionSet } from '@tierra26/engine';              // the ACTIVE set (subset-aware)
import { compile, type SourceMap } from '@tierra26/genescript';      // [04]
import { validate, hasErrors, type Diagnostic } from '@tierra26/genescript'; // [06]
import { disassemble, type DisasmResult } from '@tierra26/genescript'; // [05]
import { fromAst, toAst, palette, type BlockDoc } from '@tierra26/genescript'; // [07]
import { resolveKeywords, type KeywordSpan } from '@tierra26/content'; // [content 04]

type EditorMode = 'text' | 'block';

// The editor's own state — a view over one AST + the active set. No sim state lives here.
interface EditorState {
  mode: EditorMode;
  source: string;                 // canonical worded text (block mode edits the same AST)
  ast: Program;                    // the single source of truth (both modes render this)
  activeSet: InstructionSet;       // scenario subset — drives autocomplete + palette + compile
  sessionId: string;               // which worker soup an inject targets ([01])
}

// The derived, render-ready view-model — a PURE function of (ast, source, activeSet).
interface EditorViewModel {
  keywordSpans: readonly KeywordSpan[]; // coloring, from content registry (C-UI-SOURCE) [content 04]
  diagnostics: readonly Diagnostic[];   // exactly validate(ast, activeSet) [06]
  compiled: CompileView;                // bytes + source map (peek-under-hood) [04]
  completions(ctx: CompletionCtx): readonly Completion[]; // subset/label-aware [02]/[06]
  blocks: BlockDoc;                     // block-mode rendering of the same AST [07]
}

interface CompileView {
  bytes: Uint8Array;                    // [] when hasErrors (no partial genome) [04]
  sourceMap: SourceMap | null;          // null when compile failed [04]
  injectable: boolean;                  // === !hasErrors(diagnostics)  (inject gate)
}

// Autocomplete — items are DERIVED from VOCAB/the active set, never a UI-local list.
interface CompletionCtx { line: number; col: number; kind: 'verb' | 'target'; }
interface Completion {
  insert: string;                       // the verb or label name to insert
  category: KeywordCategory;            // from VOCAB [02] (drives the same coloring)
  tooltip: { kid: string; machine: string }; // from VOCAB [02] (single source)
  source: 'active-subset' | 'program-label';  // provenance (subset verb vs program label)
}

// Peek-under-hood hover mapping — pure lookups over the compiler source map [04].
function bytesForLine(map: SourceMap, stmtIndex: number): { start: number; end: number };
function lineForByte(map: SourceMap, offset: number): number;

// The two two-way flows.
function assembleAndInject(state: EditorState, send: WorkerSend): InjectOutcome;   // compile→inject
function loadFromGenome(genome: Uint8Array, set: InstructionSet): EditorState;      // disasm→editable

type WorkerSend = (cmd: { type: 'inject'; sessionId: string; bytes: Uint8Array }) => void; // [01]
type InjectOutcome = { injected: true; bytes: Uint8Array } | { injected: false; reason: 'has-errors' };
```

- **`EditorViewModel` is a pure function of `EditorState`** (UIINV-ROUNDTRIP spirit): coloring,
  diagnostics, and the compiled view all derive deterministically from `(ast, source, activeSet)`
  by calling upstream. No editor-local caches change output.
- **Consumers:** the app shell ([07 SHELL]) hosts the editor per lesson/sandbox; the tank/inspector
  ([02]/[04]) feed `loadFromGenome`; the worker protocol ([01]) receives `inject`.
- **Imports** only types/functions from `@tierra26/{genescript,content,engine-types}`; it stores
  **no** opcode, color, or keyword constant (C-UI-SOURCE).

---

## 3. Data structures

- **`EditorState.ast` — the single source of truth.** Both modes are views of this one
  `Program` ([01]). Text mode edits produce a new `ast` via `parse`; block mode edits produce a
  new `ast` via `toAst`. Mode switching is `fromAst(ast)` / `toAst(doc)` — **never** a
  serialize-to-text-then-reparse round-trip (which could drift). `nodeId`s are stable across a
  switch so cursor/selection and diagnostic anchoring survive it ([07]).
- **`keywordSpans`** — the coloring layer, produced by `resolveKeywords` over the source using
  the content KEYWORD registry ([content 04]); each span reports a **palette role**, which the
  theme maps to a token (C-UI-THEME). The editor stores no color values.
- **`diagnostics`** — exactly `validate(ast, activeSet)` ([06]); each carries a `SourceSpan`
  (`line`/`cols` + `nodeId`). The **same** diagnostic list anchors underlines in text mode and
  block badges in block mode via the shared `nodeId` — one computation, two surfaces.
- **`compiled` (peek-under-hood)** — `compile(source, activeSet)` ([04]) gives `bytes` +
  `SourceMap`. The `SourceMap` is the **load-bearing structure** for the side-by-side view:
  `ranges` (statement → contiguous `[start,end)` bytes) drives line→byte highlighting;
  `statementAt(offset)` drives byte→line highlighting. On any error diagnostic, `bytes` is empty
  and `sourceMap` is `null` (a failed compile emits no partial genome — [04] §4.5), so
  `injectable` is false.
- **`completions`** — computed on demand from the **active set** (verb membership, VOCAB
  category/tooltip) and the **AST** (label definitions for target completion). It is not a stored
  list; locked verbs are absent because they are not in the active set (C-GS-SUBSET).
- **`blocks`** — `fromAst(ast)`; block order is statement order; each block carries its `nodeId`
  (diagnostics/selection sync) and VOCAB color category ([07]).

Everything derived is a pure function of `EditorState`; the editor holds **no simulation state**
(C-UI-VIEW) and **no** duplicated instruction/color facts (C-UI-SOURCE).

---

## 4. Behavior / algorithms

### 4.1 One AST, two modes (switching preserves the program)
The editor renders `ast` as text or blocks. A **mode switch** never touches the program:
```
switch to block:  doc  = fromAst(state.ast)      // [07]; nodeIds preserved
switch to text:   ast' = toAst(state.blockDoc)   // [07]; toAst(fromAst(ast)) ≡ ast
```
Because `toAst(fromAst(ast))` is structurally identical ([07] BLOCK-001/002), **text→block→text
preserves the program** and both modes compile to identical bytes ([07] BLOCK-003). Cursor and
selection are addressed by `nodeId`, so they survive the switch. The editor never re-serializes
to text and re-parses to change modes (that path could lose comments/casing) — the AST is the
pivot.

### 4.2 Keyword coloring (from the content registry — C-UI-SOURCE)
Coloring is `resolveKeywords(source, KEYWORDS)` ([content 04]) plus the AST's own structural
tokens (label defs, control targets, raw lines) classified by VOCAB category ([02]). Each colored
span resolves to a **palette role** (`action`/`register`/`marker`/`control`/`value` from VOCAB,
`concept` for prose nouns); the theme maps role → token → concrete color for light/dark/
high-contrast (C-UI-THEME). The editor stores **no** hex and **no** keyword list — swap VOCAB or
the registry and the editor recolors with zero edits (UIINV-SOURCE). Hovering a keyword shows the
registry's **two-line** card (kid + machine), the identical content the wiki and block hovers use
(single source, [02] §5.1 / [content 04]).

### 4.3 Autocomplete (subset-gated verbs + program labels)
Two completion contexts, both **derived**, never a stored menu:
- **Verb context** — offer exactly the verbs whose `InstrId` is in the **active set**
  (`activeSet` membership; C-GS-SUBSET). Locked verbs are **absent**, so the same keystrokes
  under a wider subset offer more verbs (tutorial gating tracks the active set, not the source).
  `mark-0`/`mark-1` (`nop0`/`nop1`) are **never** offered as worded verbs — kids write labels; the
  templates are compiler-generated ([02] §4.2), and explicit nops are `raw`-only.
- **Target context** — after a control verb (`jump-back`, `jump`, `call`, `find`, `find-back`,
  `find-forward`), offer exactly the **program's current labels** (the AST's `LabelDef` names),
  mirroring the block-mode target dropdown ([07] BLOCK-007). A forward reference is offered as
  soon as its label exists anywhere in the program.
Each `Completion` carries its VOCAB `category` and two-line tooltip ([02]) so the popup colors and
explains items from the same source as the editor text.

### 4.4 Inline diagnostics (from DIAG [06])
The editor calls `validate(ast, activeSet)` on every change (main thread, instant) and renders the
returned `Diagnostic[]` **verbatim** — it invents no diagnostics and rewrites no messages ([06]
owns tone, C-GS-KID). Each diagnostic anchors to its `SourceSpan`: in **text** mode the editor
underlines `{line, colStart..colEnd}`; in **block** mode it badges the block with the same
`nodeId`. Severity drives the affordance (error red, warning amber, hint lightbulb) but not the
wording. `hasErrors(diagnostics)` gates compile/inject (§4.6). Validation is deterministic (same
source + active set → identical list, [06] DIAG-010), so underlines never flicker between
identical states.

### 4.5 Peek-under-hood (source map line ↔ byte, both directions)
The side-by-side view puts GeneScript on one side and the compiled **classic-32 opcode bytes** on
the other, joined by the compiler `SourceMap` ([04]) — no re-derivation, the same map that proves
GSINV-SOURCEMAP:
- **Line → bytes:** hovering/selecting statement `s` highlights `sourceMap.ranges[s] =
  [start,end)` — the exact contiguous bytes that statement emitted.
- **Byte → line:** hovering/selecting byte `off` highlights `sourceMap.statementAt(off)` — the one
  owning statement.
The map is **total and 1:1** (every emitted byte maps to exactly one line; each line to a
contiguous range — [04] COMP-006/007/008), so the highlight is unambiguous in both directions and
a paired jump lights up both its verb line and its template bytes. The byte side reuses the DISASM
per-byte annotation model for labels/roles when showing an *evolved* genome (§4.7).

### 4.6 Assemble-and-inject (compile [04] → worker `inject` [01])
```
assembleAndInject(state, send):
  { bytes, diagnostics } = compile(state.source, state.activeSet)     // [04]
  if hasErrors(diagnostics): return { injected: false, reason: 'has-errors' }  // no bytes leave
  send({ type: 'inject', sessionId: state.sessionId, bytes })          // [01] WORKER
  return { injected: true, bytes }
```
The bytes sent are **exactly** `compile`'s output — the editor derives no second byte source
(UIINV-EDITOR-ENGINE). The injected bytes therefore **equal** the bytes shown in peek-under-hood
(what you see = what's injected). Inject is **gated on a clean compile**: any error-severity
diagnostic yields no bytes and no worker message. Only genome bytes cross the boundary (C-UI-VIEW,
[00] §1); the editor never places a creature in the soup itself.

### 4.7 Disassemble-into-editor (bytes [05] → editable GeneScript)
```
loadFromGenome(genome, set):
  result = disassemble(genome, set)        // [05]; total, never throws
  return editorState(source = result.text, ast = parse(result.text), activeSet = set)
```
Any creature's bytes — selected in the tank or the inspector — become **editable** GeneScript:
clean regions render as worded verbs + inferred labels, mutated/parasitic/unmappable regions
render as `raw <mnemonic>` / `raw byte N` ([05] never throws, always round-trips). This is the
"study an evolved parasite" flow: load a genome, read it, tweak it, re-inject it. Because DISASM's
output recompiles to the original bytes ([05] DISASM-010/011, GSINV-ROUNDTRIP), a
**disassemble-into-editor → assemble-and-inject** round-trip reproduces the **original genome**
(UIINV-EDITOR-ENGINE). The DISASM `annotations` stream feeds the byte side of peek-under-hood so
the same line↔byte highlighting works for an evolved genome that has no authored source map.

### 4.8 The three-views guarantee (UIINV-EDITOR-ENGINE)
For a program with no errors, four byte views coincide: the editor's **compiled** bytes, the
**peek-under-hood** bytes, the **injected** bytes, and the bytes the **inspector** disassembles
back from the live creature. §4.6 makes injected ≡ compiled ≡ peek; DISASM round-trip (§4.7) makes
inspector ≡ compiled. This is the editor's binding of UIINV-EDITOR-ENGINE — *what you see is what
is injected is what disassembles back.*

---

## 5. Interconnections

- **Calls (main thread):** `@tierra26/genescript` — `parse`/`toAst`/`fromAst`/`palette` ([01]/[07]),
  `validate`/`hasErrors` ([06]), `compile` ([04]), `disassemble` ([05]); `@tierra26/content` —
  `resolveKeywords` + KEYWORD registry ([content 04]). All are pure, deterministic functions
  (C-GS-DET / content determinism), so the editor's derived view-model is deterministic too.
- **Sends to the worker ([01] WORKER):** exactly one run-affecting command — `inject` carrying
  genome bytes to a `sessionId`. Nothing else crosses; frames/events come back to the tank/charts,
  not the editor (C-UI-VIEW).
- **Fed by the tank/inspector ([02]/[04]):** a selected creature's `genome: Uint8Array` enters via
  `loadFromGenome` (disassemble-into-editor). The inspector's live disassembly ([04]) is the
  fourth view in UIINV-EDITOR-ENGINE.
- **Reads the active set from the scenario ([engine 04]/[15] via SHELL):** the `InstructionSet`
  subset drives autocomplete, the block palette, and compilation — one source of "which verbs are
  legal here."
- **Contracts crossed:** C-UI-VIEW (no sim on main thread; inject-only), C-UI-SOURCE/UIINV-SOURCE
  (registry-derived coloring/facts), C-UI-THEME (role→token), C-GS-SUBSET (gating), and it
  **surfaces** UIINV-EDITOR-ENGINE and GSINV-SOURCEMAP/ROUNDTRIP through its UI.

---

## 6. Determinism & edge cases

- **Pure view-model.** `keywordSpans`, `diagnostics`, and `compiled` are deterministic functions
  of `(ast, source, activeSet)` because every upstream call is deterministic; the editor adds no
  RNG, clock, or `Map`-order dependence. Identical states render identically (no underline/color
  flicker).
- **Empty / comment-only program:** no diagnostics, zero compiled bytes, an empty (vacuously
  complete) source map, `injectable: true` (an empty genome is a legal, if inert, inject target —
  UI may still warn). Mode switch on an empty program yields an empty `BlockDoc` and back ([07]
  BLOCK-013).
- **Program with only warnings/hints:** `hasErrors` false → compiles and **injects** ([06]
  DIAG-014); the "won't reproduce yet" nudges never block the child from trying.
- **Program with an error:** `bytes` empty, `sourceMap` null, `injectable` false; the inject flow
  returns `{ injected: false, reason: 'has-errors' }` and sends nothing (no partial genome ever
  leaves — [04] §4.5).
- **Subset gating:** a verb outside the active subset autocompletes **not at all** and, if typed,
  diagnoses as `verb-not-unlocked` ([06] DIAG-002) — the same source is injectable under a wider
  set (tutorial gating tracks the active set, not the source).
- **Disassemble-into-editor of garbage:** any byte array loads (DISASM never throws); mutated bytes
  become editable `raw byte N` lines that recompile to the exact input ([05] DISASM-011/016). There
  is no genome the editor cannot open.
- **Mode switch with parse errors:** best-effort blocks for valid statements; error nodes render as
  an error affordance carrying their diagnostic ([07]) — never a crash.
- **Peek-under-hood on a failed compile:** no byte side to map; the view shows the diagnostics and
  the (empty) byte pane rather than a stale map.
- **Determinism of inject:** the same editor state injects byte-identical genomes every time
  (compile is deterministic, C-GS-DET), preserving engine determinism across the boundary
  (C-UI-DET).

---

## 7. Fidelity notes

- **[CORE] one AST, two views.** The text↔block isomorphism ([07]) and the single-AST source of
  truth are the whole "one language, two renderings" promise; switching must be lossless.
- **[CORE] two-way transparency.** Peek-under-hood over the compiler source map ([04]) and
  disassemble-into-editor ([05]) realize the SPEC "peek under the hood" / "study an evolved
  creature" commitments at program granularity — the headline reason the editor exists.
- **[CORE] one genome, three views.** UIINV-EDITOR-ENGINE (editor = injected = disassembled) is
  the editor's binding invariant; every flow here is designed to keep those byte views identical.
- **[MOD] compile/diagnose on the main thread.** The engine runs in a worker (authoritative), but
  GeneScript compile/validate/disassemble run on the **main thread** for instant editor feedback
  ([00] §1). This is deterministic (C-GS-DET), so where it runs does not affect outcomes — a
  responsiveness choice, not a semantic one.
- **[MOD] registry-derived presentation.** Colors/keywords/tooltips are a projection of VOCAB +
  the content registry (C-UI-SOURCE), not an editor table — a single-source design that trades a
  derivation step for guaranteed non-drift with the wiki, blocks, and inspector.
- **[OPTIONAL] richer authoring affordances.** One-click quick-fixes from `suggestion`, inline
  "ghost" opcode previews, semantic label re-naming on disassembly, animated block snapping — all
  layer on later; the guaranteed floor is registry coloring + DIAG underlines + the source-map
  peek.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/ui/test/03-editor.test.ts`. IDs are **append-only**.
Purely-visual criteria are tagged `(visual)` — they become visual/e2e checks in the design pass
but stay on the checklist; the rest are ordinary view-logic unit tests.

**One AST, two modes**
- **EDITOR-001** — The editor holds **one AST** as its source of truth; both **text** and
  **block** modes render/edit that same `Program` (no second program model).
- **EDITOR-002** — **Switching text→block→text preserves the program**: the mode switch goes
  through `toAst`/`fromAst` ([07] isomorphism), not serialize+reparse, and yields a structurally
  identical AST (and identical compiled bytes).
- **EDITOR-003** — Cursor/selection survive a mode switch: they are addressed by the **shared
  `nodeId`**, so the same statement stays selected across text↔block.
- **EDITOR-004** — **Compile & diagnose run on the main thread** (the editor calls
  `compile`/`validate` synchronously for instant feedback); only genome **bytes** ever cross to
  the worker (C-UI-VIEW, [00] §1).

**Keyword coloring (from the content registry — C-UI-SOURCE)**
- **EDITOR-005** — Keyword **coloring resolves from the content KEYWORD/VOCAB registry**
  (`resolveKeywords` / VOCAB category), never from a UI-local color or keyword list
  (C-UI-SOURCE / UIINV-SOURCE): changing the registry changes the editor's colors with no editor
  edit.
- **EDITOR-006** — A keyword's color is its **palette role mapped through a theme token**
  (role → token), defined for every role (`action`/`register`/`marker`/`control`/`value`); the
  editor stores no per-component hex (C-UI-THEME, logic half).
- **EDITOR-007** — Hovering a keyword shows the registry's **two-line tooltip** (kid + machine),
  identical content to the wiki and block hovers (single source — [02] §5.1 / [content 04]).
- **EDITOR-008** — `(visual)` The concrete keyword palette (hex values, light/dark/high-contrast)
  renders per the design pass.

**Autocomplete (subset-gated verbs + program labels)**
- **EDITOR-009** — **Autocomplete offers only active-subset verbs**: a verb whose `InstrId` is not
  in the scenario's active set is **absent** from completions (C-GS-SUBSET / tutorial gating).
- **EDITOR-010** — The **same source under a wider active set** offers **more** verbs — gating
  tracks the active set, not the source text.
- **EDITOR-011** — `mark-0`/`mark-1` (`nop0`/`nop1`) are **never** offered as worded verb
  completions (kids write labels; explicit nops are `raw`-only) — [02] §4.2.
- **EDITOR-012** — **Label-target completion lists exactly the program's current labels**: after a
  control verb, completions are the AST's `LabelDef` names (matching the block target dropdown,
  [07] BLOCK-007), including a still-undefined-below forward reference once its label exists.
- **EDITOR-013** — Each completion carries its **VOCAB category and two-line tooltip** from the
  registry (source), so the popup colors/explains items from the same source as the text.

**Inline diagnostics (from DIAG [06])**
- **EDITOR-014** — Inline diagnostics are **exactly `validate(ast, activeSet)`** output ([06]);
  the editor renders them verbatim and invents/rewrites none.
- **EDITOR-015** — A diagnostic **maps to the right span**: it underlines its exact
  `{line, colStart..colEnd}` in text mode and badges the block with the **same `nodeId`** in block
  mode — one computation, two surfaces.
- **EDITOR-016** — **Errors block assemble-and-inject; warnings/hints do not**: `injectable ===
  !hasErrors(diagnostics)`, and a warnings-only program still compiles and injects ([06]
  DIAG-014).
- **EDITOR-017** — Diagnostic rendering is **deterministic** in `(source, activeSet)` (pure; no
  RNG/clock): identical states produce identical underlines/badges ([06] DIAG-010).

**Peek-under-hood (source-map line ↔ byte)**
- **EDITOR-018** — Peek-under-hood shows GeneScript **beside the compiled classic-32 bytes** using
  the compiler [04] **`SourceMap`** (no re-derivation of the mapping).
- **EDITOR-019** — **Hovering a source line highlights exactly its compiled byte range**:
  `bytesForLine(map, s) === map.ranges[s] = [start, end)` — contiguous, that statement's bytes
  only.
- **EDITOR-020** — **Hovering/selecting a compiled byte highlights exactly its owning statement**:
  `lineForByte(map, off) === map.statementAt(off)` — the reverse direction.
- **EDITOR-021** — The line↔byte mapping is **total and 1:1**: every emitted byte maps to exactly
  one line and each line to a contiguous range (surfaces GSINV-SOURCEMAP / [04] COMP-006/007/008).
- **EDITOR-022** — `(visual)` The two-pane peek layout and the hover-highlight styling render per
  the design pass.

**Assemble-and-inject (compile [04] → worker inject [01])**
- **EDITOR-023** — **Assemble-and-inject sends the exact compiled bytes**: it compiles the current
  program via [04] and issues a worker `inject` ([01]) carrying **precisely** `compile`'s `bytes`
  — no second byte source (UIINV-EDITOR-ENGINE).
- **EDITOR-024** — The **injected bytes equal the peek-under-hood bytes** shown for the same
  program (what you see = what's injected).
- **EDITOR-025** — Inject is **gated on a clean compile**: with any error diagnostic, no bytes are
  produced and **no** worker message is sent (`{ injected: false, reason: 'has-errors' }`).

**Disassemble-into-editor (bytes [05] → editable GeneScript)**
- **EDITOR-026** — **Disassemble-into-editor** takes a creature's `genome` bytes (from the
  inspector/tank) through DISASM [05] and loads **editable GeneScript** into the editor (the
  "study an evolved parasite" flow).
- **EDITOR-027** — **Any genome loads (never throws)**: a mutated/parasitic byte array arrives as
  editable `raw`-fallback GeneScript; there is no genome the editor cannot open ([05]
  DISASM-011/016).
- **EDITOR-028** — **Round-trip**: disassemble-into-editor then assemble-and-inject **reproduces
  the original genome bytes** (compile∘disassemble fixed point — GSINV-ROUNDTRIP /
  UIINV-EDITOR-ENGINE).

**The three-views guarantee & no-sim discipline**
- **EDITOR-029** — **UIINV-EDITOR-ENGINE**: the editor's compiled bytes, the peek-under-hood
  bytes, the injected genome, and the inspector's disassembly are the **same genome** — one
  genome, three (four) views agree.
- **EDITOR-030** — The editor **never simulates**: its only run-affecting action is `inject` via
  the worker; no gameplay/evolution logic runs on the main thread (compile/validate/disassemble
  excepted) — C-UI-VIEW / UIINV-VIEW.
- **EDITOR-031** — `(visual)` Autocomplete popup, diagnostic underline/icon, and severity-color
  affordances render per the design pass.
- **EDITOR-032** — `(visual)` Block-mode drag/palette affordances render, and a keyword's color is
  **identical** in text and blocks (one visual language, [07] + [02] §5).

---

## 9. Open questions

1. **Debounce vs keystroke compile.** Compile/validate are main-thread and instant for small
   programs, but a large disassembled genome could stutter on every keystroke. Do we debounce
   compile (not diagnostics), or cap the peek pane's live re-map? (Determinism is unaffected;
   this is purely a responsiveness policy.)
2. **Comment round-tripping across modes.** [07]/[01] flag whether comments survive a text→block→
   text trip. If block form drops comments, EDITOR-002's "preserves the program" must be scoped to
   *statements* (comments are display-only) — confirm the intended contract with [07].
3. **Peek granularity for `raw` regions.** [04] Open-Q2 asks whether a multi-instruction `raw`
   region maps as one range or per-mnemonic. The editor prefers **per-byte** annotations (via
   DISASM) for evolved genomes so each mutated byte highlights independently — confirm the source
   map matches for *authored* raw blocks too.
4. **Inject target & lifecycle.** Which `sessionId` an inject targets (the focused playground, a
   dedicated sandbox) and whether re-injecting replaces or adds a creature is a SHELL/[01]
   concern; the editor only guarantees it sends the right bytes to the given session.
5. **Semantic labels on disassembly.** [05] Open-Q defers friendly inferred names (`copy:`,
   `start:`) beyond `label1…`. The editor could offer a rename affordance on load; does that live
   here or in DISASM's optional heuristics?
6. **Autocomplete for targets vs new labels.** Should the target popup also offer "create a new
   landmark named …" (inserting a `LabelDef`), or only existing labels? (Current lean: existing
   labels only, mirroring [07] BLOCK-007; label creation is a separate action.)
