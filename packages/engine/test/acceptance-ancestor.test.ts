// M0 ACCEPTANCE GATE — the canonical ancestor 0080aaa breeds true, saturates, and evolves
// under the reaper, bit-reproducibly. This is the milestone test of the whole engine core.
// Ref: M0-TECH-DESIGN §16.2; validation S11 (INT-ANCESTOR-GOLDEN).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC, ANCESTOR_0080AAA_META as META } from './fixtures/ancestor-0080aaa.ts';

function sterile(seed: number) {
  return new Engine({ seed, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
}

describe('M0 acceptance — ancestor 0080aaa', () => {
  it('breeds true under sterile conditions (exactly 1 genotype)', () => {
    const e = sterile(7);
    e.inject(ANC, { founderId: 1 });
    e.run(500_000);
    const s = e.stats();
    assert.ok(s.births > 20, `expected replication (births=${s.births})`);
    assert.equal(s.genotypes, 1, `breeds true: 1 genotype (got ${s.genotypes})`);
  });

  it('the first daughter is byte-identical (mov_daught=80, breed_true)', () => {
    const e = sterile(7);
    e.inject(ANC, { founderId: 1 });
    while (e.stats().population < 2 && e.cycles < 300_000) e.run(500);
    assert.equal(e.stats().population >= 2, true, 'produced a daughter');
    const w = e.world;
    const kids = [...w.creatures.values()].filter((c) => c.parentId !== 0);
    assert.ok(kids.length >= 1);
    const child = kids[0]!;
    assert.equal(child.size, META.size);
    for (let i = 0; i < META.size; i++) assert.equal(w.soup.read(child.start + i), ANC[i], `byte ${i}`);
  });

  it('saturates the soup and the reaper culls', () => {
    const e = sterile(11);
    e.inject(ANC, { founderId: 1 });
    e.run(1_500_000);
    const s = e.stats();
    assert.ok(s.population > 100, `soup saturates (pop=${s.population})`);
    assert.ok(s.deaths > 0, `reaper works (deaths=${s.deaths})`);
  });

  it('is deterministic: same seed → identical stats', () => {
    const digest = (seed: number) => {
      const e = sterile(seed); e.inject(ANC, { founderId: 1 }); e.run(300_000);
      const s = e.stats(); return `${s.cycles}|${s.population}|${s.genotypes}|${s.births}|${s.deaths}`;
    };
    assert.equal(digest(3), digest(3));
    assert.notEqual(digest(3), digest(4)); // different seeds diverge
  });

  it('injecting stamps the founder tag and it is inherited on divide', () => {
    const e = sterile(7);
    e.inject(ANC, { founderId: 5 });
    e.run(200_000);
    for (const c of e.world.creatures.values()) assert.equal(c.founderId, 5);
  });
});
