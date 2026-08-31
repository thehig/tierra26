// Turn an authored PlaygroundConfig (from a lesson block, a wiki scenario, or the sandbox)
// into the two things a worker session needs: a scenario to init and a compiled genome to
// inject. Ref starters resolve through the shipped content registry; scenario ids through
// a small preset table. Pure + deterministic.
import { compile } from '@tierra26/genescript/comp.ts';
import { classic32, buildSubset } from '@tierra26/engine/isa.ts';
import type { InstructionSet } from '@tierra26/engine/runtime.ts';
import type { Scenario } from '@tierra26/engine';
import { STARTERS } from '@tierra26/content/lessons.ts';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';

// Named scenario presets the lessons reference (soup size; mutation is design-off for now).
const SCENARIO_PRESETS: Record<string, Partial<Scenario>> = {
  'soup-small': { soupSize: 30000 },
  'soup-standard': { soupSize: 60000 },
};

export interface Boot {
  scenario: Partial<Scenario>;
  genome: Uint8Array;
}

function starterSource(cfg: PlaygroundConfig): string {
  const st = cfg.starter;
  if (st.kind === 'genescript') return st.source;
  return STARTERS[st.id]?.source ?? '';
}

function activeSet(cfg: PlaygroundConfig): InstructionSet {
  if (cfg.subset.kind === 'subset' && cfg.subset.verbs.length > 0) {
    return buildSubset(cfg.subset.name ?? 'lesson', [...cfg.subset.verbs]);
  }
  return classic32;
}

export function resolvePlaygroundBoot(cfg: PlaygroundConfig): Boot {
  const genome = compile(starterSource(cfg), activeSet(cfg)).bytes;
  const preset = typeof cfg.scenario === 'string' ? (SCENARIO_PRESETS[cfg.scenario] ?? {}) : (cfg.scenario ?? {});
  return {
    scenario: { ...preset, seed: cfg.seed, mutation: { flaw: 0, copy: 0, cosmic: 0 } },
    genome,
  };
}

export const SANDBOX_STARTER = 'ancestor';
