import { describe, it, expect } from 'vitest';
import { resolvePlaygroundBoot } from '../src/playground/resolve.ts';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';

describe('playground boot resolver', () => {
  it('compiles an inline genescript starter and applies the scenario preset + seed', () => {
    const boot = resolvePlaygroundBoot({
      scenario: 'soup-small', seed: 3,
      starter: { kind: 'genescript', source: ANCESTOR_GS }, subset: { kind: 'classic32' },
    } as any);
    expect(boot.genome.length).toBeGreaterThan(0);
    expect(boot.scenario.seed).toBe(3);
    expect(boot.scenario.soupSize).toBe(30000);
  });

  it('resolves a ref starter through the shipped content registry', () => {
    const boot = resolvePlaygroundBoot({
      scenario: 'soup-standard', seed: 1,
      starter: { kind: 'ref', id: 'ancestor' }, subset: { kind: 'classic32' },
    } as any);
    expect(boot.genome.length).toBe(80); // the ancestor compiles to 80 bytes
    expect(boot.scenario.soupSize).toBe(60000);
  });

  it('is deterministic', () => {
    const cfg = { scenario: 'soup-small', seed: 7, starter: { kind: 'ref', id: 'ancestor' }, subset: { kind: 'classic32' } } as any;
    expect([...resolvePlaygroundBoot(cfg).genome]).toEqual([...resolvePlaygroundBoot(cfg).genome]);
  });
});
