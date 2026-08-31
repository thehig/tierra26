// App Shell & State (SHELL) — acceptance criteria as executable tests.
// Ref: docs/spec/ui/07-app-shell-and-state.md §8. Keep 1:1 with the doc.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reduce,
  unlocked,
  persist,
  hydrate,
  defaultAppState,
  serializeRunLink,
  parseRunLink,
  routeToPath,
  pathToRoute,
  runControl,
  runLinkPlan,
  PERSIST_VERSION,
} from '../src/shell.ts';
import type { AppState, AppAction, Route, RunLink } from '../src/shell.ts';
import { CURRICULUM } from '../../content/src/progress.ts';
import type { LearnerState } from '../../content/src/types.ts';

// Real lesson ids from the shipped curriculum (single-source, no drift).
const L0 = 'ch01-landmarks'; // requires: [] ; unlocks verbs mark-0/mark-1
const L1 = 'ch01-registers'; // requires: [L0]
const L2 = 'ch01-bit-tricks'; // requires: [L1]

function baseState(): AppState {
  return defaultAppState();
}

describe('App Shell & State (SHELL)', () => {
  it('[SHELL-001] reduce is a pure function of (state, action) — deterministic, no side effects', () => {
    const s = baseState();
    const frozenCompleted = new Set(s.learner.completed);
    const action: AppAction = { type: 'setTheme', theme: 'dark' };

    const a = reduce(s, action);
    const b = reduce(s, action);

    // deterministic: same inputs → structurally equal outputs
    assert.deepEqual(a, b);
    assert.equal(a.theme, 'dark');
    // no mutation of the input state
    assert.notEqual(a, s);
    assert.equal(s.theme, 'system');
    assert.deepEqual(s.learner.completed, frozenCompleted);

    // unknown action → state returned unchanged (same reference)
    const unknown = { type: 'nope' } as unknown as AppAction;
    assert.equal(reduce(s, unknown), s);
  });

  it('[SHELL-002] routing is a pure value transition; every Route is serializable/deep-linkable', () => {
    const routes: Route[] = [
      { surface: 'lesson', lessonId: L0 },
      { surface: 'lesson', lessonId: L1, section: 'copy-loop' },
      { surface: 'wiki' },
      { surface: 'wiki', verb: 'divide' },
      { surface: 'sandbox' },
      { surface: 'sandbox', run: { scenarioId: 'soup', seed: 42, genomes: ['grow-a\ndivide'] } },
      { surface: 'versus', run: { scenarioId: 'arena', seed: 7, genomes: ['a', 'b & c = d'] } },
    ];
    for (const route of routes) {
      const s = reduce(baseState(), { type: 'navigate', route });
      assert.deepEqual(s.route, route);
      // JSON-serializable
      assert.deepEqual(JSON.parse(JSON.stringify(route)), route);
      // deep-linkable: round-trips through the URL path mapping
      assert.deepEqual(pathToRoute(routeToPath(route)), route);
    }
  });

  it('[SHELL-003] a goal-completion event marks its lesson complete only when all required goals are met', () => {
    const s = baseState();

    // not all required goals met → NOT completed, state unchanged
    const partial = reduce(s, { type: 'completeLesson', lessonId: L0, requiredGoals: ['g1', 'g2'], metGoals: ['g1'] });
    assert.equal(partial, s);
    assert.equal(partial.learner.completed.has(L0), false);

    // all required goals met → completed
    const done = reduce(s, { type: 'completeLesson', lessonId: L0, requiredGoals: ['g1', 'g2'], metGoals: ['g1', 'g2', 'bonus'] });
    assert.equal(done.learner.completed.has(L0), true);

    // no required goals → completes (nothing to gate)
    const noReq = reduce(s, { type: 'completeLesson', lessonId: L0 });
    assert.equal(noReq.learner.completed.has(L0), true);
  });

  it('[SHELL-004] completing a lesson\'s required goals unlocks its dependents (via content PROGRESS)', () => {
    const s0 = baseState();
    // Before: L1 is not yet available (its prerequisite L0 is not complete).
    assert.equal(unlocked(CURRICULUM, s0.learner).available.has(L1), false);

    const s1 = reduce(s0, { type: 'completeLesson', lessonId: L0, requiredGoals: ['g'], metGoals: ['g'] });
    const u = unlocked(CURRICULUM, s1.learner);

    // After completing L0: its dependent L1 becomes available and L0's verbs unlock.
    assert.equal(u.available.has(L1), true);
    assert.equal(u.verbs.has('mark-0'), true);
    assert.equal(u.verbs.has('mark-1'), true);
  });

  it('[SHELL-005] the unlocked set is derived from LearnerState+Curriculum, never stored separately (no drift)', () => {
    const s = baseState();
    // AppState carries NO stored unlocked set — it is always derived.
    assert.equal('unlocked' in s, false);

    const before = unlocked(CURRICULUM, s.learner);
    assert.equal(before.available.has(L1), false);

    // Change the learner → recomputed unlocked reflects it immediately (no cache to drift).
    const s2 = reduce(s, { type: 'completeLesson', lessonId: L0 });
    const after = unlocked(CURRICULUM, s2.learner);
    assert.equal(after.available.has(L1), true);
    // The earlier derivation is untouched (pure snapshots, no shared mutable state).
    assert.equal(before.available.has(L1), false);
  });

  it('[SHELL-006] persist→hydrate round-trips AppState (learner + route + theme)', () => {
    let s = baseState();
    s = reduce(s, { type: 'setTheme', theme: 'dark' });
    s = reduce(s, { type: 'setReducedMotion', reducedMotion: true });
    s = reduce(s, { type: 'navigate', route: { surface: 'lesson', lessonId: L1, section: 'intro' } });
    s = reduce(s, { type: 'completeLesson', lessonId: L0 });
    s = reduce(s, { type: 'completeLesson', lessonId: L1 });

    const blob = persist(s);
    assert.equal(blob.version, PERSIST_VERSION);
    // blob is plain, JSON-serializable data
    const wire = JSON.parse(JSON.stringify(blob));
    const back = hydrate(wire);

    assert.equal(back.theme, 'dark');
    assert.equal(back.reducedMotion, true);
    assert.deepEqual(back.route, s.route);
    assert.deepEqual(back.learner.completed, s.learner.completed);
  });

  it('[SHELL-007] hydrate migrates an older PersistBlob version safely (or falls back)', () => {
    // A v0 (unversioned legacy) blob with the same field layout migrates cleanly.
    const legacy = {
      route: { surface: 'wiki', verb: 'divide' },
      theme: 'light',
      reducedMotion: false,
      completed: [L0, L1],
    };
    const migrated = hydrate(legacy);
    assert.deepEqual(migrated.route, { surface: 'wiki', verb: 'divide' });
    assert.equal(migrated.theme, 'light');
    assert.deepEqual([...migrated.learner.completed].sort(), [L0, L1]);

    // A blob from a FUTURE version we don't understand → safe default, no crash.
    const future = { version: PERSIST_VERSION + 99, theme: 'dark' };
    assert.deepEqual(hydrate(future), defaultAppState());

    // Partially-corrupt fields fall back individually (bad theme/route).
    const corrupt = { version: 1, theme: 'neon', route: { surface: 'bogus' }, completed: [L0, 5, null] };
    const repaired = hydrate(corrupt);
    assert.equal(repaired.theme, 'system'); // bad enum → default
    assert.deepEqual(repaired.route, defaultAppState().route); // bad route → default
    assert.deepEqual([...repaired.learner.completed], [L0]); // non-strings dropped
  });

  it('[SHELL-008] missing/blocked storage degrades to in-memory defaults without crashing', () => {
    // Any unknown/garbage blob → a valid default AppState, hydrate never throws.
    for (const bad of [undefined, null, 42, 'oops', [], {}, { version: 'x' }, NaN, true]) {
      const s = hydrate(bad as unknown);
      assert.deepEqual(s, defaultAppState());
    }
  });

  it('[SHELL-009] a RunLink deep link restores a reproducible run identical for any viewer (determinism)', () => {
    const link: RunLink = { scenarioId: 'soup', seed: 123456, genomes: ['grow-a\ndivide', 'a=b & c'] };

    // serialize → parse round-trips EXACTLY (the shareable recipe).
    const s = serializeRunLink(link);
    assert.deepEqual(parseRunLink(s), link);

    // Deep-linked through a route path too.
    const route: Route = { surface: 'sandbox', run: link };
    assert.deepEqual(pathToRoute(routeToPath(route)), route);

    // The restore plan is deterministic — same link ⇒ identical plan for any viewer.
    assert.deepEqual(runLinkPlan(link), runLinkPlan(link));
    assert.deepEqual(runLinkPlan(link), { scenarioId: 'soup', seed: 123456, genomes: link.genomes });

    // Malformed links parse to null, never throw.
    assert.equal(parseRunLink('garbage'), null);
    assert.equal(parseRunLink('scenario=x&seed=NaN&genomes=%5B%5D'), null);
  });

  it('[SHELL-010] sandbox "unlock all" free-play exposes the full verb set', () => {
    const s = reduce(baseState(), { type: 'toggleSandbox', sandbox: true });
    assert.equal(s.learner.sandbox, true);

    const gated = unlocked(CURRICULUM, { completed: new Set() } as LearnerState);
    const free = unlocked(CURRICULUM, s.learner);

    // Free-play exposes strictly more than a fresh (nothing-completed) learner.
    assert.ok(free.subset.length > gated.subset.length);
    // Sandbox exposes the WHOLE curriculum verb universe (every lesson's unlocks).
    const everyVerb = new Set<string>();
    for (const id of Object.keys(CURRICULUM.lessons)) {
      for (const v of CURRICULUM.lessons[id]!.unlocks.verbs) everyVerb.add(v);
    }
    assert.equal(free.subset.length, everyVerb.size);
    for (const v of everyVerb) assert.equal(free.verbs.has(v), true);
    // Every lesson is available in free-play.
    assert.equal(free.available.size, Object.keys(CURRICULUM.lessons).length);
  });

  it('[SHELL-011] run controls issue worker commands; the Shell runs no simulation (C-UI-VIEW)', () => {
    const sid = 'sess-1';
    // Run controls map to WORKER protocol commands (the Shell simulates nothing).
    assert.deepEqual(runControl({ kind: 'run' }, sid), { type: 'run', mode: 'play', sessionId: sid });
    assert.deepEqual(runControl({ kind: 'pause' }, sid), { type: 'run', mode: 'pause', sessionId: sid });
    assert.deepEqual(runControl({ kind: 'step' }, sid), { type: 'step', sessionId: sid });
    assert.deepEqual(runControl({ kind: 'reset' }, sid), { type: 'reset', sessionId: sid });

    // AppState holds NO simulation/tank state — only route/theme/motion/learner.
    const s = baseState();
    assert.deepEqual(Object.keys(s).sort(), ['learner', 'reducedMotion', 'route', 'theme']);
  });

  it('[SHELL-012] theme (incl. system) and reducedMotion are serializable and consumed app-wide', () => {
    for (const theme of ['light', 'dark', 'system'] as const) {
      const s = reduce(baseState(), { type: 'setTheme', theme });
      assert.equal(s.theme, theme);
      const back = hydrate(JSON.parse(JSON.stringify(persist(s))));
      assert.equal(back.theme, theme);
    }
    const m = reduce(baseState(), { type: 'setReducedMotion', reducedMotion: true });
    assert.equal(m.reducedMotion, true);
    assert.equal(hydrate(JSON.parse(JSON.stringify(persist(m)))).reducedMotion, true);
  });

  it('[SHELL-013] unlocked is a pure function of its inputs (no hidden state)', () => {
    const learner: LearnerState = { completed: new Set([L0, L1]) };
    const a = unlocked(CURRICULUM, learner);
    const b = unlocked(CURRICULUM, learner);
    // Same inputs → structurally equal outputs, every call.
    assert.deepEqual(a.subset, b.subset);
    assert.deepEqual([...a.verbs].sort(), [...b.verbs].sort());
    assert.deepEqual([...a.available].sort(), [...b.available].sort());
    // No shared mutable state: a different learner yields a different result,
    // and the earlier result is unaffected.
    const other = unlocked(CURRICULUM, { completed: new Set() } as LearnerState);
    assert.notEqual(a.subset.length, other.subset.length);
    assert.deepEqual(a.subset, unlocked(CURRICULUM, learner).subset);
  });

  it('[SHELL-014] (visual) app frame, navigation chrome, and per-surface layout', () => {
    // The pixel frame/chrome is the design pass; here we assert the pure routing substrate the
    // shell must expose for it: every surface is routable, round-trips through its path, and a
    // navigate action reaches each one (mirrors how sibling visual criteria test the substrate).
    const routes: Route[] = [
      { surface: 'lesson', lessonId: 'ch01-landmarks' },
      { surface: 'sandbox' },
      { surface: 'wiki', verb: 'copy-byte' },
      { surface: 'versus' },
    ];
    const surfaces = new Set<Route['surface']>();
    for (const route of routes) {
      const path = routeToPath(route);
      assert.equal(typeof path, 'string');
      assert.ok(path.startsWith('/'), `route path is absolute: ${path}`);
      assert.deepEqual(pathToRoute(path), route, `round-trips: ${path}`);
      const next = reduce(defaultAppState(), { type: 'navigate', route } as AppAction);
      assert.deepEqual(next.route, route, `navigate reaches ${route.surface}`);
      surfaces.add(route.surface);
    }
    // all four surfaces the app frame switches between are covered
    assert.deepEqual([...surfaces].sort(), ['lesson', 'sandbox', 'versus', 'wiki']);
  });
});
