// Public engine API — Scenario config + defaults + the Engine facade over World.
// Ref: docs/spec/engine/systems/15-engine-api-and-scenarios.md.
import { World, type WorldConfig, type WorldSnapshot } from './world.ts';
import { classic32, buildSubset } from './isa.ts';
import { DEFAULT_RATES, type MutationRates } from './mutation.ts';
import { digest as statsDigest, type RunDigest } from './stats.ts';
import type { InstructionSet } from './runtime.ts';
import type { CreatureId } from './types.ts';

export interface Injection { atCycle: number; genome: Uint8Array; founderId?: number }
export interface RunDescriptor { engineVersion: string; scenario: Scenario; injections: Injection[]; cycles: number }
export interface Snapshot { engineVersion: string; scenario: Scenario; world: WorldSnapshot }

export type MalMode = 'first-fit' | 'better-fit' | 'random' | 'near-mother' | 'near-dx' | 'near-sp';
export interface SubsetSpec { base: 'classic32'; include: string[]; name?: string }
export interface Scenario {
  soupSize: number;
  instructionSet: 'classic32' | SubsetSpec;
  seed: number;
  slicer: { style: 'ran'; sizeDependent: boolean; slicePow: number; sliceSize: number };
  reaper: { threshold: number; reapRndProp?: number };
  limits: { minCellSize: number; searchLimitMult: number; movPropThrDiv: number; minTemplSize: number; maxCellSize: number; dropDead?: number };
  malMode: MalMode;
  mutation: { flaw: number; copy: number; cosmic: number; [k: string]: number };
}

export const DEFAULT_SCENARIO: Scenario = {
  soupSize: 60000,
  instructionSet: 'classic32',
  seed: 0,
  // S6: default sizeDependent:false (the shipped-experiment, size-selecting regime).
  slicer: { style: 'ran', sizeDependent: false, slicePow: 1, sliceSize: 25 },
  reaper: { threshold: 900, reapRndProp: 0 },
  limits: { minCellSize: 12, searchLimitMult: 5, movPropThrDiv: 0.7, minTemplSize: 1, maxCellSize: 4000 },
  malMode: 'first-fit',
  mutation: { flaw: 0, copy: 0, cosmic: 0 },
};

export function normalizeScenario(s: Partial<Scenario> = {}): Scenario {
  const d = DEFAULT_SCENARIO;
  const out: Scenario = {
    soupSize: s.soupSize ?? d.soupSize,
    instructionSet: s.instructionSet ?? d.instructionSet,
    seed: (s.seed ?? d.seed) >>> 0,
    slicer: { ...d.slicer, ...(s.slicer ?? {}) },
    reaper: { ...d.reaper, ...(s.reaper ?? {}) },
    limits: { ...d.limits, ...(s.limits ?? {}) },
    malMode: s.malMode ?? d.malMode,
    mutation: { ...d.mutation, ...(s.mutation ?? {}) },
  };
  if (!Number.isInteger(out.soupSize) || out.soupSize <= 0) throw new RangeError('soupSize must be a positive integer');
  if (out.limits.minCellSize < 1) throw new RangeError('minCellSize must be >= 1');
  if (out.soupSize < out.limits.maxCellSize) out.limits.maxCellSize = out.soupSize;
  return out;
}

function activeSetOf(s: Scenario): InstructionSet {
  if (s.instructionSet === 'classic32') return classic32;
  return buildSubset(s.instructionSet.name ?? 'subset', s.instructionSet.include);
}

function toWorldConfig(s: Scenario): WorldConfig {
  return {
    soupSize: s.soupSize,
    seed: s.seed,
    activeSet: activeSetOf(s),
    minCellSize: s.limits.minCellSize,
    maxCellSize: s.limits.maxCellSize,
    searchLimitMult: s.limits.searchLimitMult,
    sizeDependent: s.slicer.sizeDependent,
    slicePow: s.slicer.slicePow,
    sliceSize: s.slicer.sliceSize,
    reaperThreshold: s.reaper.threshold,
    rates: { ...DEFAULT_RATES, ...(s.mutation as Partial<MutationRates>) } as MutationRates,
  };
}

export interface LiveStats { cycles: number; population: number; genotypes: number; births: number; deaths: number; fullness: number }

export class Engine {
  static readonly version = '0.0.0-m0';
  scenario: Scenario;
  world: World;

  constructor(scenario: Partial<Scenario> = {}) {
    this.scenario = normalizeScenario(scenario);
    this.world = new World(toWorldConfig(this.scenario));
  }

  snapshot(): Snapshot { return { engineVersion: Engine.version, scenario: this.scenario, world: this.world.snapshot() }; }

  static restore(s: Snapshot): Engine {
    if (s.engineVersion !== Engine.version) throw new Error('VERSION_MISMATCH');
    const e = new Engine(s.scenario);
    e.world = World.fromSnapshot(toWorldConfig(e.scenario), s.world);
    return e;
  }

  static replay(desc: RunDescriptor): Engine {
    if (desc.engineVersion !== Engine.version) throw new Error('VERSION_MISMATCH');
    const e = new Engine(desc.scenario);
    for (const inj of [...desc.injections].sort((a, b) => a.atCycle - b.atCycle)) {
      if (inj.atCycle > e.cycles) e.run(inj.atCycle - e.cycles);
      e.inject(inj.genome, { founderId: inj.founderId ?? 0 });
    }
    if (desc.cycles > e.cycles) e.run(desc.cycles - e.cycles);
    return e;
  }

  digest(atCycle: number): RunDigest { return statsDigest(this.world, atCycle); }

  inject(genome: Uint8Array, opts?: { founderId?: number }): CreatureId {
    return this.world.spawn(genome, opts?.founderId ?? 0);
  }
  step(): void { this.world.step(); }
  run(nInstructions: number): void { this.world.run(nInstructions); }
  get cycles(): number { return this.world.cycles; }

  stats(): LiveStats {
    return {
      cycles: this.world.cycles,
      population: this.world.population(),
      genotypes: this.world.genotypeCount(),
      births: this.world.births,
      deaths: this.world.deaths,
      fullness: this.world.fullness(),
    };
  }
}

export { classic32, buildSubset } from './isa.ts';
export { World } from './world.ts';
