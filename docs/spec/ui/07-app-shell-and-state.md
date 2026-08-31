# App Shell & State — Engineering Spec (Code: SHELL · Milestone: M3)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§2: C-UI-VIEW,
C-UI-THEME, C-UI-A11Y). Conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Consumes: content [`05-learning-progression`](../content/05-learning-progression-and-unlocks.md)
(`LearnerState`→unlocked), [`06-goals`](../content/06-goals-challenges-and-assessment.md)
(goal completion), UI [`06-reader`](06-lesson-reader-and-pages.md) and the sandbox/versus
surfaces. Ties to [`SPEC.md`](../SPEC.md) §3 (surfaces) and §7 (no accounts/online in phase 1).

---

## 1. Purpose & responsibility

The Shell is the **app frame and the single owner of client state**: routing between the four
surfaces (Lesson Reader, free-play Sandbox, per-instruction Wiki, local Versus), panel layout
per surface, theme, and the **learner-progress model** (completed lessons, met goals, unlocked
verbs/concepts) with local persistence. Every state transition is a pure reducer; visual chrome
is deferred to the design pass. It derives unlocked content from content PROGRESS rather than
storing it redundantly.

## 2. Interfaces

```ts
import type { Curriculum, LearnerState, Unlocked } from '@tierra26/content'; // (future)

type Route =
  | { surface: 'lesson'; lessonId: string; section?: string }
  | { surface: 'sandbox'; run?: RunLink }
  | { surface: 'wiki'; verb?: string }
  | { surface: 'versus'; run?: RunLink };

interface RunLink { scenarioId: string; seed: number; genomes: string[] /* GeneScript */; }

interface AppState { route: Route; theme: 'light'|'dark'|'system'; reducedMotion: boolean; learner: LearnerState; }

function reduce(state: AppState, action: AppAction): AppState;   // pure
function unlocked(curriculum: Curriculum, learner: LearnerState): Unlocked;  // via content PROGRESS
function persist(state: AppState): PersistBlob;                  // versioned
function hydrate(blob: unknown): AppState;                       // migration-safe
```

## 3. Data structures
- **`AppState`** — route + theme + reduced-motion + `LearnerState`; fully serializable
  (C-SNAP-like); the single source of client state.
- **`Route`** — a pure value; navigation is `reduce(state, {type:'navigate', route})`.
- **`RunLink`** — `{scenarioId, seed, genomes}` — a shareable, reproducible deep link into a
  sandbox/versus run (mirrors the engine `RunDescriptor`; determinism across viewers).
- **`LearnerState`** — completed lessons + met goals; **unlocked content is derived**
  (`unlocked(...)` via content PROGRESS [05]), never stored separately (avoids drift).
- **`PersistBlob`** — versioned snapshot of `AppState` for local storage.

## 4. Behavior / algorithms
- **Routing** — `reduce` maps navigation actions to a new `Route`; routing is a pure function of
  state, so it is testable and serializable (deep-linkable). No surface runs a simulation; run
  controls issue worker commands (C-UI-VIEW).
- **Progress reducer** — a goal-completion event (from Reader [06]/goals [06]) updates
  `LearnerState.metGoals`; when a lesson's *required* goals are all met, the lesson is marked
  complete, which (via `unlocked`) opens its dependents. The unlocked verb/concept set is
  **derived** from `LearnerState` + `Curriculum`, not stored.
- **Unlock derivation** — `unlocked()` delegates to content PROGRESS (cumulative fold over the
  DAG); the Shell caches it as a pure function of state, recomputing on learner change. Sandbox
  offers an "unlock all" free-play mode (content PROGRESS sandbox case).
- **Persistence** — `persist`/`hydrate` round-trip `AppState` to local storage (no accounts,
  local-only per SPEC §7); blobs are **versioned** and `hydrate` migrates older versions;
  missing/blocked storage degrades to an in-memory default (no crash).
- **Theme & motion** — `theme`/`reducedMotion` are app-level tokens consumed by every surface
  (C-UI-THEME/C-UI-A11Y); `system` follows the OS preference.
- **Deep-link restore** — a `RunLink` route hydrates a reproducible run: compile genomes, `init`
  the scenario+seed, inject — identical for any viewer (determinism across the worker boundary).

## 5. Interconnections
- **content [05] PROGRESS** — the unlock computation the Shell owns the *state* for.
- **content [06] Goals** — completion events drive the progress reducer.
- **UI [06] Reader** — the lesson/wiki surfaces render here; goal events flow up.
- **UI [01] Worker** — run controls / deep-link restore issue worker commands.
- **design pass** — realizes the frame, navigation chrome, and layout.

## 6. Determinism & edge cases
- `reduce` is pure and deterministic (same state+action → same next state).
- `unlocked` is a pure function of `(curriculum, learner)` — no hidden state.
- Corrupt/old persisted blob → `hydrate` migrates or falls back to defaults (never throws).
- Storage unavailable (private mode) → in-memory state, app still works, progress not saved.
- A `RunLink` with a genome that fails to compile → routes to the surface with an error, not a
  crash.
- Unlocked set never drifts from `LearnerState` (it is derived, not stored).

## 7. Fidelity notes
- **[CORE]** single-owner, pure, serializable client state; unlocked-content derived not stored.
- **[CORE]** local-only persistence in phase 1 (no accounts/online — SPEC §7).
- **[MOD]** modern SPA shell; Versus is local hotseat first (online later reuses `RunLink`).
- **[OPTIONAL]** accounts, cloud sync, sharing services — a later phase; `RunLink` is the seam.

## 8. Acceptance criteria
- **SHELL-001** `reduce` is a pure function of `(state, action)` — deterministic, no side effects.
- **SHELL-002** Routing is a pure value transition; every `Route` is serializable/deep-linkable.
- **SHELL-003** A goal-completion event marks its lesson complete only when all *required* goals
  are met.
- **SHELL-004** Completing a lesson's required goals unlocks its dependents (via content
  PROGRESS).
- **SHELL-005** The unlocked verb/concept set is **derived** from `LearnerState`+`Curriculum`,
  never stored separately (no drift).
- **SHELL-006** `persist`→`hydrate` round-trips `AppState` (learner + route + theme).
- **SHELL-007** `hydrate` migrates an older `PersistBlob` version safely (or falls back).
- **SHELL-008** Missing/blocked storage degrades to in-memory defaults without crashing.
- **SHELL-009** A `RunLink` deep link restores a reproducible run (compile→init→inject), identical
  for any viewer (determinism).
- **SHELL-010** Sandbox "unlock all" free-play exposes the full verb set (content PROGRESS
  sandbox case).
- **SHELL-011** Run controls issue worker commands; the Shell runs no simulation (C-UI-VIEW).
- **SHELL-012** `theme` (incl. `system`) and `reducedMotion` are serializable and consumed
  app-wide (C-UI-THEME/C-UI-A11Y).
- **SHELL-013** `unlocked` is a pure function of its inputs (no hidden state).
- **SHELL-014** `(visual)` app frame, navigation chrome, and per-surface layout per the design
  pass.

## 9. Open questions
1. Route serialization format for deep links (path vs query vs hash) — pick with the framework.
2. Persist granularity (debounced full-state vs per-event) — tune for storage churn.
3. Where Versus scoring/session lives (Shell vs a dedicated Versus system doc, M4).
