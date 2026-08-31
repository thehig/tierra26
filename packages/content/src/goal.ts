// Goals, Challenges & Assessment (GOAL) — the deterministic, engine-backed success-condition
// checker for lessons & playgrounds. Owns the checker (checkGoal), the per-lesson roll-up
// (checkLesson), the pure learner progress record (recordOutcome/isLessonComplete), the Versus
// win-condition ranking (rankVersus), and authoring validation (validateGoal).
//
// Ref: docs/spec/content/06-goals-challenges-and-assessment.md (§2 model + checker I/O,
// §4 rules/hints/completion/validation, §6 determinism & edge cases, §8 GOAL-001..012).
//
// CONTRACT: a goal check is a PURE function of (scenario, seed, genome, goal). It builds a FRESH
// engine, injects the genome(s), runs the REAL simulation to a bounded budget, and reads only the
// engine's INTEGER observables (births/population/genotypes/live genome size). No Math.random, no
// Date.now, no float on the verdict path — same inputs ⇒ byte-identical GoalResult (C-CON-DET).
// Anti-cheese: a goal passes only when the real run exhibits the outcome, never by source/AST
// inspection (GOAL-007).
//
// NOTE: `--experimental-strip-types` rejects TS parameter properties/enums/decorators/namespaces —
// this module uses plain functions, interfaces, and one plain class. Types are `import type`.

import { Engine } from '../../engine/src/index.ts';
import type { Scenario, LiveStats } from '../../engine/src/index.ts';
import type {
  Goal,
  GoalKind,
  GoalTier,
  GoalResult,
  GoalHint,
  Int,
} from './types.ts';

// ---------------------------------------------------------------------------
// Checker I/O (mirrors spec §2 — kept exported from goal.ts)
// ---------------------------------------------------------------------------

// Everything needed to build the deterministic run. `scenario` is a Partial (the Engine
// normalizes it); `seed` overrides scenario.seed so the run is keyed on it (C-CON-DET).
export interface CheckContext {
  scenario: Partial<Scenario>;
  seed: Int;
  genome: Uint8Array;
  maxCycles: Int; // hard cap on cycles the checker will run (bounds every check)
  rivalGenome?: Uint8Array; // present only for 'out-populate' / Versus (§4.6)
  genomeB?: Uint8Array; // alias for the rival genome (accepted alongside rivalGenome)
}

// Per-lesson roll-up split by tier for the completion rule (§4.4).
export interface LessonGoalOutcome {
  lessonId: string;
  results: GoalResult[]; // one per goal, in authored order (deterministic)
  requiredMet: boolean; // ALL required goals passed → lesson complete
  bonusMet: number; // count of passed bonus goals (tracked, never blocks)
}

// The learner's pure-data progress — serializable, no engine state, no floats.
export interface GoalRecord {
  metGoalIds: readonly string[]; // stable-sorted, dedup'd set of passed goal ids
  completedLessonIds: readonly string[]; // lessons whose required goals are all met
}

// A single authoring/validation issue (empty array from validateGoal ⇒ valid).
export interface GoalDiagnostic {
  code: string;
  message: string;
}

// Thrown by assertParamsValid on an invalid goal (never silently clamps — §4.5).
export class GoalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoalError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Validation (§4.5) — reject impossible / unsatisfiable goals; never clamp.
// ---------------------------------------------------------------------------

function isPosInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// The param each kind REQUIRES to be a positive integer (its primary threshold/deadline).
function requiredParamOf(kind: GoalKind): keyof Goal['params'] {
  switch (kind) {
    case 'replicates':
      return 'within';
    case 'reach-pop':
      return 'population';
    case 'shrink-genome':
      return 'size';
    case 'survive':
      return 'cycles';
    case 'diversity':
      return 'count';
    case 'out-populate':
      return 'by';
  }
}

// Non-throwing authoring validation. Returns [] when the goal is valid; otherwise a list of
// diagnostics. `ctx.mutation` (0 = breed-true) enables the soft cross-layer diversity check (§4.5).
export function validateGoal(goal: Goal, ctx?: { mutation: number }): GoalDiagnostic[] {
  const out: GoalDiagnostic[] = [];
  const p = goal.params ?? {};

  // 1) the kind-required primary param must be present and a positive integer.
  const key = requiredParamOf(goal.kind);
  const primary = p[key];
  if (primary === undefined || primary === null) {
    out.push({ code: 'missing-param', message: `A ${goal.kind} goal needs a "${String(key)}" value.` });
  } else if (!isPosInt(primary)) {
    out.push({
      code: 'bad-deadline',
      message: `The "${String(key)}" value must be a whole number greater than 0 (got ${String(primary)}).`,
    });
  }

  // 2) any other supplied deadline/threshold that is present must be a positive integer.
  for (const k of ['within', 'count', 'population', 'size', 'cycles', 'by'] as const) {
    if (k === key) continue;
    const v = p[k];
    if (v !== undefined && !isPosInt(v)) {
      out.push({
        code: 'bad-deadline',
        message: `The "${k}" value must be a whole number greater than 0 (got ${String(v)}).`,
      });
    }
  }
  if (goal.cycles !== undefined && !isPosInt(goal.cycles)) {
    out.push({
      code: 'bad-deadline',
      message: `The run budget "cycles" must be a whole number greater than 0 (got ${String(goal.cycles)}).`,
    });
  }

  // 3) out-populate is comparative — a rival genome is supplied at check time, not here; that is
  //    enforced in checkGoal/rankVersus (§4.6).

  // 4) (soft, cross-layer) a REQUIRED diversity goal in a mutation==0 scenario is unwinnable under
  //    breed-true (only one genotype can ever exist) — reject so it never ships (§4.5, §6).
  if (goal.kind === 'diversity' && goal.tier === 'required' && ctx && ctx.mutation === 0) {
    const need = p.count ?? 2;
    if (need > 1) {
      out.push({
        code: 'unwinnable-diversity',
        message:
          'A required diversity goal cannot be met with mutation turned off — only one kind of creature can ever appear. Turn mutation on or make this a bonus goal.',
      });
    }
  }

  return out;
}

// Throwing form used on the checker's fate path (§4.1). Validates the params (ignores the soft
// mutation check, which needs scenario context the checker does not gate on).
function assertParamsValid(goal: Goal): void {
  const ds = validateGoal(goal).filter((d) => d.code === 'missing-param' || d.code === 'bad-deadline');
  if (ds.length > 0) throw new GoalError(ds[0]!.code, ds[0]!.message);
}

// ---------------------------------------------------------------------------
// Failure hints (§4.3) — kid-facing, teaching, sourced from the RUN's observables.
// Every message is a static string with integer interpolation only → byte-identical per run.
// ---------------------------------------------------------------------------

function hintNeverDivided(): GoalHint {
  return {
    code: 'never-divided',
    message:
      'Your creature is alive, but it never made a baby — it never called divide. Add divide once the copy is finished!',
    suggestion: 'Add divide right after your copy loop finishes.',
    hoverTerms: ['divide'],
    teaches: true,
  };
}

function hintCopyUnfinished(): GoalHint {
  return {
    code: 'copy-unfinished',
    message:
      "You started making a baby but the copy never finished, so divide didn't happen. Make sure your copy loop copies the whole creature.",
    suggestion: 'Check that your copy loop runs until the whole creature is copied.',
    hoverTerms: ['divide'],
    teaches: true,
  };
}

function hintDiedBeforeBreeding(): GoalHint {
  return {
    code: 'died-before-breeding',
    message:
      'Your creature died before it could make a baby. Try to reproduce sooner, before it runs out of room.',
    suggestion: 'Make your copy loop shorter so a baby is made sooner.',
    hoverTerms: ['divide'],
    teaches: true,
  };
}

function hintNotEnoughBabies(measured: Int, need: Int): GoalHint {
  return {
    code: 'not-enough-babies',
    message: `You reached ${measured} creatures but needed ${need}. Can your babies make babies too?`,
    suggestion: 'Make sure your babies can copy themselves, not just the first creature.',
    hoverTerms: ['population'],
    teaches: true,
  };
}

function hintTooBig(measured: Int, size: Int): GoalHint {
  return {
    code: 'too-big',
    message: `Your smallest creature is ${measured} bytes — the goal wants under ${size}. Try removing steps it doesn't need.`,
    suggestion: 'Look for instructions your creature can do without and delete them.',
    hoverTerms: ['bytes'],
    teaches: true,
  };
}

function hintDiedEarly(measured: Int, cycles: Int): GoalHint {
  return {
    code: 'died-early',
    message: `Your creatures lasted ${measured} cycles but needed ${cycles}. Something is killing them early — check they don't run off the end.`,
    suggestion: 'Give your creature room to live and make sure it does not run off the end of its code.',
    hoverTerms: ['cycles'],
    teaches: true,
  };
}

function hintNoVariety(measured: Int): GoalHint {
  return {
    code: 'no-variety',
    message: `Only ${measured} kind(s) of creature appeared. Diversity needs mutation turned on and creatures that survive long enough to change.`,
    suggestion: 'Turn mutation on and let creatures live long enough to change.',
    hoverTerms: ['mutation', 'genotype'],
    teaches: true,
  };
}

function hintOutNumbered(): GoalHint {
  return {
    code: 'out-numbered',
    message:
      'The rival ended with more creatures. Make yours copy faster or make smaller babies so more fit in the soup.',
    suggestion: 'Make your creature copy faster or smaller so more of yours fit in the soup.',
    hoverTerms: ['population'],
    teaches: true,
  };
}

// ---------------------------------------------------------------------------
// The checker (§4.1/§4.2) — build a fresh engine, run the real sim, read integers.
// ---------------------------------------------------------------------------

function buildEngine(ctx: CheckContext): Engine {
  return new Engine({ ...ctx.scenario, seed: ctx.seed });
}

function deadlineOf(goal: Goal): Int | undefined {
  const p = goal.params;
  switch (goal.kind) {
    case 'replicates':
    case 'reach-pop':
    case 'diversity':
      return p.within;
    case 'survive':
      return p.cycles;
    case 'out-populate':
      return p.by;
    case 'shrink-genome':
      return undefined; // no deadline: runs to goal.cycles ?? ctx.maxCycles
  }
}

// Bounded run budget: never unbounded (§4.1). min(deadline, maxCycles).
function budgetOf(goal: Goal, ctx: CheckContext): Int {
  const raw = goal.cycles ?? deadlineOf(goal) ?? ctx.maxCycles;
  return Math.min(raw, ctx.maxCycles);
}

// Advance the engine by exactly one whole slice (API-004 whole-slice boundary). `run(1)` targets
// cycles+1 and returns after the first slice that advances the counter — a fixed, deterministic
// per-slice sampling cadence (§4.1, open-question 1 resolution).
function stepSlice(e: Engine): void {
  e.run(1);
}

// Smallest LIVE genome size in the soup (§4.2 shrink-genome; open-question 3 → smallest live).
function minLiveGenomeSize(e: Engine): number {
  let min = Infinity;
  for (const c of e.world.creatures.values()) if (c.size < min) min = c.size;
  return min === Infinity ? 0 : min;
}

// Pick the replication-failure hint from the RUN's observables (§4.3), not the source.
function pickReplicationHint(e: Engine, founderId: number, baseDeaths: number): GoalHint {
  const pop = e.stats().population;
  const founder = e.world.creatures.get(founderId);
  if (pop === 0 || (founder === undefined && e.stats().deaths > baseDeaths)) {
    return hintDiedBeforeBreeding();
  }
  // A live creature that logged an execution error tried something (e.g. a divide that faulted at
  // the copy gate) but never produced a daughter.
  let anyError = false;
  for (const c of e.world.creatures.values()) if (c.errorCount > 0) { anyError = true; break; }
  if (anyError) return hintCopyUnfinished();
  return hintNeverDivided();
}

export function checkGoal(goal: Goal, ctx: CheckContext): GoalResult {
  assertParamsValid(goal); // §4.5 — throws GoalError; never clamps

  // out-populate is comparative — handled over one shared soup (§4.6).
  if (goal.kind === 'out-populate') return checkOutPopulate(goal, ctx);

  const e = buildEngine(ctx);
  const founderId = e.inject(ctx.genome, { founderId: 1 });
  const base: LiveStats = e.stats();
  const baseBirths = base.births; // the injected founder(s) already count as births
  const baseDeaths = base.deaths;
  const budget = budgetOf(goal, ctx);

  switch (goal.kind) {
    case 'replicates': {
      const need = goal.params.count ?? 1;
      let atCycle = e.cycles;
      while (e.cycles < budget && e.stats().population > 0) {
        stepSlice(e);
        if (e.stats().births - baseBirths >= need) {
          atCycle = e.cycles;
          break;
        }
        atCycle = e.cycles;
      }
      const measured = e.stats().births - baseBirths; // daughters produced (excludes the founder)
      const passed = measured >= need;
      return {
        goalId: goal.id,
        kind: goal.kind,
        passed,
        measured,
        atCycle,
        hint: passed ? undefined : pickReplicationHint(e, founderId, baseDeaths),
      };
    }

    case 'reach-pop': {
      const need = goal.params.population!;
      let maxPop = e.stats().population; // integer high-water mark (§4.2)
      let atCycle = e.cycles;
      if (maxPop >= need) {
        return { goalId: goal.id, kind: goal.kind, passed: true, measured: maxPop, atCycle };
      }
      while (e.cycles < budget && e.stats().population > 0) {
        stepSlice(e);
        const pop = e.stats().population;
        if (pop > maxPop) maxPop = pop;
        if (maxPop >= need) {
          atCycle = e.cycles;
          break;
        }
        atCycle = e.cycles;
      }
      const passed = maxPop >= need;
      return {
        goalId: goal.id,
        kind: goal.kind,
        passed,
        measured: maxPop,
        atCycle,
        hint: passed ? undefined : hintNotEnoughBabies(maxPop, need),
      };
    }

    case 'shrink-genome': {
      const size = goal.params.size!;
      let minSize = minLiveGenomeSize(e);
      let atCycle = e.cycles;
      while (e.cycles < budget && e.stats().population > 0) {
        stepSlice(e);
        const m = minLiveGenomeSize(e);
        if (m < minSize) minSize = m;
        atCycle = e.cycles;
        if (minSize < size) break;
      }
      const passed = minSize < size;
      return {
        goalId: goal.id,
        kind: goal.kind,
        passed,
        measured: minSize,
        atCycle,
        hint: passed ? undefined : hintTooBig(minSize, size),
      };
    }

    case 'survive': {
      const horizon = goal.params.cycles!;
      const cap = Math.min(horizon, budget);
      // measured = the cycle the lineage hit population 0, else the full horizon (§4.2).
      let deathCycle = -1;
      if (e.stats().population === 0) {
        deathCycle = e.cycles; // never established (e.g. inject failed) → died at cycle 0
      } else {
        while (e.cycles < cap) {
          stepSlice(e);
          if (e.stats().population === 0) {
            deathCycle = e.cycles;
            break;
          }
        }
      }
      const survived = deathCycle < 0;
      const measured = survived ? horizon : deathCycle;
      return {
        goalId: goal.id,
        kind: goal.kind,
        passed: survived,
        measured,
        atCycle: survived ? horizon : deathCycle,
        hint: survived ? undefined : hintDiedEarly(measured, horizon),
      };
    }

    case 'diversity': {
      const need = goal.params.count!;
      let maxGeno = e.stats().genotypes;
      let atCycle = e.cycles;
      while (e.cycles < budget && e.stats().population > 0) {
        stepSlice(e);
        const g = e.stats().genotypes;
        if (g > maxGeno) maxGeno = g;
        atCycle = e.cycles;
        if (maxGeno >= need) break;
      }
      const passed = maxGeno >= need;
      return {
        goalId: goal.id,
        kind: goal.kind,
        passed,
        measured: maxGeno,
        atCycle,
        hint: passed ? undefined : hintNoVariety(maxGeno),
      };
    }
  }
}

// out-populate as a GoalResult over a shared soup (§4.6). measured = this genome's live pop.
function checkOutPopulate(goal: Goal, ctx: CheckContext): GoalResult {
  const rival = ctx.rivalGenome ?? ctx.genomeB;
  if (rival === undefined) {
    throw new GoalError('missing-rival', 'An out-populate goal needs a rival genome in the CheckContext.');
  }
  const by = goal.params.by!;
  const cap = Math.min(by, ctx.maxCycles);
  const e = buildEngine(ctx);
  e.inject(ctx.genome, { founderId: 1 });
  e.inject(rival, { founderId: 2 });
  if (cap > 0) e.run(cap);
  const popA = e.world.founders[1]!;
  const popB = e.world.founders[2]!;
  const passed = popA > popB;
  return {
    goalId: goal.id,
    kind: goal.kind,
    passed,
    measured: popA,
    atCycle: e.cycles,
    hint: passed ? undefined : hintOutNumbered(),
  };
}

// ---------------------------------------------------------------------------
// Per-lesson roll-up (§4.4) — completion is driven by required goals only.
// ---------------------------------------------------------------------------

function tierOf(g: Goal): GoalTier {
  return g.tier ?? 'required';
}

export function checkLesson(
  lessonId: string,
  goals: Goal[],
  ctxOf: (g: Goal) => CheckContext,
): LessonGoalOutcome {
  const results: GoalResult[] = [];
  const byId = new Map<string, Goal>();
  for (const g of goals) {
    byId.set(g.id, g);
    results.push(checkGoal(g, ctxOf(g))); // authored order (deterministic)
  }
  let requiredMet = true;
  let bonusMet = 0;
  for (const r of results) {
    const g = byId.get(r.goalId)!;
    if (tierOf(g) === 'required') {
      if (!r.passed) requiredMet = false;
    } else if (r.passed) {
      bonusMet++;
    }
  }
  return { lessonId, results, requiredMet, bonusMet };
}

// ---------------------------------------------------------------------------
// The learner progress record (§4.4 / §6) — pure, stable-sorted, dedup'd, serializable.
// ---------------------------------------------------------------------------

function sortedDedup(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

export function recordOutcome(prev: GoalRecord, outcome: LessonGoalOutcome): GoalRecord {
  const met: string[] = [...prev.metGoalIds];
  for (const r of outcome.results) if (r.passed) met.push(r.goalId);
  const lessons: string[] = [...prev.completedLessonIds];
  if (outcome.requiredMet) lessons.push(outcome.lessonId);
  return {
    metGoalIds: sortedDedup(met),
    completedLessonIds: sortedDedup(lessons),
  };
}

export const EMPTY_RECORD: GoalRecord = { metGoalIds: [], completedLessonIds: [] };

export function isLessonComplete(rec: GoalRecord, lessonId: string): boolean {
  return rec.completedLessonIds.includes(lessonId);
}

// ---------------------------------------------------------------------------
// Versus win-condition (§4.6) — rank two genomes over ONE shared, seed-fixed soup.
// Deterministic for the same (scenario, a, b); an exact live-population tie → 'tie'.
// ---------------------------------------------------------------------------

export function rankVersus(
  scenario: Partial<Scenario>,
  a: Uint8Array,
  b: Uint8Array,
  opts: { kind: 'out-populate'; by: Int; seed?: Int },
): 'a' | 'b' | 'tie' {
  const e = new Engine(opts.seed !== undefined ? { ...scenario, seed: opts.seed } : scenario);
  e.inject(a, { founderId: 1 }); // canonical injection order: a then b (§6 Versus symmetry)
  e.inject(b, { founderId: 2 });
  if (opts.by > 0) e.run(opts.by);
  const popA = e.world.founders[1]!;
  const popB = e.world.founders[2]!;
  if (popA > popB) return 'a';
  if (popB > popA) return 'b';
  return 'tie';
}
