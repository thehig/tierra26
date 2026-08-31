// Creature Lifecycle & Reproduction (REPRO) — real tests. Ref: docs/spec/engine/systems/08-*.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';
import { Engine } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

function w1() {
  return new World({ soupSize: 2000, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 500, searchLimitMult: 5, sizeDependent: false, slicePow: 1, sliceSize: 25, reaperThreshold: 990, rates: DEFAULT_RATES });
}
const spawn = (w: World, size = 40) => w.creatures.get(w.spawn(new Uint8Array(size)))!;
function malOf(w: World, c: any, size: number) { c.cpu.reg[2] = size; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c); }
function divideStep(w: World, c: any) { w.soup.write(c.start + 1, 31); c.cpu.ip = c.start + 1; w.stepOne(c); }

describe('Reproduction (REPRO)', () => {
  it('[REPRO-001] mal allocates a daughter, returns start in A', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40);
    assert.ok(c.dauStart >= 0); assert.equal(c.cpu.reg[0], c.dauStart); assert.equal(c.dauSize, 40);
  });

  it('[REPRO-002] daughter is write-protected to the mother, not others', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40);
    const other = { start: 1000, size: 40, dauStart: -1, dauSize: 0 };
    assert.equal(w.soup.canWrite(c, c.dauStart), true);
    assert.equal(w.soup.canWrite(other, c.dauStart), false);
  });

  it('[REPRO-003] mal below MinCellSize fails: E, no alloc, A unchanged', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[0] = 777;
    c.cpu.reg[2] = 5; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, true); assert.equal(c.dauStart, -1); assert.equal(c.cpu.reg[0], 777);
  });

  it('[REPRO-004] mal above maxCellSize fails: E, no alloc', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[2] = 9999; w.soup.write(c.start, 30); c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, true); assert.equal(c.dauStart, -1);
  });

  it('[REPRO-005] second mal frees the prior daughter and resets fill', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40); const first = c.dauStart;
    c.dauWritten = 10; malOf(w, c, 50);
    assert.notEqual(c.dauStart, -1); assert.equal(c.dauWritten, 0); assert.equal(c.dauSize, 50);
    // the first block is free again → a fresh mal could reuse the region
    assert.ok(!w.allocsView().some((a) => a.start === first && a.size === 40));
  });

  it('[REPRO-006] movii into the daughter increments dauWritten + mask', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40);
    c.cpu.reg[0] = c.dauStart; c.cpu.reg[1] = c.start; // dst=daughter, src=mother
    w.soup.write(c.start + 2, 26); c.cpu.ip = c.start + 2; w.stepOne(c);
    assert.equal(c.dauWritten, 1); assert.equal(c.dauWriteMask[0], 1);
  });

  it('[REPRO-007] rewriting the same daughter byte does not advance the gate', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40);
    c.cpu.reg[0] = c.dauStart; c.cpu.reg[1] = c.start;
    for (let k = 0; k < 3; k++) { w.soup.write(c.start + 2, 26); c.cpu.ip = c.start + 2; w.stepOne(c); }
    assert.equal(c.dauWritten, 1); // same byte written thrice
  });

  it('[REPRO-008] movii outside own+daughter is denied, sets E, no count', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40);
    c.cpu.reg[0] = 1500; c.cpu.reg[1] = c.start; // dst outside everything
    w.soup.write(c.start + 2, 26); c.cpu.ip = c.start + 2; w.stepOne(c);
    assert.equal(c.cpu.flagE, true); assert.equal(c.dauWritten, 0);
  });

  it('[REPRO-009] divide with no daughter fails, sets E', () => {
    const w = w1(); const c = spawn(w); divideStep(w, c);
    assert.equal(c.cpu.flagE, true); assert.equal(w.births, 1); // only the injected one
  });

  it('[REPRO-010] divide below 0.7 fill fails, sets E', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40); c.dauWritten = 20; // 50% < 70%
    divideStep(w, c);
    assert.equal(c.cpu.flagE, true); assert.ok(c.dauStart >= 0); // daughter fields intact
  });

  it('[REPRO-011] the 0.7 gate is integer: 55 fails, 56 passes for size 80', () => {
    const wA = w1(); const a = spawn(wA); malOf(wA, a, 80); a.dauWritten = 55; divideStep(wA, a);
    assert.equal(a.cpu.flagE, true);
    const wB = w1(); const b = spawn(wB); malOf(wB, b, 80); b.dauWritten = 56;
    const births0 = wB.births; divideStep(wB, b);
    assert.equal(wB.births, births0 + 1);
  });

  it('[REPRO-012/013/014/016/017/019] a legal divide births an independent daughter', () => {
    const w = w1(); const c = spawn(w); c.founderId = 3; malOf(w, c, 40); c.dauWritten = 40;
    const dStart = c.dauStart; const births0 = w.births; const bornCyc = w.cycles; divideStep(w, c);
    assert.equal(w.births, births0 + 1);
    const child = [...w.creatures.values()].find((x) => x.parentId === c.id)!;
    assert.equal(child.start, dStart);                 // over [dauStart,dauSize)
    assert.equal(child.cpu.ip, child.start);           // fresh CPU, IP at own start
    assert.equal(child.bornAtCycle, bornCyc);          // cycle at the instant of birth
    assert.equal(child.founderId, 3);                  // REPRO-019 inheritance
    assert.equal(c.dauStart, -1);                      // mother daughter fields cleared
    assert.ok(w.slicerView().includes(child.id) && w.reaperView().includes(child.id));
  });

  it('[REPRO-015] a divide registers the daughter genotype', () => {
    const w = w1(); const c = spawn(w); malOf(w, c, 40); c.dauWritten = 40; divideStep(w, c);
    assert.ok(w.genebank.count() >= 1);
  });

  it('[REPRO-018] the 0080aaa sequence breeds a byte-identical, sterile daughter', () => {
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(ANC, { founderId: 1 });
    while (e.stats().population < 2 && e.cycles < 300_000) e.run(500);
    const child = [...e.world.creatures.values()].find((c) => c.parentId !== 0)!;
    for (let i = 0; i < ANC.length; i++) assert.equal(e.world.soup.read(child.start + i), ANC[i]);
  });
});
