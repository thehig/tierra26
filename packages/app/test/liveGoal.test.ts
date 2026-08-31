import { describe, it, expect } from 'vitest';
import { liveGoalStatus } from '../src/goal/liveGoal.ts';
import type { Goal } from '@tierra26/content/types.ts';

const frame = (over: Record<string, number> = {}, sizeHist: { key: number; count: number }[] = []) =>
  ({
    cycles: over.cycles ?? 0,
    stats: { cycles: over.cycles ?? 0, population: over.population ?? 0, genotypes: over.genotypes ?? 1, births: over.births ?? 0, deaths: 0, fullness: 0, avgSize: 0, generations: 0 },
    sizeHist: sizeHist.map((b) => ({ key: b.key, label: String(b.key), count: b.count })),
  }) as any;

const goal = (kind: string, params: Record<string, number>): Goal =>
  ({ id: 'g', kind, params, tier: 'required', title: 't' }) as any;

describe('live goal status', () => {
  it('null frame → not passed, no crash', () => {
    expect(liveGoalStatus(goal('replicates', { within: 5000 }), null).passed).toBe(false);
  });

  it('replicates counts daughters as births − founders', () => {
    // 1 founder, 1 birth event = just the founder → 0 daughters, not passed
    expect(liveGoalStatus(goal('replicates', {}), frame({ births: 1 }), 1)).toMatchObject({ passed: false, measured: 0 });
    // 3 births with 1 founder → 2 daughters → passed
    expect(liveGoalStatus(goal('replicates', {}), frame({ births: 3 }), 1)).toMatchObject({ passed: true, measured: 2 });
  });

  it('reach-pop compares live population', () => {
    expect(liveGoalStatus(goal('reach-pop', { population: 10 }), frame({ population: 7 })).passed).toBe(false);
    expect(liveGoalStatus(goal('reach-pop', { population: 10 }), frame({ population: 12 })).passed).toBe(true);
  });

  it('shrink-genome passes when a live genome is below the size threshold', () => {
    const g = goal('shrink-genome', { size: 60 });
    expect(liveGoalStatus(g, frame({}, [{ key: 80, count: 3 }])).passed).toBe(false);
    expect(liveGoalStatus(g, frame({}, [{ key: 45, count: 1 }, { key: 80, count: 2 }]))).toMatchObject({ passed: true, measured: 45 });
  });

  it('survive needs a living lineage past the horizon', () => {
    const g = goal('survive', { cycles: 1000 });
    expect(liveGoalStatus(g, frame({ cycles: 1200, population: 0 })).passed).toBe(false);
    expect(liveGoalStatus(g, frame({ cycles: 1200, population: 5 })).passed).toBe(true);
  });
});
