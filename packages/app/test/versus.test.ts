import { describe, it, expect } from 'vitest';
import { normalizeScenario } from '@tierra26/engine';
import { buildDescriptor, toRunDescriptor } from '@tierra26/versus/runner.ts';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import type { MatchConfig } from '@tierra26/versus/types.ts';

const cfg = (): MatchConfig => ({
  scenario: normalizeScenario({ soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } }),
  seed: 1,
  players: [
    { founderId: 1, name: 'A', genome: ANCESTOR_GS },
    { founderId: 2, name: 'B', genome: ANCESTOR_GS },
  ],
  rules: { threshold: { kind: 'cycles', value: 200_000 }, tiebreakers: ['peak-population'] },
});

describe('versus arena binding', () => {
  it('a match descriptor derives cycle-0 injections for both founders', () => {
    const run = toRunDescriptor(buildDescriptor(cfg()));
    expect(run.injections.length).toBe(2);
    for (const inj of run.injections) expect(inj.atCycle).toBe(0);
    expect([...run.injections.map((i) => i.founderId)].sort()).toEqual([1, 2]);
  });

  it('the same config yields identical injections (deterministic recipe)', () => {
    const a = toRunDescriptor(buildDescriptor(cfg()));
    const b = toRunDescriptor(buildDescriptor(cfg()));
    expect(a.injections.map((i) => [...i.genome])).toEqual(b.injections.map((i) => [...i.genome]));
    expect(a.injections.map((i) => i.founderId)).toEqual(b.injections.map((i) => i.founderId));
  });
});
