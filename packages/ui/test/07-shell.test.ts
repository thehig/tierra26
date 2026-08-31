// App Shell & State (SHELL) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/07-app-shell-and-state.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('App Shell & State (SHELL)', () => {
  it.todo('[SHELL-001] reduce is a pure function of (state, action) — deterministic, no side effects');
  it.todo('[SHELL-002] routing is a pure value transition; every Route is serializable/deep-linkable');
  it.todo('[SHELL-003] a goal-completion event marks its lesson complete only when all required goals are met');
  it.todo('[SHELL-004] completing a lesson\'s required goals unlocks its dependents (via content PROGRESS)');
  it.todo('[SHELL-005] the unlocked set is derived from LearnerState+Curriculum, never stored separately (no drift)');
  it.todo('[SHELL-006] persist→hydrate round-trips AppState (learner + route + theme)');
  it.todo('[SHELL-007] hydrate migrates an older PersistBlob version safely (or falls back)');
  it.todo('[SHELL-008] missing/blocked storage degrades to in-memory defaults without crashing');
  it.todo('[SHELL-009] a RunLink deep link restores a reproducible run identical for any viewer (determinism)');
  it.todo('[SHELL-010] sandbox "unlock all" free-play exposes the full verb set');
  it.todo('[SHELL-011] run controls issue worker commands; the Shell runs no simulation (C-UI-VIEW)');
  it.todo('[SHELL-012] theme (incl. system) and reducedMotion are serializable and consumed app-wide');
  it.todo('[SHELL-013] unlocked is a pure function of its inputs (no hidden state)');
  it.todo('[SHELL-014] (visual) app frame, navigation chrome, and per-surface layout');
});
