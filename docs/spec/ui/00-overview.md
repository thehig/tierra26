# Web UI & Host Layer — Overview & Architecture (anchor)

**Status:** v1 anchor. Defines the **client architecture**, the **worker boundary**, the
**document set**, and conventions for `docs/spec/ui/`. Reuses the doc template + criterion
scheme + test conventions from the engine anchor
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8. Companion
package **`@tierra26/ui`** (`packages/ui/`) holds **framework-agnostic contracts + view
logic** (protocol types, view-model transforms, state reducers) as testable code —
**pixel-level visual design is a separate design pass**, not unit-tested here.

Upstream it *consumes* (does not redefine): [`../engine/`](../engine/systems/00-architecture.md)
(Engine API, ObservationFrame, RunDescriptor), [`../genescript/`](../genescript/00-overview.md)
(compile/disassemble/diagnostics), [`../content/`](../content/00-overview.md) (lessons,
PlaygroundConfig, per-instruction data, keyword registry, progression, goals),
[`SPEC.md`](../SPEC.md) §3–4 (the experience + Nintendo-bright visual language).

> This layer mostly **wires up** contracts defined elsewhere. Where it proposes concrete
> UX/visuals, those are proposals for a later design pass (each doc §9); the *logic* contracts
> here are firm.

---

## 1. Client architecture

```
        main thread (UI)                                   Web Worker(s)
 ┌───────────────────────────────┐                 ┌──────────────────────────────┐
 │ App shell / router  [07]      │   commands ───▶ │  Engine session(s)           │
 │ Lesson reader + wiki [06]     │  (init/inject/  │  @tierra26/engine            │
 │ Tank view      [02]           │   run/step/…)   │  (authoritative, deterministic)│
 │ Gene editor    [03] ──compile─┼── genescript ─┐ │                              │
 │ Inspector      [04]           │  (main-thread) │ │  emits ObservationFrames,    │
 │ Charts         [05]           │ ◀─── events ───┼─┤  births/deaths/errors        │
 │  view-models from frames      │  (frames/stats) │ │                              │
 └───────────────────────────────┘                 └──────────────────────────────┘
   imports @tierra26/{engine types, genescript, content}   worker imports @tierra26/engine
```

- **The engine runs in a Web Worker and is authoritative.** The UI is a *view*; it never
  simulates. Determinism lives in the worker; the UI only renders frames and sends commands.
- **GeneScript compiles on the main thread** (instant editor feedback: diagnostics,
  peek-under-hood). Only **genome bytes + commands** cross into the worker; only **frames +
  events** come back. (Compile is deterministic, so where it runs doesn't affect outcomes.)
- **Multiple engine sessions.** A lesson page can host several playgrounds; the worker
  protocol is **session-addressed** ([01]) so one worker multiplexes many small playgrounds,
  with heavy sandbox/Versus optionally on a dedicated worker.
- **Content is data.** Lessons, per-instruction pages, keyword registry, progression, and
  goals come from `@tierra26/content`; the UI renders and drives them.
- **Framework: TBD** (React/Solid/Svelte candidates — `SPEC.md` §14). All contracts here are
  framework-agnostic; the framework choice is an implementation detail behind them.

## 2. Cross-cutting contracts

- **C-UI-VIEW:** the UI never runs the simulation; it renders worker frames and issues
  commands. No gameplay/evolution logic on the main thread (compile/validate excepted).
- **C-UI-DET:** UI actions that affect a run go through the worker as commands against the
  authoritative engine; a shared/replayed run looks identical regardless of the viewer
  (preserves engine determinism across the boundary).
- **C-UI-SOURCE:** instruction facts, keywords, colors, goals, and progression come from
  `@tierra26/{genescript,content}` — the UI never re-defines them.
- **C-UI-RESPONSIVE:** the render loop is decoupled from the sim rate; the worker streams at
  its own cadence with backpressure, the UI paints at display refresh (dropped/al=coalesced
  frames never corrupt state).
- **C-UI-THEME:** every surface supports light/dark and the Nintendo-bright keyword palette
  from content [04]; color roles are tokens, never hard-coded per component.
- **C-UI-A11Y:** keyboard-navigable, honors reduced-motion, sufficient contrast — baseline
  accessibility for an 8–16 audience.

## 3. System map & document set

| # | Doc | Code | Responsibility |
|---|---|---|---|
| 00 | this file | UIA | client architecture, worker boundary, conventions |
| 01 | worker-protocol | WORKER | main↔worker message contract: session-addressed commands/events, transferables, backpressure, determinism preservation |
| 02 | tank-view | TANK | the soup memory-map visualization: frame→pixels, genotype color, IP sparks, birth/death, click-to-inspect, pan/zoom, speed/step controls |
| 03 | gene-editor | EDITOR | GeneScript authoring: text+block modes, keyword coloring, autocomplete, inline diagnostics, peek-under-hood (source map), assemble-inject, disassemble-into-editor |
| 04 | inspector | INSPECTOR | creature/cell inspector: registers, stack, flags, live disassembly w/ IP marker, daughter/lineage, genotype |
| 05 | charts-and-readouts | CHARTS | population/genotype/size-over-time, stat readouts, histograms (view-models from frames) |
| 06 | lesson-reader-and-pages | READER | renders content: scroll lessons + embedded playgrounds + keyword tooltips, per-instruction wiki pages |
| 07 | app-shell-and-state | SHELL | routing/navigation (lessons/sandbox/wiki/versus), layout, theme, learner-progress persistence |

Cross-layer invariants live in `packages/ui/test/_invariants.test.ts` (code **UIINV**).

## 4. Global invariants (UIINV)
- **UIINV-VIEW:** no simulation state is mutated on the main thread; the only source of run
  state is worker frames (C-UI-VIEW).
- **UIINV-ROUNDTRIP:** a command→worker→frame cycle leaves the UI reflecting exactly the
  engine's state (view-model is a pure function of the latest frame).
- **UIINV-DET:** replaying a shared RunDescriptor renders an identical sequence of frames for
  any viewer (C-UI-DET).
- **UIINV-EDITOR-ENGINE:** the genome the editor shows (and its peek-under-hood opcodes) equals
  what gets injected and what the inspector disassembles back — one genome, three views.
- **UIINV-SOURCE:** every displayed instruction fact / keyword / color resolves to a
  `@tierra26/{genescript,content}` source, never a UI constant.
- **UIINV-BACKPRESSURE:** dropping or coalescing frames under load never corrupts the view or
  desyncs from the worker.

## 5. Conventions
Identical to the engine anchor §8: 9-section doc template, append-only `CODE-NNN` criterion
IDs referenced verbatim in `it.todo('[CODE-NNN] …')` tests (**no `src/` imports yet**),
fidelity/scope tags. One doc + one companion test file per system:
`packages/ui/test/NN-<code>.test.ts`. **Mark purely-visual criteria `(visual)`** in the
test name — they become visual/e2e checks later, but still belong on the checklist; logic
criteria become ordinary unit tests.

## 6. Milestone & the design pass
UI is **M2–M3** (editor + tank alongside GeneScript/content; reader with content). This spec
defines **contracts, view logic, and interaction models**. A separate **visual design pass**
(mockups, the Nintendo-bright system, motion) will realize the look — these docs tell that
pass *what* each surface must show and do, and *which contracts* it binds to.
