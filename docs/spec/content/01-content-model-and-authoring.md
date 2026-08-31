# Content Model & Authoring — Engineering Spec              (Code: CONTENT · Milestone: M3)

**Status:** v1, authored. Defines the **Lesson document** — its frontmatter schema, its body
model (markdown prose + typed directives + inline markup), the **parse → typed Lesson AST**
step, and the **validation** that turns an authored `.md`-like file into a schema-valid, fully
resolvable content record with authoring diagnostics. This is the front door of the content
pipeline: every other content system consumes the Lesson AST this doc defines.

**Upstream refs:** [`00-overview.md`](00-overview.md) §1 (teaching model — read-then-play,
scrollable page), §2 (the pipeline: authored lesson → parse+validate → Lesson AST +
diagnostics → fan-out to 04/02/06/05), §3 (the concrete lesson format — frontmatter +
`:::playground`/`:::goal` directives + `{term}` + `` `verb` ``), §4 (system map + document
set), §5 (contracts, esp. **C-CON-DATA**/**C-CON-SOURCE**), §6 (global invariants CONTINV).
[`../SPEC.md`](../SPEC.md) §11 (content-as-data, embeddable playgrounds referencing scenario +
seed + starter genome), §5 (design→emergence progression, mutation on/off arc).
Doc template & test conventions: [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md)
§8.1/§8.3/§8.4 (reused verbatim). Payload *meaning* for each directive lives downstream —
[02] PLAY (playground config), [04] KEYWORD (term registry/colors/tooltips), [05] PROGRESS
(unlock/prereq graph), [06] GOAL (success conditions); this doc specs **shape and resolution**,
not their semantics, and never duplicates them.

**Contracts obeyed:** **C-CON-DATA** — a lesson is declarative data validated against a
schema; nothing in a lesson is executable (no scripts, no `<script>`/JS, no arbitrary HTML
event handlers, no code that runs at author time). **C-CON-SOURCE** — instruction facts come
only from [03] and keyword terms/colors/tooltips only from [04]; the parser records *references*
(`{term}`, `` `verb` ``) and never inlines a definition. **C-CON-DET** — parse is a pure
function of the source text: same bytes → identical AST + diagnostics, in source order (no RNG,
no wall-clock, no `Map`-key-order traversal). The parser is **error-tolerant**: it never throws
on bad input; malformed frontmatter/directives become diagnostic-bearing nodes so the authoring
tool always has a tree and a diagnostic list to show.

---

## 1. Purpose & responsibility

This system owns the **Lesson document model** and its **front end**: taking an authored
lesson source (YAML-ish frontmatter + markdown body with typed directives and inline markup)
and producing (a) a **schema-validated frontmatter record** and (b) a **typed Lesson AST** —
an ordered tree of prose nodes, playground nodes, goal nodes, keyword references and code
references, plus the lesson's unlock/prereq metadata — together with a list of **authoring
diagnostics**. It must guarantee: a small, unambiguous **frontmatter schema** (`id`, `chapter`,
`title`, `unlocks {verbs, concepts}`, `requires[]`, `mutation`, optional scenario defaults);
exactly the **body constructs** the concrete format defines (markdown prose, `:::playground`
and `:::goal` block directives, inline `{term}` keyword markup, `` `verb` `` instruction
links); a **parse** that is pure and deterministic; and **validation** that checks frontmatter
against the schema, checks each directive is well-formed, and checks every referenced id is
resolvable (scenario, starter genome, verbs, prerequisite lesson ids) — surfacing each failure
as a precise, kid-tone authoring diagnostic. It enforces **C-CON-DATA** (declarative-only) by
construction: the grammar admits prose, directives and references — never an executable form.
This layer resolves no keyword *colors* and runs no engine; it records references and hands the
AST to [04]/[02]/[06]/[05]. It is **pure and stateless**: source in, frontmatter + AST +
diagnostics out.

---

## 2. Interfaces

The front end exposes pure functions and the types they produce. Consumers: [04] KEYWORD
(resolve `KeywordRef`→color/tooltip), [02] PLAY (build a playground from a `PlaygroundNode`),
[06] GOAL (build a checker from a `GoalNode`), [05] PROGRESS (read `unlocks`/`requires` into the
curriculum graph), and the UI layer (render the AST as a scroll reader). Validation needs a
**resolver** (the set of known ids) supplied by the caller — the parser itself hard-codes no id
lists (**C-CON-SOURCE**).

```ts
// parse: lesson source text → best-effort Lesson AST + frontmatter + diagnostics (never throws)
export function parse(source: string): ParseResult;

// validate: an AST + a resolver of known ids → the same AST enriched with validation diagnostics
export function validate(ast: LessonAst, resolver: IdResolver): Diagnostic[];

export interface ParseResult {
  frontmatter: Frontmatter | null; // null only if frontmatter block is absent/unparseable
  ast: LessonAst;                  // always present (best-effort), even on malformed input
  diagnostics: Diagnostic[];       // parse-level (schema/binding checks are validate()'s)
}

// ---- Frontmatter schema ----
export interface Frontmatter {
  id: string;                      // unique lesson id (kebab, e.g. "ch02-first-copy")
  chapter: number;                 // integer chapter number
  title: string;                   // learner-facing title
  unlocks: { verbs: string[]; concepts: string[] }; // what this lesson gates ([05])
  requires: string[];              // prerequisite lesson ids ([05]); [] for an entry lesson
  mutation: 'on' | 'off';          // scenario default: design-mode (off) vs emergence (on)
  defaults?: ScenarioDefaults;     // optional lesson-wide playground defaults
}

// Lesson-level fallbacks a :::playground may omit and inherit (all optional).
export interface ScenarioDefaults {
  scenario?: string;               // default scenario id ([02])
  seed?: number;                   // default integer seed
  starter?: string;                // default starter-genome id ([02]/[03])
  subset?: string;                 // default active instruction subset (ISA named set)
}

// ---- Lesson AST ----
export interface LessonAst {
  frontmatter: Frontmatter | null;
  body: BodyNode[];                // ordered; source order
}

// Discriminated union — the AST shape every downstream system consumes.
export type BodyNode =
  | ProseNode        // a run of markdown prose (may contain KeywordRef/CodeRef inline spans)
  | PlaygroundNode   // a :::playground directive → embeddable engine instance config ([02])
  | GoalNode         // a :::goal directive → deterministic success condition ([06])
  | ErrorNode;       // a directive/line that could not be parsed — carries a diagnostic

export interface Loc { line: number; startCol: number; endCol: number; }

export interface ProseNode {
  kind: 'prose';
  markdown: string;                // the raw prose span (renderer parses markdown)
  refs: InlineRef[];               // ordered inline references extracted from this span
  loc: Loc;
}

export type InlineRef = KeywordRef | CodeRef;
export interface KeywordRef { kind: 'keyword'; term: string; loc: Loc; } // from {term}
export interface CodeRef    { kind: 'code';    verb: string; loc: Loc; } // from `verb`

export interface PlaygroundNode {
  kind: 'playground';
  config: PlaygroundConfig;        // shape only; [02] interprets/validates semantics
  body: string;                    // the directive's inner prose ("Try adding a copy-byte…")
  loc: Loc;
}
// Fields the concrete format admits; may inherit missing ones from Frontmatter.defaults.
// The raw parse shape of a :::playground directive (all optional). The NORMALIZED, resolved
// `PlaygroundConfig` is owned by PLAY [02] (S18); this parse shape is renamed to avoid the clash.
export interface PlaygroundDirective {
  scenario?: string; seed?: number; starter?: string; subset?: string;
}

export interface GoalNode {
  kind: 'goal';
  spec: Record<string, unknown>;   // e.g. { kind: 'replicates', within: 20000 } — [06] owns meaning
  body: string;                    // learner-facing goal prose
  loc: Loc;
}

export interface ErrorNode { kind: 'error'; raw: string; diagnostic: Diagnostic; loc: Loc; }

// A caller-supplied set of known ids — the parser holds no id lists (C-CON-SOURCE).
export interface IdResolver {
  hasScenario(id: string): boolean;   // [02]
  hasStarter(id: string): boolean;    // [02]/[03]
  hasVerb(name: string): boolean;     // classic-32 verb ([03]/GeneScript VOCAB)
  hasLesson(id: string): boolean;     // for requires[] prereq ids ([05])
  hasKeyword?(term: string): boolean; // optional: [04] registry (unknown {term} → hint)
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'hint';
  code: string;                    // stable machine code, e.g. "frontmatter.missing.id"
  message: string;                 // plain wording, ages 8–16 (C-CON-KID)
  loc: Loc;
}
```

The parser knows *structure* — a frontmatter block, prose, a `:::playground`/`:::goal`
directive, a `{term}` span, a `` `verb` `` span — not what any id *means*. Whether a scenario or
verb id actually exists is a **resolution** fact checked by `validate()` against the caller's
`IdResolver`, keeping the front end free of every downstream registry (**C-CON-SOURCE**).

---

## 3. Data structures

- **Frontmatter block** — a leading fenced block (delimited `---` … `---`) of declarative
  key/values only. It parses to a `Frontmatter` record with a **fixed schema** (§2). Unknown
  keys are a `warning` (typo-catching), not a hard error; missing *required* keys (`id`,
  `chapter`, `title`, `unlocks`, `requires`, `mutation`) are `error`s. Values are scalars,
  string lists, or the two nested objects (`unlocks`, `defaults`) — **no expressions, no code**
  (C-CON-DATA). `mutation` is a closed enum (`on`/`off`) mirroring the design→emergence arc
  (SPEC §5): early lessons ship `off` (pure puzzle), later lessons `on`.
- **`body: BodyNode[]`** — an **ordered** list in source order; **a lesson body is exactly this
  ordered list**. Blank lines between blocks contribute no node. Order is reading order (the
  scroll reader renders top-to-bottom), so a `PlaygroundNode`'s position relative to the prose
  that motivates it is preserved.
- **`ProseNode.refs`** — inline references are **extracted but not resolved**: `{term}` becomes
  a `KeywordRef{term}` and `` `verb` `` becomes a `CodeRef{verb}`, each with a `Loc`. The raw
  `markdown` is retained verbatim so the renderer still owns markdown formatting; `refs` is the
  index the UI/[04]/[03] use to decorate the exact spans. The parser records the *string*, never
  a color, tooltip or instruction fact (**C-CON-SOURCE**).
- **`PlaygroundNode`/`GoalNode`** — carry a **shape-only** payload (`config`/`spec`) plus their
  inner prose. This layer verifies the payload is *well-formed* (parseable key/values, known
  keys); it does **not** interpret `kind: replicates` or run a scenario — that meaning is [02]'s
  and [06]'s. Missing playground fields may be inherited from `Frontmatter.defaults` at
  build-time by [02]; the AST records what the author wrote, marking inheritance explicitly is a
  [02] concern.
- **`ErrorNode`** — a malformed directive or frontmatter never aborts the file; it becomes one
  `ErrorNode` carrying a `Diagnostic` and the raw text, and parsing continues with the next
  block. This is what lets the authoring tool render a partially-written lesson.
- **`Loc`** — every node, ref and diagnostic carries a 1-based line + column range (integer
  only) so the authoring tool underlines the exact offending span.

### Identifier & directive rules
- **Lesson `id`/`requires` ids**: kebab identifiers (`[a-z][a-z0-9-]*`), matched exactly (case
  sensitive). `requires` is a list of such ids; an entry lesson uses `[]`.
- **`unlocks.verbs`**: classic-32 verb names ([03]/GeneScript VOCAB); **`unlocks.concepts`**:
  free identifiers naming a taught idea (`daughter`, `copy-loop`).
- **Directive syntax**: a block directive opens with `:::name` optionally followed by a
  brace-delimited config object `{ … }` on the same line; its body is the following lines up to
  the closing `:::`. A `:::goal` may directly follow a `:::playground` inside one directive block
  (the goal is embedded in that playground, per [00] §3). Config values are scalars/lists only —
  never an expression.
- **`{term}`**: a keyword reference span; `` `verb` `` (backtick code span whose content is a
  known verb name): an instruction link. A backtick span that is *not* a verb is ordinary
  inline code (no `CodeRef`), and `validate()` (not `parse()`) decides verb-hood via the
  resolver.

---

## 4. Behavior / algorithms

**Parse** (three linear passes; never throws):

```
1. split off frontmatter:
     if source starts with a "---" fence → capture up to the next "---" as the frontmatter block,
        parse its declarative key/values into Frontmatter (unknown key → warning; bad scalar → error).
        (absent/unterminated fence → frontmatter = null + one diagnostic; body = whole source)
2. segment the body into blocks (source order):
     a ":::name { config }" line opens a block directive → consume to the matching ":::"
        → PlaygroundNode | GoalNode (by name); an embedded ":::goal" after a ":::playground"
          nests into that playground block per the concrete format.
     any run of non-directive lines → one ProseNode (markdown retained verbatim).
     a ":::" opener whose name/config/close is malformed → ErrorNode + diagnostic; continue.
3. extract inline refs from each ProseNode.markdown (scan spans, do not resolve):
     "{" ident "}"                 → KeywordRef{ term }
     "`" ident "`" (backtick span) → CodeRef{ verb }   // verb-hood confirmed later by validate()
     (all other markdown is left untouched in .markdown)
```

Parsing is **case-preserving** and pure: it records strings and shapes; it resolves no id and
consults no registry.

**Validate** (`validate(ast, resolver)` → diagnostics; the schema + resolution pass):

```
- Frontmatter schema:
    each required key present and correctly typed        → else error (e.g. frontmatter.missing.id)
    id is a well-formed kebab id                          → else error
    mutation ∈ {on, off}                                  → else error
    unknown frontmatter keys                              → warning
- Directives well-formed:
    every PlaygroundNode.config uses only known keys with scalar values   → else error
    every GoalNode.spec has a `kind` and parseable fields                 → else error
- References resolvable (via resolver; C-CON-SOURCE):
    each requires[] id     → resolver.hasLesson  → else error (unknown prerequisite)
    each unlocks.verbs name→ resolver.hasVerb     → else error (unknown verb)
    each playground scenario→ resolver.hasScenario→ else error (unknown scenario id)
    each playground starter → resolver.hasStarter → else error (unknown starter genome)
    each playground subset  → (ISA named set)      → else error (unknown subset)
    each CodeRef.verb       → resolver.hasVerb     → else error (unknown instruction link)
    each KeywordRef.term    → resolver.hasKeyword? → else hint  (unlinked term — [04])
- Declarative-only (C-CON-DATA):
    any executable form encountered (script span, raw HTML event handler, non-declarative
    frontmatter value) → error. The grammar admits none, so this is a defense-in-depth check.
```

Missing playground fields that resolve via `Frontmatter.defaults` are **not** errors — a
playground that omits `scenario` inherits `defaults.scenario`; only a field that is neither
present nor defaulted-and-resolvable is flagged.

**Authoring ergonomics.** Educators write **mostly normal markdown**. The only ceremony is the
frontmatter block and the two block directives; everything else is prose. Known keyword terms
**auto-highlight** — the UI/[04] decorates every registry term it finds, so authors seldom need
explicit `{term}` markup (they use it to force a link, or to link a term the auto-linker would
miss). Instruction links are the natural `` `verb` `` a writer already reaches for. Diagnostics
are **kid-and-author-friendly** (C-CON-KID): each names the field/span and says what to do
("`ch02-first-copy` requires `ch01-hello-soup`, but no lesson has that id — check the spelling
in `requires`").

**Error-tolerance philosophy.** `parse` always returns a `ParseResult` with a best-effort
`ast`; `validate` always returns a list (empty = clean). Neither throws. A malformed block is an
`ErrorNode`; later blocks parse independently — the authoring surface always has something to
render and a precise diagnostic list.

---

## 5. Interconnections

- **Produces the Lesson AST** consumed by **[04] KEYWORD** (resolves each `KeywordRef`/prose
  term → color + tooltip; auto-linking), **[02] PLAY** (turns a `PlaygroundNode.config` +
  inherited defaults into an engine-instance config: scenario + seed + starter + subset),
  **[06] GOAL** (turns a `GoalNode.spec` into a deterministic pass/fail checker), **[05]
  PROGRESS** (reads `unlocks`/`requires` into the curriculum graph), and the **UI layer**
  (renders the ordered `body` as the scroll reader).
- **Depends on an `IdResolver`** (caller-supplied) to know which ids exist — it hard-codes no
  scenario/starter/verb/lesson/keyword list (**C-CON-SOURCE**). Instruction facts come only from
  [03]; keyword terms/colors only from [04].
- **Feeds every downstream Loc:** each node's `loc` is the origin the authoring tool and the
  source map thread through to precise underlines.
- Crosses **C-CON-DATA** (declarative-only grammar + validate check), **C-CON-DET** (pure parse),
  **C-CON-SOURCE** (references, not definitions), **C-CON-KID** (diagnostic wording).
- Upholds **CONTINV-VALID** (every shipped lesson validates against this schema) — this doc *is*
  the schema; the invariant test in `_invariants.test.ts` runs `validate()` over the shipped set.

---

## 6. Determinism & edge cases

- **Deterministic:** `parse`/`validate` are pure functions of their inputs — same source (and
  same resolver) → identical AST + diagnostics, in source order (**C-CON-DET**). No RNG, no
  clock, no `Map`-key-order traversal; diagnostics are emitted in source order.
- **No frontmatter block:** `frontmatter: null` + one `error` diagnostic; the body still parses
  (so an author sees prose feedback while adding frontmatter).
- **Unterminated directive** (`:::playground` with no closing `:::`): the block is captured to
  EOF and flagged as an `ErrorNode` (or a well-formed node + a "missing close" diagnostic per
  §9-Q2); later content is unaffected only if a close is found — otherwise it is the last block.
- **Empty / whitespace-only source:** a valid `ParseResult` with `frontmatter: null`, `body:
  []`, and one diagnostic (a lesson must have frontmatter). Whitespace-only body after valid
  frontmatter: `body: []`, no body diagnostics.
- **Duplicate frontmatter keys / duplicate lesson `id`:** duplicate key → last-wins + a warning;
  a duplicate `id` across the shipped set is a **collection-level** check (CONTINV-VALID), not a
  single-file parse error.
- **`{term}` / `` `verb` `` at a span boundary:** extracted with an exact `Loc`; a backtick span
  that is not a known verb stays ordinary inline code (no `CodeRef`) — `validate` never errors on
  ordinary code spans.
- **Unknown scenario/starter/verb/prereq id:** always a `validate` **error** (never silently
  dropped) — an unresolvable reference fails validation (CONTINV-INTRO-BEFORE-USE and
  C-CON-SUBSET build on top of this in [05]).
- **Declarative-only:** the grammar cannot express a script; any injected executable form is an
  `error` — content carries no executable code (**C-CON-DATA**).

---

## 7. Fidelity notes

- **[CORE] — content-as-data.** The whole model exists to make authoring a lesson **not** touch
  engine/UI source (SPEC §11): a lesson is declarative data (frontmatter + prose + directives +
  references) validated against a schema. This is the load-bearing decision — it is what lets
  educators write lessons and what makes lessons replayable/shareable.
- **[CORE] — embeddable playgrounds by reference.** A `:::playground` names a **scenario + seed +
  starter genome + subset** (SPEC §11, [00] §2) — never inline engine code — mirroring the
  engine's `RunDescriptor` so a playground is reproducible and shareable. This layer specs the
  *reference shape*; [02] owns the run.
- **[MOD] — MDX-like surface, not MDX.** The concrete format is markdown + typed `:::` directives
  + `{term}`/`` `verb` `` markup (SPEC §11 "e.g. MDX-like"). We deliberately admit **no** JSX /
  embedded JS (unlike true MDX) precisely to hold **C-CON-DATA** — the directive set is closed
  and declarative. Exact directive syntax stays open ([00] §-note, §9).
- **[MOD] — auto-highlight over explicit markup.** Authors mostly omit `{term}`; [04]
  auto-links registry terms. Explicit `{term}` is the affordance to force/override a link. No
  engine or teaching semantics change — purely an authoring ergonomic (mirrors GeneScript's
  case-insensitive-keyword affordance).

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/content/test/01-content.test.ts`. IDs are
append-only.

- **CONTENT-001** — **Valid frontmatter parses:** a lesson whose frontmatter block sets `id`,
  `chapter`, `title`, `unlocks {verbs, concepts}`, `requires[]` and `mutation` parses to a
  `Frontmatter` record with each field typed correctly (and validates clean).
- **CONTENT-002** — **Missing a required frontmatter field → diagnostic:** dropping any of
  `id`/`chapter`/`title`/`unlocks`/`requires`/`mutation` yields an `error` diagnostic naming the
  missing field (parse still returns a best-effort result).
- **CONTENT-003** — **`mutation` is a closed enum:** `mutation: on`/`off` parse; any other value
  is an `error` diagnostic (design→emergence toggle is not free-form).
- **CONTENT-004** — **Scenario defaults parse:** an optional `defaults { scenario, seed,
  starter, subset }` frontmatter block parses into `ScenarioDefaults`, and a playground omitting
  a field inherits it rather than erroring.
- **CONTENT-005** — **A `:::playground` directive parses into a `PlaygroundNode`** carrying its
  config (`scenario`, `seed`, `starter`, `subset`) as shape-only data plus its inner prose.
- **CONTENT-006** — **A `:::goal` directive parses into a `GoalNode`** carrying its `spec`
  (e.g. `{ kind: replicates, within: 20000 }`) as shape-only data plus its learner-facing prose.
- **CONTENT-007** — **An embedded `:::goal` after a `:::playground`** nests into that playground
  block (a playground with its goal), per the concrete lesson format.
- **CONTENT-008** — **`{term}` becomes a `KeywordRef`:** an inline `{daughter}` span in prose is
  extracted into `ProseNode.refs` as a `KeywordRef{ term: 'daughter' }` with a `Loc` — the term
  string only, no color/tooltip resolved here (C-CON-SOURCE).
- **CONTENT-009** — **`` `verb` `` becomes an instruction link (`CodeRef`):** a backtick span
  whose content is a known verb (`` `copy-byte` ``) is extracted as a `CodeRef{ verb }`, while a
  backtick span that is not a verb stays ordinary inline code (no `CodeRef`).
- **CONTENT-010** — **Prose is retained verbatim + refs are ordered:** a `ProseNode` keeps its
  raw markdown and lists its inline `KeywordRef`/`CodeRef`s in source order with correct `Loc`s.
- **CONTENT-011** — **Body order is preserved:** `body` is the ordered list of prose/playground/
  goal nodes in source (reading) order — a playground keeps its position relative to the prose
  that motivates it.
- **CONTENT-012** — **A lesson referencing an unknown scenario id fails validation:** a
  `:::playground` whose `scenario` is not in the `IdResolver` yields a `validate` `error`
  (unknown scenario id).
- **CONTENT-013** — **An unknown starter-genome id fails validation:** a `:::playground` whose
  `starter` is not resolvable yields a `validate` `error`.
- **CONTENT-014** — **An unknown verb fails validation:** an `unlocks.verbs` entry or a
  `` `verb` `` `CodeRef` that is not a classic-32 verb yields a `validate` `error`.
- **CONTENT-015** — **An unknown prerequisite id fails validation:** a `requires[]` id with no
  matching lesson yields a `validate` `error` (unknown prerequisite).
- **CONTENT-016** — **A malformed directive → diagnostic-bearing `ErrorNode`, no crash:** an
  unterminated or mis-braced `:::` directive becomes one `ErrorNode` with a `Diagnostic`; later
  blocks parse independently and `parse` never throws.
- **CONTENT-017** — **Diagnostics are precise and kid/author-tone (C-CON-KID):** every diagnostic
  carries a stable `code`, a plain-language `message`, and a `Loc` pinpointing the field/span.
- **CONTENT-018** — **Auto-highlight ergonomics:** an unmarked known term in prose is left in the
  raw markdown for [04] to auto-link, while an explicit `{term}` forces a `KeywordRef`; an
  explicit `{term}` not in the keyword registry produces a `hint` (not an error).
- **CONTENT-019** — **Parse is deterministic (C-CON-DET):** parsing the same source twice yields
  structurally identical ASTs and diagnostics in the same (source) order; no RNG, clock, or
  key-order dependence.
- **CONTENT-020** — **Content carries no executable code (C-CON-DATA):** the grammar admits only
  prose/directives/references, and an injected executable form (a `<script>`/JS/handler or a
  non-declarative frontmatter value) is rejected with an `error` — a lesson is declarative data.
- **CONTENT-021** — **A well-formed lesson round-trips to a resolvable content record:** a valid
  lesson with all ids resolvable (scenario, starter, verbs, subset, prereqs) validates with zero
  `error` diagnostics — the AST is a fully-resolved record for [02]/[04]/[05]/[06] (CONTINV-VALID).
- **CONTENT-022** — **Absent/empty frontmatter is handled:** source with no frontmatter fence
  yields `frontmatter: null` + a diagnostic while still parsing the body; empty source yields an
  empty body + the "frontmatter required" diagnostic, never a throw.

---

## 9. Open questions

1. **Frontmatter dialect.** YAML is the obvious choice but its surface (anchors, tags,
   multi-line scalars) exceeds the declarative subset we want. Confirm a **restricted YAML
   subset** (scalars, string lists, one level of nested map) vs a bespoke mini-format — the
   schema (§2) is dialect-independent either way.
2. **Unterminated-directive policy.** On a `:::playground` with no closing `:::`: capture-to-EOF
   as an `ErrorNode`, or accept the block and emit a "missing close" warning? (Current lean:
   warning + best-effort node, matching GeneScript's error-tolerance stance.)
3. **`validate` seam.** Does `parse` stay resolver-free (as specced) with all id checks in
   `validate`, or should a convenience `parseAndValidate(source, resolver)` be the primary API?
   (Lean: keep them separate for testability; offer the combined helper.)
4. **Keyword auto-link vs explicit `{term}`.** Confirm the division of labor with [04]: does
   this layer emit a `KeywordRef` *only* for explicit `{term}`, leaving all auto-linking to [04]
   at render (current spec), or should the parser pre-scan prose for registry terms? (Lean: [04]
   owns auto-linking; [01] extracts only explicit markup — keeps [01] registry-free per
   C-CON-SOURCE.)
5. **Goal-in-prose vs goal-only.** The concrete format shows `:::goal` embedded in a
   `:::playground`; confirm whether a standalone top-level `:::goal` (a goal with no adjacent
   playground) is legal, and if so what [06] binds it to.
