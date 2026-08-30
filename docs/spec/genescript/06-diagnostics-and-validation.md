# Diagnostics & Validation — Engineering Spec              (Code: DIAG · Milestone: M2)

**Status:** v1, authored. The **validate** step of the GeneScript pipeline: it takes the parsed
AST and produces a list of **kid-friendly diagnostics** (errors, warnings, hints) before lowering.
This doc **owns the message-tone contract (C-GS-KID) for the whole app** — every user-facing
string in editor, block form, and tooltips follows the tone rules defined here (§4).

**Upstream refs:** [`00-overview.md`](00-overview.md) §3 (pipeline — validate sits between parse
and lower), §5 (contracts **C-GS-KID**, **C-GS-SUBSET**), §4 (system map — diagnostics attach to
the AST from `01` and surface in `07` block form);
[`ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §6 (the reproduction life-cycle — the source of the
"will it replicate?" hints), §5 (templates — informs the label/jump checks);
[`ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3 (verb ↔ mnemonic names used in messages).
**Reference:** verb vocabulary from [`02-vocabulary-and-keywords.md`](02-vocabulary-and-keywords.md)
(VOCAB) — the active subset and the canonical friendly names / hover terms.

**Contracts obeyed:** **C-GS-KID** (this doc defines it — plain language for ages 8–16, no jargon
without a hover term), **C-GS-SUBSET** (a verb outside the scenario's active subset is a gated
error, supporting tutorial gating), **C-GS-DET** (same source + active set → byte-identical
diagnostics; no RNG, no wall-clock, stable ordering). Validation is **pure and read-only over the
AST** — it never mutates the tree or emits bytes.

---

## 1. Purpose & responsibility

This system owns **the validate step**: a pure function from a parsed AST (+ the scenario's active
subset) to an ordered list of **diagnostics**. It must guarantee: (a) every diagnostic carries a
**severity** (`error` / `warning` / `hint`), a **source span** (which characters — or which block —
the message points at), a **plain-language message** for ages 8–16, an **optional fix suggestion**,
and a **stable diagnostic code** (`DIAG-NNN`-derived, e.g. `unknown-verb`); (b) **errors block
compilation** while **warnings and hints do not** — a program with only warnings/hints still
compiles to valid bytes; (c) the **static checks** below (unknown verb, subset gating, label
integrity, stack-balance heuristic, unreachable code) are applied deterministically; (d) the
**replication hints** ("will it replicate?") are emitted as *soft* diagnostics that **teach, never
scold**; (e) diagnostics **attach to AST nodes** so the editor and the block form can highlight the
exact statement; (f) the output is **deterministic** — same source + active set yields the same
diagnostics in the same order every time. Validation **owns no state** and reads only the AST +
active set; it is the single authority for **message tone** across the product.

---

## 2. Interfaces

`validate.ts` exposes one pure entry point; the editor (`07`) and compiler (`04`) consume its
result. It reads the AST from `01` and the active `InstructionSubset` from the scenario.

```ts
type Severity = 'error' | 'warning' | 'hint';

// A character span in the source (editor) OR a node handle (block form).
interface SourceSpan {
  line: number;        // 1-based source line
  colStart: number;    // 1-based, inclusive
  colEnd: number;      // 1-based, exclusive
  nodeId: NodeId;      // the AST node this span belongs to (block form has no cols)
}

// A single kid-facing diagnostic.
interface Diagnostic {
  code: DiagCode;      // stable, e.g. 'unknown-verb' | 'jump-to-missing-label' | 'wont-reproduce'
  severity: Severity;  // error blocks compile; warning/hint do not
  span: SourceSpan;    // where to underline / which block to flag
  message: string;     // plain language, ages 8-16 (C-GS-KID) — no jargon w/o a hover term
  suggestion?: string; // optional concrete fix ("did you mean `divide`?")
  hoverTerms?: string[]; // any technical word used → must resolve to a wiki tooltip (VOCAB)
  teaches?: boolean;   // hints/soft warnings that explain a concept (drives gentler UI framing)
}

// Pure: (AST, active subset) → ordered, deterministic diagnostics. No mutation, no RNG.
function validate(program: Program, active: InstructionSubset): Diagnostic[];

// Convenience for the editor: does anything block compilation?
function hasErrors(diags: Diagnostic[]): boolean;   // === diags.some(d => d.severity === 'error')
```

- **Imports:** the AST/`Program` types (`01`), the `InstructionSubset`/verb-name lookup (VOCAB /
  engine active set). Reads opcodes **through** the active set — never hard-codes them
  (C-GS-NOOPCODES).
- **Imported by:** `04` compiler (calls `validate` and refuses to lower if `hasErrors`), `07` block
  form and the editor (render underlines/badges from spans), the tooltip layer (resolves
  `hoverTerms`).

---

## 3. Data structures

Validation holds **no persistent state**. It builds transient per-run tables from the AST, then
discards them. All tables are keyed deterministically (source order), never by `Map` iteration
chance (C-GS-DET).

| Structure | Built from | Purpose | Determinism note |
|---|---|---|---|
| `verbSet` | active `InstructionSubset` | membership + suggestion candidates | ordered by opcode; suggestions ranked by edit distance then opcode order |
| `labelDefs: label → span[]` | `label:` statements, in source order | detect duplicate + undefined labels | insertion order = source order |
| `labelRefs: label → span[]` | control verbs' targets (`jump-back X`, `find-back Y`, `call Z`) | detect jump/find to a missing label | source order |
| `stackDelta` | scan of `save-*` / `load-*` verbs | push/pop imbalance heuristic | integer running sum, deterministic scan |
| `reachable: boolean[]` | linear scan flagging code after an unconditional `jump`/`return` with no inbound label | unreachable-code check | one forward pass |
| `reproFacts` | presence/absence of `find*`, `make-space`, `copy-byte`, a loop back, `divide` | drive the replication hints (§5) | boolean flags, source order |

- A **span** is the diagnostic's anchor. In **worded text** it is `{line, colStart, colEnd}`; in
  **block form** the same `nodeId` addresses the block (no columns) — one model, two renderings
  (00 §1). The `nodeId` is the shared key so a diagnostic computed once lights up in **either**
  surface.
- `DiagCode` is a **stable string** (kebab-case) paired 1:1 with a `DIAG-NNN` acceptance criterion
  (§8). Codes are **append-only** and never renumbered, so saved lessons / analytics stay valid.

---

## 4. The tone rules (C-GS-KID — this doc owns them)

Every user-facing string in GeneScript — diagnostics **and** tooltips, empty states, block labels —
obeys these rules. This is the single source of truth; other docs defer here.

1. **Short.** One or two sentences. A kid reads it in a glance. No stack traces, no walls of text.
2. **Encouraging, never scolding.** Address the *code*, not the child. "This creature never calls
   **divide**, so it won't make a baby yet." — not "Error: missing divide instruction." Hints in
   particular **teach**: they explain *why* something matters, framed as a next step.
3. **Concrete.** Name the exact verb/label and what to do. "I can't find a landmark called
   **`copy`**. Did you spell it the same in both places?" beats "undefined reference".
4. **No jargon without a hover term.** Words like *template*, *opcode*, *stack*, *register* are
   banned from the plain sentence **unless** they are attached as a `hoverTerm` that resolves to a
   wiki tooltip (a kid line + the machine truth, 00 §1). Prefer the friendly noun: **landmark** (not
   template/label-address), **verb** (not instruction/opcode), **save/load pile** (not stack),
   **make a baby / reproduce** (not divide-to-spawn).
5. **Second person, present tense, active voice.** "You jump back to a landmark that isn't here."
6. **A fix when there is one.** Populate `suggestion` with the smallest concrete step. Never
   suggest a fix you're unsure of (determinism + trust): "did you mean" only when edit distance is
   small and unambiguous.
7. **Severity sets the emoji/color, not the harshness.** Errors are red but still kind; warnings and
   hints are softer and marked `teaches: true` so the UI frames them as tips, not failures.

> **Rule of thumb for authors:** read the message aloud to an 8-year-old. If any word makes them ask
> "what's that?", it must become a hover term or be replaced. This is testable — see DIAG-011.

---

## 5. Behavior / algorithms

`validate` runs the checks below in a **fixed order** over a single AST; it collects diagnostics
into one list and returns it sorted by `(line, colStart, code)` for stable ordering (C-GS-DET).

### 5.1 Static checks (errors + a warning)

**Unknown verb → `error`, with "did you mean".** A statement whose verb is not in the engine
dictionary at all is an error. Compute the closest known verb by edit distance (Damerau-Levenshtein,
integer, deterministic tie-break by opcode order); if a near match exists, put it in `suggestion`.
- code `unknown-verb`; e.g. *"I don't know the verb **`copybyte`**. Did you mean **`copy-byte`**?"*

**Verb not in the active subset → `error` (gated, C-GS-SUBSET).** The verb exists in the full
`classic32` dictionary but the current tutorial subset hasn't unlocked it. This is a *distinct*
error from unknown-verb — the message reassures the kid the verb is real, just not yet.
- code `verb-not-unlocked`; e.g. *"**`divide`** is a real verb, but this puzzle hasn't unlocked it
  yet. You'll get it in a later chapter!"* `teaches: true`.

**Undefined label (jump/find to a missing landmark) → `error`.** A control verb targets a label
name that has no `label:` definition. Suggest the nearest defined label if one is close.
- code `jump-to-missing-label`; e.g. *"You jump back to a landmark called **`copy`**, but I can't
  find it. Did you make a landmark with that name?"* (hover term: *landmark*).

**Duplicate label → `error`.** Two `label:` statements share a name — addressing would be
ambiguous. Point the span at the **second** definition and reference the first's line.
- code `duplicate-label`; e.g. *"There are two landmarks called **`copy`**. Give one a different
  name so I know which to jump to."*

**Stack imbalance heuristic → `warning`.** A linear scan sums `+1` per `save-*` (push) and `-1` per
`load-*` (pop). If the running sum goes **negative** (pop with nothing saved) or ends **non-zero**,
warn. It's a heuristic (branches/loops make exact balance undecidable), so it is a **warning**, not
an error, and says so gently.
- code `stack-imbalance`; e.g. *"You **load** from the pile more times than you **save** to it —
  the pile might be empty when you try."* (hover term: *pile / stack*). `teaches: true`.

**Unreachable code after an unconditional jump → `warning`.** Statements that follow an
unconditional `jump` / `jump-back` / `return` and have **no label** in front of them (nothing can
land there) can never run.
- code `unreachable-code`; e.g. *"These lines come right after a **jump**, and nothing points here,
  so they never run. You can delete them or add a landmark above."* `teaches: true`.

### 5.2 Replication hints (soft warnings — they TEACH, they don't scold)

These answer *"will it replicate?"* by inspecting the AST against the ISA reproduction life-cycle
(ISA-VM-SPEC §6: locate self → allocate → copy loop → divide). They are **never errors** — a
half-built creature is a normal step in learning. Each is `severity: 'warning'` or `'hint'` with
`teaches: true`, phrased as a friendly nudge toward the next piece.

| Missing piece (AST fact) | Life-cycle step (§6) | Diagnostic (code) | Message shape |
|---|---|---|---|
| no `divide` anywhere | step 4 (divide) | `wont-reproduce` | *"This creature copies itself but never calls **divide**, so it won't make a baby yet. Add **divide** when the copy is done!"* |
| a `copy-byte` but no `make-space` before it | step 2 (mal) | `no-space-before-copy` | *"You copy bytes, but you never **make-space** for the baby first — there's nowhere to copy into."* |
| copy body with no `jump-back` to loop | step 3 (copy loop) | `no-copy-loop` | *"Your copy only runs once — with no **jump-back**, it copies a single byte and stops. Loop back to copy the whole creature."* |
| no `find` / `find-back` / `find-forward` | step 1 (locate self) | `no-self-location` | *"This creature never uses **find**, so it can't tell where it starts or how big it is — it won't know what to copy."* |

- Emphasis (C-GS-KID rule 2): every hint states **why it matters** and **what to add next**, framed
  as encouragement. The UI marks `teaches: true` hints as tips (lightbulb), not failures.
- These are **heuristics on presence/order**, not a proof of replication — the ground truth is the
  cross-layer **GSINV-ANCESTOR** test (00 §6). A creature can pass all hints and still not breed;
  the hints only catch the common, teachable omissions.

### 5.3 Attaching to the AST + surfacing in both renderings

- Each diagnostic's `span.nodeId` is the AST node it concerns. The editor maps `nodeId → {line,cols}`
  to underline the exact text; the block form maps the **same** `nodeId` to a badge on the block.
  One computation, two surfaces (00 §1 "one language, two renderings").
- The editor shows severity as color + icon (error red, warning amber, hint lightbulb) and renders
  `suggestion` as a one-click quick-fix where safe (e.g. rename to the "did you mean" verb).
- `hoverTerms` in a message are the **only** place a technical word may appear; the tooltip layer
  resolves each to its VOCAB wiki entry.

### 5.4 Determinism (C-GS-DET)

- No RNG, no wall-clock, no environment reads. The check order is fixed; the final list is sorted by
  `(line, colStart, code)`.
- Suggestion ranking (edit distance, then opcode order) is a **total, integer** order — no ties are
  broken by hash/`Map` iteration.
- Therefore **same source + same active subset ⇒ byte-identical diagnostics list** (asserted by
  DIAG-010).

---

## 6. Interconnections

- **Calls:** the VOCAB / active-set lookup (verb membership + friendly names + hover terms) and the
  AST node accessors from `01`. Reads opcodes only through the active set (C-GS-NOOPCODES).
- **Called by:** `04` compiler (validate → refuse-to-lower on any `error`; warnings/hints pass
  through and still produce bytes), `07` block form + editor (render), the tooltip layer (hover
  terms). Cross-layer, **GSINV-ANCESTOR** is the ground-truth replication check that the §5.2 hints
  only approximate.
- **Contracts crossed:** **C-GS-SUBSET** (subset-gated error supports tutorial gating), **C-GS-KID**
  (owned here — every downstream string obeys §4), **C-GS-DET** (deterministic list feeds the
  deterministic compile).

---

## 7. Fidelity notes

| Aspect | Tag | Note |
|---|---|---|
| Severity model (error/warning/hint), span, code, suggestion | **[CORE]** | The diagnostic shape every surface consumes. |
| Kid tone rules (C-GS-KID) | **[CORE]** | This doc owns the app-wide message-tone contract. |
| Subset gating as a distinct error (C-GS-SUBSET) | **[CORE]** | Needed for tutorial progression; a real verb, "not yet unlocked". |
| Label integrity (undefined/duplicate/jump-to-missing) | **[CORE]** | Mirrors the engine's template semantics (ISA-VM §5) at the friendly layer, before templates are even generated (03 LBL). |
| Stack-balance check | **[MOD]** | A **heuristic** warning (exact balance is undecidable with branches) — deliberately soft. |
| Unreachable-code check | **[MOD]** | Simple linear "after unconditional jump, no inbound label" pass; not a full CFG analysis. |
| Replication hints | **[MOD]** | Presence/order heuristics against ISA-VM §6, **not** a replication proof (that's GSINV-ANCESTOR). Framed to teach. |
| "Did you mean" via edit distance | **[OPTIONAL]** | Nice-to-have suggestion; deterministic tie-break required if enabled. |

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/genescript/test/06-diag.test.ts`. IDs are
append-only.

- **DIAG-001** — An **unknown verb** (not in the engine dictionary) produces an `error` whose
  `code` is `unknown-verb` and whose `suggestion` names the closest known verb ("did you mean
  `copy-byte`?") when one is within a small edit distance.
- **DIAG-002** — A verb that **exists but is not in the active subset** produces a **gated** `error`
  (`verb-not-unlocked`, C-GS-SUBSET) — distinct from `unknown-verb` — whose message reassures the
  verb is real but not yet unlocked (`teaches: true`).
- **DIAG-003** — A control verb (`jump-back`/`find-back`/`call`) targeting a label with **no
  definition** produces an `error` `jump-to-missing-label`, and suggests the nearest defined label
  if one is close.
- **DIAG-004** — Two `label:` statements with the **same name** produce an `error`
  `duplicate-label`, spanned on the second definition and referencing the first.
- **DIAG-005** — A creature that has a copy loop but **no `divide`** produces a **warning/hint**
  `wont-reproduce` (never an error), `teaches: true`, telling the kid to add `divide`.
- **DIAG-006** — A creature that uses `copy-byte` with **no `make-space` before it** produces a
  warning `no-space-before-copy` explaining there's nowhere to copy into (never an error).
- **DIAG-007** — A **push/pop imbalance** (more `load-*` than `save-*`, or a negative running sum)
  produces a **warning** `stack-imbalance` (heuristic, not an error), `teaches: true`.
- **DIAG-008** — Every diagnostic carries a **source span** (`line`/`cols` + `nodeId`) and a
  **stable `code`**, so the editor and block form can highlight the exact statement from the same
  data.
- **DIAG-009** — **Unreachable code**: statements after an unconditional `jump`/`return` with **no
  inbound label** produce a warning `unreachable-code` (`teaches: true`).
- **DIAG-010** — **Determinism (C-GS-DET):** validating the same source with the same active subset
  twice yields an **identical** diagnostics list (same items, same order); no RNG/wall-clock.
- **DIAG-011** — **Tone check (C-GS-KID):** every diagnostic message is short and jargon-free — any
  technical word present is declared in `hoverTerms` (resolvable to a tooltip); the plain sentence
  alone contains no un-hovered jargon (`template`, `opcode`, `register`, `stack`, …).
- **DIAG-012** — A creature with a copy body but **no `jump-back` loop** produces a hint
  `no-copy-loop` ("copies a single byte and stops"), `teaches: true`.
- **DIAG-013** — A creature with **no `find`/`find-back`/`find-forward`** produces a hint
  `no-self-location` ("can't tell where it starts or how big it is"), `teaches: true`.
- **DIAG-014** — **Errors block compilation; warnings and hints do not**: `hasErrors` is true iff
  at least one `error` is present, and a program with only warnings/hints still lowers to valid
  bytes (with C-GS-VALID upheld downstream).

---

## 9. Open questions

1. **Edit-distance threshold.** What maximum distance (and minimum length ratio) makes a "did you
   mean" trustworthy enough to auto-suggest / offer as a one-click fix? Too loose erodes trust.
2. **Loop detection depth for hints.** `no-copy-loop`/`wont-reproduce` use presence/order
   heuristics; how much control-flow following (through `ifz`/`jump-back`) is worth it before we
   defer to the GSINV-ANCESTOR ground truth?
3. **Localization.** The tone rules assume English reading levels. When messages are translated, do
   the age-appropriate constraints (sentence length, hover-term policy) travel per-locale, and where
   is that contract asserted?
4. **Warning fatigue in tutorials.** Should early chapters suppress replication hints entirely (the
   kid isn't building a replicator yet) via a per-scenario flag, and is that flag part of the active
   subset or a separate diagnostics policy?
