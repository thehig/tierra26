// Genotype & Genebank (GENE) — real tests. Ref: docs/spec/engine/systems/12-genotype-and-genebank.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Genebank, makeLabel, int2lbl } from '../src/genebank.ts';
import { Engine } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

const g80 = (fill: number) => new Uint8Array(80).fill(fill);

describe('Genotype & Genebank (GENE)', () => {
  it('[GENE-001] byte-identical genomes share one genotypeId; alive/everBorn reach 2', () => {
    const gb = new Genebank();
    const a = gb.register(g80(3), 0, -1);
    const b = gb.register(g80(3), 0, -1);
    assert.equal(a.id, b.id);
    assert.equal(a.alive, 2); assert.equal(a.everBorn, 2);
  });

  it('[GENE-002] one-byte difference → distinct genotypeIds', () => {
    const gb = new Genebank();
    const x = g80(3), y = g80(3); y[40] = 4;
    assert.notEqual(gb.register(x, 0, -1).id, gb.register(y, 0, -1).id);
  });

  it('[GENE-003] labels are a pure function of (size, sizeSeq)', () => {
    assert.equal(makeLabel(80, 0), '0080aaa');
    assert.equal(makeLabel(80, 1), '0080aab');
    assert.equal(int2lbl(26), 'aba');
    const gb = new Genebank();
    assert.equal(gb.register(g80(3), 0, -1).label, '0080aaa');
    const y = g80(3); y[0] = 4;
    assert.equal(gb.register(y, 0, -1).label, '0080aab');
  });

  it('[GENE-004] onBirth increments alive + everBorn', () => {
    const gb = new Genebank();
    const a = gb.register(g80(3), 0, -1); assert.equal(a.alive, 1); assert.equal(a.everBorn, 1);
    gb.register(g80(3), 0, -1); assert.equal(a.alive, 2); assert.equal(a.everBorn, 2);
  });

  it('[GENE-005] onDeath decrements alive (never < 0); record persists at 0', () => {
    const gb = new Genebank();
    const a = gb.register(g80(3), 0, -1);
    gb.deathById(a.id); assert.equal(a.alive, 0);
    gb.deathById(a.id); assert.equal(a.alive, 0); // never below 0
    assert.equal(gb.info(a.id)!.everBorn, 1);      // record persists
    assert.equal(gb.count(), 1);
  });

  it('[GENE-006] sterile ancestor → count()==1 (all daughters map to the ancestor)', () => {
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(ANC, { founderId: 1 });
    e.run(300_000);
    assert.equal(e.world.genebank.aliveGenotypes(), 1);
    assert.equal(e.world.genebank.count(), 1);
  });

  it('[GENE-007] genotypes group by size class in birth order', () => {
    const gb = new Genebank();
    const a = gb.register(g80(3), 0, -1);
    const shorter = new Uint8Array(79).fill(3);
    const s = gb.register(shorter, 0, -1);
    const y = g80(3); y[0] = 4; const a2 = gb.register(y, 0, -1);
    assert.deepEqual(gb.bySizeClass(80).map((g) => g.id), [a.id, a2.id]);
    assert.deepEqual(gb.bySizeClass(79).map((g) => g.id), [s.id]);
  });

  it('[GENE-008] extinct then re-born genotype is re-found (same id/label/sizeSeq/firstSeen)', () => {
    const gb = new Genebank();
    const a = gb.register(g80(3), 5, -1);
    gb.deathById(a.id); assert.equal(a.alive, 0);
    const a2 = gb.register(g80(3), 99, -1); // re-born at a later cycle
    assert.equal(a2.id, a.id); assert.equal(a2.label, a.label);
    assert.equal(a2.sizeSeq, a.sizeSeq); assert.equal(a2.firstSeen, 5); // unchanged
    assert.equal(a2.everBorn, 2);
  });

  it('[GENE-009] identical birth sequences → identical records regardless of map order', () => {
    const seq: [Uint8Array, number, number][] = [[g80(1), 0, -1], [g80(2), 1, -1], [g80(1), 2, -1]];
    const rec = (gb: Genebank) => { for (const [b, c, p] of seq) gb.register(b, c, p); return JSON.stringify(gb.toRecords().map((g) => [g.id, g.label, g.sizeSeq, g.firstSeen, g.alive, g.everBorn])); };
    assert.equal(rec(new Genebank()), rec(new Genebank()));
  });

  it('[GENE-010] new genotype captures firstSeen, parentGenotypeId, and a surviving sample', () => {
    const gb = new Genebank();
    const anc = gb.register(g80(3), 10, -1);
    const kid = g80(3); kid[5] = 4; const k = gb.register(kid, 20, anc.id);
    assert.equal(k.firstSeen, 20); assert.equal(k.parentGenotypeId, anc.id);
    gb.deathById(k.id); // every carrier dead
    assert.equal(gb.info(k.id)!.sample[5], 4); // sample survives
  });

  it('[GENE-011] genotypes peaking past savMinNum are saved; idempotent; sub-threshold not', () => {
    const gb = new Genebank(); gb.savMinNum = 2;
    const a = gb.register(g80(3), 0, -1); gb.register(g80(3), 0, -1); // peakAlive 2 → saved
    const y = g80(3); y[0] = 4; gb.register(y, 0, -1);               // peakAlive 1 → not saved
    assert.deepEqual(gb.savedIds(), [a.id]);
    assert.deepEqual(gb.savedIds(), [a.id]); // idempotent
  });
});
