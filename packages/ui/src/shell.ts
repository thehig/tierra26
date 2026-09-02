// ============================================================================
// [07] SHELL — app frame + single owner of client state (SHELL system).
// Ref: docs/spec/ui/07-app-shell-and-state.md.
//
// The Shell is the app's ROUTING + STATE core: a pure reducer over AppState
// (route + theme + reduced-motion + LearnerState), plus versioned, migration-
// safe persistence. It is FRAMEWORK-AGNOSTIC and side-effect-free:
//   - NO DOM, NO window/document/localStorage.
//   - NO Date.now / Math.random / wall-clock / RNG.
//   - `persist`/`hydrate` produce/consume PLAIN DATA; the host wires storage.
//
// Unlock gating goes THROUGH content PROGRESS (`computeUnlocked`) — the Shell
// owns the learner STATE but never reimplements the unlock fold (C-UI-SOURCE):
// the unlocked verb/concept set is DERIVED, never stored (no drift).
//
// --experimental-strip-types: no parameter properties/enums/decorators;
// explicit fields; `import type` for types; `.ts` import specifiers.
// ============================================================================

import type { Curriculum, LearnerState, Unlocked, LessonId } from '../../content/src/types.ts';
import { CURRICULUM, computeUnlocked } from '../../content/src/progress.ts';
import type { HostCommand, TankCommand, SessionId } from './protocol.ts';
import { tankCommandToHost } from './protocol.ts';

// ---- Route: a pure, serializable, deep-linkable value ----------------------
export type Route =
  | { surface: 'sandbox'; run?: RunLink }
  | { surface: 'bible'; verb?: string }
  | { surface: 'versus'; run?: RunLink };

export type Surface = Route['surface'];

// A shareable, reproducible deep link into a sandbox/versus run. `genomes` are
// GeneScript source strings (the shareable recipe); mirrors the engine
// RunDescriptor — same scenarioId+seed+genomes ⇒ identical run for any viewer.
export interface RunLink {
  scenarioId: string;
  seed: number;
  genomes: string[]; // GeneScript text
}

export type Theme = 'light' | 'dark' | 'system';

// The single source of client state; fully serializable.
export interface AppState {
  route: Route;
  theme: Theme;
  reducedMotion: boolean;
  learner: LearnerState; // { completed, sandbox? } — unlocked is DERIVED, not stored
}

// ---- Actions (discriminated union) -----------------------------------------
// `completeLesson` carries the goal picture from Reader[06]/Goals[06]: the
// lesson is marked complete ONLY when every REQUIRED goal is met (SHELL-003).
export type AppAction =
  | { type: 'navigate'; route: Route }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setReducedMotion'; reducedMotion: boolean }
  | { type: 'completeLesson'; lessonId: string; requiredGoals?: readonly string[]; metGoals?: readonly string[] }
  | { type: 'toggleSandbox'; sandbox?: boolean };

// ---- Persistence blob (versioned snapshot for local storage) ---------------
export interface PersistBlob {
  version: number;
  route: Route;
  theme: Theme;
  reducedMotion: boolean;
  completed: string[]; // sorted LessonIds (Set → array for serialization)
  sandbox?: boolean;
}

export const PERSIST_VERSION = 1;

// ----------------------------------------------------------------------------
// Defaults — derived from CURRICULUM so there is no second source to drift.
// ----------------------------------------------------------------------------

/** The app's home route. */
export function defaultRoute(): Route {
  // The lesson surface is gone with the retired TypeScript curriculum; chapters
  // live at the app-level `learn` surface, which this shared shell does not model.
  return { surface: 'sandbox' };
}

/** A valid, dependency-free default AppState (also the hydrate fall-back). */
export function defaultAppState(): AppState {
  return {
    route: defaultRoute(),
    theme: 'system',
    reducedMotion: false,
    learner: { completed: new Set<LessonId>() },
  };
}

// ----------------------------------------------------------------------------
// reduce — PURE. Same (state, action) ⇒ same next state; never mutates `state`
// (always returns a fresh object on change); unknown action ⇒ state unchanged.
// ----------------------------------------------------------------------------
export function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'navigate':
      return { ...state, route: action.route };

    case 'setTheme':
      return { ...state, theme: action.theme };

    case 'setReducedMotion':
      return { ...state, reducedMotion: action.reducedMotion };

    case 'completeLesson': {
      const required = action.requiredGoals ?? [];
      const met = new Set(action.metGoals ?? []);
      // Gate: complete ONLY when ALL required goals are met (SHELL-003).
      if (!required.every((g) => met.has(g))) return state;
      if (state.learner.completed.has(action.lessonId)) return state; // idempotent
      const completed = new Set(state.learner.completed);
      completed.add(action.lessonId);
      return { ...state, learner: { ...state.learner, completed } };
    }

    case 'toggleSandbox': {
      const next = action.sandbox ?? !(state.learner.sandbox === true);
      return { ...state, learner: { ...state.learner, sandbox: next } };
    }

    default:
      return state; // unknown action ⇒ unchanged (SHELL-001)
  }
}

// ----------------------------------------------------------------------------
// unlocked — DELEGATE to content PROGRESS. A pure function of (curriculum,
// learner) with no hidden state; the Shell never reimplements the fold.
// ----------------------------------------------------------------------------
export function unlocked(curriculum: Curriculum, learner: LearnerState): Unlocked {
  return computeUnlocked(curriculum, learner);
}

// ----------------------------------------------------------------------------
// Persistence — versioned, serializable; hydrate NEVER throws (migrate/default).
// ----------------------------------------------------------------------------
export function persist(state: AppState): PersistBlob {
  const blob: PersistBlob = {
    version: PERSIST_VERSION,
    route: state.route,
    theme: state.theme,
    reducedMotion: state.reducedMotion,
    completed: Array.from(state.learner.completed).sort(),
  };
  if (state.learner.sandbox === true) blob.sandbox = true;
  return blob;
}

/**
 * Rebuild an AppState from an unknown/older/garbage blob. Migration-safe: every
 * field is validated and falls back individually; a newer-than-known version or
 * a non-object falls back wholesale. NEVER throws (SHELL-007/008).
 */
export function hydrate(blob: unknown): AppState {
  const def = defaultAppState();
  try {
    if (typeof blob !== 'object' || blob === null) return def;
    const o = blob as Record<string, unknown>;
    const version = typeof o.version === 'number' ? o.version : 0;
    if (version > PERSIST_VERSION) return def; // from the future ⇒ safe default

    // v0 (unversioned legacy) and v1 share this field layout; validate each.
    // A route persisted under the surface's old name still names a real page,
    // so migrate it rather than dropping the reader back to the default.
    const raw = renameWikiSurface(o.route);
    const route = isRoute(raw) ? raw : def.route;
    const theme = isTheme(o.theme) ? o.theme : def.theme;
    const reducedMotion = typeof o.reducedMotion === 'boolean' ? o.reducedMotion : def.reducedMotion;
    const completed = Array.isArray(o.completed)
      ? o.completed.filter((x): x is string => typeof x === 'string')
      : [];
    const learner: LearnerState = { completed: new Set(completed) };
    if (o.sandbox === true) (learner as { sandbox?: boolean }).sandbox = true;
    return { route, theme, reducedMotion, learner };
  } catch {
    return def; // defence in depth — hydrate never throws
  }
}

/** `{surface:'wiki'}` -> `{surface:'bible'}`. The surface was renamed when the
 *  instruction wiki became the Bible; anything else passes through untouched. */
function renameWikiSurface(x: unknown): unknown {
  if (typeof x !== 'object' || x === null) return x;
  const r = x as Record<string, unknown>;
  return r.surface === 'wiki' ? { ...r, surface: 'bible' } : x;
}

// ---- Structural guards (pure) ----------------------------------------------
export function isTheme(x: unknown): x is Theme {
  return x === 'light' || x === 'dark' || x === 'system';
}

export function isRunLink(x: unknown): x is RunLink {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.scenarioId === 'string' &&
    typeof r.seed === 'number' &&
    Number.isFinite(r.seed) &&
    Array.isArray(r.genomes) &&
    r.genomes.every((g) => typeof g === 'string')
  );
}

export function isRoute(x: unknown): x is Route {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  switch (r.surface) {
    case 'bible':
      return r.verb === undefined || typeof r.verb === 'string';
    case 'sandbox':
    case 'versus':
      return r.run === undefined || isRunLink(r.run);
    default:
      return false;
  }
}

// ----------------------------------------------------------------------------
// RunLink serialization — round-trips exactly (share URLs). genomes are encoded
// as JSON so arbitrary GeneScript text (incl. &, =, newlines) survives; the
// whole value is percent-encoded so it is a single safe query token.
// ----------------------------------------------------------------------------
export function serializeRunLink(link: RunLink): string {
  return [
    'scenario=' + encodeURIComponent(link.scenarioId),
    'seed=' + String(link.seed),
    'genomes=' + encodeURIComponent(JSON.stringify(link.genomes)),
  ].join('&');
}

/** Parse a serialized RunLink; returns null on any malformed input (no throw). */
export function parseRunLink(text: string): RunLink | null {
  try {
    const q = text.startsWith('?') ? text.slice(1) : text;
    const params = new Map<string, string>();
    for (const part of q.split('&')) {
      if (part.length === 0) continue;
      const i = part.indexOf('=');
      if (i < 0) continue;
      params.set(part.slice(0, i), part.slice(i + 1));
    }
    const scenarioRaw = params.get('scenario');
    const seedRaw = params.get('seed');
    const genomesRaw = params.get('genomes');
    if (scenarioRaw === undefined || seedRaw === undefined || genomesRaw === undefined) return null;
    const seed = Number(seedRaw);
    if (!Number.isFinite(seed) || !Number.isInteger(seed)) return null;
    const genomes = JSON.parse(decodeURIComponent(genomesRaw)) as unknown;
    if (!Array.isArray(genomes) || !genomes.every((g) => typeof g === 'string')) return null;
    return { scenarioId: decodeURIComponent(scenarioRaw), seed, genomes: genomes as string[] };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Route <-> URL path mapping (deep links). Pure and round-tripping (SHELL-002).
// ----------------------------------------------------------------------------
export function routeToPath(route: Route): string {
  switch (route.surface) {
    case 'bible':
      return route.verb !== undefined ? '/bible/' + encodeURIComponent(route.verb) : '/bible';
    case 'sandbox':
      return route.run !== undefined ? '/sandbox?' + serializeRunLink(route.run) : '/sandbox';
    case 'versus':
      return route.run !== undefined ? '/versus?' + serializeRunLink(route.run) : '/versus';
  }
}

/** Parse a path back to a Route; returns null for an unrecognized path. */
export function pathToRoute(path: string): Route | null {
  try {
    const qIdx = path.indexOf('?');
    const rawPath = qIdx < 0 ? path : path.slice(0, qIdx);
    const rawQuery = qIdx < 0 ? '' : path.slice(qIdx + 1);
    const segs = rawPath.split('/').filter((s) => s.length > 0);
    switch (segs[0]) {
      // `wiki` is the old name for this surface; keep the path working so
      // links people already have (or bookmarked) still land on the Bible.
      case 'bible':
      case 'wiki':
        return segs[1] !== undefined ? { surface: 'bible', verb: decodeURIComponent(segs[1]) } : { surface: 'bible' };
      case 'sandbox': {
        const run = rawQuery.length > 0 ? parseRunLink(rawQuery) : null;
        return run !== null ? { surface: 'sandbox', run } : { surface: 'sandbox' };
      }
      case 'versus': {
        const run = rawQuery.length > 0 ? parseRunLink(rawQuery) : null;
        return run !== null ? { surface: 'versus', run } : { surface: 'versus' };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Run controls — the Shell issues WORKER commands; it runs NO simulation
// (C-UI-VIEW, SHELL-011). This is a thin pure mapping onto the locked protocol;
// no run/tank state is ever held in AppState.
// ----------------------------------------------------------------------------
export function runControl(cmd: TankCommand, sessionId: SessionId): HostCommand {
  return tankCommandToHost(cmd, sessionId);
}

/**
 * The deterministic restore PLAN for a RunLink deep link (SHELL-009): the host
 * compiles each genome, then inits the scenario+seed and injects. The Shell
 * only produces the plan (identical for any viewer) — it compiles/simulates
 * nothing itself.
 */
export function runLinkPlan(link: RunLink): { scenarioId: string; seed: number; genomes: readonly string[] } {
  return { scenarioId: link.scenarioId, seed: link.seed, genomes: link.genomes.slice() };
}
