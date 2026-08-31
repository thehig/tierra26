// [02] PLAY — the playground config ⇄ engine bridge (data + behavior; no rendering).
// A PlaygroundConfig is a tiny, serializable recipe that fully determines a deterministic
// run (C-CON-DET). This module resolves it to a real @tierra26/engine instance, drives that
// engine with a controls contract, streams the engine's ObservationFrame [13], and proves
// the config is replay-equivalent to a RunDescriptor. It owns NO pixels and references NO
// DOM/host global (C-CON, PLAY-013): pure data + logic, drivable by any UI.
//
// --experimental-strip-types: no parameter properties, enums, decorators, or namespaces.
import { Engine, normalizeScenario, classic32, buildSubset } from '../../engine/src/index.ts';
import type { Scenario, SubsetSpec, RunDescriptor } from '../../engine/src/index.ts';
import { observe, makeTank } from '../../engine/src/stats.ts';
import type { ObservationFrame, TankView } from '../../engine/src/stats.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';
import { compile } from '../../genescript/src/comp.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { parse } from '../../genescript/src/gs.ts';
import { verbToMnemonic } from '../../genescript/src/vocab.ts';
import { hasErrors } from '../../genescript/src/types.ts';
import type { Diagnostic as GsDiagnostic } from '../../genescript/src/types.ts';
import type {
  PlaygroundConfig,
  NormalizedPlayground,
  GenomeSource,
  ActiveSubset,
  GoalSpec,
  GoalStatus,
  DisplayOptions,
  SourceMappedGenome,
  SourceMapEntry,
  InjectResult,
  SpeedLevel,
  PanelId,
  SpotlightSpec,
} from './types.ts';

// ---- module constants (NO module-level mutable state — PLAY-012) --------------
// The founder is injected at cycle 0 with a stable founder id (census only; never
// perturbs the soup/CPU, so it does not affect the deterministic frame stream).
const FOUNDER_ID = 1;
// The observation cadence is presentation (spec §9.1): topK + tank dims are documented
// defaults, held out of the RunDescriptor recipe entirely.
export const OBS = { topK: 16, width: 64, height: 48 } as const;
// A default "run to end" budget when neither cfg.cycles nor a goal window is given.
const DEFAULT_CYCLES = 1000;

// A tiny built-in scenario registry for string ids (real ids are resolved by [01]).
// The shipped-lesson soups (soup-small/soup-standard/soup-evolve) mirror the app's playground
// presets (packages/app/src/playground/resolve.ts) so the content bridge and the worker agree:
// design-phase soups run mutation-off; the emergence "evolve" soup turns copy/cosmic mutation on.
const SCENARIOS: Readonly<Record<string, Partial<Scenario>>> = {
  default: {},
  small: { soupSize: 8000 },
  'soup-small': { soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } },
  'soup-standard': { soupSize: 60000, mutation: { flaw: 0, copy: 0, cosmic: 0 } },
  'soup-evolve': { soupSize: 60000, mutation: { flaw: 0, copy: 200, cosmic: 4000 } },
};

// ---- a typed, kid-friendly failure carrying compile/subset diagnostics --------
export class PlaygroundError extends Error {
  diagnostics: readonly GsDiagnostic[];
  constructor(message: string, diagnostics: readonly GsDiagnostic[]) {
    super(message);
    this.name = 'PlaygroundError';
    this.diagnostics = diagnostics;
  }
}

// ---- subset resolution --------------------------------------------------------
// ActiveSubset carries GeneScript verb names (gene names like "grow-a") or, tolerantly,
// engine mnemonics; both resolve to canonical mnemonics for buildSubset / SubsetSpec.
function toMnemonic(nameOrVerb: string): string {
  return verbToMnemonic(nameOrVerb) ?? nameOrVerb;
}

function resolveSubset(subset: ActiveSubset): { set: InstructionSet; spec: 'classic32' | SubsetSpec } {
  if (subset.kind === 'classic32') return { set: classic32, spec: 'classic32' };
  const name = subset.name ?? 'subset';
  const mnemonics = subset.verbs.map(toMnemonic);
  return { set: buildSubset(name, mnemonics), spec: { base: 'classic32', include: mnemonics, name } };
}

function resolveScenarioBase(scenario: string | Partial<Scenario>): Partial<Scenario> {
  if (typeof scenario !== 'string') return scenario;
  const found = SCENARIOS[scenario];
  if (!found) {
    throw new PlaygroundError(
      `We couldn't find a world called "${scenario}". Pick one of the built-in worlds, or describe your own.`,
      [],
    );
  }
  return found;
}

// ---- genome resolution + source mapping --------------------------------------
function resolveGenomeSource(src: GenomeSource): string {
  if (src.kind === 'genescript') return src.source;
  // Named refs are resolved by [01]/[03]; PLAY keeps no registry of its own.
  throw new PlaygroundError(
    `This playground points at a saved creature ("${src.id}") that isn't available here yet.`,
    [],
  );
}

// Compile authored GeneScript under a subset → a source-mapped genome (line ↔ byte).
// Throws a kid-friendly PlaygroundError if it won't compile/load (C-CON-COMPILES).
function compileAuthored(source: string, set: InstructionSet, what: string): SourceMappedGenome {
  const result = compile(source, set);
  if (hasErrors(result.diagnostics)) {
    throw new PlaygroundError(`The ${what} doesn't work under this puzzle's instructions yet.`, result.diagnostics);
  }
  const stmts = parse(source).statements;
  const map: SourceMapEntry[] = result.sourceMap.ranges.map((r) => ({
    line: stmts[r.stmt]?.loc.line ?? 1,
    byteStart: r.start,
    byteEnd: r.end,
  }));
  return { source, bytes: result.bytes, map };
}

// Peek-under-hood for an edited/evolved genome that has NO authored source: disassemble
// the bytes (best-effort, total) and tile a line ↔ byte map (GeneScript §5).
export function sourceMappedGenome(bytes: Uint8Array, set: InstructionSet): SourceMappedGenome {
  const dis = disassemble(bytes, set);
  const map: SourceMapEntry[] = dis.lines.map((l, i) => ({ line: i + 1, byteStart: l.bytes[0], byteEnd: l.bytes[1] }));
  return { source: dis.source, bytes: Uint8Array.from(bytes), map };
}

// ---- display defaults ---------------------------------------------------------
const DEFAULT_PANELS: readonly PanelId[] = ['soup', 'registers', 'code', 'stats'];
function fillDisplay(display: DisplayOptions | undefined): DisplayOptions {
  return {
    panels: display?.panels ?? DEFAULT_PANELS,
    speedDefault: display?.speedDefault ?? 'normal',
    spotlight: display?.spotlight ?? {},
  };
}

// ---- normalize: refs resolved, subset resolved, starter compiled & verified ---
export function normalizePlayground(cfg: PlaygroundConfig): NormalizedPlayground {
  const { set, spec } = resolveSubset(cfg.subset);
  const base = resolveScenarioBase(cfg.scenario);
  // seed + subset are authoritative parts of the recipe (C-CON-DET / C-CON-SUBSET).
  const scenario = normalizeScenario({ ...base, seed: cfg.seed, instructionSet: spec });

  const starter = compileAuthored(resolveGenomeSource(cfg.starter), set, 'starter');
  // C-CON-COMPILES for EVERY variant, up front — fail loudly, not at selection time.
  for (const v of cfg.variants ?? []) {
    compileAuthored(resolveGenomeSource(v.starter), set, `"${v.label}" variant`);
  }

  return {
    config: cfg,
    scenario,
    subset: set,
    starter,
    goal: cfg.goal,
    display: fillDisplay(cfg.display),
  };
}

// ---- the reproducibility bridge: a PlaygroundConfig IS a RunDescriptor ---------
function goalWindow(goal: GoalSpec | undefined): number | undefined {
  if (!goal) return undefined;
  return goal.cycles ?? goal.params.within ?? goal.params.by ?? goal.params.cycles;
}

export function toRunDescriptor(norm: NormalizedPlayground): RunDescriptor {
  const cycles = norm.config.cycles ?? goalWindow(norm.goal) ?? DEFAULT_CYCLES;
  return {
    engineVersion: Engine.version,
    scenario: norm.scenario, // normalized, defaults-filled, subset-carrying (display is NOT here)
    injections: [{ atCycle: 0, genome: norm.starter.bytes, founderId: FOUNDER_ID }],
    cycles,
  };
}

// ---- serialize / deserialize (pure JSON data; stable + round-tripping) --------
export function serializeConfig(cfg: PlaygroundConfig): string {
  return JSON.stringify(cfg);
}
export function deserializeConfig(s: string): PlaygroundConfig {
  return JSON.parse(s) as PlaygroundConfig;
}

// Smallest LIVE genome size in the soup (matches goal.ts minLiveGenomeSize — the same "smallest
// live descendant" reading spec 06 §4.2 uses for shrink-genome). 0 when the soup is empty.
function minLiveGenomeSize(e: Engine): number {
  let min = Infinity;
  for (const c of e.world.creatures.values()) if (c.size < min) min = c.size;
  return min === Infinity ? 0 : min;
}

// ---- live goal evaluation (deterministic per seed; a pure fn of engine stats) --
interface Countable {
  cycles: number;
  population: number;
  genotypes: number;
  births: number;
  deaths: number;
  minLiveSize: number; // smallest live genome size in the soup at this cycle (shrink-genome)
}
function evaluateGoal(goal: GoalSpec, s: Countable): GoalStatus {
  const p = goal.params;
  let measured = 0;
  let passed = false;
  let progress = 0;
  switch (goal.kind) {
    case 'reach-pop': {
      const target = p.population ?? 1;
      measured = s.population;
      passed = measured >= target;
      progress = target > 0 ? Math.min(1, measured / target) : 1;
      break;
    }
    case 'replicates': {
      const need = p.count ?? 1;
      measured = Math.max(0, s.births - 1); // the founder's own birth is not a daughter
      passed = measured >= need;
      progress = need > 0 ? Math.min(1, measured / need) : 1;
      break;
    }
    case 'diversity': {
      const need = p.count ?? 1;
      measured = s.genotypes;
      passed = measured >= need;
      progress = need > 0 ? Math.min(1, measured / need) : 1;
      break;
    }
    case 'survive': {
      const need = p.cycles ?? 0;
      measured = s.cycles;
      passed = s.population > 0 && measured >= need;
      progress = need > 0 ? Math.min(1, measured / need) : (s.population > 0 ? 1 : 0);
      break;
    }
    case 'out-populate': {
      // A single-config playground has no rival lineage, so this cannot be decided live here —
      // out-populate is a comparative Versus goal ([06] rankVersus / checkOutPopulate runs both
      // genomes in one shared soup). We surface this lineage's live population as `measured` and
      // stay inconclusive (passed:false) rather than fake a verdict.
      measured = s.population;
      passed = false;
      progress = 0;
      break;
    }
    case 'shrink-genome': {
      // Live status from the engine's smallest live genome size (spec 06 §4.2). Passes once some
      // living creature is under the byte threshold; guarded on a non-empty soup so an empty tank
      // (minLiveSize 0) never spuriously passes.
      const target = p.size ?? 1;
      measured = s.minLiveSize;
      passed = s.population > 0 && measured < target;
      progress = passed ? 1 : measured > 0 && target > 0 ? Math.min(1, target / measured) : 0;
      break;
    }
    default: {
      measured = 0;
      passed = false;
      progress = 0;
    }
  }
  return { goalId: goal.id, kind: goal.kind, passed, measured, atCycle: s.cycles, progress };
}

// ---- the running playground: one owned Engine + read-only exposed state -------
export type PlaygroundStatus = 'idle' | 'running' | 'paused' | 'ended';

export interface PlaygroundState {
  readonly config: PlaygroundConfig;
  readonly status: PlaygroundStatus;
  readonly cycle: number;
  readonly frame: ObservationFrame;
  readonly goal?: GoalStatus;
  readonly genome: SourceMappedGenome;
  readonly activeVariantId?: string;
}

export interface Playground {
  readonly state: PlaygroundState;
  readonly normalized: NormalizedPlayground;
  stepInstruction(): void;
  runTo(cycle: number): void;
  reset(): void;
  selectVariant(variantId: string): void;
  injectEdited(source: string): InjectResult;
  play(): void;
  pause(): void;
  setSpeed(level: SpeedLevel): void;
  setPanels(panels: readonly PanelId[]): void;
  setSpotlight(spotlight: SpotlightSpec): void;
}

export function createPlayground(cfg: PlaygroundConfig): Playground {
  const normalized = normalizePlayground(cfg);

  // The single owned engine + the live, mutable genome the peek-under-hood follows.
  // Everything lives in this closure — two playgrounds share nothing (PLAY-012).
  let engine: Engine;
  let starter: SourceMappedGenome = normalized.starter;
  let genome: SourceMappedGenome = normalized.starter;
  let activeVariantId: string | undefined;
  let display: DisplayOptions = normalized.display;
  let status: PlaygroundStatus = 'idle';

  function build(): void {
    engine = new Engine(normalized.scenario);
    engine.inject(starter.bytes, { founderId: FOUNDER_ID });
    genome = starter;
    status = 'paused';
  }

  function observeFrame(): ObservationFrame {
    // A fresh tank per frame so each exposed frame is its own immutable snapshot
    // (never aliased to the next refresh) — PLAY-STATE-READONLY.
    const tank: TankView = makeTank(OBS.width, OBS.height, engine.scenario.soupSize);
    return observe(engine.world, OBS.topK, tank);
  }

  function currentGoal(): GoalStatus | undefined {
    if (!normalized.goal) return undefined;
    const s = engine.stats();
    return evaluateGoal(normalized.goal, { ...s, minLiveSize: minLiveGenomeSize(engine) });
  }

  build();

  const pg: Playground = {
    get state(): PlaygroundState {
      const st: PlaygroundState = {
        config: normalized.config,
        status,
        cycle: engine.cycles,
        frame: observeFrame(),
        goal: currentGoal(),
        genome,
        activeVariantId,
      };
      return Object.freeze(st);
    },
    normalized,

    stepInstruction(): void {
      if (engine.stats().population === 0) {
        status = 'ended';
        return;
      }
      engine.step(); // exactly +1 instruction ([15] §4.3) → PLAY-004
      status = engine.stats().population === 0 ? 'ended' : status;
    },

    runTo(cycle: number): void {
      const delta = cycle - engine.cycles;
      if (delta <= 0) return;
      if (engine.stats().population === 0) {
        status = 'ended';
        return;
      }
      engine.run(delta); // whole-slice budget → cycle lands in [N, N+maxSliceSize) (PLAY-004)
      status = engine.stats().population === 0 ? 'ended' : status;
    },

    reset(): void {
      // EXACT initial state: a fresh engine + fresh inject (never a rewind) — PLAY-003.
      build();
    },

    selectVariant(variantId: string): void {
      const v = (normalized.config.variants ?? []).find((x) => x.id === variantId);
      if (!v) throw new PlaygroundError(`There's no "${variantId}" to try in this playground.`, []);
      // Recompile under the SAME subset and rebuild deterministically (PLAY-006).
      starter = compileAuthored(resolveGenomeSource(v.starter), normalized.subset, `"${v.label}" variant`);
      activeVariantId = variantId;
      build();
    },

    injectEdited(source: string): InjectResult {
      const result = compile(source, normalized.subset);
      if (hasErrors(result.diagnostics)) {
        // Engine untouched; kid-friendly diagnostics surfaced (C-CON-COMPILES / C-CON-SUBSET).
        return { ok: false, diagnostics: result.diagnostics };
      }
      const creatureId = engine.inject(result.bytes, { founderId: FOUNDER_ID });
      if (creatureId < 0) {
        return {
          ok: false,
          diagnostics: [
            {
              code: 'parse-error',
              severity: 'error',
              span: { line: 1, colStart: 1, colEnd: 1, nodeId: 's0' },
              message: "The soup is too full to fit your creature right now — let it thin out and try again.",
            },
          ],
        };
      }
      const stmts = parse(source).statements;
      const map: SourceMapEntry[] = result.sourceMap.ranges.map((r) => ({
        line: stmts[r.stmt]?.loc.line ?? 1,
        byteStart: r.start,
        byteEnd: r.end,
      }));
      genome = { source, bytes: result.bytes, map }; // peek-under-hood now follows the edit
      return { ok: true, creatureId, genome };
    },

    // ---- presentational controls: NEVER touch the engine (PLAY-010) ----
    play(): void {
      status = engine.stats().population === 0 ? 'ended' : 'running';
    },
    pause(): void {
      if (status === 'running') status = 'paused';
    },
    setSpeed(level: SpeedLevel): void {
      display = { ...display, speedDefault: level };
    },
    setPanels(panels: readonly PanelId[]): void {
      display = { ...display, panels };
    },
    setSpotlight(spotlight: SpotlightSpec): void {
      display = { ...display, spotlight };
    },
  };

  return pg;
}
