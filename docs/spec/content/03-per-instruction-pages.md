# Per-Instruction Pages — Engineering Spec              (Code: INSTRPAGE · Milestone: M3)

**Status:** v1. Defines the **`InstructionPage` data record** — *one record per classic-32
verb* — that is the **single source of instruction depth** feeding three surfaces at once:
the **wiki page** for that verb, the **keyword tooltip** [04], and the playground **"try
this" scenarios** [02]. It realizes the overview's "**every instruction a page**" commitment
([`00-overview.md`](00-overview.md) §1) and sits in the content pipeline as the [03] node
that "feeds both the wiki pages AND playground 'try this' scenarios" (§2).

Upstream: [`00-overview.md`](00-overview.md) (§1 teaching model, §2 pipeline, §4 doc set,
§5 contracts — esp. **C-CON-SOURCE**, **C-CON-COMPILES**, **C-CON-DET**, **C-CON-KID**;
§6 **CONTINV-COVERAGE**),
[`../genescript/02-vocabulary-and-keywords.md`](../genescript/02-vocabulary-and-keywords.md)
(**VOCAB** — the definitive verb↔mnemonic↔kid-def↔machine-truth↔color table; [03] builds
**on** it and must **not** contradict it) and
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3 (mnemonic load order) and §4
(per-instruction semantics — the source of every machine-truth line). Conforms to the engine
anchor [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8
(doc template §8.1, criterion IDs §8.2, `it.todo` test conventions §8.3, fidelity tags §8.4).

**Contracts obeyed:** **C-CON-SOURCE** (instruction facts live only in [03] + VOCAB [04];
prose/tooltips *reference*, never redefine), **C-CON-COMPILES** (every scenario genome
compiles under its subset via `@tierra26/genescript` and loads in `@tierra26/engine`),
**C-CON-DET** (page data is static; every scenario is a reproducible `RunDescriptor`),
**C-CON-KID** (all learner-facing text obeys the age-8–16 tone rules, shared with VOCAB
C-GS-KID). Feeds [04] keyword tooltips, [01] lesson `` `verb` `` links, and [02] playground
"try this" configs.

---

## 1. Purpose & responsibility

This system owns the **per-instruction reference record**: the closed set of wiki-page data,
one entry per classic-32 verb, and everything a UI needs to render a verb's page, tooltip
depth, and "try it" playgrounds. It must guarantee:

- **Total, one-to-one coverage.** Exactly **one** `InstructionPage` per classic-32 verb — the
  32 VOCAB verbs, no more, no fewer (**CONTINV-COVERAGE**). No verb is page-less; no page
  names a verb VOCAB does not define.
- **Single source of depth (C-CON-SOURCE).** The *facts about an instruction* — what it does
  for the creature (kid definition), what it does to the machine (machine-truth), which
  register it binds, its color role, its mnemonic — are owned by **VOCAB** ([04]) and **this
  record**, and **nowhere else**. Lesson prose and tooltips **reference** these fields; they
  never restate or fork a definition. A page therefore *composes* from VOCAB (identity/short)
  + this record (depth) rather than duplicating anything.
- **Identity comes from the engine, not a literal.** A page's `mnemonic` is resolved via the
  VOCAB entry (whose mnemonic the engine's active set validates) — **never hard-coded** in the
  page. Reordering the set or activating a subset changes bytes; it never edits a page.
- **Runnable depth.** Each page carries a small set of **editable scenarios** — each a valid
  **`PlaygroundConfig`** [02] that spotlights *this* instruction with a "try: change X" prompt.
  Every scenario's genome **compiles and loads** (C-CON-COMPILES) and is **deterministic**
  (C-CON-DET).
- **Data, not behavior.** A page is authored, frozen content that the wiki, tooltip, and
  playground surfaces all read from one place — no executable authoring.

This doc is **data**, not logic: it is the authoritative content that the wiki renderer, the
tooltip "more"/see-also panel, and the playground "try this" launcher all read from one place.

---

## 2. Interfaces

The per-instruction pages are exposed as a plain, declarative table (no `src/` imports yet;
identity/short fields are *derived from* the VOCAB entry, not copied):

```ts
// A declarative description of the on-screen animation for this instruction — NOT a renderer.
// The UI layer interprets these to animate; content only says WHAT changes, never HOW to draw.
interface AnimationSpec {
  summary: string;                 // one plain line: "register C decreases; a byte flies from mother to daughter"
  targets: readonly (             // the visual actors this instruction touches, declaratively
    | { kind: 'register'; reg: 'A'|'B'|'C'|'D'; change: 'increase'|'decrease'|'set'|'read' }
    | { kind: 'flag'; flag: 'E'|'S'|'Z'; change: 'set'|'clear' }
    | { kind: 'stack'; change: 'push'|'pop' }
    | { kind: 'soup'; from: 'self'|'mother'|'daughter'; to: 'self'|'mother'|'daughter' } // e.g. copy-byte
    | { kind: 'ip'; change: 'jump'|'skip'|'call'|'return' }
    | { kind: 'cell'; change: 'allocate'|'divide' }
  )[];
}

// A "try this" scenario: a PlaygroundConfig [02] spotlighting this instruction, plus a prompt.
interface EditableScenario {
  id: string;                      // unique within the page
  prompt: string;                  // "try: change X" — one plain instruction to the learner (C-CON-KID)
  config: PlaygroundConfig;        // the reproducible engine recipe (scenario+seed+starter+subset[+goal]) — [02]
  spotlight: string;               // which verb/behavior this scenario highlights (== the page's verb)
}

// One per-instruction page — the definitive per-verb reference record.
interface InstructionPage {
  verb: string;                    // the GeneScript verb — the join key to its VOCAB entry (unique across the table)
  // --- identity / short: DERIVED from VOCAB, not redefined here (C-CON-SOURCE) ---
  mnemonic: string;                // === vocab(verb).mnemonic (via engine ISA, NOT hard-coded)
  kid: string;                     // === vocab(verb).tooltip.kid       (the kid definition)
  machine: string;                 // === vocab(verb).tooltip.machine   (the machine-truth line)
  // --- depth: OWNED here ---
  animation: AnimationSpec;        // what-it-does-visually (declarative — for the UI to animate)
  scenarios: readonly EditableScenario[];  // editable "try this" playgrounds (>= 1)
  seeAlso: readonly string[];      // related verbs — each MUST be a real verb in this table
  commonMistakes: readonly string[]; // plain-language pitfalls (C-CON-KID)
  introLesson: string;             // id of the lesson that introduces this verb — resolves in [05]
}

const INSTRUCTION_PAGES: readonly InstructionPage[]; // one per classic-32 verb, VOCAB (§3.3) order
```

**Importers:** the wiki renderer (composes a page from VOCAB identity + this record's depth),
[04] tooltip UI (pulls `seeAlso`/`animation` for the expanded card; `kid`/`machine` stay
VOCAB-owned), [02] playground launcher (mounts each `EditableScenario.config`), [01] lesson
parser (`` `verb` `` code spans link to the page whose `verb` matches), and [05] progression
(cross-checks `introLesson`).

---

## 3. Data structures

- **`INSTRUCTION_PAGES`** — a frozen array, **exactly one entry per classic-32 verb**, in
  VOCAB's §3.3 load order (0–31) so the wiki index and VOCAB palette share one canonical
  ordering. Order is *presentational only*; nothing keys off the index (mirrors
  C-GS-NOOPCODES / C-CON-SOURCE).
- **`verb`** — the join key to VOCAB; lower-kebab-case, unique across the table, and **must
  exist** in `VOCABULARY`. This is the token an [01] `` `verb` `` link resolves against.
- **`mnemonic` / `kid` / `machine`** — **derived, not authored.** They must be *identical* to
  the corresponding VOCAB entry's `mnemonic`, `tooltip.kid`, `tooltip.machine`. Storing them
  on the record is a **projection** for renderer convenience; the tests assert equality so a
  page can never fork a fact VOCAB owns (**C-CON-SOURCE**). A page adds **no new** definition
  fields beyond these three projections.
- **`animation`** — the declarative visual spec. `summary` is one plain line (C-CON-KID);
  `targets` names the actors (registers/flags/stack/soup/ip/cell) and the *direction* of
  change, and must be **consistent** with the machine-truth (e.g. `shrink-c` ⇒ a `register`
  target `C` with `decrease`; `copy-byte` ⇒ a `soup` target `mother→daughter`). It says
  **what** changes, never how to draw it.
- **`scenarios`** — **≥ 1** `EditableScenario`. Each `config` is a full `PlaygroundConfig`
  [02] (scenario + seed + starter genome + active subset + optional goal), so it is a
  reproducible `RunDescriptor` (C-CON-DET). The starter genome **uses / spotlights this
  verb**, and the `prompt` is a single "try: change X" line. Every `config` compiles under its
  subset and loads (C-CON-COMPILES).
- **`seeAlso`** — related verbs (its family siblings, its counterpart, the verbs it pairs with
  in the copy loop). **Every** entry must be a real `verb` in this table (links resolve; no
  dangling see-also).
- **`commonMistakes`** — plain-language pitfalls (e.g. "forgetting to `shrink-c` so the loop
  never ends"). C-CON-KID: no mnemonics, no opcode numbers.
- **`introLesson`** — the id of the lesson that **first introduces** this verb; must resolve
  to a lesson in the [05] progression graph, and that lesson must actually unlock this verb
  (cross-checked against `unlocks.verbs`).

**Invariants this structure holds** (asserted in §8): 32 entries, one per VOCAB verb; verbs
unique and all present in VOCAB; `mnemonic`/`kid`/`machine` equal their VOCAB source;
`animation` consistent with machine-truth; every scenario a valid, compiling `PlaygroundConfig`;
every `seeAlso` resolves; every `introLesson` resolves and unlocks the verb; data is static.

---

## 4. How a page composes (VOCAB identity + this record's depth)

A rendered wiki page is a **composition**, not a redefinition. It is assembled left-to-right
from two single sources:

```
  VOCAB entry (04)                         InstructionPage (this record)
  ────────────────                         ─────────────────────────────
  verb, mnemonic  ─────── identity ──────▶  page header (verb + [category] badge)
  tooltip.kid     ─────── short def ─────▶  "what it does" line          (C-CON-SOURCE)
  tooltip.machine ─────── machine truth ─▶  "under the hood" line        (C-CON-SOURCE)
  category/color  ─────── palette role ──▶  header/keyword coloring (04)
                                            + animation (what-it-does-visually)   ── depth
                                            + editable scenarios ("try this")     ── depth
                                            + see-also / related verbs            ── depth
                                            + common mistakes                     ── depth
                                            + "introduced in <lesson>" link (05)  ── depth
```

- The **top of the page = VOCAB** (identity + the two-register kid/machine lines, verbatim).
  The page never rewrites them; it *projects* them (§3) and the tests assert equality.
- The **body = this record** (animation, scenarios, see-also, mistakes, lesson pointer) —
  the depth VOCAB deliberately does not carry.
- The **same** two-line kid/machine content therefore renders identically on the wiki page,
  the [04] tooltip, and any block/hover — one source, three surfaces (C-CON-SOURCE).

### 4.1 Feeds three surfaces (§2 pipeline)

- **Wiki page** — the full composition above.
- **Keyword tooltip [04]** — the expanded card pulls `seeAlso` (and may reference
  `animation.summary`) from this record; the two definition lines stay VOCAB-owned.
- **Playground "try this" [02]** — each `EditableScenario.config` mounts as a live engine
  instance; the `prompt` is the "try: change X" nudge.
- **Lesson links [01]** — a `` `verb` `` code span in lesson prose links to the page whose
  `verb` matches; the page's `introLesson` is the reverse pointer into [05].

---

## 5. Behavior / algorithms

This system is **data**; the only "behavior" is the validation that ties it to its sources.
None of it runs at learner time — it is build/test-time checking.

1. **Coverage check (CONTINV-COVERAGE).** Build the set of `verb` keys from `VOCABULARY`
   (the 32 classic-32 verbs). Assert `INSTRUCTION_PAGES` has exactly one page per verb —
   a bijection page↔verb, no orphan verb, no page for an unknown verb.
2. **Identity projection check (C-CON-SOURCE).** For each page, look up `vocab(page.verb)` and
   assert `page.mnemonic === vocab.mnemonic`, `page.kid === vocab.tooltip.kid`,
   `page.machine === vocab.tooltip.machine`. A mismatch means the page forked a VOCAB-owned
   fact — a bug. (No page introduces a *new* definition field beyond these projections.)
3. **Mnemonic-via-engine check.** `page.mnemonic` is the VOCAB mnemonic, which the engine's
   active set resolves to an opcode at compile time; the page stores **no opcode number**.
4. **Animation consistency check.** For each page, assert `animation.targets` is consistent
   with the machine-truth (e.g. the bound register of a `grow-*`/`shrink-*` op appears as an
   `increase`/`decrease` target; `copy-byte` has a `soup` mother→daughter target; `divide`
   has a `cell` `divide` target).
5. **Scenario validity + compile check (C-CON-COMPILES).** For each `EditableScenario`, assert
   `config` is a well-formed `PlaygroundConfig` [02] and its starter genome **compiles** under
   `config.subset` via `@tierra26/genescript` and **loads** in `@tierra26/engine`; assert the
   spotlighted genome actually uses this page's verb.
6. **Determinism check (C-CON-DET).** Assert every `config` is a complete reproducible recipe
   (scenario + seed + starter + subset) — same inputs ⇒ same run; and that the page module is
   static (frozen, no `Date.now`/`Math.random`/env reads at load).
7. **Link resolution.** Assert every `seeAlso` verb exists in the table; assert every
   `introLesson` resolves to a lesson in [05] whose `unlocks.verbs` includes this verb.

---

## 6. Determinism & edge cases

- **C-CON-SOURCE (no re-definition):** the only place an instruction fact may live is VOCAB
  [04] + this record's depth fields; the three identity fields are byte-equal projections of
  VOCAB, asserted by test. Prose and tooltips reference — never redefine (INSTRPAGE-004/005).
- **C-CON-DET (static data):** the page table is a frozen constant; it must not read the
  clock, the PRNG, the environment, or the filesystem at load. Each scenario is a full
  `RunDescriptor` so its run is reproducible (INSTRPAGE-011/012).
- **C-CON-COMPILES (runnable scenarios):** a scenario whose starter genome fails to compile or
  load is a shipping error; the subset in the config must include this verb's mnemonic so the
  spotlight is actually runnable (INSTRPAGE-008/009).
- **Coverage is exact both ways:** neither a VOCAB verb without a page nor a page for a
  non-VOCAB verb is allowed (INSTRPAGE-001/002).
- **`nop0`/`nop1` (mark-0/mark-1):** these two VOCAB verbs still get pages (coverage is total),
  but their scenarios spotlight **templates/labels** (how a landmark is matched) rather than a
  register change; their `animation` uses an `ip` `jump` target for the matcher, not a
  register target (edge case for the animation-consistency check).
- **Verb spotlight must be genuine:** a scenario's starter genome must contain the page's verb
  (or, for `mark-0/1`, a label that compiles to it) — a scenario that never exercises the
  instruction is rejected (INSTRPAGE-010).
- **Subset gating:** a scenario may use an early subset, but that subset **must** contain this
  verb's mnemonic; otherwise the spotlight verb would be un-runnable in the config.
- **Ordering:** presentation order follows VOCAB §3.3; nothing keys off the array index.

---

## 7. Fidelity notes

- **[CORE]** Realizes SPEC "**every instruction a page**" ([`00-overview.md`](00-overview.md)
  §1) and the pipeline's [03] node that feeds wiki pages *and* playground "try this"
  scenarios (§2) — one record, three surfaces.
- **[CORE]** Machine-truth and kid lines are **not re-authored** here; they are VOCAB's
  ISA-VM §4-grounded text, projected. This keeps a *single* place where an instruction's
  meaning is stated (C-CON-SOURCE), preventing the classic drift between a wiki page, a
  tooltip, and a lesson.
- **[MOD]** The `AnimationSpec` is a **declarative** description ("register C decreases; a
  byte flies from mother to daughter"), not a renderer or an animation script — the UI layer
  (specced later) interprets it. Content says *what* changes; the UI decides *how* to draw it.
  This keeps `@tierra26/content` pure and headless like the engine.
- **[MOD]** Identity fields are stored as **projections** of VOCAB for renderer ergonomics
  rather than looked up lazily; the equality tests make the projection safe (a stale copy
  fails the suite).
- **[OPTIONAL]** Rich media (recorded GIFs, audio) is out of scope; the animation spec is
  declarative and text-first so it themes/localizes and stays deterministic.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo` in `packages/content/test/03-instrpage.test.ts`.

- **INSTRPAGE-001** — `INSTRUCTION_PAGES` has **exactly one page per classic-32 verb** — a
  bijection page↔VOCAB verb (32 pages, no orphan verb, no page for an unknown verb)
  (**CONTINV-COVERAGE**).
- **INSTRPAGE-002** — every page's `verb` is a **real verb** present in `VOCABULARY`, and every
  VOCAB verb has a page (coverage is exact in both directions).
- **INSTRPAGE-003** — every page's `mnemonic` **equals `vocab(verb).mnemonic`** and is a real
  classic-32 mnemonic resolved via the engine ISA — **never hard-coded** and never an opcode
  number (identity comes from VOCAB/engine, not the page).
- **INSTRPAGE-004** — every page's `kid` and `machine` are **byte-equal** to the VOCAB entry's
  `tooltip.kid` / `tooltip.machine` (kid definition + machine-truth present and consistent with
  VOCAB; the page projects, never redefines — **C-CON-SOURCE**).
- **INSTRPAGE-005** — **no page redefines a fact owned by VOCAB**: a page adds no new
  definition field beyond the three VOCAB projections; kid/machine/mnemonic exist only as
  equal copies, so prose/tooltips reference and never fork a definition (**C-CON-SOURCE**).
- **INSTRPAGE-006** — every page has an `animation` whose `summary` is non-empty plain language
  (C-CON-KID) and whose `targets` are **consistent with the machine-truth** (the bound register
  of an arithmetic verb appears with the right increase/decrease/set; `copy-byte` has a soup
  mother→daughter target; `divide` a cell-divide target; `mark-0/1` an ip target).
- **INSTRPAGE-007** — every page has **≥ 1** `EditableScenario`, each with a non-empty
  "try: change X" `prompt` (C-CON-KID) and a `spotlight` equal to the page's verb.
- **INSTRPAGE-008** — every `EditableScenario.config` is a **valid `PlaygroundConfig`** [02]
  (complete scenario + seed + starter genome + active subset [+ optional goal]).
- **INSTRPAGE-009** — every `EditableScenario`'s starter genome **compiles** under its
  `config.subset` (via `@tierra26/genescript`) and **loads** in `@tierra26/engine`, and that
  subset **contains this verb's mnemonic** so the spotlight is runnable (**C-CON-COMPILES**).
- **INSTRPAGE-010** — every `EditableScenario` **genuinely exercises the page's verb**: its
  starter genome contains this page's verb (or, for `mark-0/1`, a label compiling to it) — no
  scenario spotlights an instruction it never runs.
- **INSTRPAGE-011** — page data is **deterministic/static**: `INSTRUCTION_PAGES` is a frozen
  constant with no `Date.now`/`Math.random`/env/filesystem reads at load, and each `config` is
  a complete reproducible recipe so identical inputs give identical runs (**C-CON-DET**).
- **INSTRPAGE-012** — every scenario `config` is deterministic per seed: re-running the same
  `config` yields the identical engine run (reuses the engine determinism contract — reproduces
  as a `RunDescriptor`).
- **INSTRPAGE-013** — every page's `seeAlso` list contains **only verbs that resolve** to a
  page in this table (related-verb links resolve; no dangling see-also).
- **INSTRPAGE-014** — every page's `introLesson` **resolves** to a lesson in the [05]
  progression graph, and that lesson's `unlocks.verbs` **includes this verb** (each page names
  the lesson that introduces it, and the pointer is sound).
- **INSTRPAGE-015** — every page's `commonMistakes` entries are non-empty plain language
  (C-CON-KID: no mnemonic strings, no register-letter jargon, no word "opcode").
- **INSTRPAGE-016** — presentation order of `INSTRUCTION_PAGES` matches VOCAB's §3.3 load order
  (0–31) so the wiki index and palette share one canonical ordering; order is presentational
  only — nothing keys off the array index (mirrors C-CON-SOURCE / C-GS-NOOPCODES).

---

## 9. Open questions

1. **Projection vs lookup.** Should identity fields (`mnemonic`/`kid`/`machine`) be stored on
   the record at all, or resolved lazily from VOCAB at render time? (Spec stores projections
   for renderer ergonomics; the equality tests INSTRPAGE-003/004 keep them honest. Revisit if
   VOCAB gains localized variants.)
2. **How many scenarios per verb?** Minimum is 1; is there a target (e.g. 2–3: one "watch it",
   one "break it", one "fix it")? A per-page count is deferred to the authoring pass.
3. **`mark-0`/`mark-1` pages.** They must exist for coverage, but their "try this" is really a
   *template/label* lesson. Do they get full pages or thin "see labels" stubs that defer to the
   LBL doc? (Spec: full pages; scenarios spotlight the matcher via `ip` targets.)
4. **`seeAlso` symmetry.** Should see-also be symmetric (if A lists B, B lists A) and/or
   auto-derived from VOCAB families (`grow-a`↔`grow-b`↔`grow-c`)? (Spec requires resolution
   only; symmetry/auto-derivation deferred.)
5. **Animation vocabulary completeness.** Is the `targets` union (register/flag/stack/soup/
   ip/cell) sufficient for all 32 verbs, or do template/find ops need a dedicated `template`
   target kind distinct from `ip`? (Flagged for the UI-spec review.)
6. **`introLesson` uniqueness.** Exactly one introducing lesson per verb is assumed; confirm no
   verb is co-introduced by two lessons (would make the reverse pointer ambiguous).
