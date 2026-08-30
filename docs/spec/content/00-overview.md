# Learning Content System — Overview & Architecture (anchor)

**Status:** v1 anchor. Defines the **teaching model**, the **content pipeline**, the concrete
**lesson format**, the **document set**, and conventions for `docs/spec/content/`. Reuses the
doc template + criterion scheme + test conventions from the engine anchor
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8. Companion
package **`@tierra26/content`** (`packages/content/`) holds the *data model + logic* (schema,
validators, keyword registry, progression, goal-checking) as pure, testable code — **rendering
lives in the UI layer** (specced next; this layer's contracts *inform* it).

Upstream: [`SPEC.md`](../SPEC.md) §2–5, §11 (audience, the scroll-based tutorial site,
per-instruction pages, keyword system, design→emergence progression),
[`../genescript/02-vocabulary-and-keywords.md`](../genescript/02-vocabulary-and-keywords.md)
(the verb/keyword source of truth), [`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md)
§3.2 (named subsets — how lessons gate instructions).

> The concrete lesson format below is a **proposal**, deliberately concrete so the sub-specs
> align; exact syntax stays open per each doc's §9.

---

## 1. The teaching model

A kid learns by **doing, then seeing**. A lesson is a **scrollable page**: read a short,
plain-language paragraph, then hit an inline **playground** that runs *exactly* the thing
just described and shows it happening (registers lighting, cells coloring, the instruction
pointer moving). Scroll on; the story builds. Reference lives in **per-instruction pages**
(one wiki page per verb, with editable scenarios) and every meaningful word is a
**color-coded, hoverable keyword**.

Two design spines from [`SPEC.md`](../SPEC.md):
- **Progression: design → emergence.** Early lessons = author a creature that lives and
  replicates (mutation off; pure puzzle). Later lessons unlock mutation + selection and the
  emergent story (parasites, immunity, optimization). Versus sits at the top.
- **Formidable underneath.** Playgrounds run the *real* `@tierra26/engine`; friendliness is
  vocabulary, pacing, and UX — never a weakened simulation.

## 2. The content pipeline

```
authored lesson (content-as-data: markdown + typed directives + frontmatter)
      │  parse + validate (01 CONTENT)      → typed Lesson AST + diagnostics
      ▼
  Lesson AST ──┬─ prose (with keyword markup) ─▶ (04 KEYWORD) resolve terms → colored, hoverable
               ├─ <Playground> directives      ─▶ (02 PLAY) config: scenario+seed+starter genome+goal
               ├─ <Goal> conditions            ─▶ (06 GOAL) deterministic pass/fail checker
               └─ unlocks / prereqs            ─▶ (05 PROGRESS) which verbs/subset/concepts this gates
  (03 INSTRPAGE) per-instruction data feeds both the wiki pages AND playground "try this" scenarios
      ▼
  validated content graph  →  rendered by the UI layer (scroll reader, playground component,
                              wiki pages, keyword tooltips) — UI spec consumes these contracts.
```

- **Content is data, not code.** Authoring a lesson never requires touching engine/UI source.
- **Playgrounds are engine instances.** A `<Playground>` is fully described by a **scenario +
  seed + starter genome (GeneScript) + active subset + optional goal** — reproducible and
  shareable (mirrors the engine's `RunDescriptor`).
- **Single sources of truth.** Instruction facts come from [03]; keyword terms/colors/tooltips
  from [04] (built on GeneScript VOCAB); nothing is duplicated in prose.

## 3. A lesson at a glance (proposed concrete form)

Markdown + frontmatter + typed directives (MDX-like). Known keyword terms auto-highlight from
the [04] registry; authors mostly write normal words.

```markdown
---
id: ch02-first-copy
chapter: 2
title: "Teach it to copy"
unlocks: { verbs: [copy-byte, make-space], concepts: [daughter, copy-loop] }
requires: [ch01-hello-soup]
mutation: off
---

A creature makes a baby by **copying itself** one {byte} at a time into a fresh
{daughter} cell. First it asks the {soup} for space with `make-space`, then it
runs a {copy-loop} using `copy-byte`.

:::playground {scenario: sandbox-small, seed: 7, starter: ch02-starter, subset: ch02}
Try adding a `copy-byte`. Watch the daughter cell fill in.
:::goal { kind: replicates, within: 20000 }
Make your creature produce at least one baby.
:::
```

- `{term}` (or bare known words) → keyword resolution [04].
- `` `verb` `` in code style → linked to its per-instruction page [03].
- `:::playground … :::goal …` → a `<Playground>` [02] with an embedded goal [06].
- `unlocks`/`requires` → progression graph [05].

## 4. System map & document set

```
 lesson source ─▶ [01 CONTENT model/parse/validate] ─▶ Lesson AST
        │                        │            │              │
        │            [04 KEYWORD]│  [02 PLAY] │  [06 GOAL]    │[05 PROGRESS]
        ▼                        ▼            ▼              ▼
   prose keywords          tooltips      engine playground   pass/fail   curriculum graph
   [03 INSTRPAGE] feeds keyword tooltips, wiki pages, and playground "try this" scenarios
                          (renders in the UI layer — next spec)
```

| # | Doc | Code | Responsibility |
|---|---|---|---|
| 00 | this file | CONA | teaching model, pipeline, lesson format, conventions |
| 01 | content-model-and-authoring | CONTENT | lesson schema, frontmatter, directives, parse/validate, Lesson AST |
| 02 | playground-component | PLAY | embeddable engine-instance contract: config, controls, emitted state, goals |
| 03 | per-instruction-pages | INSTRPAGE | one data record per verb (kid def, machine truth, animation spec, scenarios) |
| 04 | keyword-and-tooltip-system | KEYWORD | color-coded term registry + tooltip content + auto-linking contract |
| 05 | learning-progression-and-unlocks | PROGRESS | curriculum graph, prereqs, verb/subset/concept gating, design→emergence arc |
| 06 | goals-challenges-and-assessment | GOAL | deterministic success conditions, checking, hints, progress tracking |

Cross-layer invariants (coverage, validity, determinism) live in
`packages/content/test/_invariants.test.ts` (code **CONTINV**).

## 5. Cross-cutting contracts

- **C-CON-DATA:** all content is declarative data validated against a schema; no executable
  authoring.
- **C-CON-DET:** playground runs and goal-checks are deterministic (scenario + seed + starter
  genome ⇒ fixed outcome) — reuses the engine determinism contract; lessons are replayable.
- **C-CON-SUBSET:** a lesson's active subset ⊆ the verbs unlocked by its prerequisites; a goal
  never requires a verb the lesson hasn't introduced (PROGRESS enforces; GOAL/PLAY respect).
- **C-CON-SOURCE:** instruction facts come only from [03]; keyword terms/colors/tooltips only
  from [04] (which builds on GeneScript VOCAB). No duplicated definitions in prose.
- **C-CON-KID:** all learner-facing text obeys the age-8–16 tone rules (shared with GeneScript
  DIAG C-GS-KID).
- **C-CON-COMPILES:** every playground's starter/solution genome compiles under its active
  subset (via `@tierra26/genescript`) and loads in `@tierra26/engine`.

## 6. Global invariants (CONTINV)
- **CONTINV-COVERAGE:** every classic-32 verb has a per-instruction page [03] and a keyword
  entry [04] (no orphan instructions).
- **CONTINV-VALID:** every shipped lesson validates against the [01] schema.
- **CONTINV-COMPILE:** every playground starter/solution genome compiles + loads (C-CON-COMPILES).
- **CONTINV-INTRO-BEFORE-USE:** no lesson's goal/playground requires a verb not unlocked by it
  or a prerequisite (C-CON-SUBSET) — the curriculum graph is topologically sound.
- **CONTINV-DET:** goal-checkers and playground runs are deterministic per seed (C-CON-DET).
- **CONTINV-KEYWORDS:** keyword auto-linking only links terms in the registry and is
  deterministic.

## 7. Conventions
Identical to the engine anchor §8: 9-section doc template, append-only `CODE-NNN` criterion
IDs referenced verbatim in `it.todo('[CODE-NNN] …')` tests (**no `src/` imports yet**),
fidelity/scope tags. One doc + one companion test file per system:
`packages/content/test/NN-<code>.test.ts`.

## 8. Milestone & UI hand-off
Content system is **M3** (after engine M0/M1 and GeneScript M2). It is specced *before* the UI
because its data contracts (playground config, per-instruction data, keyword registry, goal
model, progression) define **what the UI must render and drive** — the UI spec will consume
them rather than invent them.
