// Turn an authored PlaygroundConfig (from a lesson block, a wiki scenario, or the sandbox)
// into the two things a worker session needs: a scenario to init and a compiled genome to
// inject. Ref starters resolve through the shipped content registry; scenario ids through
// a small preset table. Pure + deterministic.
import { compile } from '@tierra26/genescript/comp.ts';
import { classic32, buildSubset } from '@tierra26/engine/isa.ts';
import type { InstructionSet } from '@tierra26/engine/runtime.ts';
import type { Scenario, Injection } from '@tierra26/engine';
import { STARTERS } from '@tierra26/content/lessons.ts';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';

// Named scenario presets the lessons reference. Design-phase soups run mutation-off; the
// emergence "evolve" soup turns copy/cosmic mutation on (the proven open-ended-evolution regime).
const SCENARIO_PRESETS: Record<string, Partial<Scenario>> = {
  'soup-small': { soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } },
  'soup-standard': { soupSize: 60000, mutation: { flaw: 0, copy: 0, cosmic: 0 } },
  'soup-evolve': { soupSize: 60000, mutation: { flaw: 0, copy: 200, cosmic: 4000 } },
};

export interface Boot {
  scenario: Partial<Scenario>;
  injections: Injection[];
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
    // The preset carries the mutation regime (design-off vs evolve-on); seed comes from the recipe.
    scenario: { ...preset, seed: cfg.seed },
    injections: [{ atCycle: 0, genome, founderId: 1 }],
  };
}

export const SANDBOX_STARTER = 'ancestor';
