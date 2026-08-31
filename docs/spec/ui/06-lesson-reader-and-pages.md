# Lesson Reader & Pages — Engineering Spec (Code: READER · Milestone: M3)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§2: C-UI-SOURCE,
C-UI-THEME, C-UI-A11Y). Conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Consumes: content [`01-content-model`](../content/01-content-model-and-authoring.md) (Lesson AST),
[`02-playground-component`](../content/02-playground-component.md) (PlaygroundConfig),
[`03-per-instruction-pages`](../content/03-per-instruction-pages.md),
[`04-keyword-and-tooltip-system`](../content/04-keyword-and-tooltip-system.md),
[`06-goals`](../content/06-goals-challenges-and-assessment.md); UI [`01`](01-worker-protocol.md)/
[`02`](02-tank-view.md)/[`03`](03-gene-editor.md) (an embedded playground = worker session +
tank + editor).

---

## 1. Purpose & responsibility

The Reader **renders the content layer into the actual learning experience**: scrollable
lessons (prose → inline playground → prose), hoverable color-coded keywords, and the
per-instruction wiki pages. It maps the content Lesson AST into an ordered render model, mounts
embedded playgrounds as live engine sessions, resolves keyword tooltips from the registry, and
surfaces goal completion to the Shell. It renders content it does not define (C-UI-SOURCE).

## 2. Interfaces

```ts
import type { LessonAst, PlaygroundConfig, InstructionPage, KeywordRef } from '@tierra26/content'; // (future)

function toRenderModel(ast: LessonAst): LessonRenderModel;   // pure
interface LessonRenderModel { blocks: RenderBlock[]; }
type RenderBlock =
  | { kind: 'prose'; spans: ProseSpan[] }        // text with resolved keyword spans
  | { kind: 'playground'; config: PlaygroundConfig; goal?: GoalRef; mount: 'lazy' }
  | { kind: 'goal'; goal: GoalRef }
  | { kind: 'heading'|'image'|'note'; /* … */ };
type ProseSpan =
  | { kind: 'text'; text: string }
  | { kind: 'keyword'; term: string; entryId: string; color: string; tooltip: TooltipModel }
  | { kind: 'instr-link'; verb: string; pageId: string };

function toInstructionPageModel(p: InstructionPage): InstrPageModel;  // wiki page render model
```

## 3. Data structures
- **`LessonRenderModel`** — the ordered list of render blocks a lesson becomes; a pure function
  of the Lesson AST + the keyword registry.
- **`ProseSpan[]`** — prose split into text / resolved keyword / instruction-link spans (keyword
  resolution delegated to content [04], not re-implemented).
- **Embedded playground block** — carries the `PlaygroundConfig` [content 02]; mounts **lazily**
  (a page may hold many).
- **`InstrPageModel`** — a per-instruction wiki page from the `InstructionPage` record (kid def,
  machine truth, animation spec, editable scenarios as mini-playgrounds, see-also).

## 4. Behavior / algorithms
- **Render mapping (pure)** — `toRenderModel(ast)` walks the Lesson AST into ordered
  `RenderBlock`s; prose nodes become `ProseSpan[]` with keyword/instr-link spans resolved via the
  content KEYWORD registry [04] (longest-match, code spans skipped — that logic lives in content;
  the Reader consumes its output). Unknown keyword refs degrade to plain text (never crash).
- **Keyword tooltips** — each keyword span carries its color category + `TooltipModel` (kid line
  + "more") straight from the registry (C-UI-SOURCE); the UI renders the hover.
- **Playground mounting** — a `playground` block instantiates a **worker engine session** [01]
  from its `PlaygroundConfig` (compile starter via GeneScript, `init`+`inject`), wiring a Tank
  [02] + Editor [03] + goal status [content 06] into an inline widget. Mounts **lazily** on
  scroll-into-view for performance; unmount tears down the session (WORKER `disposeSession`).
- **Goals** — an embedded goal's checker [content 06] runs against the playground's session;
  on pass, the Reader emits a completion event to the Shell [07] (drives progression unlock).
- **Per-instruction pages** — `toInstructionPageModel` renders every `InstructionPage` field;
  its editable scenarios are mini-playgrounds reusing the same mounting path.
- **A11y** — reduced-motion disables scroll/playground animations; keyboard nav walks blocks and
  playground controls; tooltips are keyboard-focusable (C-UI-A11Y).

## 5. Interconnections
- **content [01/02/03/04/06]** — the data it renders (lessons, playground configs, instruction
  pages, keyword registry, goals).
- **UI [01/02/03]** — an embedded playground *is* a worker session + tank + editor.
- **[07] Shell** — receives goal-completion/progress events; owns routing to lessons/wiki.
- **design pass** — realizes scroll layout, typography, the Nintendo-bright keyword styling.

## 6. Determinism & edge cases
- `toRenderModel` / `toInstructionPageModel` are pure (same AST → same model).
- Unknown keyword term → plain text span (graceful, no crash).
- A playground whose starter fails to compile → the block renders an authoring error (content
  validation should have caught it; the Reader still degrades gracefully).
- Many playgrounds on a page → only in-view sessions are live (lazy mount/unmount); off-screen
  ones hold no worker session.
- Deterministic playground runs (seed+config) mean a lesson demo looks the same for every kid
  (C-CON-DET via the worker).

## 7. Fidelity notes
- **[CORE]** the Reader renders content/registry data, never redefines facts (C-UI-SOURCE).
- **[CORE]** embedded playgrounds run the real engine via the worker (formidable-underneath).
- **[MOD]** the scroll-lesson format is modern pedagogy over the authentic sim.
- **[OPTIONAL]** rich scrollytelling (pinned playgrounds, step-synced prose) — later.

## 8. Acceptance criteria
- **READER-001** `toRenderModel(ast)` is pure and maps the Lesson AST to an ordered
  `RenderBlock[]` (prose/playground/goal/heading…).
- **READER-002** Prose keyword refs resolve to registry entries with color + tooltip
  (C-UI-SOURCE); resolution is delegated to content [04], not reimplemented.
- **READER-003** An unknown keyword term degrades to a plain-text span (no crash).
- **READER-004** A `playground` block yields a valid worker-session config from its
  `PlaygroundConfig` (compilable starter, init+inject).
- **READER-005** Embedded playgrounds mount **lazily** on scroll-into-view and dispose their
  worker session on unmount (WORKER `disposeSession`).
- **READER-006** An embedded goal's pass emits a completion event to the Shell [07].
- **READER-007** `toInstructionPageModel` renders every `InstructionPage` field (kid def,
  machine truth, animation, editable scenarios, see-also).
- **READER-008** A per-instruction page's editable scenarios mount as playgrounds via the same
  path.
- **READER-009** Instruction-link spans (`` `verb` ``) resolve to the correct per-instruction
  page id.
- **READER-010** Reduced-motion disables playground/scroll animation; keyword tooltips are
  keyboard-focusable (C-UI-A11Y).
- **READER-011** A playground with a non-compiling starter renders an error state, not a crash.
- **READER-012** Off-screen playgrounds hold no live worker session (bounded resource use).
- **READER-013** `(visual)` scroll layout, typography, keyword styling, and tooltip presentation
  per the design pass.

## 9. Open questions
1. Lazy-mount threshold / prefetch distance (perf vs snappiness).
2. Whether wiki pages and lessons share one worker (session pool) or separate — align with [01].
3. Deep-linking to a specific lesson section or per-instruction page (route shape with [07]).
