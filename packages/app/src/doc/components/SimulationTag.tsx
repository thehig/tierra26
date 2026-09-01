// <Simulation> — the real, worker-driven soup, for population-scale lessons.
//
// Distinct from <EntityDesigner> on purpose. The designer runs one creature on
// the main thread so a learner can step it a tick at a time; this runs the full
// engine in a Web Worker with the tank, charts and inspector, and never
// simulates on the main thread (UIINV-VIEW).
import { useMemo } from 'react';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';
import { STARTERS } from '@tierra26/content/lessons.ts';
import { LazyPlayground } from '../../reader/LazyPlayground.tsx';
import { attr, type DocComponentProps } from '../DocRenderer.tsx';

export function SimulationTag({ node, ctx }: DocComponentProps) {
  const scenario = attr.str(node, 'scenario', 'soup-small')!;
  const seed = attr.int(node, 'seed', 1);
  const starterId = attr.str(node, 'starter', 'ancestor')!;
  const cycles = attr.int(node, 'cycles', 0);
  const editable = attr.bool(node, 'editable');

  // useSession's effect deps are OBJECT IDENTITY on the boot it derives from this
  // config, so an unmemoised literal here would tear down and recreate the worker
  // on every render.
  const config = useMemo<PlaygroundConfig>(() => {
    const starter = STARTERS[starterId];
    return {
      scenario,
      seed,
      starter: starter ? { kind: 'genescript', source: starter.source } : { kind: 'ref', id: starterId },
      subset: { kind: 'classic32' },
      ...(cycles > 0 ? { cycles } : {}),
    };
  }, [scenario, seed, starterId, cycles]);

  return <LazyPlayground config={config} dark={ctx.dark} editable={editable} />;
}
